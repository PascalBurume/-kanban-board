// Type-to-convert for the formula editor.
//
// A teacher types "sum" and a space; they get \sum_{i=1}^{n} with the caret sitting
// on the "i=1" they need to change. No backslash, no LaTeX to remember. The existing
// "\command" autocomplete stays — this is the surface for teachers who never learned
// that a sum is \sum in the first place.
//
// Expansions produce LATEX COMMANDS, never Unicode glyphs. "∑" looks identical in the
// input box and is wrong: it cannot carry limits (\sum_{i=1}^{n} typesets them above
// and below, ∑_{i=1}^{n} does not), extractFormulas() cannot validate it, and it does
// not survive as meaningful LaTeX in an export.
//
// Where a symbol already has a palette button, the palette entry IS the definition —
// this file only maps typed words onto it, so the two surfaces can never disagree
// about what "somme" inserts.

import { MATH_GROUPS, STRUCT_GROUPS, CHEM_GROUPS, type Symbol } from "./symbols";

export type Expansion = { insert: string; select?: [number, number] };

/** Replace `text.slice(from, to)` with `insert`, then select `select` (absolute). */
export type Replacement = { from: number; to: number; insert: string; select?: [number, number] };

const BY_ID = new Map<string, Symbol>(
  [...MATH_GROUPS, ...STRUCT_GROUPS, ...CHEM_GROUPS].flatMap((g) => g.items.map((s) => [s.id, s] as const))
);

// A typed word resolves to a palette entry by id. French and English both work: a
// teacher trained in French writes "somme", one reading an English textbook writes
// "sum", and neither should have to know which one we chose.
const FROM_PALETTE: Record<string, string> = {
  sum: "sum", somme: "sum",
  prod: "prod", produit: "prod",
  int: "int", integrale: "int",
  iint: "iint",
  oint: "oint",
  lim: "lim", limite: "lim",
  frac: "frac", fraction: "frac",
  sqrt: "sqrt", racine: "sqrt",
  nthroot: "nthroot",
  vec: "vec", vecteur: "vec",
  matrix: "pmatrix", matrice: "pmatrix",
  bmatrix: "bmatrix",
  det: "vmatrix", determinant: "vmatrix",
  cases: "cases", cas: "cases",
  systeme: "system2",
  aligned: "aligned",
  abs: "abs",
  norm: "norm", norme: "norm",
  binom: "binom",
  overbrace: "overbrace",
  underbrace: "underbrace",
  bar: "bar", moyenne: "bar",
  inf: "infty", infini: "infty",
  angle: "angle",
  degre: "degree",
  union: "cup",
  inter: "cap",
  vide: "emptyset",
  reels: "reals",
};

// Letters and operators with no palette button of their own. One-liners with no
// placeholder, so they carry no `select`.
const GREEK = [
  "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa",
  "lambda", "mu", "nu", "xi", "pi", "rho", "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega",
  "Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi", "Sigma", "Upsilon", "Phi", "Psi", "Omega",
];

const PLAIN: Record<string, string> = {
  ...Object.fromEntries(GREEK.map((g) => [g, `\\${g}`])),
  times: "\\times", fois: "\\times",
  div: "\\div",
  pm: "\\pm",
  cdot: "\\cdot",
  neq: "\\neq",
  leq: "\\leq", geq: "\\geq",
  approx: "\\approx",
  equiv: "\\equiv",
  in: "\\in",
  notin: "\\notin",
  subset: "\\subset",
  forall: "\\forall",
  exists: "\\exists",
  to: "\\to",
  cos: "\\cos", sin: "\\sin", tan: "\\tan",
  log: "\\log", ln: "\\ln", exp: "\\exp",
  max: "\\max", min: "\\min",
  partial: "\\partial",
  nabla: "\\nabla",
  perp: "\\perp",
  parallel: "\\parallel",
};

// Two-character operators expand the moment the second character is typed — there is
// no word boundary to wait for.
const PAIRS: Record<string, string> = {
  "->": "\\to ",
  "=>": "\\Rightarrow ",
  "<=": "\\leq ",
  ">=": "\\geq ",
  "!=": "\\neq ",
  "~=": "\\approx ",
};

