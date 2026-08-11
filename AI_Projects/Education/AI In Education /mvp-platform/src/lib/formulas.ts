// Pull every math span out of a lesson and check that KaTeX can actually render it.
//
// Lessons here are dense in LaTeX and a broken formula is nearly invisible in a wall
// of French prose — it just renders as red text somewhere down the page, or silently
// as literal "$x^2$". Listing the formulas on their own turns proofreading the maths
// into a short, finite task.

import katex from "katex";

export type Formula = {
  tex: string;
  display: boolean; // $$…$$ rather than $…$
  line: number; // 1-based line in the source markdown
  ok: boolean; // KaTeX can render it
  error?: string; // why it cannot
  suspect?: string; // renders, but almost certainly says the wrong thing
  blank?: boolean; // renders, and shows nothing at all
};

// A formula that lost its backslashes still PARSES — "\times" eaten down to "imes"
// renders as the italic variable product i·m·e·s, and KaTeX reports no error. Those
// are the ones that actually reach students looking wrong, so parse-success is not
// enough: look for the tails a swallowed command leaves behind.
// The trailing (?![A-Za-z]) stops "imes" matching inside a longer word — but it must
// NOT apply to the brace-terminated forms. "ext{" is followed by the argument's first
// letter essentially always, so guarding it meant "\text{D}" collapsed to "ext{D}" —
// the commonest instance of this corruption — was never flagged at all. The "{"
// already terminates those alternatives on its own.
const EATEN_COMMAND = /(?:^|[^\\A-Za-z])(extbf\{|ext\{|rac\{|qrt\{|(?:imes|abla|otin|heta|ilde|ightarrow|riangle|nfty|eq)(?![A-Za-z]))/;
const CONTROL_CHARS = /[\t\r\f\x0B\x08]/;

// Commands and characters that ARRANGE maths without drawing anything themselves.
// Deliberately not a "strip all commands" pass: \pi and \frac are commands too, and
// treating them as invisible would report every Greek letter as an empty formula.
// \hline is absent on purpose — a ruled but empty table is a visible grid, which is a
// perfectly reasonable thing for a teacher to want.
const INVISIBLE: RegExp[] = [
  /\\begin\{[^}]*\}(?:\s*(?:\{[^}]*\}|\[[^\]]*\]))*/g, // \begin{array}{ccccc}
  /\\end\{[^}]*\}/g,
  /\\\\(?:\[[^\]]*\])?/g, // row break, with optional spacing argument
  /\\(?:quad|qquad|displaystyle|textstyle|scriptstyle|scriptscriptstyle|limits|nolimits|left|right|bigl?|Bigl?|biggl?|Biggl?|phantom\{[^}]*\}|hspace\{[^}]*\}|vspace\{[^}]*\})/g,
  /\\[,;:!> ]/g, // thin/medium/thick spaces and \!
  /\\text\{\s*\}/g, // an empty \text{} draws nothing
  /[&\s{}]/g,
];

/**
 * Does this typeset to anything a student would actually see?
 *
 * "\begin{array}{ccccc} & & & & \\ … \end{array}" is valid LaTeX, renders without a
 * single warning, and puts nothing on the page — a 5×10 grid of empty cells with no
 * rules. KaTeX is happy, the teacher sees a blank box and reports that the button did
 * nothing. Parse-success is not the same as "produced something".
 */
export function hasVisibleContent(tex: string): boolean {
  let rest = String(tex ?? "");
  for (const re of INVISIBLE) rest = rest.replace(re, "");
  return rest.length > 0;
}

// The tail alone does not name the command it came from — "imes" is what survives of
// \times, not of "\imes". Suggesting the wrong fix in an accuracy panel is worse than
// suggesting none, so map each tail back to the real command.
const EATEN_ORIGIN: Record<string, string> = {
  imes: "\\times",
  "ext{": "\\text{",
  "extbf{": "\\textbf{",
  "rac{": "\\frac{",
  "qrt{": "\\sqrt{",
  abla: "\\nabla",
  otin: "\\notin",
  heta: "\\theta",
  ilde: "\\tilde",
  ightarrow: "\\rightarrow",
  riangle: "\\triangle",
  nfty: "\\infty",
  eq: "\\neq",
};

// Walk the text tracking $ / $$ delimiters. A backslash-escaped \$ is currency, not
// math, and fenced code blocks are skipped so a literal $ in code is not a formula.
export function extractFormulas(md: string): Formula[] {
  const src = String(md ?? "");
  const out: Formula[] = [];
  let line = 1;
  let inFence = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "\n") {
      line++;
      continue;
    }
    if (src.startsWith("```", i)) {
      inFence = !inFence;
      i += 2;
      continue;
    }
    if (inFence || c !== "$" || src[i - 1] === "\\") continue;

    const display = src[i + 1] === "$";
    const open = display ? "$$" : "$";
    const from = i + open.length;
    let end = -1;
    for (let j = from; j < src.length; j++) {
      if (src[j] === "$" && src[j - 1] !== "\\") {
        if (display && src[j + 1] !== "$") continue;
        end = j;
        break;
      }
    }
    if (end < 0) {
      // Unterminated — report it rather than swallowing the rest of the lesson.
      out.push({ tex: src.slice(from, from + 40).trim(), display, line, ok: false, error: "Formule non fermée — il manque un « $ »." });
      break;
    }
    const tex = src.slice(from, end).trim();
    if (tex) out.push({ tex, display, line, ...check(tex, display) });
    for (let k = i; k < end; k++) if (src[k] === "\n") line++;
    i = end + open.length - 1;
  }
  return out;
}

// Exported because the LaTeX editor checks a single formula the teacher (or Copilot)
// is writing, and it must apply exactly the checks the audit panel applies — a
// derivation that passes in the editor and is then flagged in the Formules tab is a
// contradiction the teacher cannot act on.
export function check(tex: string, display: boolean): { ok: boolean; error?: string; suspect?: string; blank?: boolean } {
  try {
    katex.renderToString(tex, { throwOnError: true, displayMode: display });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // KaTeX prefixes everything with "KaTeX parse error: " and appends the position.
    return { ok: false, error: msg.replace(/^KaTeX parse error:\s*/, "").replace(/\s*at position \d+.*$/, "") };
  }
  const eaten = tex.match(EATEN_COMMAND);
  if (eaten) return { ok: true, suspect: `« ${eaten[1]} » est probablement un « ${EATEN_ORIGIN[eaten[1]] ?? "\\" + eaten[1]} » qui a perdu sa barre oblique.` };
  if (CONTROL_CHARS.test(tex)) return { ok: true, suspect: "Contient un caractère de contrôle — un reste de commande LaTeX abîmée." };
  if (!hasVisibleContent(tex)) {
    return { ok: true, blank: true, suspect: "Cette formule s'affiche, mais elle est entièrement vide — un tableau sans filets ni contenu ne montre rien à l'élève. Ajoutez des filets (\\hline) et remplissez les cases." };
  }
  return { ok: true };
}
