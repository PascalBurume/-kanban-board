import { describe, it, expect } from "vitest";
import { isBlankQuestion, withoutBlankQuestions } from "../quizContent";

describe("isBlankQuestion", () => {
  it("catches the row the editor adds and nobody fills in", () => {
    expect(isBlankQuestion({ promptMd: "", optionsJson: '["",""]' })).toBe(true);
    expect(isBlankQuestion({ promptMd: "   ", options: ["", "  "], explanationMd: null })).toBe(true);
    expect(isBlankQuestion({})).toBe(true);
    expect(isBlankQuestion(null)).toBe(true);
  });

  // The point of the strictness: a teacher mid-sentence must not lose their work to an
  // autosave. Any text anywhere keeps the question.
  it("keeps a question that is merely half-written", () => {
    expect(isBlankQuestion({ promptMd: "Quelle est la dé" })).toBe(false);
    expect(isBlankQuestion({ promptMd: "", options: ["", "35"] })).toBe(false);
    expect(isBlankQuestion({ promptMd: "", optionsJson: '["","35"]' })).toBe(false);
    expect(isBlankQuestion({ promptMd: "", explanationMd: "à compléter" })).toBe(false);
  });

  it("keeps a question with no options at all — TF and SHORT have none", () => {
    expect(isBlankQuestion({ promptMd: "Vrai ou faux ?", optionsJson: null })).toBe(false);
  });

  it("does not treat malformed options as content", () => {
    expect(isBlankQuestion({ promptMd: "", optionsJson: "not json" })).toBe(true);
    expect(isBlankQuestion({ promptMd: "", optionsJson: '{"a":1}' })).toBe(true);
    // Non-string entries are not text either.
    expect(isBlankQuestion({ promptMd: "", options: [null, 0, false] })).toBe(true);
  });
});

describe("withoutBlankQuestions", () => {
  it("drops only the empty ones and keeps the order", () => {
    const qs = [
      { promptMd: "Un ?" },
      { promptMd: "", optionsJson: '["",""]' },
      { promptMd: "Deux ?" },
    ];
    expect(withoutBlankQuestions(qs).map((q) => q.promptMd)).toEqual(["Un ?", "Deux ?"]);
  });

  it("returns nothing when every question is empty", () => {
    expect(withoutBlankQuestions([{ promptMd: "" }, {}])).toEqual([]);
  });

  it("leaves a sound quiz untouched", () => {
    const qs = [{ promptMd: "A ?" }, { promptMd: "B ?" }];
    expect(withoutBlankQuestions(qs)).toEqual(qs);
  });
});
