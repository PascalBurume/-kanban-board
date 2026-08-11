// Quiz questions the refine pass got wrong, put right — with the reasoning recorded.
//
// The quizzes are written by the local model, and a handful state mathematics that is
// simply false. check-quizzes.mjs deliberately says nothing about those: it decides
// whether a question can be ANSWERED, never whether the answer is right, because a rule
// that guessed at mathematics would quietly rewrite the book. This file is the other
// half — the place where a wrong answer is corrected one at a time, by hand, carrying
// the argument that settles it.
//
// Rules for adding one:
//   * correct, never compose. Fix what is false; leave what is merely plain alone;
//   * write the reasoning into `source`, in enough detail that the next person can
//     re-derive it rather than take it on trust;
//   * change as little as possible. If only the answer index is wrong, move only that.
//
// A correction whose question has gone is reported by staleQuizCorrections(), so a
// re-run of the refine pass cannot leave a silent no-op behind.

import fs from "node:fs";
import path from "node:path";

export const QUIZ_CORRECTIONS = [
  {
    book: "maths-5-scientifique",
    lessonSlug: "module-6-analyse-combinatoire-1-applications-entre-ensembles",
    // Identifies the question within the lesson.
    match: "choisir 3 fruits parmi 7 fruits",
    set: {
      optionsJson: JSON.stringify(["21", "35", "210", "28"]),
      answerJson: "1",
    },
    source:
      "C(7,3) = 7! / (3! · 4!) = (7·6·5)/(3·2·1) = 35. The question's own explanation "
      + "derives 35 and is correct; the answer index pointed at 21, which is C(7,2). The "
      + "option list also carried 35 twice, so a pupil picking the second copy gave the "
      + "right value and was marked wrong. The duplicate becomes 210 = 7·6·5, the number "
      + "of ARRANGEMENTS of 3 fruits among 7 — the count you get by forgetting to divide "
      + "by 3!, which is exactly the mistake the prompt guards against when it says "
      + "« l'ordre de sélection n'a pas d'importance ». 21 and 28 are left as they were.",
  },
  {
    book: "maths-5-scientifique",
    lessonSlug: "module-1-notions-de-logique-mathematique-1-raisonnement-par-",
    match: "La contraposition de la proposition",
    set: {
      optionsJson: JSON.stringify([
        "Si le carré d'un nombre entier est impair, alors ce nombre est impair",
        "Si le carré d'un nombre entier est pair, alors ce nombre est pair",
        "Si un nombre entier est impair, alors son carré est impair",
        "Si un nombre entier est pair, alors son carré est pair",
      ]),
      answerJson: "0",
      explanationMd:
        "La contraposition de « Si P alors Q » est « Si non-Q alors non-P » : on échange "
        + "l'hypothèse et la conclusion, puis on nie les deux. Ici P = « le nombre est pair » "
        + "et Q = « son carré est pair », donc la contraposition est « Si le carré est "
        + "impair, alors le nombre est impair ».\n\n"
        + "Les trois autres propositions sont vraies elles aussi — chez les entiers, un "
        + "nombre et son carré ont toujours la même parité — mais aucune n'a cette forme : "
        + "« Si le carré est pair, alors le nombre est pair » est la réciproque, « Si le "
        + "nombre est impair, alors son carré est impair » est la contraposée de cette "
        + "réciproque, et la dernière est la proposition de départ. C'est la forme, et non "
        + "la vérité, qui distingue la contraposition.",
    },
    source:
      "P = « n est pair », Q = « n² est pair ». The contraposition is ¬Q ⇒ ¬P, « si n² est "
      + "impair alors n est impair ». None of the four options offered it: every one kept n "
      + "as the hypothesis and n² as the conclusion, so none of them swapped the two at all. "
      + "The marked answer, « si n est impair alors son carré est impair », is ¬P ⇒ ¬Q — the "
      + "inverse. The explanation stated the rule « Si non Q alors non P » correctly and then "
      + "misapplied it in the very next sentence, in the one lesson whose subject is the "
      + "contraposition.\n"
      + "The replacement options are the three classic confusions, which is what makes them "
      + "worth offering: the converse Q ⇒ P, the inverse ¬P ⇒ ¬Q, and the original P ⇒ Q. "
      + "Note that all four statements are TRUE here, since n and n² share their parity — so "
      + "the question cannot be answered by testing truth, only by reading the form. The "
      + "explanation now says so.",
  },
];

/** The question a correction targets, or null. */
function findQuestion(quiz, match) {
  return (quiz?.questions ?? []).find((q) => String(q.promptMd ?? "").includes(match)) ?? null;
}

/**
 * Apply the corrections belonging to one lesson. Mutates the lesson's quiz in place.
 *
 * @returns {Array<object>} the corrections that matched
 */
export function applyQuizCorrections(lesson, book) {
  const applied = [];
  for (const fix of QUIZ_CORRECTIONS) {
    if (fix.book !== book || fix.lessonSlug !== lesson?.slug) continue;
    const q = findQuestion(lesson.quiz, fix.match);
    if (!q) continue;
    let changed = false;
    for (const [k, v] of Object.entries(fix.set)) {
      if (q[k] !== v) { q[k] = v; changed = true; }
    }
    if (changed) applied.push(fix);
  }
  return applied;
}

/**
 * Corrections whose question is no longer there.
 *
 * A correction is written against one generation of the quiz. Re-run the refine pass and
 * the model may reword the prompt, renumber the lesson, or drop the question — and the
 * entry becomes a no-op that nobody notices. Surfacing them keeps the file honest.
 */
export function staleQuizCorrections(refinedRoot) {
  const stale = [];
  for (const fix of QUIZ_CORRECTIONS) {
    const dir = path.join(refinedRoot, fix.book);
    if (!fs.existsSync(dir)) { stale.push({ ...fix, why: "no such book" }); continue; }
    let found = false;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      let mod;
      try { mod = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { continue; }
      for (const l of mod.lessons ?? []) {
        if (l.slug === fix.lessonSlug && findQuestion(l.quiz, fix.match)) found = true;
      }
    }
    if (!found) stale.push({ ...fix, why: "no question matches" });
  }
  return stale;
}
