"use client";
import { useMemo, useState } from "react";
import Exercises from "./Exercises";

export default function ProfDashboard({ index, exercises, onOpenLesson }) {
  const [subject, setSubject] = useState("");
  const [quality, setQuality] = useState("");

  const exByPath = useMemo(() => {
    const m = {};
    for (const e of exercises) (m[e.lessonPath] ||= []).push(e);
    return m;
  }, [exercises]);

  const books = useMemo(() => {
    const b = {};
    for (const r of index) {
      const x = (b[r.book] ||= { title: r.bookTitle, subject: r.subject, classe: r.classe, n: 0, ok: 0, ex: 0 });
      x.n++;
      if (r.status === "complete") x.ok++;
      x.ex += exByPath[r.path]?.length || 0;
    }
    return b;
  }, [index, exByPath]);

  const totOk = index.filter((r) => r.status === "complete").length;
  const subjects = [...new Set(exercises.map((e) => e.subject))];
  const filtered = exercises.filter((e) => (!subject || e.subject === subject) && (!quality || e.quality === quality));

  return (
    <div>
      <div className="rounded-2xl bg-gradient-to-br from-brand to-teal-900 p-6 text-teal-50 shadow">
        <h1 className="text-2xl font-bold">Espace Professeur</h1>
        <p className="mt-1 max-w-xl text-sm opacity-85">
          Vue d&apos;ensemble du corpus, banque d&apos;exercices reliés aux leçons, et copilote pédagogique pour préparer vos cours.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi v={Object.keys(books).length} l="manuels numérisés" />
        <Kpi v={index.length} l="leçons en ligne" />
        <Kpi v={exercises.length} l="exercices reliés aux leçons" />
        <Kpi v={`${Math.round((totOk / Math.max(1, index.length)) * 100)}%`} l={`contenu vérifié (${totOk}/${index.length})`} />
      </div>

      <h2 className="mt-7 text-xs font-bold uppercase tracking-widest text-slate-400">Qualité du contenu par manuel</h2>
      <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {Object.entries(books).map(([slug, b]) => (
          <div key={slug} className="grid grid-cols-[minmax(130px,220px)_1fr_90px] items-center gap-3 border-b border-dashed border-slate-200 py-2 text-sm last:border-0">
            <span>
              <span className="font-semibold text-slate-900">{b.title}</span>
              <br /><span className="text-xs text-slate-400">{b.subject} · {b.classe}</span>
            </span>
            <span className="h-2.5 overflow-hidden rounded-full bg-amber-200" title={`${b.ok}/${b.n} vérifiés`}>
              <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.max(3, Math.round((b.ok / b.n) * 100))}%` }} />
            </span>
            <span className="text-right text-xs text-slate-500">{b.ok}/{b.n} · {b.ex} ex.</span>
          </div>
        ))}
        <p className="mt-2 text-[11px] text-slate-400">
          Barre verte = leçons «Vérifié» ; fond jaune = brouillon OCR. Source : audit 1 690/1 690 pages.
        </p>
      </div>

      <h2 className="mt-7 text-xs font-bold uppercase tracking-widest text-slate-400">
        Banque d&apos;exercices ({filtered.length})
      </h2>
      <div className="my-3 flex flex-wrap gap-2">
        <select value={subject} onChange={(e) => setSubject(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm">
          <option value="">Toutes matières</option>
          {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={quality} onChange={(e) => setQuality(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm">
          <option value="">Toutes qualités</option>
          <option value="clean">Vérifié</option>
          <option value="ocr">Brouillon OCR</option>
        </select>
      </div>
      <Exercises items={filtered.slice(0, 30)} linked={false} onOpenLesson={onOpenLesson} />
      {filtered.length > 30 && (
        <p className="py-4 text-center text-sm text-slate-400">… {filtered.length - 30} autres (filtrez pour affiner)</p>
      )}
    </div>
  );
}

function Kpi({ v, l }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="text-2xl font-extrabold text-brand">{v}</div>
      <div className="text-xs text-slate-500">{l}</div>
    </div>
  );
}
