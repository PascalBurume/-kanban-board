import { extractFormulas } from "./formulas";
import { parseFigure } from "./figures";
import { fences } from "./mdCaret";
import { outline, type Heading } from "./lessonOutline";

// Everything wrong with a lesson, in one place.
//
// This merges the two half-audits that used to exist: the Rédiger page listed broken
// FORMULAS only, and the LaTeX atelier listed formulas plus broken FIGURES. A teacher
// had to know which page to look at to see which kind of problem — so the one problem
// they can actually see on the page (a figure rendering as a red slab of its own JSON)
// was the one the writing surface stayed silent about.

export type Problem = {
  kind: "formula" | "figure" | "quiz" | "image";
  line: number;
  /** The offending source, for display. */
  source: string;
  /** Plain-French explanation, already actionable. */
  why: string;
  /** A formula that renders but is probably not what was meant. */
  suspect?: boolean;
  /** Copilot can be asked to repair this one — see the Problèmes rail. */
  fixable?: boolean;
  /** Index of the offending quiz question, for the Quiz tab to jump to. */
  question?: number;
};

export type Audit = {
  problems: Problem[];
  plan: Heading[];
  stats: { words: number; characters: number; formulas: number; figures: number; headings: number };
};

/** A ```figure whose JSON stopped parsing. */
function brokenFigures(md: string): Problem[] {
  const src = md || "";
  return fences(src)
    .filter((f) => f.lang === "figure")
    .map((f) => {
      const bodyStart = src.indexOf("\n", f.start) + 1;
      const bodyEnd = src.lastIndexOf("```", f.end);
      return { fence: f, body: src.slice(bodyStart, bodyEnd) };
    })
    .filter(({ body }) => !parseFigure(body))
    .map(({ fence, body }) => ({
      kind: "figure" as const,
      line: src.slice(0, fence.start).split("\n").length,
      source: body,
      // The overwhelmingly common cause, and the one worth naming: something was
      // inserted into the payload. Say so rather than "invalid JSON".
      why: /\$\$?[\s\S]*\$\$?/.test(body)
        ? "Une formule a été insérée à l'intérieur du bloc et a coupé ses données en deux. Retirez le « $$…$$ » et recollez la ligne qu'il a séparée."
        : "Les données de la figure ne sont plus lisibles (JSON invalide).",
    }));
}

export type QuizQuestion = { type: string; q: string; opts: string[]; correct: number; expl?: string };

// A quiz can be broken in ways a teacher will not notice until a pupil is sitting in
// front of it: two identical options, an empty distractor, a "réponse courte" with no
// accepted answer. None of these throw, none of them look wrong in the editor, and all
// of them make the question unanswerable. So they are audited like formulas are.
export function auditQuiz(questions: QuizQuestion[]): Problem[] {
  const out: Problem[] = [];
  const push = (i: number, why: string, suspect = false) =>
    out.push({ kind: "quiz", line: 0, question: i, source: questions[i]?.q?.slice(0, 120) || `Question ${i + 1}`, why, suspect, fixable: true });

  questions.forEach((q, i) => {
    const opts = (q.opts ?? []).map((o) => String(o ?? "").trim());
    if (!String(q.q ?? "").trim()) push(i, "La question est vide.");

    if (q.type === "court") {
      if (!opts[0]) push(i, "Aucune réponse acceptée : l'élève ne peut pas avoir juste.");
      return;
    }

    if (opts.length < 2) push(i, "Il faut au moins deux propositions.");
    if (opts.some((o) => !o)) push(i, "Une proposition est vide — l'élève verrait un bouton sans texte.");

    const seen = new Map<string, number>();
    for (const o of opts) {
      const key = o.toLocaleLowerCase("fr");
      if (o) seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    if ([...seen.values()].some((n) => n > 1)) push(i, "Deux propositions sont identiques : la question n'a pas de bonne réponse unique.");

    if (q.correct == null || q.correct < 0 || q.correct >= opts.length) push(i, "Aucune bonne réponse n'est cochée.");
    // Not an error — a quiz without explanations still works — but it is the thing
    // that turns a score into a lesson, so it is worth surfacing.
    if (!String(q.expl ?? "").trim()) push(i, "Pas d'explication : l'élève verra son score sans comprendre son erreur.", true);
  });

  return out;
}

/**
 * Every figure the teacher can actually see, of both kinds: a ```figure fence (chart
 * JSON we render) and a hand-drawn `<figure><svg>` épure. The 423 épures across the
 * seeded books are the second kind, so counting fences alone reported "0 figures" on a
 * page visibly showing one. An occurrence inside a fenced block is prose about markup,
 * not a figure.
 */
function countFigures(src: string): number {
  const fenced = fences(src);
  const inFence = (at: number) => fenced.some((f) => at > f.start && at < f.end);

  let n = fenced.filter((f) => f.lang === "figure").length;
  for (const m of src.matchAll(/<figure[\s>]/g)) if (!inFence(m.index)) n++;
  return n;
}

/**
 * Pictures still sitting on this device.
 *
 * The teacher sees them because the editor draws them from the local blob; a pupil
 * would get a broken box. Reporting them as problems is what stops the lesson being
 * published in that state — publication is gated on this list being empty.
 */
function pendingImages(md: string): Problem[] {
  const src = md || "";
  const out: Problem[] = [];
  for (const m of src.matchAll(/mwalimu-pending:[A-Za-z0-9-]+/g)) {
    out.push({
      kind: "image",
      line: src.slice(0, m.index).split("\n").length,
      source: m[0],
      why: "Cette image n'est encore que sur cet appareil — elle sera envoyée dès que le serveur de l'école répondra. Les élèves ne la verraient pas.",
    });
  }
  return out;
}

export function auditDocument(md: string): Audit {
  const src = md || "";
  const formulas = extractFormulas(src);
  const figureCount = countFigures(src);

  // "Renders but wrong" needs attention just as much as "fails to render".
  const formulaProblems: Problem[] = formulas
    .filter((f) => !f.ok || f.suspect)
    .map((f) => ({
      kind: "formula" as const,
      line: f.line,
      source: f.tex,
      why: f.ok ? String(f.suspect) : String(f.error),
      suspect: Boolean(f.ok && f.suspect),
      // Copilot's `latex` action takes a broken formula and an instruction and returns
      // a corrected one, already re-checked. That is exactly this problem's shape.
      fixable: true,
    }));

  const plan = outline(src);
  // Formulas are stripped before counting: "$\\alpha$" is one idea, not three words.
  const prose = src.replace(/\$[^$]*\$/g, " ");
  const words = prose.trim() ? prose.trim().split(/\s+/).filter(Boolean).length : 0;

  return {
    problems: [...formulaProblems, ...brokenFigures(src), ...pendingImages(src)].sort((a, b) => a.line - b.line),
    plan,
    stats: {
      words,
      characters: src.length,
      formulas: formulas.length,
      figures: figureCount,
      headings: plan.length,
    },
  };
}
