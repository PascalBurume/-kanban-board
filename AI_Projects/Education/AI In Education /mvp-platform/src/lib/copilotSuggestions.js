// Deterministic, offline Copilot suggestion chips. No LLM, no network — derived
// from the lesson's objectives/notions, the active atelier tab, and the exercise
// the student is looking at, so the suggestions actually match the context.
//
// `chipPool` returns an ORDERED pool of candidates; the UI shows a rotating
// window of 3 and advances it after each turn so suggestions stay fresh.
// `suggestChips` is a thin slice for callers that just want a small static set.

export const DEFAULT_CHIPS = ["Explique autrement", "Donne un exemple", "Interroge-moi"];

// A maths span, display first so `$$…$$` is matched whole rather than as two
// empty inline ones.
const MATHS = /\$\$[\s\S]*?\$\$|\$[^$]*\$/g;

// Emphasis markers, outside of maths. `$a_1$` and `$x^*$` are content: an
// underscore or star inside a formula belongs to the formula, so the stripper
// walks the string in maths / not-maths spans and only touches the latter.
function unmark(s) {
  return String(s || "")
    .split(/(\$\$[\s\S]*?\$\$|\$[^$]*\$)/)
    .map((part, i) =>
      i % 2
        ? part
        // Outside maths a star or backtick is always markup. An underscore is only
        // markup at a word edge, so « oxydo_réduction » keeps its own.
        : part.replace(/[*`]/g, "").replace(/(?<!\w)_+|_+(?!\w)/g, ""))
    .join("");
}

/**
 * Trim an objective/notion to a chip-sized fragment.
 *
 * A notion is written « **Terme** : sa définition » — 1,167 of the corpus's 1,685
 * are — so the bolded term IS the notion and the rest is its gloss. Taking the term
 * alone gives « Explique : Proposition conditionnelle » where clamping the raw line
 * gave « Explique : **Proposition conditionnelle**: Une affi… »: the markers reached
 * the button unrendered on 309 of the 351 lessons that show a chip, and the words
 * that survived the 40-character cut were the definition's first few rather than the
 * thing being defined.
 *
 * The chip is also the prompt the student sends, so this is what the Copilot is
 * asked about, not just what the button reads.
 */
function clamp(s, n = 40) {
  const raw = String(s || "").replace(/\s+/g, " ").trim();
  const term = /^\*\*([^*]+?)\*\*/.exec(raw);
  // « **Équation du second degré :** » puts the colon inside the emphasis; it
  // introduces the gloss that the term has just been split from, so it goes too.
  const t = unmark(term ? term[1] : raw)
    .replace(/\s+/g, " ").trim()
    .replace(/^[:—–-]\s*/, "")
    .replace(term ? /\s*[:;,—–-]+$/ : /(?!)/, "");
  if (!t) return "";
  if (t.length <= n) return t;

  // Never end inside a formula. The chip is the prompt as well as the label, so a
  // cut at « $\sin(\theta) = \frac{\text{opp… » sends the Copilot a LaTeX fragment
  // that closes nowhere. Back off to before the span opens; when that would leave
  // nothing to click — the notion IS the formula — keep it whole and overlong
  // instead, which the button ellipsises on its own.
  let end = n - 1;
  for (const m of t.matchAll(MATHS)) {
    const from = m.index, to = m.index + m[0].length;
    if (end > from && end < to) { end = from; break; }   // the cut lands inside it
  }
  const cut = t.slice(0, end).trimEnd().replace(/[:;,—–-]+$/, "").trimEnd();
  return cut.length >= 8 ? cut + "…" : t;
}

// Ordered pool of contextual suggestions (most relevant first). All inputs
// optional. Deduped, never empty.
//   tab: "ex" | "sim" | "illu" | "lesson" | undefined
//   lesson: { title, objectives?: string[], notions?: string[] }
//   exercise: { n?, section?, text? } | null
export function chipPool({ tab, lesson, exercise } = {}) {
  const notion = clamp(lesson?.notions?.[0]);
  const notion2 = clamp(lesson?.notions?.[1]);
  const objective = clamp(lesson?.objectives?.[0]);
  const out = [];

  if (tab === "ex") {
    if (exercise) {
      const ref = exercise.n != null ? `l'exercice ${exercise.n}` : exercise.section ? `« ${clamp(exercise.section, 24)} »` : "cet exercice";
      out.push(
        `Donne-moi un indice pour ${ref}`,
        "Vérifie ma méthode",
        "Explique l'énoncé autrement",
        "Par quelle étape commencer ?",
        "Quelle formule utiliser ?",
        "Vérifie mon résultat",
      );
      if (notion) out.push(`Rappelle : ${notion}`);
      out.push("Donne un exemple similaire");
    } else {
      out.push(
        "Par où commencer ?",
        "Donne-moi un indice",
        "Vérifie ma méthode",
        "Quelle formule utiliser ?",
        "Explique l'énoncé autrement",
        "Donne un exemple similaire",
      );
    }
  } else if (tab === "sim") {
    out.push("Que montre cette simulation ?");
    if (notion) out.push(`Explique : ${notion}`);
    out.push("Donne un exemple concret", "Pourquoi ça se comporte ainsi ?");
    if (objective) out.push(`Un exemple de ${objective}`);
    out.push("Explique autrement", "Interroge-moi");
  } else {
    // illu / lesson page / unknown: notion- and objective-driven.
    if (notion) out.push(`Explique : ${notion}`);
    if (objective) out.push(`Un exemple de ${objective}`);
    out.push("Explique autrement", "Interroge-moi", "Pourquoi c'est important ?");
    if (notion2) out.push(`Explique : ${notion2}`);
    out.push("Résume l'essentiel", "Donne un exemple concret");
  }

  const pool = [...new Set(out.filter(Boolean))];
  return pool.length ? pool : DEFAULT_CHIPS;
}

// A rotating window of `count` chips starting at `cursor`, wrapping around the
// pool so each turn surfaces a fresh set.
export function rotateChips(pool, cursor = 0, count = 3) {
  const list = pool && pool.length ? pool : DEFAULT_CHIPS;
  const n = Math.min(count, list.length);
  return Array.from({ length: n }, (_, i) => list[(cursor + i) % list.length]);
}

// Small static set (first few of the pool). Kept for backward compatibility.
export function suggestChips(ctx = {}) {
  return chipPool(ctx).slice(0, 4);
}

// ---- studio: topics drawn from the teacher's own manual ----

const dedupe = (a) => [...new Set(a.filter(Boolean))];

// Which chapter a book lesson belongs to. moduleId when the payload carries one;
// the chapter title otherwise, so an older response still groups into chapters
// instead of collapsing every lesson into one bucket.
const chapterKey = (r) => r.moduleId ?? r.moduleTitle ?? "";

/**
 * Ordered pool of topics for the studio's « Rédiger la leçon » chips, plus the
 * grain it ended up at so the caller can label it.
 *
 * With no manual lesson selected the teacher is still orienting, so the pool is
 * CHAPTER titles spread across the book. It is interleaved in three bands, which
 * means every window of three takes one title from each third — rotating stays
 * broad instead of degrading into "the next three sections of chapter 1".
 *
 * Once a manual lesson is selected the teacher is writing against it, so the pool
 * narrows to the LESSON titles of that chapter, the selected one first. This is
 * the grain the panel asks for: « Statistiques » is the shapeless topic
 * TOPIC_EXAMPLES warns about, « La médiane » is what yields a usable lesson.
 *
 * @param {Array<{id: string, title: string, moduleId?: string|null, moduleTitle?: string}>} rows
 *   the book's lessons in book order
 * @param {string|null} [sourceId] the selected manual lesson, if any
 * @returns {{topics: string[], grain: "lesson"|"chapter"}}
 */
export function bookTopicPool(rows, sourceId = null) {
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && r.title);
  if (!list.length) return { topics: [], grain: "chapter" };

  const source = sourceId ? list.find((r) => r.id === sourceId) : null;
  if (source) {
    const siblings = list.filter((r) => chapterKey(r) === chapterKey(source)).map((r) => r.title);
    const topics = dedupe([source.title, ...siblings]);
    // A one-lesson chapter has nothing to offer beyond the lesson already
    // selected, so fall through to the book rather than show a dead single chip.
    if (topics.length > 1) return { topics, grain: "lesson" };
  }

  const titles = dedupe(list.map((r) => r.moduleTitle || r.title));
  if (titles.length <= 3) return { topics: titles, grain: "chapter" };
  const step = titles.length / 3;
  const bands = [0, 1, 2].map((i) => titles.slice(Math.floor(i * step), Math.floor((i + 1) * step)));
  const topics = [];
  for (let k = 0; k < Math.max(...bands.map((b) => b.length)); k++) {
    for (const b of bands) if (b[k] !== undefined) topics.push(b[k]);
  }
  return { topics, grain: "chapter" };
}
