// Repair lessons whose LaTeX lost its backslashes.
//
// A model writing "\text{D}" into a JSON string emits a bare \t; JSON.parse turns it
// into a TAB, and the formula reaches the lesson as "<TAB>ext{D}". The editor now
// heals that on the way in (src/lib/latexRepair.ts), but rows already saved with the
// TAB *trimmed away* are past the point where an automatic repair can see what
// happened — "ext{D}" is all that is left.
//
// This walks Lesson.contentMd and Quiz questions, restores the commands from the
// tails they left behind, and reports every change. Dry-run by default.
//
//   npx tsx scripts/repair-lesson-latex.ts           # report only
//   npx tsx scripts/repair-lesson-latex.ts --write   # apply
//
// ONLY the brace-terminated tails are restored, and that restriction is load-bearing.
// The bare-word tails are not safe to rewrite in this corpus:
//
//   \mathrm{n_{eq}}     "eq" is chemistry's équivalent, not \neq
//   \text{au PE : }     "au" is French "at the", not \tau
//   \mathrm{M}_{eq}     same
//
// A first version of this script included them and would have corrupted 12 perfectly
// healthy chemistry lessons. "ext{" and friends have no such reading — they cannot
// occur naturally — so those are restored and everything else is left alone.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const WRITE = process.argv.includes("--write");

// tail → command. Brace forms are self-terminating; bare words need a boundary.
const BRACED: Record<string, string> = { "ext{": "\\text{", "extbf{": "\\textbf{", "extit{": "\\textit{", "rac{": "\\frac{", "qrt{": "\\sqrt{" };

// The control character is itself the eaten backslash-letter, so it must be CONSUMED,
// not kept: "\text" collapsed to TAB+"ext{" is one command, and a first version of
// this replacement left the tab behind as a stray control char that the audit then
// (correctly) went on flagging.
const bracedRe = new RegExp(
  `(^|[^\\\\A-Za-z])(${Object.keys(BRACED).map((k) => k.replace("{", "\\{")).join("|")})`,
  "g"
);
const isControl = (c: string) => c === "\t" || c === "\r" || c === "\n" || c === "\f" || c === "\v";

// Bare tails that are only safe to restore when a control character is still in front
// of them — the control char IS the eaten backslash-letter, so it proves the intent.
// Without that proof "eq" is chemistry's équivalent and "au" is French "at the".
const BARE_AFTER_CONTROL: Record<string, string> = {
  imes: "\\times", abla: "\\nabla", otin: "\\notin", heta: "\\theta", ilde: "\\tilde",
  ightarrow: "\\rightarrow", riangle: "\\triangle", nfty: "\\infty", eq: "\\neq",
  ho: "\\rho", au: "\\tau", ewline: "\\newline", op: "\\top", an: "\\tan",
};
const controlBareRe = new RegExp(`[\\t\\r\\n\\f\\v](${Object.keys(BARE_AFTER_CONTROL).join("|")})(?![A-Za-z])`, "g");

// Everything happens INSIDE $…$ / $$…$$ and nowhere else.
//
// Deliberately NOT repairLatex() here: that helper escapes every \f to a literal "\f"
// on the assumption it is a collapsed \frac. That is right for fresh model output but
// wrong for stored content — the EXETAT exam papers use form feeds as OCR page
// separators, and a whole-document pass rewrote three of them.
function repairMathSpans(src: string | null | undefined) {
  let changed = 0;
  const out = String(src ?? "").replace(/(\$\$[\s\S]*?\$\$|\$[^$]*?\$)/g, (span) => {
    const fixed = span
      .replace(controlBareRe, (_m, tail) => BARE_AFTER_CONTROL[tail])
      .replace(bracedRe, (_m, pre, tail) => `${isControl(pre) ? "" : pre}${BRACED[tail]}`)
      // Whatever control characters survive the repairs above are orphans: LaTeX
      // spaces with \, \; \quad, never a raw tab. A newline is left alone — display
      // maths is legitimately multi-line.
      .replace(/[\t\r\f\v]+/g, " ");
    if (fixed !== span) changed++;
    return fixed;
  });
  return { out, changed };
}

const short = (s: string) => s.replace(/\s+/g, " ").slice(0, 90);

async function main() {
  const lessons = await prisma.lesson.findMany({ select: { id: true, title: true, contentMd: true } });
  let touched = 0;
  let spans = 0;

  for (const lesson of lessons) {
    const { out, changed } = repairMathSpans(lesson.contentMd);
    if (!changed) continue;
    touched++;
    spans += changed;
    console.log(`\n${lesson.title} (${lesson.id}) — ${changed} formule(s)`);
    // Show the first differing span so the change is reviewable, not just counted.
    const before = lesson.contentMd.match(/(\$\$[\s\S]*?\$\$|\$[^$]*?\$)/g) ?? [];
    const after = out.match(/(\$\$[\s\S]*?\$\$|\$[^$]*?\$)/g) ?? [];
    for (let i = 0, shown = 0; i < before.length && shown < 3; i++) {
      if (before[i] === after[i]) continue;
      console.log(`   − ${short(before[i])}`);
      console.log(`   + ${short(after[i])}`);
      shown++;
    }
    if (WRITE) await prisma.lesson.update({ where: { id: lesson.id }, data: { contentMd: out } });
  }

  const questions = await prisma.question.findMany({ select: { id: true, promptMd: true, explanationMd: true, optionsJson: true } });
  let qTouched = 0;
  for (const q of questions) {
    const prompt = repairMathSpans(q.promptMd);
    const expl = repairMathSpans(q.explanationMd ?? "");
    const opts = repairMathSpans(q.optionsJson ?? "");
    if (!prompt.changed && !expl.changed && !opts.changed) continue;
    qTouched++;
    if (WRITE) {
      await prisma.question.update({
        where: { id: q.id },
        data: {
          promptMd: prompt.out,
          ...(q.explanationMd ? { explanationMd: expl.out } : {}),
          ...(q.optionsJson ? { optionsJson: opts.out } : {}),
        },
      });
    }
  }

  console.log(
    `\n${WRITE ? "Réparé" : "À réparer"} : ${touched} leçon(s) / ${spans} formule(s), ${qTouched} question(s).` +
      (WRITE ? "" : "\nRelancez avec --write pour appliquer.")
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
