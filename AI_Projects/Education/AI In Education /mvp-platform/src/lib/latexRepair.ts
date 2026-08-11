// Restoring LaTeX that lost its backslashes.
//
// A model writing "\text{D}" into a JSON string emits a bare \t. JSON.parse then
// hands us a real TAB, and "\text{D}" arrives as TAB + "ext{D}" — which KaTeX happily
// typesets as three italic variables e·x·t. Same for \r (\rightarrow, \rho) and \n
// (\newline, \neq, \nabla, \nu).
//
// This lives in its own module rather than in ./ollama because the EDITOR needs it
// too, not just the model client: the collapse has to be undone before anything trims
// the string, and ./ollama is a server-side module. Same reason latexCheck.ts is
// separate — see the note at the top of that file.

// Command tails that can follow a collapsed \t, \r or \n. The (?![a-zA-Z]) guard is
// what keeps "\textract" in a code block from being read as "\t" + "extract".
const TAIL_TAB = /^(extbf|extit|extrm|ext|imes|riangle|heta|ilde|au|an|op|o)(?![a-zA-Z])/;
const TAIL_CR = /^(ightarrow|angle|ho)(?![a-zA-Z])/;
const TAIL_LF = /^(ewline|onumber|otin|abla|eq|u)(?![a-zA-Z])/;

// Per-character map of "is this inside $…$ or $$…$$". The $ delimiters survive the
// JSON collapse (only backslash sequences are eaten), so they remain trustworthy.
function mathMask(s: string): Uint8Array {
  const mask = new Uint8Array(s.length);
  let inline = false;
  let display = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "$" && s[i - 1] !== "\\") {
      if (s[i + 1] === "$") {
        display = !display;
        mask[i] = mask[i + 1] = 1;
        i++;
        continue;
      }
      inline = !inline;
      mask[i] = 1;
      continue;
    }
    mask[i] = inline || display ? 1 : 0;
  }
  return mask;
}

function repair(src: string, inMath: (i: number) => boolean): string {
  let out = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "\t" || c === "\r" || c === "\n") {
      const tail = src.slice(i + 1, i + 12);
      const re = c === "\t" ? TAIL_TAB : c === "\r" ? TAIL_CR : TAIL_LF;
      // Newlines only inside math — everywhere else they are real paragraph breaks.
      const guarded = c !== "\n" || inMath(i);
      if (guarded && re.test(tail)) {
        out += c === "\t" ? "\\t" : c === "\r" ? "\\r" : "\\n";
        continue;
      }
    }
    out += c;
  }
  return out;
}

const escapeControls = (s: string) =>
  String(s ?? "")
    .replace(/\f/g, "\\f")
    .replace(/\x08/g, "\\b")
    .replace(/\x0B/g, "\\v");

/** Repair a whole markdown document: newlines are only touched inside $…$. */
export function repairLatex(s: string): string {
  const src = escapeControls(s);
  if (!/[\t\r\n]/.test(src)) return src;
  const mask = mathMask(src);
  return repair(src, (i) => mask[i] === 1);
}

/**
 * Repair a bare formula — the contents of a math node, with no $ delimiters left to
 * build a mask from. Everything here is maths by definition, so a collapsed \newline
 * is repaired rather than mistaken for a paragraph break.
 */
export function repairTex(tex: string): string {
  const src = escapeControls(tex);
  if (!/[\t\r\n]/.test(src)) return src;
  return repair(src, () => true);
}
