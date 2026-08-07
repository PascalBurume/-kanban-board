import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// One rule, enforced on the source, because breaking it destroys a teacher's work
// silently and no test we have would notice.
//
// ProseMirror's insertContent REPLACES the selection when that selection is a
// NodeSelection. On a lesson opened but not yet clicked into, the selection sits on the
// first node — which for 91 of the seeded lessons is the hand-drawn SVG épure. So an
// insert command written as a bare `insertContent` deletes an irreplaceable figure the
// first time a teacher uses it on a freshly opened lesson. That is exactly how the
// image button shipped broken, and useLessonEditor already carried
// `insertAfterSelection` with a comment explaining why.
//
// A source check is blunt, but there is no TipTap test harness here, and the cost of
// getting this wrong is content that cannot be recovered.

const SRC = path.join(process.cwd(), "src", "components", "editor", "useLessonEditor.js");

describe("insert commands go through insertAfterSelection", () => {
  const source = fs.readFileSync(SRC, "utf8");

  it("defines the guarded helper", () => {
    expect(source).toContain("const insertAfterSelection");
  });

  it("guards the helper against a NodeSelection", () => {
    // The helper itself is the ONE place a raw insertContent is correct, and only on
    // the branch where nothing is node-selected.
    const helper = source.slice(source.indexOf("const insertAfterSelection"));
    expect(helper.slice(0, 400)).toMatch(/selection\.node/);
    expect(helper.slice(0, 400)).toMatch(/insertContentAt\(selection\.to/);
  });

  // Every OTHER insertContent must either be the helper's own fallback branch or an
  // explicitly positioned insertContentAt, never a bare insert at an unknown selection.
  it("has no bare insertContent outside the helper", () => {
    const lines = source.split("\n");
    const helperLine = lines.findIndex((l) => l.includes("const insertAfterSelection"));
    const offenders: string[] = [];
    lines.forEach((line, i) => {
      if (!/\.insertContent\(/.test(line)) return;
      // The helper's own two-branch body, within a few lines of its declaration.
      if (i >= helperLine && i <= helperLine + 8) return;
      offenders.push(`${i + 1}: ${line.trim()}`);
    });
    expect(offenders, `bare insertContent replaces a node-selected épure:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("routes the image insert through the helper", () => {
    const cmd = source.slice(source.indexOf("const insertImage"), source.indexOf("const insertImage") + 400);
    expect(cmd).toContain("insertAfterSelection");
    expect(cmd).not.toMatch(/chain\(\)\?\.insertContent\(/);
  });
});

// The second content-safety rule in useLessonEditor, pinned for the same reason.
//
// Every side panel — formula, chart, épure — remembers the POSITION of the node it is
// editing and writes back to it. ProseMirror's doc.nodeAt THROWS for a position past
// the end rather than returning null, so a `!node` guard alone does not cover it, and
// anything that shortens the document without moving the selection leaves that
// position dangling: undo, a Copilot insert that replaces a block, reloading the
// lesson from the server. The result was an uncaught RangeError from inside a panel.
describe("writing back to a remembered node position", () => {
  it("nodeAt throws out of bounds — which is why the bounds check exists", async () => {
    const { Schema } = await import("prosemirror-model");
    const s = new Schema({
      nodes: { doc: { content: "block+" }, paragraph: { group: "block", content: "text*" }, text: {} },
    });
    const doc = s.node("doc", null, [s.node("paragraph", null, [s.text("abc")])]);
    expect(() => doc.nodeAt(doc.content.size + 100)).toThrow(RangeError);
    // In range it behaves, which is what makes the out-of-range case easy to miss.
    expect(doc.nodeAt(0)?.type.name).toBe("paragraph");
  });

  it("checks the bounds before calling nodeAt", () => {
    const source = fs.readFileSync(SRC, "utf8");
    const body = source.slice(source.indexOf("const updateNodeAt"), source.indexOf("const updateNodeAt") + 1400);
    const guard = body.indexOf("tr.doc.content.size");
    const call = body.indexOf("tr.doc.nodeAt");
    expect(guard, "no bounds check in updateNodeAt").toBeGreaterThan(-1);
    expect(guard, "bounds check must come before nodeAt").toBeLessThan(call);
  });
});
