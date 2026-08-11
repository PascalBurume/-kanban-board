import { describe, it, expect } from "vitest";
// Plain .mjs pipeline module.
import { CORRECTIONS, applyCorrections, staleCorrections } from "../../../scripts/book-corrections.mjs";

describe("book corrections", () => {
  it("every entry carries the evidence that settles it", () => {
    for (const fix of CORRECTIONS) {
      expect(fix.book, "book").toBeTruthy();
      expect(fix.find, "find").toBeTruthy();
      expect(typeof fix.replace, "replace").toBe("string");
      // A correction without a citation is indistinguishable from an opinion.
      expect(fix.source?.length ?? 0, `source for ${fix.find}`).toBeGreaterThan(60);
      expect(fix.find, "the correction must change something").not.toBe(fix.replace);
    }
  });

  it("applies only to its own book", () => {
    const fix = CORRECTIONS[0];
    expect(applyCorrections(fix.find, fix.book).applied).toHaveLength(1);
    expect(applyCorrections(fix.find, "another-book").applied).toHaveLength(0);
  });

  it("reports what it changed", () => {
    const fix = CORRECTIONS[0];
    const out = applyCorrections(`avant ${fix.find} après`, fix.book);
    expect(out.text).toBe(`avant ${fix.replace} après`);
    expect(out.applied[0].source).toBe(fix.source);
  });

  it("leaves text it does not match alone", () => {
    expect(applyCorrections("rien à corriger", "maths-5-scientifique").text).toBe("rien à corriger");
  });

  it("notices when a correction has gone stale", () => {
    // A re-transcribed book may fix the error itself; the entry then quietly does
    // nothing, and a silent no-op is how a stale rule survives for years.
    expect(staleCorrections("content/sources", "/nowhere")).toHaveLength(CORRECTIONS.length);
  });

  it("is satisfied by the built corpus", () => {
    expect(staleCorrections("content/sources", "public/content/refined")).toEqual([]);
  });
});
