import { describe, it, expect } from "vitest";
import path from "node:path";
import { sniffImage, looksLikeSvg, contentName, resolveUploadPath, lessonDir, uploadUrl, UPLOAD_DIR } from "../uploads";

// What may be stored, and what may be read back out. Both halves are security
// boundaries: the first decides what runs in a browser from our own origin, the second
// decides which files on the server a signed-in user can pull.

const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const jpg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
const gif = () => Buffer.concat([Buffer.from("GIF89a", "latin1"), Buffer.alloc(16)]);
const webp = () => Buffer.concat([Buffer.from("RIFF", "latin1"), Buffer.alloc(4), Buffer.from("WEBP", "latin1"), Buffer.alloc(8)]);

describe("sniffing the bytes, not the declared type", () => {
  it("recognises the four accepted formats", () => {
    expect(sniffImage(png())).toEqual({ ext: "png", mime: "image/png" });
    expect(sniffImage(jpg())).toEqual({ ext: "jpg", mime: "image/jpeg" });
    expect(sniffImage(gif())).toEqual({ ext: "gif", mime: "image/gif" });
    expect(sniffImage(webp())).toEqual({ ext: "webp", mime: "image/webp" });
  });

  // THE test of this file. An SVG served from our own origin is a script host, and
  // unlike the épures in lesson markdown it never passes through sanitizeHast.
  it("refuses SVG however it is dressed up", () => {
    const plain = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const declared = Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(sniffImage(plain)).toBeNull();
    expect(sniffImage(declared)).toBeNull();
    expect(looksLikeSvg(plain)).toBe(true);
    expect(looksLikeSvg(declared)).toBe(true);
  });

  it("refuses an SVG renamed to .png", () => {
    // The name never reaches sniffImage — that is the point. Only bytes decide.
    expect(sniffImage(Buffer.from("<svg/>"))).toBeNull();
  });

  it("refuses HTML, scripts and empty files", () => {
    expect(sniffImage(Buffer.from("<!doctype html><html></html>"))).toBeNull();
    expect(sniffImage(Buffer.from("#!/bin/sh\nrm -rf /"))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
    expect(sniffImage(Buffer.from([0x89, 0x50]))).toBeNull(); // truncated PNG header
  });

  it("does not mistake a JPEG for an SVG", () => {
    expect(looksLikeSvg(jpg())).toBe(false);
  });
});

describe("content addressing", () => {
  it("gives the same name to the same bytes", () => {
    expect(contentName(png(), "png")).toBe(contentName(png(), "png"));
  });

  it("gives different names to different bytes", () => {
    const other = Buffer.concat([png(), Buffer.from("x")]);
    expect(contentName(png(), "png")).not.toBe(contentName(other, "png"));
  });

  it("produces a name the serving route will accept", () => {
    expect(contentName(png(), "png")).toMatch(/^[0-9a-f]{16}\.png$/);
  });
});

describe("path traversal", () => {
  const ok = (...s: string[]) => resolveUploadPath(s);

  it("resolves a real upload path inside the root", () => {
    const p = ok("lessons", "abc123", "deadbeefdeadbeef.png");
    expect(p).toBe(path.join(UPLOAD_DIR, "lessons", "abc123", "deadbeefdeadbeef.png"));
  });

  it("refuses climbing out with ..", () => {
    expect(ok("..", "prisma", "dev.db")).toBeNull();
    expect(ok("lessons", "..", "..", "prisma", "dev.db")).toBeNull();
    expect(ok("lessons", "abc", "..", "..", "..", ".env")).toBeNull();
  });

  it("refuses absolute and slash-bearing segments", () => {
    expect(ok("/etc/passwd")).toBeNull();
    expect(ok("lessons/abc/../../.env")).toBeNull();
  });

  it("refuses an empty path", () => {
    expect(resolveUploadPath([])).toBeNull();
  });

  // A prefix test alone would accept a sibling directory whose name merely starts the
  // same way; the trailing separator is what closes that.
  it("refuses a sibling directory sharing the prefix", () => {
    expect(ok("..", `${path.basename(UPLOAD_DIR)}-secret`, "x.png")).toBeNull();
  });
});

describe("lesson folders", () => {
  it("accepts a cuid", () => {
    expect(lessonDir("cmrz8hxqp0005f6zag14ko453")).toContain("cmrz8hxqp0005f6zag14ko453");
  });

  it("refuses anything that is not one path segment", () => {
    expect(lessonDir("../etc")).toBeNull();
    expect(lessonDir("a/b")).toBeNull();
    expect(lessonDir("")).toBeNull();
  });
});

describe("the URL matches what the sanitiser allows", () => {
  // SAFE_IMG in mdSanitize.ts admits /api/uploads/… — a URL shape that drifted from it
  // would render for the teacher and vanish for the class.
  it("builds a /api/uploads/ URL", () => {
    expect(uploadUrl("abc", "deadbeef.png")).toBe("/api/uploads/lessons/abc/deadbeef.png");
  });

  // The renderer drops an <img> whose src it does not recognise, so a URL shape that
  // drifted from SAFE_IMG would show for the teacher and vanish for the class.
  it("is accepted by the student renderer's image policy", async () => {
    const { __test__ } = await import("../mdSanitize");
    expect(__test__.SAFE_IMG.test(uploadUrl("abc", contentName(Buffer.from("x"), "png")))).toBe(true);
  });

  it("still refuses an off-site image", async () => {
    const { __test__ } = await import("../mdSanitize");
    expect(__test__.SAFE_IMG.test("https://evil.example/x.png")).toBe(false);
  });
});