// Typing one of these after a word is what commits the expansion. A letter or an
// opening brace is deliberately absent: "sumx" and "sum{" are still being typed.
const BOUNDARY = new Set([" ", "(", ")", "=", "+", "-", "*", "/", "^", "_", ",", ";", "[", "]", "|", "<", ">"]);

const MIN_WORD = 2;

export function expansionFor(word: string): Expansion | null {
  const id = FROM_PALETTE[word];
  if (id) {
    const sym = BY_ID.get(id);
    // A stale id here would silently disable a trigger, so fail loudly in tests
    // rather than quietly doing nothing in front of a teacher.
    if (!sym) throw new Error(`mathInput: no palette symbol "${id}" for trigger "${word}"`);
    return { insert: sym.insert.trimEnd(), select: sym.select };
  }
  const plain = PLAIN[word];
  return plain ? { insert: plain } : null;
}

/** Every word that expands — used by the autocomplete to offer bare-word matches. */
export function triggerWords(): string[] {
  return [...Object.keys(FROM_PALETTE), ...Object.keys(PLAIN)].sort();
}

// A palette entry usually has two triggers — the French word and the English one. The
// French one is what a teacher here would reach for, so it is what the palette should
// teach; ties break on the shorter word, which is the one worth memorising.
const PREFERRED = new Map<string, string>();
for (const [word, id] of Object.entries(FROM_PALETTE)) {
  const held = PREFERRED.get(id);
  if (!held || word.length < held.length) PREFERRED.set(id, word);
}

/**
 * The word that types this palette symbol, or null if it has no shortcut.
 *
 * This is what lets the symbol keyboard teach the shortcut that replaces it — press
 * ∑ and the strip says "or type: somme" — so the palette trains a teacher out of
 * needing the palette.
 */
export function triggerFor(symbolId: string): string | null {
  const fromPalette = PREFERRED.get(symbolId);
  if (fromPalette) return fromPalette;
  // Symbols with no `FROM_PALETTE` entry may still be typeable, because PLAIN is keyed
  // by the same word the symbol is named after ("alpha", "pi", "leq").
  return PLAIN[symbolId] ? symbolId : null;
}

// \text{…} holds prose, where "sin" is a French word and "pi" is part of "pinceau".
// Expanding inside it would corrupt the sentence the teacher is writing.
function insideText(text: string, caret: number): boolean {
  const re = /\\(?:text|mathrm|operatorname)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const open = m.index + m[0].length;
    if (open > caret) break;
    let depth = 1;
    let i = open;
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
    }
    // Unclosed brace runs to end of input — the caret is still inside it.
    const close = depth > 0 ? text.length : i - 1;
    if (caret > open - 1 && caret <= close) return true;
  }
  return false;
}

/**
 * The expansion to apply for `text` with the caret at `caret`, or null.
 *
 * Call after every input change. Word triggers fire only once a boundary character
 * has been typed, so the teacher can still write a variable named `pi` by not
 * following it with one — and Ctrl+Z always brings the typed word back, because the
 * caller applies this as a single ordinary edit.
 *
 *   "sum "  ──▶  from=0 to=3, insert "\sum_{i=1}^{n}", select on "i=1"
 *   "x->"   ──▶  from=1 to=3, insert "\to "
 *   "\su"   ──▶  null  (a backslash command — the \command autocomplete owns it)
 */
export function expandTrigger(text: string, caret: number): Replacement | null {
  if (caret < 2 || caret > text.length) return null;
  if (insideText(text, caret)) return null;

  const before = text.slice(0, caret);

  const pair = PAIRS[before.slice(-2)];
  if (pair) return { from: caret - 2, to: caret, insert: pair };

  const boundary = before[caret - 1];
  if (!BOUNDARY.has(boundary)) return null;

  const m = before.slice(0, -1).match(/([a-zA-Z]+)$/);
  if (!m || m[1].length < MIN_WORD) return null;

  const word = m[1];
  const from = caret - 1 - word.length;
  // Already a LaTeX command being typed — leave it to the \command autocomplete.
  if (from > 0 && text[from - 1] === "\\") return null;

  const exp = expansionFor(word);
  if (!exp) return null;

  return {
    from,
    to: from + word.length,
    insert: exp.insert,
    select: exp.select ? [from + exp.select[0], exp.select[1]] : undefined,
  };
}
