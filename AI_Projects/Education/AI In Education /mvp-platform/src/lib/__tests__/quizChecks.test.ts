import { describe, it, expect } from "vitest";
import { auditQuestion, auditQuiz, optionsOf, answerIndex } from "../../../scripts/quiz-checks.mjs";

const mcq = (options: string[], answer: number | string, promptMd = "Une question ?") => ({
  type: "MCQ",
  promptMd,
  optionsJson: JSON.stringify(options),
  answerJson: JSON.stringify(answer),
});

const codes = (q: unknown) => auditQuestion(q).map((i: { code: string }) => i.code);

describe("optionsOf / answerIndex", () => {
  it("reads the JSON-encoded shape the refine pass writes", () => {
    expect(optionsOf({ optionsJson: '["a","b"]' })).toEqual(["a", "b"]);
    expect(answerIndex({ answerJson: "2" })).toBe(2);
  });

  it("accepts an answer already decoded, or wrapped in an array", () => {
    expect(answerIndex({ answerJson: 1 })).toBe(1);
    expect(answerIndex({ answerJson: "[3]" })).toBe(3);
  });

  it("returns null rather than guessing when the answer is not an index", () => {
    expect(answerIndex({ answerJson: "false" })).toBeNull();
    expect(answerIndex({ answerJson: "not json" })).toBeNull();
    expect(optionsOf({ optionsJson: "not json" })).toBeNull();
  });
});

describe("auditQuestion", () => {
  it("passes a well-formed question", () => {
    expect(codes(mcq(["21", "35", "28"], 1))).toEqual([]);
  });

  // The case that bites a pupil: they pick the twin, give the answer the question
  // wanted, and are marked wrong.
  it("separates a duplicate that is the answer from one that is not", () => {
    expect(codes(mcq(["f(u+v)=f(u)+f(v)", "x", "y", "f(u+v)=f(u)+f(v)"], 0))).toEqual(["DUPLICATE_ANSWER"]);
    expect(codes(mcq(["21", "35", "35", "28"], 0))).toEqual(["DUPLICATE_OPTION"]);
  });

  it("compares options ignoring case and spacing", () => {
    expect(codes(mcq(["m x n", "M  X  N", "m x m"], 2))).toEqual(["DUPLICATE_OPTION"]);
  });

  it("catches an answer index pointing past the options", () => {
    expect(codes(mcq(["a", "b"], 7))).toEqual(["ANSWER_OUT_OF_RANGE"]);
  });

  it("catches a question with nothing to choose between", () => {
    expect(codes(mcq(["seule"], 0))).toContain("TOO_FEW_OPTIONS");
    expect(codes({ type: "MCQ", promptMd: "Q ?", answerJson: "0" })).toEqual(["NO_OPTIONS"]);
  });

  it("catches the wholly blank question", () => {
    const c = codes(mcq(["", ""], 0, ""));
    expect(c).toContain("BLANK_PROMPT");
    expect(c).toContain("BLANK_OPTIONS");
  });

  it("checks only the prompt on questions that have no options", () => {
    expect(codes({ type: "TF", promptMd: "Vrai ou faux ?", answerJson: "false" })).toEqual([]);
    expect(codes({ type: "SHORT", promptMd: "", answerJson: '"x"' })).toEqual(["BLANK_PROMPT"]);
  });

  // Judging the mathematics is deliberately out of scope — a rule that guessed would
  // quietly rewrite the book.
  it("does not judge whether the marked answer is mathematically right", () => {
    expect(codes(mcq(["21", "35", "28"], 0, "C(7,3) ?"))).toEqual([]);
  });
});

describe("auditQuiz", () => {
  it("reports one entry per faulty question, with its order", () => {
    const quiz = {
      questions: [
        { ...mcq(["a", "b"], 0), order: 1 },
        { ...mcq(["dup", "dup"], 0), order: 2 },
      ],
    };
    const out = auditQuiz(quiz);
    expect(out).toHaveLength(1);
    expect(out[0].order).toBe(2);
    expect(out[0].issues[0].code).toBe("DUPLICATE_ANSWER");
  });

  it("is quiet on an empty or missing quiz", () => {
    expect(auditQuiz(null)).toEqual([]);
    expect(auditQuiz({ questions: [] })).toEqual([]);
  });
});
