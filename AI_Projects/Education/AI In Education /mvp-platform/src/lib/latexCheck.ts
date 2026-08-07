// The gate every piece of generated LaTeX passes before it can reach a lesson.
//
// This exists because of what it replaces. The drawing canvas rendered whatever it
// could and stamped "N éléments n'ont pas pu être tracés" into the picture when it
// could not — so a figure that was half wrong still went in front of a class, and the
// teacher had no way to tell which half. Nothing here degrades silently: LaTeX either
// renders, or the teacher keeps what they had and is told why.
//
// It runs on both sides. The client checks as the teacher types; the studio route
// checks the model's output before answering, so a broken formula never even makes the
// trip. KaTeX is pure and synchronous, so the same function serves both.

import { check, hasVisibleContent } from "./formulas";

// Re-exported so callers have one import for the gate. The implementation lives beside
// the other "renders but is wrong" heuristics in formulas.ts, so the live editor, the
// Problèmes tab and the Copilot retry all judge a formula by exactly the same rules.
export { hasVisibleContent };

export type LatexVerdict = {
  ok: boolean;
  tex: string; // the cleaned-up source — what should actually be saved
  error?: string; // why KaTeX refused it, in French
  suspect?: string; // renders, but probably says the wrong thing
  repaired?: string; // what cleanUp had to remove, named for the teacher
  blank?: boolean; // parses, renders, and shows nothing at all
};

/**
 * How much of a LaTeX instruction reaches the model.
 *
 * Copilot writes ONE formula, so the instruction is a sentence, not a document. Shared
 * by the route, the composer and the two editors so all four agree on where the cut
 * falls — two different limits in two places is how the question got trimmed off the
 * end of a pasted lesson without anybody being told.
 *
 * It lives HERE, not in studioCopilot, because the editors are client components and
 * studioCopilot reaches `next/headers` through the auth chain — importing a single
 * constant from it broke the build.
 */
export const LATEX_INSTRUCTION_MAX = 1200;

/**
 * What a studio `latex` failure means, in words a teacher can act on.
 *
 * These were one sentence — "le modèle n'a pas répondu" — for every failure, and for
 * most of them it was untrue: the model HAD replied and been cut off mid-formula by
 * the token budget. Being told nothing came back gives no reason to suspect the
 * request was too long, which is the one thing that would have fixed it.
 *
 * Returns null for an unknown code so the caller keeps its own generic fallback.
 */
export function latexReason(code: unknown): string | null {
  switch (code) {
    case "LATEX_EMPTY":
      return "Le modèle n'a rien renvoyé. C'est en général une demande trop longue : gardez la consigne courte, et sélectionnez la formule à retravailler plutôt que de coller toute la leçon.";
    case "LATEX_TRUNCATED":
      return "La réponse a été coupée avant la fin — la demande est trop longue pour un seul passage. Découpez-la, ou demandez une seule formule à la fois.";
    case "LATEX_UNPARSABLE":
      return "Le modèle a répondu à côté du format demandé. Reformulez en une phrase : « écris … », « calcule … », « transforme … ».";
    case "LATEX_BLANK":
      return "Copilot n'a produit qu'une formule vide — un tableau sans filets ni contenu. Précisez ce que doivent contenir les cases.";
    case "LATEX_INVALID":
      return "Copilot n'a pas réussi à écrire une formule affichable.";
    default:
      return null;
  }
}

export type LiveHint = {
  message: string; // what is wrong, in French
  fix?: string; // the exact text that would close it, when there is one
  at?: number; // offset of the opener, so the editor can point at it
};

