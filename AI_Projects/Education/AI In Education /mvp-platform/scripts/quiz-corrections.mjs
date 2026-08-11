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
  {
    book: "maths-5-scientifique",
    lessonSlug: "module-10-limites-4-limite-a-gauche-et-a-droite",
    match: "par valeurs inférieures",
    set: {
      optionsJson: JSON.stringify([
        "lim x->a+ f(x)",
        "lim x->a- f(x)",
        "lim x->a f(x)",
        "lim x->-a f(x)",
      ]),
    },
    source:
      "« Par valeurs inférieures » means x approaches a from below, so the notation is "
      + "lim x→a⁻ — the marked answer, and the explanation, were already right. Only the "
      + "option list was broken: « lim x->a f(x) » appeared at both index 2 and 3. The "
      + "second copy becomes « lim x->-a f(x) », which is the misreading the minus sign "
      + "invites — a⁻ (approaching a from below) mistaken for −a (approaching the opposite "
      + "number). The answer index is untouched.",
  },
  {
    book: "maths-5-scientifique",
    lessonSlug: "module-19-applications-lineaires-1-definition-et-exemples-d-",
    match: "Quelle propriété définit une application comme linéaire",
    set: {
      optionsJson: JSON.stringify([
        "f(u + v) = f(u) + f(v) et f(a · u) = a · f(u)",
        "f(u + v) = f(u) + f(v) seulement",
        "f(a · u) = a · f(u) seulement",
        "f(u · v) = f(u) · f(v)",
      ]),
      answerJson: "0",
      explanationMd:
        "Une application linéaire doit satisfaire les **deux** conditions à la fois : "
        + "l'additivité f(u + v) = f(u) + f(v) et l'homogénéité f(a · u) = a · f(u). "
        + "Prise seule, aucune des deux ne suffit — la définition est leur conjonction. "
        + "f(u · v) = f(u) · f(v) ne fait pas partie de la définition : c'est la "
        + "multiplicativité, une propriété d'une autre nature.",
    },
    source:
      "This one was mis-posed, not merely duplicated. The question asked which property "
      + "DEFINES linearity and offered additivity at index 0 (marked correct) and "
      + "homogeneity at index 2 — while its own explanation said « une application linéaire "
      + "doit satisfaire les deux propriétés ». By the explanation's own statement the "
      + "marked answer was incomplete and index 2 was equally defensible, so deduplicating "
      + "index 3 would have left a question with two half-right answers and one marked. "
      + "The correct option now states both conditions, and the two halves become the "
      + "distractors they were always meant to be. No claim is made about whether either "
      + "condition implies the other — that is a genuine subtlety over ℝ and well outside "
      + "this lesson; the explanation says only that the definition requires both.",
  },
  {
    book: "maths-5-scientifique",
    lessonSlug: "module-20-matrices-2-operations-sur-les-matrices-somme-et-pr",
    match: "dimension résultante de la somme de deux matrices",
    set: {
      optionsJson: JSON.stringify(["m x n", "2m x 2n", "m x m", "n x m"]),
    },
    source:
      "The sum of two m×n matrices is m×n, so the marked answer and the explanation were "
      + "right. « m x n » was simply listed twice, at 0 and 1, and 0 was the answer — a "
      + "pupil choosing the second copy gave the right dimension and was marked wrong. The "
      + "duplicate becomes « 2m x 2n », the answer you get by believing that adding two "
      + "matrices adds their dimensions. The answer index is untouched.",
  },
  {
    book: "maths-6-scientifique",
    lessonSlug: "module-3-fonctions-exponentielles-et-logarithmiques-5-limite",
    match: "limite de la fonction $a^x$ lorsque x tend vers l'infini",
    set: {
      optionsJson: JSON.stringify(["0", "1", "l'infini", "moins l'infini"]),
    },
    source:
      "For a > 1, aˣ → +∞ as x → +∞: the marked answer (index 2) and the explanation were "
      + "right. « 0 » appeared at both index 0 and 3. The second copy becomes « moins "
      + "l'infini », a sign confusion, which leaves the four options covering the four "
      + "plausible readings: 0 is the limit when 0 < a < 1 (or as x → −∞), 1 is the a = 1 "
      + "case, +∞ is correct, −∞ is the sign slip. The answer index is untouched.",
  },
  {
    book: "maths-6-scientifique",
    lessonSlug: "module-5-differentielles-1-definition",
    match: "lorsque x se rapproche de a, et cette limite est égale à L",
    set: {
      optionsJson: JSON.stringify([
        "lim x->a f(x) = L",
        "lim f(x)->a = L",
        "lim x->L f(x) = a",
        "f(x) -> a = L",
      ]),
    },
    source:
      "The marked answer « lim x->a f(x) = L » and the explanation were right. The same "
      + "string sat at index 0 and index 2, with 0 marked — so the pupil who picked index 2 "
      + "wrote the correct notation and was told it was wrong. The duplicate becomes "
      + "« lim x->L f(x) = a », which swaps the point approached with the value approached: "
      + "the confusion the question is actually testing. The answer index is untouched.",
  },
  {
    book: "maths-6-scientifique",
    lessonSlug: "module-6-integrales-3-methodes-d-integration",
    match: "notation générale d'une intégrale indéfinie",
    set: {
      promptMd: "Quelle est la primitive générale de $x^n$, pour $n \\neq -1$ ?",
      optionsJson: JSON.stringify([
        "$\\frac{x^{n+1}}{n+1} + C$",
        "$\\frac{x^{n-1}}{n-1} + C$",
        "$n x^{n-1} + C$",
        "$\\frac{x^2}{2} + C$",
      ]),
      answerJson: "0",
      explanationMd:
        "On augmente l'exposant d'une unité, puis on divise par ce nouvel exposant : "
        + "$\\int x^n\\,dx = \\frac{x^{n+1}}{n+1} + C$, valable pour $n \\neq -1$ — le cas "
        + "$n = -1$ donne $\\ln|x| + C$. Attention : $n x^{n-1}$ est la **dérivée** de $x^n$, "
        + "pas sa primitive, et $\\frac{x^2}{2}$ n'est que le cas particulier $n = 1$.",
    },
    source:
      "The second mis-posed question. It asked for the NOTATION of an indefinite integral "
      + "and then offered four antiderivatives — none of them a notation, which would be "
      + "∫f(x)dx. The marked answer, x^(n+1)/(n+1) + C, is the general antiderivative of "
      + "xⁿ, and the explanation repeated the confusion by calling it a notation.\n"
      + "The options were plainly authored for « what is the antiderivative of xⁿ », so the "
      + "prompt is corrected to the question they answer rather than replacing all four to "
      + "chase a prompt that had drifted. The duplicate x³/3 makes way for two real errors: "
      + "n−1 instead of n+1, and n·x^(n−1), which is the derivative — the single most common "
      + "confusion in this chapter. The n ≠ −1 restriction is now stated, since x^(n+1)/(n+1) "
      + "is undefined there.",
  },
];

/**
 * The question a correction targets, or null.
 *
 * A correction is found by a substring of the prompt — and a few of them rewrite that
 * prompt, because the question asked for one thing and offered options answering
 * another. Once applied, such a correction can no longer find its own question by the
 * old wording, and staleQuizCorrections would report it as rotten for ever. So the
 * corrected prompt is a second way in: the entry matches the question it targets both
 * before and after it has done its work.
 */
function findQuestion(quiz, fix) {
  const qs = quiz?.questions ?? [];
  const has = (needle) => qs.find((q) => String(q.promptMd ?? "").includes(needle)) ?? null;
  return has(fix.match) ?? (fix.set?.promptMd ? has(fix.set.promptMd) : null);
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
    const q = findQuestion(lesson.quiz, fix);
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
        if (l.slug === fix.lessonSlug && findQuestion(l.quiz, fix)) found = true;
      }
    }
    if (!found) stale.push({ ...fix, why: "no question matches" });
  }
  return stale;
}
