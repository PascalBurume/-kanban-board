// What makes a generated quiz question unanswerable, as opposed to merely hard.
//
// The quizzes are written by the local model during the refine pass, and nothing has
// ever read them back. Most are fine. The ones that are not fail in ways a pupil meets
// directly: two options that say the same thing with only one of them marked right, a
// question with no text at all, an answer index pointing past the end of the list.
//
// Every rule here is MECHANICAL — it decides whether a question can be answered, never
// whether the mathematics is correct. "C(7,3) = 21" is wrong, and this file does not
// say so: judging that needs someone who knows the subject, and a rule that guessed
// would quietly rewrite the book. Those are reported as evidence, not repaired.

/** Options as an array, whatever shape they were stored in. */
export function optionsOf(q) {
  if (Array.isArray(q?.options)) return q.options;
  if (typeof q?.optionsJson !== "string") return null;
  try {
    const v = JSON.parse(q.optionsJson);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** The index the answer points at, or null when it is not an index. */
export function answerIndex(q) {
  let v = q?.answerJson;
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch { return null; }
  }
  if (Array.isArray(v)) v = v[0];
  return typeof v === "number" && Number.isInteger(v) ? v : null;
}

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Everything mechanically wrong with one question.
 *
 * @returns {Array<{code: string, detail: string}>} empty when the question is answerable
 */
export function auditQuestion(q) {
  const issues = [];
  if (!norm(q?.promptMd)) issues.push({ code: "BLANK_PROMPT", detail: "the question has no text" });

  if (q?.type !== "MCQ") return issues;

  const opts = optionsOf(q);
  if (!opts) return [...issues, { code: "NO_OPTIONS", detail: "multiple choice with no options" }];
  if (opts.length < 2) {
    return [...issues, { code: "TOO_FEW_OPTIONS", detail: `${opts.length} option(s) — nothing to choose between` }];
  }
  if (opts.every((o) => !norm(o))) {
    return [...issues, { code: "BLANK_OPTIONS", detail: "every option is empty" }];
  }

  const idx = answerIndex(q);
  if (idx === null) issues.push({ code: "NO_ANSWER", detail: "no answer index" });
  else if (idx < 0 || idx >= opts.length) {
    issues.push({ code: "ANSWER_OUT_OF_RANGE", detail: `answer ${idx} of ${opts.length} options` });
  }

  // Two options that read the same are one option wearing two hats. It matters most
  // when the marked answer is one of them: the pupil picks the twin, gives the answer
  // the question wanted, and is told they are wrong.
  const seen = new Map();
  for (const [i, o] of opts.entries()) {
    const k = norm(o);
    if (!k) continue;
    if (!seen.has(k)) { seen.set(k, i); continue; }
    const first = seen.get(k);
    const bites = idx === first || idx === i;
    issues.push({
      code: bites ? "DUPLICATE_ANSWER" : "DUPLICATE_OPTION",
      detail: bites
        ? `options ${first} and ${i} are identical and one of them is the answer`
        : `options ${first} and ${i} are identical`,
    });
  }
  return issues;
}

/** Audit a whole quiz. Returns one entry per question that has something wrong. */
export function auditQuiz(quiz) {
  const out = [];
  for (const [i, q] of (quiz?.questions ?? []).entries()) {
    const issues = auditQuestion(q);
    if (issues.length) out.push({ order: q?.order ?? i + 1, promptMd: q?.promptMd ?? "", issues });
  }
  return out;
}
