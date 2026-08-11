// Whether a quiz question holds anything at all.
//
// The studio's editor adds a question as an empty row and lets the teacher fill it in,
// and the panel autosaves. Nothing stopped an untouched row from being written, so a
// draft could carry a question with no prompt, no options and no explanation — and
// nothing stopped it being served either: publish the lesson and a pupil meets a blank
// question with two blank buttons, which « Valider » then insists they answer.
//
// The test is deliberately strict. A question is blank only when EVERY part of it is
// empty. A prompt still being typed, or options entered before the prompt, is
// half-written work — dropping that would delete what the teacher was in the middle of
// saying, which is far worse than keeping an unfinished row.

export interface QuizQuestionish {
  promptMd?: string | null;
  explanationMd?: string | null;
  options?: unknown;
  optionsJson?: string | null;
}

const hasText = (v: unknown): boolean => typeof v === "string" && v.trim() !== "";

/** Options as an array, from either the decoded or the JSON-encoded field. */
function optionsOf(q: QuizQuestionish): unknown[] {
  if (Array.isArray(q.options)) return q.options;
  if (typeof q.optionsJson === "string") {
    try {
      const v: unknown = JSON.parse(q.optionsJson);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** True when the question carries no text anywhere — nothing to read, nothing to pick. */
export function isBlankQuestion(q: QuizQuestionish | null | undefined): boolean {
  if (!q) return true;
  if (hasText(q.promptMd)) return false;
  if (hasText(q.explanationMd)) return false;
  return !optionsOf(q).some(hasText);
}

/** The questions worth keeping, in order. */
export function withoutBlankQuestions<T extends QuizQuestionish>(questions: readonly T[]): T[] {
  return questions.filter((q) => !isBlankQuestion(q));
}
