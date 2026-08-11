// Text the transcription got wrong, put right — with the evidence recorded.
//
// The platform serves what the books say. Very occasionally the transcription says
// something the book does not, and a pupil revising from it would learn the error. This
// file is where such a reading is corrected, one entry at a time, each carrying the
// evidence that settles it.
//
// Rules for adding one:
//   * correct, never compose. An entry needs evidence from the book itself — the page
//     crops, whose <text> nodes are exact, or the book's own worked solution;
//   * write that evidence into `source`, so the next person can re-check the call;
//   * change as little as possible: `find` should be the smallest string that is wrong.
//
// A correction that stops matching is reported by `staleCorrections`, so a re-transcribed
// book cannot leave a silent no-op behind.

import fs from "node:fs";
import path from "node:path";

export const CORRECTIONS = [
  {
    book: "maths-5-scientifique",
    // The statement of exercise 2 d). The transcription divides the whole expression by
    // x; the book does not.
    find: "d) $$f(x) = \\frac{5x + 2\\sqrt{x^2 - 1}}{x}$$",
    replace: "d) $$f(x) = 5x + 2\\sqrt{x^2 - 1}$$",
    source:
      "Maîtriser les Maths 5, p. 277, exercice 2 d). Four crops of the page render it "
      + "'5x + 2√(x² − 1)' with no denominator. The book's own solution settles it twice "
      + "over: it gives Df = ]−∞,−1] ∪ [1,+∞[, which is the domain of √(x²−1) and not of "
      + "that over x, and it then computes m = lim (5x + 2√(x²−1))/x — the oblique-"
      + "asymptote formula f(x)/x. The transcription folded the solution's ÷x into the "
      + "statement.",
  },
  {
    book: "maths-5-scientifique",
    // The same exercise. Its statement runs over two printed lines, and the crop of the
    // second line was transcribed a second time, leaving its tail stranded between the
    // full statement and the functions it introduces.
    find:
      "des courbes représentatives de chacune des fonctions suivantes :\n\n"
      + "des fonctions suivantes :\n\n",
    replace: "des courbes représentatives de chacune des fonctions suivantes :\n\n",
    source:
      "Maîtriser les Maths 5, p. 277, exercice 2. The page sets the statement over two "
      + "lines, « … des courbes représentatives de chacune / des fonctions suivantes : », "
      + "and the crop of the second line was transcribed on its own as well as within the "
      + "whole. The full statement immediately above carries the same words, so only the "
      + "orphan is dropped. It occurs exactly once in the book.",
  },
];

/** Apply this book's corrections. Returns the text and what was changed. */
export function applyCorrections(text, book) {
  let out = String(text);
  const applied = [];
  for (const fix of CORRECTIONS) {
    if (fix.book !== book || !out.includes(fix.find)) continue;
    out = out.split(fix.find).join(fix.replace);
    applied.push(fix);
  }
  return { text: out, applied };
}

/**
 * Corrections whose `find` no longer appears in their book.
 *
 * A correction is written against one transcription. Re-run the OCR and it may fix the
 * error itself, or move it — either way the entry becomes a no-op, and a no-op nobody
 * notices is how a stale rule survives for years. Surfacing them keeps the file honest.
 */
export function staleCorrections(sourcesDir, refinedRoot) {
  const stale = [];
  for (const fix of CORRECTIONS) {
    const dir = path.join(refinedRoot, fix.book);
    if (!fs.existsSync(dir)) { stale.push({ ...fix, why: "no such book" }); continue; }
    // Parse rather than grep: a backslash is escaped in the JSON, so "\\sqrt" on disk is
    // "\sqrt" in the lesson and a raw substring search never matches.
    const found = fs.readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .some((f) => {
        const mod = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        return (mod.lessons ?? []).some((l) => String(l.contentMd ?? "").includes(fix.replace));
      });
    if (!found) stale.push({ ...fix, why: "neither the error nor the correction is present" });
  }
  return stale;
}
