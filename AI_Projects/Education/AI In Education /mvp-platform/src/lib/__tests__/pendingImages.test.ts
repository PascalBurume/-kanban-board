import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { queueImage, listPendingImages, getPendingImage, deletePendingImage, countPendingImages, pendingKey } from "../localDocs";
import { auditDocument } from "../lessonAudit";

// The offline image queue.
//
// The school's Wi-Fi drops constantly, so "insert a photo" has to mean something while
// the server is unreachable. The bytes go on the device, the markdown carries a
// mwalimu-pending: placeholder, and the next successful save swaps in the real URL.
//
// The rule the whole design turns on: a lesson's TEXT is worth more than its pictures.
// Nothing here may ever stop the words being saved.

const png = () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" });

describe("queueing on a device", () => {
  it("hands back a key the markdown can point at", async () => {
    const key = await queueImage("lesson-a", png(), "photo.png");
    expect(key).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
    expect((await getPendingImage(key))?.lessonId).toBe("lesson-a");
  });

  it("keeps the bytes, not just the name", async () => {
    const key = await queueImage("lesson-a", png(), "photo.png");
    const row = await getPendingImage(key);
    expect(row?.blob).toBeInstanceOf(Blob);
    expect(row?.blob.size).toBe(8);
  });

  it("lists a lesson's queue oldest first, and only that lesson's", async () => {
    const a1 = await queueImage("lesson-b", png(), "1.png");
    const a2 = await queueImage("lesson-b", png(), "2.png");
    await queueImage("lesson-c", png(), "other.png");
    const rows = await listPendingImages("lesson-b");
    expect(rows.map((r) => r.key)).toEqual([a1, a2]);
  });

  it("forgets one once it has gone up", async () => {
    const key = await queueImage("lesson-d", png(), "x.png");
    await deletePendingImage(key);
    expect(await getPendingImage(key)).toBeNull();
  });

  it("counts what is still waiting", async () => {
    expect(await countPendingImages()).toBeGreaterThan(0);
  });

  // crypto.randomUUID is secure-context only and the school is served over plain http
  // on the LAN, where it is simply undefined.
  it("makes keys without crypto.randomUUID", () => {
    const keys = new Set(Array.from({ length: 500 }, () => pendingKey()));
    expect(keys.size).toBe(500);
    expect(pendingKey()).not.toContain("undefined");
  });

  it("makes keys the placeholder pattern can match", () => {
    expect(`mwalimu-pending:${pendingKey()}`).toMatch(/^mwalimu-pending:[A-Za-z0-9-]+$/);
  });
});

// The audit is what stops a lesson going out with a picture only its author can see.
describe("a pending image blocks publication", () => {
  it("is reported as a problem", () => {
    const md = `## Titre\n\n![](mwalimu-pending:abc-123)\n`;
    const p = auditDocument(md).problems.filter((x) => x.kind === "image");
    expect(p).toHaveLength(1);
    expect(p[0].why).toMatch(/appareil/);
  });

  it("reports the line it is on", () => {
    const md = `## Titre\n\ntexte\n\n![](mwalimu-pending:abc-123)`;
    expect(auditDocument(md).problems.find((x) => x.kind === "image")?.line).toBe(5);
  });

  it("reports each one separately", () => {
    const md = `![](mwalimu-pending:a-1)\n\n![](mwalimu-pending:b-2)`;
    expect(auditDocument(md).problems.filter((x) => x.kind === "image")).toHaveLength(2);
  });

  it("says nothing about an image that has uploaded", () => {
    const md = `![](/api/uploads/lessons/x/deadbeef.jpg)`;
    expect(auditDocument(md).problems.filter((x) => x.kind === "image")).toHaveLength(0);
  });
});

