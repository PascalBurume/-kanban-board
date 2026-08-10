import { describe, it, expect } from "vitest";
import { solutionProvenance } from "../copilot";

// The shapes matchExercises actually emits (src/lib/practice.ts):
//  • refined  — a clean entry existed: quality "clean", reconstructed true
//  • raw      — no clean entry: quality stays "ocr", reconstructed FALSE
//  • book     — parsed from a structured chapter: quality "clean", not reconstructed
//  • fixed    — a teacher override: quality "clean", reconstructed false, fixed true
const refined = { quality: "clean", reconstructed: true, complete: true };
const raw = { quality: "ocr", reconstructed: false, complete: true };
const book = { quality: "clean", reconstructed: false, complete: true };
const fixed = { quality: "clean", reconstructed: false, complete: true, fixed: true };

describe("solutionProvenance", () => {
  it("marks unrefined OCR as unverified, never as a plain corrigé", () => {
    const p = solutionProvenance(raw);
    expect(p.kind).toBe("raw");
    expect(p.label).toBe("Corrigé — texte OCR non vérifié");
  });

  // The bug: `reconstructed` is false on this path, so it fell through to the
  // green check — the least trustworthy text on the page, presented as the book's.
  it("does not give unrefined OCR the verified styling", () => {
    expect(solutionProvenance(raw).cls).not.toBe(" sol");
    expect(solutionProvenance(raw).icon).not.toBe("check");
  });

  // ...and equally must not claim an LLM rebuilt it, because none did.
  it("does not call unrefined OCR a reconstruction", () => {
    expect(solutionProvenance(raw).label).not.toMatch(/reconstruit/i);
    expect(solutionProvenance(raw).kind).not.toBe("ai");
  });

  it("keeps the reconstruction labels", () => {
    expect(solutionProvenance(refined)).toMatchObject({ kind: "ai", label: "Corrigé reconstruit — à vérifier" });
    expect(solutionProvenance({ ...refined, complete: false })).toMatchObject({
      kind: "ai",
      label: "Corrigé reconstruit — incomplet",
    });
  });

  it("keeps the plain corrigé for real book text", () => {
    expect(solutionProvenance(book)).toMatchObject({ kind: "book", cls: " sol", icon: "check", label: "Corrigé" });
  });

  // A teacher's override is trustworthy and the drawer banners it separately —
  // the header must not start double-reporting it.
  it("leaves a teacher fix reading as a plain corrigé", () => {
    expect(solutionProvenance(fixed)).toMatchObject({ kind: "book", label: "Corrigé" });
  });

  it("never returns an empty label or an unknown kind", () => {
    for (const ex of [refined, raw, book, fixed, {}, { quality: "ocr" }, { complete: false }]) {
      const p = solutionProvenance(ex);
      expect(p.label.length).toBeGreaterThan(0);
      expect(["raw", "ai", "book"]).toContain(p.kind);
    }
  });

  it("treats a missing argument as ordinary book text rather than throwing", () => {
    expect(solutionProvenance().kind).toBe("book");
  });
});