// Structural checks that run on EVERY keystroke, before the formula is finished.
//
// checkLatex only speaks once the formula parses or fails as a whole, and while you
// are half-way through "\begin{aligned}" everything fails — so its error is noise
// during typing and useful only at rest. These hints are the opposite: they say the
// one thing that is actually actionable mid-flight ("il manque \end{aligned}"), and
// they say nothing at all when the structure is sound.
//
// Deterministic on purpose. This has to work when the school's model is offline, which
// is the normal case, so no part of typing assistance may depend on Ollama.
export function liveHints(tex: string): LiveHint[] {
  const src = String(tex ?? "");
  const hints: LiveHint[] = [];
  // Ignore anything escaped: "\{" is a literal brace, not a group opener.
  const bare = src.replace(/\\[{}$&%#_]/g, "  ");

  // ── unclosed environments ──
  const envs: { name: string; at: number }[] = [];
  const envRe = /\\(begin|end)\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = envRe.exec(bare))) {
    if (m[1] === "begin") envs.push({ name: m[2], at: m.index });
    else {
      const top = envs.pop();
      if (!top) hints.push({ message: `« \\end{${m[2]}} » ferme un environnement qui n'a pas été ouvert.`, at: m.index });
      else if (top.name !== m[2]) hints.push({ message: `« \\begin{${top.name}} » est fermé par « \\end{${m[2]}} ».`, fix: `\\end{${top.name}}`, at: top.at });
    }
  }
  for (const e of envs) hints.push({ message: `Il manque « \\end{${e.name}} ».`, fix: `\\end{${e.name}}`, at: e.at });

  // ── braces ──
  let depth = 0;
  let firstOpen = -1;
  for (let i = 0; i < bare.length; i++) {
    if (bare[i] === "{") { if (depth === 0) firstOpen = i; depth++; }
    else if (bare[i] === "}") {
      depth--;
      if (depth < 0) { hints.push({ message: "Une accolade « } » se ferme sans avoir été ouverte.", at: i }); depth = 0; }
    }
  }
  if (depth > 0) hints.push({ message: depth === 1 ? "Il manque une accolade fermante « } »." : `Il manque ${depth} accolades fermantes « } ».`, fix: "}".repeat(depth), at: firstOpen });

  // ── \left … \right ──
  const lefts = (bare.match(/\\left(?![a-zA-Z])/g) || []).length;
  const rights = (bare.match(/\\right(?![a-zA-Z])/g) || []).length;
  if (lefts > rights) hints.push({ message: "« \\left » attend un « \\right » — sinon rien ne s'affiche.", fix: "\\right." });
  if (rights > lefts) hints.push({ message: "« \\right » arrive sans « \\left »." });

  // ── a lone $ inside a formula ──
  // The editor is already inside maths; a "$" here is a delimiter the teacher typed out
  // of habit, and it ends the formula early in the saved markdown.
  if (/(?<!\\)\$/.test(src)) hints.push({ message: "Retirez les « $ » : vous êtes déjà dans une formule." });

  // ── commands whose argument was not typed yet ──
  // Reported only once the fragment is no longer the very end of the input, so the
  // hint does not fire on every keystroke of "\frac".
  for (const [cmd, need] of [["frac", 2], ["dfrac", 2], ["tfrac", 2], ["sqrt", 1], ["binom", 2]] as const) {
    const re = new RegExp(`\\\\${cmd}(?!\\{)(?!\\[)(?![a-zA-Z])`, "g");
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(bare))) {
      const rest = bare.slice(mm.index + cmd.length + 1).trim();
      if (rest) hints.push({ message: `« \\${cmd} » attend ${need === 1 ? "un argument" : "deux arguments"} entre accolades : \\${cmd}${"{}".repeat(need)}.`, at: mm.index });
    }
  }

  // ── ^ or _ with nothing after ──
  if (/[\^_]\s*$/.test(src.trimEnd()) === false && /[\^_](\s|$)/.test(src)) {
    hints.push({ message: "Un « ^ » ou un « _ » n'a rien à mettre en exposant ou en indice." });
  }

  return hints;
}

// A local model asked for "LaTeX" reaches for a whole .tex file, because that is what
// most LaTeX in its training data looks like. KaTeX renders a formula, not a document,
// so a perfectly correct answer wrapped in a preamble would be rejected for a reason
// the teacher can do nothing about. Unwrap it instead of failing.
const DOC_BODY = /\\begin\{document\}([\s\S]*?)\\end\{document\}/;
const PREAMBLE_LINE = /^\s*\\(documentclass|usepackage|geometry|title|author|date|maketitle|pagestyle)\b.*$/gm;
// ```latex fences, and the $$ or \[ \] the model wraps the answer in. The delimiters
// are added back by whoever stores the formula, so carrying them here would double them.
const FENCE = /^\s*```+[a-zA-Z]*\s*\n?|\n?\s*```+\s*$/g;
const OUTER_DELIMS = /^\s*(?:\$\$|\\\[|\\\(|\$)([\s\S]*?)(?:\$\$|\\\]|\\\)|\$)\s*$/;

