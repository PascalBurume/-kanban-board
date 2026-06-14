"use client";
import { useEffect, useState } from "react";
import Markdown from "./Markdown";
import Exercises from "./Exercises";
import { loadModule, splitFrontMatter, STATUS_LABELS } from "@/lib/content";

export default function Reader({ module, exercises = [], onBack }) {
  const [state, setState] = useState({ loading: true, body: "", meta: {}, error: null });
  const [tab, setTab] = useState(module.tab === "exercices" ? "exercices" : "lecture");

  useEffect(() => {
    let alive = true;
    setState({ loading: true, body: "", meta: {}, error: null });
    setTab(module.tab === "exercices" ? "exercices" : "lecture");
    loadModule(module.path)
      .then((txt) => {
        if (!alive) return;
        const { meta, body } = splitFrontMatter(txt);
        setState({ loading: false, body, meta, error: null });
      })
      .catch((e) => alive && setState({ loading: false, body: "", meta: {}, error: e.message }));
    return () => { alive = false; };
  }, [module.path, module.tab]);

  const badge = STATUS_LABELS[state.meta.status] || null;
  const isDraft = state.meta.status && state.meta.status !== "complete";

  return (
    <article className="mx-auto max-w-3xl px-4 py-6">
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm text-brand hover:underline">
        ← Retour aux leçons
      </button>
      <div className="mb-3">
        <div className="text-xs text-slate-500">{state.meta.book_title}</div>
        <h1 className="text-2xl font-bold text-slate-900">
          {module.n ? `Module ${module.n} — ` : ""}{module.title}
        </h1>
        {badge && (
          <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.c}`}>
            {badge.t}
          </span>
        )}
      </div>

      {isDraft && tab === "lecture" && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          <span>⚠️</span>
          <span><b>Brouillon OCR.</b> Ce texte vient du scan du manuel : certains accents et formules peuvent être imparfaits. La version vérifiée arrive.</span>
        </div>
      )}

      <div className="mb-4 flex gap-1 border-b border-slate-200">
        <Tab on={tab === "lecture"} onClick={() => setTab("lecture")}>📖 Lecture</Tab>
        <Tab on={tab === "exercices"} onClick={() => setTab("exercices")}>✎ Exercices ({exercises.length})</Tab>
      </div>

      {tab === "lecture" ? (
        <>
          {state.loading && <p className="text-slate-400">Chargement…</p>}
          {state.error && <p className="text-red-600">Erreur : {state.error}</p>}
          {!state.loading && !state.error && <Markdown>{state.body}</Markdown>}
        </>
      ) : (
        <Exercises items={exercises} linked />
      )}
    </article>
  );
}

function Tab({ on, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`-mb-px border-b-2 px-3.5 py-2 text-sm font-semibold ${on ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-brand"}`}>
      {children}
    </button>
  );
}
