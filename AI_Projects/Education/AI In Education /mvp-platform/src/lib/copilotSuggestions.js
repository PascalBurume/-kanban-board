// Deterministic, offline Copilot suggestion chips. No LLM, no network — derived
// from the lesson's objectives/notions, the active atelier tab, and the exercise
// the student is looking at, so the suggestions actually match the context.
//
// `chipPool` returns an ORDERED pool of candidates; the UI shows a rotating
// window of 3 and advances it after each turn so suggestions stay fresh.
// `suggestChips` is a thin slice for callers that just want a small static set.

export const DEFAULT_CHIPS = ["Explique autrement", "Donne un exemple", "Interroge-moi"];

// Trim an objective/notion to a chip-sized fragment.
function clamp(s, n = 40) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
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
