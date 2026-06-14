"use client";
import { useEffect, useState } from "react";
import "./practice.css";
import Icon from "@/components/ui/Icon";
import { BrandMark, OfflinePill } from "@/components/ui/chrome";
import { SIM_TITLES } from "@/components/sims";

export default function PracticeHub() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/student/chapters/")
      .then(async (r) => {
        if (r.status === 403) { window.location.href = "/login/"; return null; }
        return r.json();
      })
      .then((d) => d && setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const subjects = data?.subjects || [];

  return (
    <div className="practice-page">
      <header className="app-header">
        <a className="brand" href="/student/" style={{ textDecoration: "none", color: "inherit" }}>
          <BrandMark /> Mwalimu
        </a>
        <div className="row" style={{ gap: 14 }}>
          <OfflinePill label="Serveur local connecté" />
          <a className="back-pill" href="/student/"><Icon name="chevL" /> Tableau de bord</a>
        </div>
      </header>

      <main className="practice-wrap">
        <div className="practice-hero">
          <div className="ph-ic"><Icon name="sparkles" /></div>
          <div>
            <h1>Atelier — S’entraîner</h1>
            <p>Choisis un chapitre pour explorer des simulations interactives, des illustrations animées et tous les exercices associés.</p>
          </div>
        </div>

        {loading ? (
          <p className="muted" style={{ padding: 40, textAlign: "center" }}>Chargement…</p>
        ) : subjects.length === 0 ? (
          <p className="muted" style={{ padding: 40, textAlign: "center" }}>Aucun chapitre disponible pour le moment.</p>
        ) : (
          subjects.map((s) => (
            <section key={s.slug} className="subj-block">
              <div className="subj-head">
                <span className="subj-ic" style={{ background: (s.color || "#4f46e5") + "22", color: s.color || "#4f46e5" }}>
                  <Icon name={s.icon || "book"} />
                </span>
                <h2>{s.name}</h2>
                <span className="subj-count">{s.chapters.length} chapitres</span>
              </div>
              <div className="chap-grid">
                {s.chapters.map((c) => (
                  <a key={c.moduleId} className="chap-card" href={`/practice/${c.moduleId}/`} style={{ "--accent": s.color || "#4f46e5" }}>
                    <div className="chap-top">
                      <span className="chap-n">Chapitre {c.order}</span>
                      {c.doneCount === c.lessonCount && c.lessonCount > 0 && <span className="chap-done"><Icon name="check" /></span>}
                    </div>
                    <h3>{c.title}</h3>
                    <div className="chap-meta">
                      <span><Icon name="book" /> {c.lessonCount} leçons</span>
                      {c.exerciseCount > 0 && <span><Icon name="edit" /> {c.exerciseCount} exercices</span>}
                    </div>
                    {c.sims.length > 0 && (
                      <div className="chap-sims">
                        {c.sims.slice(0, 3).map((k) => <span key={k} className="sim-tag">{SIM_TITLES[k] || k}</span>)}
                      </div>
                    )}
                    <span className="chap-go">Ouvrir l’atelier <Icon name="arrowR" /></span>
                  </a>
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