export function cleanLatex(raw: string): { tex: string; repaired?: string } {
  let tex = String(raw ?? "").trim();
  const removed: string[] = [];

  // Compare-after-replace rather than test-then-replace: /g regexes carry lastIndex
  // between calls, and a .test() that leaves it mid-string makes the very next call
  // miss a match it should have found.
  const defenced = tex.replace(FENCE, "").trim();
  if (defenced !== tex) {
    tex = defenced;
    removed.push("les délimiteurs de bloc de code");
  }
  const body = tex.match(DOC_BODY);
  if (body) {
    tex = body[1].trim();
    removed.push("l'en-tête du document LaTeX");
  }
  const stripped = tex.replace(PREAMBLE_LINE, "").trim();
  if (stripped !== tex) {
    tex = stripped;
    if (!removed.includes("l'en-tête du document LaTeX")) removed.push("les lignes de préambule (\\usepackage…)");
  }
  // Only strip the outer $…$ when it wraps the WHOLE thing. A derivation containing
  // "$a$ and $b$" would otherwise be truncated to everything between the first and
  // last dollar, silently swallowing the text between them.
  const outer = tex.match(OUTER_DELIMS);
  if (outer && !outer[1].includes("$")) {
    tex = outer[1].trim();
    removed.push("les délimiteurs $ en trop");
  }

  return { tex, repaired: removed.length ? removed.join(", ") : undefined };
}

/**
 * Check one formula. `display` matters: \begin{aligned} and friends are only legal in
 * display mode, so checking a derivation as inline maths would reject it wrongly.
 */
export function checkLatex(raw: string, display = true): LatexVerdict {
  const { tex, repaired } = cleanLatex(raw);
  if (!tex) return { ok: false, tex, error: "La formule est vide." };
  // `check` already reports a blank formula as a suspect — a warning rather than an
  // error, because mid-typing a half-written table is legitimately still empty and
  // turning the editor red on the way to a valid formula is worse than useless.
  // Copilot output is held to the stricter bar by its caller, which reads `blank` and
  // has the option of asking again.
  return { ...check(tex, display), tex, repaired };
}

// What to tell the model when its first attempt did not render. Naming the failing
// source alongside the error matters — asked to "fix the error" without being shown
// what it wrote, a small local model tends to answer with a different formula.
export function retryPrompt(tex: string, error: string): string {
  return [
    "Le LaTeX que tu viens d'écrire ne peut pas être affiché par KaTeX.",
    `Erreur : ${error}`,
    "Source refusée :",
    tex,
    "",
    "Réécris UNIQUEMENT la formule corrigée, sans préambule, sans \\begin{document},",
    "sans \\usepackage, et sans délimiteurs $ ni bloc de code.",
  ].join("\n");
}

// A different failure needs a different instruction. Told only "your LaTeX is wrong",
// a small model tends to rewrite the same empty grid with the columns rearranged.
export function blankRetryPrompt(tex: string): string {
  return [
    "Le LaTeX que tu viens d'écrire est valide, mais il ne montre RIEN : toutes les",
    "cases sont vides et il n'y a aucun filet, donc l'élève ne verra qu'un espace blanc.",
    "Source refusée :",
    tex,
    "",
    "Recommence. Si c'est un tableau : mets des filets verticaux dans la spécification",
    "des colonnes (par exemple {|c|c|c|}), un \\hline entre chaque ligne, une ligne",
    "d'en-têtes, et remplis chaque case — avec des valeurs, ou des points de suspension",
    "si le contenu doit rester à compléter. Ne renvoie jamais une case entièrement vide.",
  ].join("\n");
}
