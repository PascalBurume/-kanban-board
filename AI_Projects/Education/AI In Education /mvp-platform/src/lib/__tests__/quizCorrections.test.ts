import { describe, it, expect } from "vitest";
import {
  QUIZ_CORRECTIONS,
  applyQuizCorrections,
  staleQuizCorrections,
} from "../../../scripts/quiz-corrections.mjs";
import { auditQuestion } from "../../../scripts/quiz-checks.mjs";
import fs from "node:fs";
import path from "node:path";

const REFINED = path.resolve(process.cwd(), "public/content/refined");

type Fix = {
  book: string;
  lessonSlug: string;
  match: string;
  set: Record<string, string>;
  source: string;
};

const lessonFor = (fix: Fix, question: Record<string, unknown>) => ({
  slug: fix.lessonSlug,
  quiz: { questions: [{ type: "MCQ", promptMd: `… ${fix.match} …`, ...question }] },
});

describe("quiz corrections — the file's own discipline", () => {
  it("carries the reasoning for every entry, not just the change", () => {
    for (const fix of QUIZ_CORRECTIONS as Fix[]) {
      expect(fix.source.length, `${fix.lessonSlug} has no worked reason`).toBeGreaterThan(120);
      expect(Object.keys(fix.set).length).toBeGreaterThan(0);
    }
  });

  it("leaves a question it does not target alone", () => {
    const fix = (QUIZ_CORRECTIONS as Fix[])[0];
    const lesson = { slug: fix.lessonSlug, quiz: { questions: [{ type: "MCQ", promptMd: "autre chose" }] } };
    expect(applyQuizCorrections(lesson, fix.book)).toEqual([]);
  });

  it("leaves the same question in another book alone", () => {
    const fix = (QUIZ_CORRECTIONS as Fix[])[0];
    const lesson = lessonFor(fix, { optionsJson: "[]", answerJson: "0" });
    expect(applyQuizCorrections(lesson, "un-autre-livre")).toEqual([]);
  });

  it("applies once and then reports nothing — a rebuild must not churn", () => {
    const fix = (QUIZ_CORRECTIONS as Fix[])[0];
    const lesson = lessonFor(fix, { optionsJson: "[]", answerJson: "9" });
    expect(applyQuizCorrections(lesson, fix.book)).toHaveLength(1);
    expect(applyQuizCorrections(lesson, fix.book)).toEqual([]);
  });

  // A few entries rewrite the prompt, which is the field `match` searches. Without a
  // second way in they would apply once and then report themselves stale for ever.
  it("still finds a question whose prompt it rewrote", () => {
    const fix = (QUIZ_CORRECTIONS as Fix[]).find((f) => f.set.promptMd);
    expect(fix, "no correction rewrites a prompt — drop this test if that is intended").toBeTruthy();
    const lesson = lessonFor(fix!, { optionsJson: "[]", answerJson: "0" });
    expect(applyQuizCorrections(lesson, fix!.book)).toHaveLength(1);
    // The old wording is gone; the entry must still recognise its own handiwork.
    expect(lesson.quiz.questions[0].promptMd).toBe(fix!.set.promptMd);
    expect(applyQuizCorrections(lesson, fix!.book)).toEqual([]);
  });

  it("produces questions that the answerability checker accepts", () => {
    for (const fix of QUIZ_CORRECTIONS as Fix[]) {
      const lesson = lessonFor(fix, { optionsJson: "[]", answerJson: "0" });
      applyQuizCorrections(lesson, fix.book);
      expect(auditQuestion(lesson.quiz.questions[0]), `${fix.lessonSlug}`).toEqual([]);
    }
  });

  // Every correction names a real question. Skipped when the gitignored build output is
  // absent (a fresh clone), because then there is nothing to be stale against.
  it.skipIf(!fs.existsSync(REFINED))("targets questions that exist in the built content", () => {
    expect(staleQuizCorrections(REFINED)).toEqual([]);
  });
});

describe("the two corrected questions", () => {
  const find = (slugPart: string) =>
    (QUIZ_CORRECTIONS as Fix[]).find((f) => f.lessonSlug.includes(slugPart))!;

  it("marks 35 for C(7,3), and no longer offers it twice", () => {
    const fix = find("analyse-combinatoire");
    const options: string[] = JSON.parse(fix.set.optionsJson);
    expect(new Set(options).size).toBe(options.length);
    expect(options[Number(fix.set.answerJson)]).toBe("35");
  });

  it("offers a contraposition at all, and marks it", () => {
    const fix = find("notions-de-logique");
    const options: string[] = JSON.parse(fix.set.optionsJson);
    const answer = options[Number(fix.set.answerJson)];
    // ¬Q ⇒ ¬P: the SQUARE is the hypothesis and the number the conclusion. Every
    // option in the original kept the number as the hypothesis, which is why none of
    // them was a contraposition.
    expect(answer).toMatch(/^Si le carré .* est impair, alors ce nombre est impair$/);
    expect(options).toHaveLength(4);
    expect(new Set(options).size).toBe(4);
  });

  it("keeps the inverse and the original as distractors — they are the confusions", () => {
    const fix = find("notions-de-logique");
    const options: string[] = JSON.parse(fix.set.optionsJson);
    expect(options).toContain("Si un nombre entier est impair, alors son carré est impair");
    expect(options).toContain("Si un nombre entier est pair, alors son carré est pair");
  });

  it("explains that form, not truth, decides — all four statements are true here", () => {
    const fix = find("notions-de-logique");
    expect(fix.set.explanationMd).toMatch(/non-Q.*non-P/s);
    expect(fix.set.explanationMd).toMatch(/forme/i);
  });
});
