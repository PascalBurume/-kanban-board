// Offline RAG-lite engine for the Mwalimu copilot.
// Pure functions over the client-side search index + exercises — no network, no model.
export const fold = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function searchIndex(index, q, k = 3) {
  const terms = fold(q).split(/\s+/).filter((t) => t.length > 1);
  const scored = [];
  for (const r of index) {
    let sc = 0;
    const ft = fold(r.title), fs = fold(r.subject), fx = fold(r.text);
    for (const t of terms) {
      if (ft.includes(t)) sc += 5;
      if (fs.includes(t)) sc += 3;
      const i = fx.indexOf(t);
      if (i >= 0) sc += 1 + Math.min(2, fx.split(t).length - 2);
    }
    if (sc > 0) scored.push({ r, sc });
  }
  scored.sort((a, b) => b.sc - a.sc);
  return scored.slice(0, k);
}

export function bestQuote(r, q) {
  const terms = fold(q).split(/\s+/).filter((t) => t.length > 2);
  const fx = fold(r.text);
  let pos = -1;
  for (const t of terms) { const i = fx.indexOf(t); if (i >= 0) { pos = i; break; } }
  if (pos < 0) pos = 0;
  return r.text.slice(Math.max(0, pos - 80), pos + 260).replace(/\s+/g, " ").trim();
}

export function splitRep(t) {
  const m = t.match(/[°º*\s]*R[ée]p\.?\s*:?\s*([\s\S]{1,300})/);
  if (!m) return { q: t, rep: null };
  return { q: t.slice(0, m.index).trim(), rep: m[1].split("\n")[0].trim() };
}

/**
 * How to label a book exercise's solution block, so the header never claims more
 * than the text behind it is worth. Three provenances, in descending trust:
 *
 *   book    parsed from a structured chapter, verbatim (a teacher's own fix also
 *           lands here — the drawer already banners that separately)
 *   ai      an LLM rebuilt it from unreadable OCR (may be invented maths)
 *   raw     no clean version exists — the scan's own OCR, unchecked
 *
 * `raw` is the one that had no label: it is not a reconstruction, so the
 * « reconstruit » wording is wrong for it, and the plain green « Corrigé » it
 * used to fall through to read as a verified answer key.
 *
 * @param {{quality?: string, reconstructed?: boolean, complete?: boolean}} ex
 * @returns {{kind: "raw"|"ai"|"book", cls: string, icon: string, label: string}}
 */
export function solutionProvenance(ex = {}) {
  if (ex.quality === "ocr") return { kind: "raw", cls: " raw", icon: "alert", label: "Corrigé — texte OCR non vérifié" };
  // `complete === false` only ever lands on a reconstruction: the un-refined path
  // has nothing to truncate and defaults the flag to true.
  if (ex.complete === false) return { kind: "ai", cls: " ai", icon: "sparkles", label: "Corrigé reconstruit — incomplet" };
  if (ex.reconstructed) return { kind: "ai", cls: " ai", icon: "sparkles", label: "Corrigé reconstruit — à vérifier" };
  return { kind: "book", cls: " sol", icon: "check", label: "Corrigé" };
}

// Compose an answer. Returns { html?, text, sources: [record], openExercises?: path }
export function answer({ role, q, index, exercises, lessonsCache }) {
  const fq = fold(q);
  const exByPath = {};
  for (const e of exercises) (exByPath[e.lessonPath] ||= []).push(e);

  if (role === "prof" && /plan de cours|pr[ée]parer? (un|le) cours|fiche de le[çc]on/.test(fq)) {
    const hits = searchIndex(index, fq.replace(/plan de cours( :| sur| de)?/, ""), 1);
    if (!hits.length) return { text: "Dites-moi le sujet de la leçon (ex : «Plan de cours : Électrostatique»).", sources: [] };
    const r = hits[0].r;
    const full = lessonsCache?.[r.path];
    let outline = [];
    if (full) {
      const m = full.match(/## Plan du module\n([\s\S]*?)\n## /);
      if (m) outline = m[1].split("\n").filter((l) => l.trim().startsWith("-")).map((l) => l.replace(/^- */, ""));
    }
    if (!outline.length) {
      const heads = (full || r.text).match(/^#{2,3} .*/gm) || [];
      outline = heads.map((h) => h.replace(/^#+ /, "")).filter((h) => !/Plan du module|Contenu/.test(h)).slice(0, 5);
    }
    const ex = exByPath[r.path] || [];
    const steps = [
      "Rappel & mise en situation — 5 min",
      ...outline.slice(0, 4).map((o, i) => `${o} — ${i < 2 ? 12 : 8} min`),
      `Exercices d'application${ex.length ? ` (${ex.length} dans la leçon)` : ""} — 10 min`,
      "Synthèse & devoir — 5 min",
    ];
    return {
      kind: "plan", title: `Plan de cours (50 min) — ${r.title}`,
      meta: `${r.subject}, ${r.classe}`, steps, sources: [r],
      openExercises: ex.length ? r.path : null, text: steps.join("\n"),
    };
  }

  if (role === "prof" && /v[ée]rifi/.test(fq) && /le[çc]ons?|contenu|manuel/.test(fq)) {
    const ok = index.filter((r) => r.status === "complete");
    return {
      text: `Aujourd'hui, ${ok.length}/${index.length} leçons sont vérifiées : les 9 leçons de Sciences 1 (EXETAT) et le Module 1 d'Électricité (Électrostatique). Le reste est en brouillon OCR — lisible, mais avec des défauts d'accents et de formules.`,
      sources: ok.slice(0, 4),
    };
  }

  if (/exercices?/.test(fq)) {
    const hits = searchIndex(index, fq.replace(/exercices?( sur| de| d')?/, ""), 3).filter((h) => exByPath[h.r.path]?.length);
    if (hits.length) {
      const r = hits[0].r;
      const pool = exByPath[r.path];
      return {
        kind: "exercises", text: `J'ai trouvé ${pool.length} exercice(s) dans «${r.moduleTitle || r.title}» (${r.subject}).`,
        quote: pool[0].text.slice(0, 220), sources: [r], openExercises: r.path,
      };
    }
  }

  const hits = searchIndex(index, fq, 3);
  if (!hits.length) return { text: "Je n'ai rien trouvé là-dessus dans tes manuels 🤔. Essaie un mot-clé du cours (ex : «Coulomb», «oxydation», «dérivée»).", sources: [] };
  const best = hits[0];
  return {
    kind: "quote",
    text: `D'après «${best.r.title}» (${best.r.subject}, ${best.r.classe}) :`,
    quote: bestQuote(best.r, fq),
    draft: best.r.status !== "complete",
    sources: [best.r, ...hits.slice(1).filter((h) => h.sc > 2).map((h) => h.r)],
  };
}
