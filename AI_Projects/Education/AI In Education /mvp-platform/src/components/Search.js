"use client";
import { useEffect, useMemo, useRef, useState } from "react";

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export default function Search({ index, onPick, onClose }) {
  const [q, setQ] = useState("");
  const [smart, setSmart] = useState(false); // « Recherche intelligente » (RAG)
  const [smartResults, setSmartResults] = useState(null); // null = idle
  const [smartState, setSmartState] = useState("idle"); // idle | loading | ok | unavailable
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Semantic search: debounced call to the local RAG endpoint. Falls back to
  // keyword results (below) when the embedding model/index is unavailable.
  useEffect(() => {
    if (!smart || normalize(q).trim().length < 3) { setSmartResults(null); setSmartState("idle"); return; }
    setSmartState("loading");
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/search/semantic/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q }),
        });
        const d = await r.json().catch(() => ({}));
        if (d.error === "EMBED_MODEL_MISSING" || d.error === "SEARCH_FAILED") {
          setSmartResults(null);
          setSmartState("unavailable");
        } else {
          setSmartResults(d.results || []);
          setSmartState("ok");
        }
      } catch {
        setSmartResults(null);
        setSmartState("unavailable");
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q, smart]);

  const results = useMemo(() => {
    const nq = normalize(q).trim();
    if (nq.length < 2) return [];
    const terms = nq.split(/\s+/);
    const scored = [];
    for (const item of index) {
      const title = normalize(item.title);
      const subj = normalize(item.subject + " " + item.bookTitle + " " + item.classe);
      const text = normalize(item.text);
      let score = 0;
      for (const t of terms) {
        if (title.includes(t)) score += 8;
        if (subj.includes(t)) score += 3;
        if (text.includes(t)) score += 1;
      }
      if (score > 0) {
        let snippet = "";
        const pos = text.indexOf(terms[0]);
        if (pos >= 0) snippet = item.text.slice(Math.max(0, pos - 40), pos + 80);
        scored.push({ ...item, score, snippet });
      }
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, 40);
  }, [q, index]);

  const showSmart = smart && smartState === "ok" && smartResults;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 p-4 sm:p-10" onClick={onClose}>
      <div
        className="mx-auto max-w-2xl rounded-xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-slate-200 px-4">
          <span className="text-slate-400">🔎</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={smart ? "Posez votre question — recherche par le sens…" : "Rechercher une leçon, un mot-clé…"}
            className="w-full py-3 outline-none text-slate-800"
          />
          <button
            onClick={() => setSmart((s) => !s)}
            title="Recherche par le sens (IA locale) — trouve les leçons même sans mot-clé exact"
            className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition ${
              smart ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500 hover:text-slate-700"
            }`}
          >
            ✨ Intelligente
          </button>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-sm">Esc</button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {smart && smartState === "loading" && (
            <p className="p-4 text-sm text-slate-400">Recherche par le sens…</p>
          )}
          {smart && smartState === "unavailable" && (
            <p className="px-4 pt-3 text-xs text-amber-600">
              Recherche intelligente indisponible (index ou modèle absent) — résultats par mots-clés :
            </p>
          )}

          {showSmart ? (
            <>
              {smartResults.length === 0 && (
                <p className="p-4 text-sm text-slate-500">Aucune leçon trouvée pour cette question.</p>
              )}
              {smartResults.map((r) => (
                <a
                  key={r.lessonId}
                  href={`/lesson/?id=${r.lessonId}`}
                  className="block w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100"
                >
                  <div className="text-sm font-medium text-slate-900">{r.title}</div>
                  <div className="text-xs text-slate-500">{r.subject} · {r.moduleTitle}</div>
                  {r.snippet && <div className="mt-1 text-xs text-slate-400 line-clamp-2">…{r.snippet}…</div>}
                </a>
              ))}
            </>
          ) : (
            <>
              {q.length >= 2 && results.length === 0 && (!smart || smartState !== "loading") && (
                <p className="p-4 text-sm text-slate-500">Aucun résultat.</p>
              )}
              {results.map((r, i) => (
                <button
                  key={i}
                  onClick={() => onPick(r)}
                  className="block w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100"
                >
                  <div className="text-sm font-medium text-slate-900">{r.title}</div>
                  <div className="text-xs text-slate-500">{r.classe} · {r.subject} · {r.bookTitle}</div>
                  {r.snippet && <div className="mt-1 text-xs text-slate-400 line-clamp-2">…{r.snippet}…</div>}
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
