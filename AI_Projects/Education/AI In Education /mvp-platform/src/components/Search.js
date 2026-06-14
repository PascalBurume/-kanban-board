"use client";
import { useEffect, useMemo, useRef, useState } from "react";

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default function Search({ index, onPick, onClose }) {
  const [q, setQ] = useState("");
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
            placeholder="Rechercher une leçon, un mot-clé…"
            className="w-full py-3 outline-none text-slate-800"
          />
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-sm">Esc</button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {q.length >= 2 && results.length === 0 && (
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
        </div>
      </div>
    </div>
  );
}
