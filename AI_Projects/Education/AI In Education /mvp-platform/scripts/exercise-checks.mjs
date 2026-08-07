// Deterministic QA for AI-reconstructed book exercises: is the text COMPLETE
// (not truncated mid-thought) and does every math span RENDER? Shared by the
// build-time audit (check-exercises.mjs) and by the refiner, which uses the same
// verdict as its accept/reject gate so a truncation never reaches the cache. No LLM.
import { renders, mathNodes } from "./fix-content-latex.mjs";

// A generation cut off by num_predict leaves an unterminated "$…" fragment that
// renders as raw LaTeX source. Count inline delimiters outside $$…$$ blocks:
// an odd tally means the model ran out of tokens mid-expression.
export function mathBalanced(s) {
  const inline = String(s || "").replace(/\$\$[\s\S]*?\$\$/g, "");
  return inline.split("$").length % 2 === 1;
}

// Text cut off mid-expression can still have balanced $ delimiters while leaving
// a dangling macro like "\frac{[CH_3" — which renders as raw LaTeX. An unbalanced
// { } count is that truncation signature, so require both.
export function bracesBalanced(s) {
  const t = String(s || "");
  return t.split("{").length === t.split("}").length;
}
export function usable(s) {
  return mathBalanced(s) && bracesBalanced(s);
}

// French connectives / articles that never legitimately END a sentence — a
// solution stopping on one is a truncation, not a finished thought.
const DANGLING_WORDS = new Set([
  "et", "ou", "de", "des", "du", "la", "le", "les", "un", "une", "à", "au", "aux",
  "en", "dans", "sur", "avec", "sans", "pour", "par", "donc", "car", "mais", "puis",
  "ainsi", "que", "qui", "quoi", "dont", "où", "est", "sont", "on", "il", "elle",
  "ce", "cette", "ces", "son", "sa", "ses", "leur", "leurs", "plus", "moins", "comme",
]);

// A statement/solution "looks complete" when its last non-empty line ends the way
// a finished sentence or worked answer does. Biased toward NOT flagging on
// ambiguity, so a real teacher-facing warning stays meaningful.
export function looksComplete(text) {
  let t = String(text || "").trim();
  if (!t) return true; // empty solution = "no corrigé", handled elsewhere, not a truncation
  // The refiner sometimes leaves a trailing delimiter/rule artifact ("===",
  // "===SOLUTION===", a bare "---" line). Strip it before judging so its trailing
  // "=" isn't misread as a dangling operator. (Judging only — content untouched.)
  t = t.replace(/(?:[\s\n]*[-=]{2,}[\s\n]*)+$/g, "").trim();
  if (!t) return true;
  const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1] || "";
  // A markdown table row or separator is a fine place to end.
  if (/\|/.test(last)) return true;
  // Ends mid-expression: a trailing binary operator or open group.
  if (/[+\-=×·/*\\({[]$/.test(last)) return false;
  // Ends on punctuation that opens a continuation.
  if (/[,;:]$/.test(last)) return false;
  // Clean terminators: sentence punctuation, closing math/brackets/quotes, or a
  // number (an answer like "= 980" or "pH = 2,05").
  if (/[.!?)\]}»"]$/.test(last)) return true;
  if (/[0-9]$/.test(last)) return true;
  if (/\$$/.test(last)) return true; // ends on a closed inline/display math delimiter
  // Otherwise judge by the final word: a bare connective/article ⇒ truncated.
  const word = (last.match(/([\p{L}]+)\W*$/u)?.[1] || "").toLowerCase();
  if (DANGLING_WORDS.has(word)) return false;
  return true; // ends on a content word with no dangling signal — treat as complete
}

// Drop a trailing question the scan never captured. Some OCR blocks end on a
// stub — "598. Déterminer le centre et le rayon des cercles suivants :" — whose
// list was lost, and the model reproduces that stub verbatim no matter how the
// prompt asks it not to (verified: identical output across four re-rolls). The
// stub is unanswerable, so removing it makes the text honestly complete rather
// than merely passing. Conservative: peels whole trailing lines, gives up if
// that would cost more than maxDropRatio of the text, and never returns
// something the audit would still reject.
export function trimDanglingTail(text, { maxDropRatio = 0.25 } = {}) {
  const t = String(text || "").trim();
  if (!t || looksComplete(t)) return t;
  const lines = t.split("\n");
  for (let i = lines.length - 1; i > 0; i--) {
    const cand = lines.slice(0, i).join("\n").trim();
    if (!cand || t.length - cand.length > t.length * maxDropRatio) break;
    if (looksComplete(cand) && mathBalanced(cand) && bracesBalanced(cand)) return cand;
  }
  return t; // nothing safe to peel — leave it and let the gate reject it
}

// Full audit of one clean entry → { complete, issues[] }.
//   issues ⊂ ["truncated-statement","truncated-solution","katex"]
export function auditEntry({ statement = "", solution = "" }) {
  const issues = [];

  const stmtOk = mathBalanced(statement) && bracesBalanced(statement) && looksComplete(statement);
  if (!stmtOk) issues.push("truncated-statement");
  // Only judge a solution's completeness when there is one to judge.
  if (solution && String(solution).trim()) {
    const solOk = mathBalanced(solution) && bracesBalanced(solution) && looksComplete(solution);
    if (!solOk) issues.push("truncated-solution");
  }

  // Rendering: every math span must pass KaTeX the way the app renders it.
  let katexOk = true;
  for (const src of [statement, solution]) {
    if (!src) continue;
    for (const n of mathNodes(src)) {
      if (!renders(n.value, n.type === "math")) { katexOk = false; break; }
    }
    if (!katexOk) break;
  }
  if (!katexOk) issues.push("katex");

  return { complete: issues.length === 0, issues };
}
