import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { canEditVisually, mdToDoc, docToMd } from "../lessonDoc";

// The regression net for the real books.
//
// Unit tests pin the constructs we thought of; this one runs the gate over every lesson
// actually seeded — 481 of them across nine books, including the OCR'd EXETAT exam
// papers and the chapters carrying hand-authored SVG épures. It is the only test that
// would catch "the editor still round-trips the examples, but a third of the corpus
// now opens in source mode".
//
// public/content/refined is BUILT (npm run build:content) from content/sources, and
// both are gitignored — the OCR dumps are far too large for the repo. So the suite
// skips itself on a fresh checkout rather than failing for the wrong reason.

const REFINED = path.join(process.cwd(), "public", "content", "refined");

type Lesson = { book: string; slug: string; md: string };

function corpus(): Lesson[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(".json")) files.push(p);
    }
  };
  walk(REFINED);

  const out: Lesson[] = [];
  for (const file of files) {
    const mod = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const lesson of mod.lessons ?? []) {
      const md = lesson.contentMd ?? "";
      if (md.trim()) out.push({ book: path.relative(REFINED, file), slug: lesson.slug, md });
    }
  }
  return out;
}

const present = fs.existsSync(REFINED) && fs.readdirSync(REFINED).length > 0;

describe.skipIf(!present)("the seeded book corpus", () => {
  const lessons = corpus();
  const where = (l: Lesson) => `${l.book} → ${l.slug}`;

  it("has content to check", () => {
    expect(lessons.length).toBeGreaterThan(300);
  });

  // The explicit timeouts here and below are the corpus's, not a slow assertion:
  // parsing every lesson costs seconds and the corpus grows with each book that is
  // transcribed (481 → 598 when maths-6 and chimie-5 gained their illustrated
  // lessons). The default 5 s turns "we added a book" into three red tests.
  it("never throws on real lesson text", { timeout: 30_000 }, () => {
    for (const l of lessons) {
      expect(() => canEditVisually(l.md), `threw on ${where(l)}`).not.toThrow();
    }
  });

  // THE assertion of this file. A lesson may be refused only because it uses a
  // construct the editor has not learned yet (an SVG épure, a table) — never because
  // the serialiser mangles it. Round-trip drift is a defect in lessonDoc; an
  // unsupported node is a known gap with a phase attached to it.
  //
  // Six lessons failed this before empty formulas, adjacent runs and consecutive lists
  // were canonicalised on the parse side. It must stay at zero.
  it("refuses lessons only for named unsupported constructs, never for drift", { timeout: 30_000 }, () => {
    const drifted = lessons.filter((l) => !canEditVisually(l.md).ok && mdToDoc(l.md).unsupported.length === 0);
    const detail = drifted.slice(0, 5).map(where).join("\n  ");
    expect(drifted.length, `serialiser drift on:\n  ${detail}`).toBe(0);
  });

  // Re-serialising must settle immediately: an autosave that keeps rewriting the file
  // would churn LessonVersion history on every keystroke.
  it("reaches a fixed point after one pass", { timeout: 30_000 }, () => {
    for (const l of lessons) {
      if (!canEditVisually(l.md).ok) continue;
      const once = docToMd(mdToDoc(l.md).doc);
      expect(docToMd(mdToDoc(once).doc), `${where(l)} never settled`).toBe(once);
    }
  });

  // A floor, not an equality: this number should only ever go up as the editor learns
  // tables (then ~74% → ~87%) and inline SVG (→ ~100%). It was 73% before the
  // serialiser fixes and must never fall back.
  it("keeps at least 94% of lessons visually editable", { timeout: 30_000 }, () => {
    const refused = lessons.filter((l) => !canEditVisually(l.md).ok);
    const rate = (lessons.length - refused.length) / lessons.length;
    const byReason = new Map<string, number>();
    for (const l of refused) {
      const key = [...mdToDoc(l.md).unsupported].sort().join("+") || "drift";
      byReason.set(key, (byReason.get(key) ?? 0) + 1);
    }
    const detail = [...byReason].map(([k, n]) => `${k}=${n}`).join(" ");
    expect(rate, `${refused.length}/${lessons.length} refused (${detail})`).toBeGreaterThanOrEqual(0.94);
  });

  // The épures are hand-drawn <figure><svg> blocks. Now that rawHtml keeps them
  // verbatim they mostly open visually — and the ones that do MUST come back
  // byte-identical, because they were drawn against the printed book by hand and
  // cannot be rebuilt from a parsed subtree.
  it("keeps SVG épures byte-identical, or names why not", () => {
    const withSvg = lessons.filter((l) => l.md.includes("<svg"));
    expect(withSvg.length).toBeGreaterThan(50);
    let opened = 0;
    for (const l of withSvg) {
      if (!canEditVisually(l.md).ok) {
        expect(mdToDoc(l.md).unsupported.length, where(l)).toBeGreaterThan(0);
        continue;
      }
      opened++;
      // The surrounding markdown may legitimately be re-spelled ("## T\nx" gains its
      // blank line). The FIGURE may not: compare the <svg> blocks themselves.
      const svgOf = (md: string) => md.match(/<svg[\s\S]*?<\/svg>/g) ?? [];
      expect(svgOf(docToMd(mdToDoc(l.md).doc)), `${where(l)} lost SVG fidelity`).toEqual(svgOf(l.md));
    }
    expect(opened, "most épures should now open visually").toBeGreaterThan(withSvg.length * 0.7);
  });
});