describe("flushing the queue", () => {
  let flushPendingImages: typeof import("../imageUpload")["flushPendingImages"];
  let pendingKeysIn: typeof import("../imageUpload")["pendingKeysIn"];

  beforeEach(async () => {
    ({ flushPendingImages, pendingKeysIn } = await import("../imageUpload"));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("finds every placeholder in a document", () => {
    expect(pendingKeysIn("a ![](mwalimu-pending:k1) b ![](mwalimu-pending:k2)")).toEqual(["k1", "k2"]);
    expect(pendingKeysIn("nothing here")).toEqual([]);
  });

  it("does nothing when the document has no placeholder", async () => {
    const md = "## Titre\n\nTexte.";
    expect(await flushPendingImages("lesson-e", md)).toEqual({ md, drained: 0, remaining: 0 });
  });

  it("swaps the placeholder for the real URL once it uploads", async () => {
    const key = await queueImage("lesson-f", png(), "p.png");
    const md = `![](mwalimu-pending:${key})`;
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ src: "/api/uploads/lessons/lesson-f/aa.jpg" }), { status: 200 }));
    const out = await flushPendingImages("lesson-f", md);
    expect(out.md).toBe("![](/api/uploads/lessons/lesson-f/aa.jpg)");
    expect(out.drained).toBe(1);
    expect(out.remaining).toBe(0);
    expect(await getPendingImage(key)).toBeNull();
  });

  // THE rule: the text must save regardless. A server that is still down leaves the
  // markdown untouched and resolves — it never throws into the save path.
  it("leaves the document alone and resolves when the server is still down", async () => {
    const key = await queueImage("lesson-g", png(), "p.png");
    const md = `![](mwalimu-pending:${key})`;
    vi.stubGlobal("fetch", async () => { throw new TypeError("Failed to fetch"); });
    const out = await flushPendingImages("lesson-g", md);
    expect(out.md).toBe(md);
    expect(out.drained).toBe(0);
    expect(out.remaining).toBe(1);
    // Still queued — it must survive to try again.
    expect(await getPendingImage(key)).not.toBeNull();
  });

  // A 4xx is a decision, not an outage: the same bytes will be refused in an hour, so
  // keeping them would leave a placeholder that can never resolve.
  it("drops bytes the server has refused outright", async () => {
    const key = await queueImage("lesson-h", png(), "p.png");
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ message: "Ce fichier n'est pas une image" }), { status: 415 }));
    await flushPendingImages("lesson-h", `![](mwalimu-pending:${key})`);
    expect(await getPendingImage(key)).toBeNull();
  });

  it("discards bytes for a picture the teacher has since deleted", async () => {
    const key = await queueImage("lesson-i", png(), "p.png");
    const other = await queueImage("lesson-i", png(), "kept.png");
    let calls = 0;
    vi.stubGlobal("fetch", async () => { calls++; return new Response(JSON.stringify({ src: "/api/uploads/lessons/lesson-i/bb.jpg" }), { status: 200 }); });
    // Only `other` is still referenced by the document.
    await flushPendingImages("lesson-i", `![](mwalimu-pending:${other})`);
    expect(await getPendingImage(key)).toBeNull();
    expect(calls).toBe(1); // the orphan was never uploaded
  });

  it("stops after the first outage rather than hammering the server", async () => {
    await queueImage("lesson-j", png(), "1.png");
    await queueImage("lesson-j", png(), "2.png");
    const keys = (await listPendingImages("lesson-j")).map((r) => r.key);
    let calls = 0;
    vi.stubGlobal("fetch", async () => { calls++; throw new TypeError("Failed to fetch"); });
    await flushPendingImages("lesson-j", keys.map((k) => `![](mwalimu-pending:${k})`).join("\n\n"));
    expect(calls).toBe(1);
  });

  it("replaces every occurrence of the same picture", async () => {
    const key = await queueImage("lesson-k", png(), "p.png");
    const md = `![](mwalimu-pending:${key})\n\ntexte\n\n![](mwalimu-pending:${key})`;
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ src: "/u.jpg" }), { status: 200 }));
    const out = await flushPendingImages("lesson-k", md);
    expect(out.md).toBe("![](/u.jpg)\n\ntexte\n\n![](/u.jpg)");
    expect(out.remaining).toBe(0);
  });
});
