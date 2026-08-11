"use client";
import { useEffect, useState } from "react";
import "../module.css";
import Icon from "@/components/ui/Icon";
import Ring from "@/components/ui/Ring";
import { BrandMark, OfflinePill } from "@/components/ui/chrome";
import UnderstandingRating from "@/components/UnderstandingRating";

const UNDERSTOOD_LABEL = { 0: "Pas du tout", 25: "Un peu", 50: "Moyennement", 75: "Bien", 100: "Parfaitement" };

export default function ModulePage({ params }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openRating, setOpenRating] = useState(null); // lessonId being rated

  const load = () => {
    fetch(`/api/student/chapters/${params.id}/`)
      .then(async (r) => {
        if (r.status === 403) { window.location.href = "/login/"; return null; }
        if (r.status === 404) { setData("notfound"); return null; }
        return r.json();
      })
      .then((d) => d && setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, [params.id]);

  if (loading) return <div className="module-page"><p className="muted center">Chargement…</p></div>;
  if (!data || data === "notfound") {
    return <div className="module-page"><p className="muted center">Module introuvable. <a href="/student/">Retour au tableau de bord</a></p></div>;
  }

  const accent = data.color || "#4f46e5";
  const description = data.lessons[0]?.objectives?.[0] || data.lessons[0]?.notions?.[0] || `${data.subjectName} · ${data.lessons.length} leçons`;
  const lessonStatusIcon = (l) => (l.status === "done" ? (l.hasQuiz ? "trophy" : "check") : "play");

  return (
    <div className="module-page" style={{ "--accent": accent }}>
      <header className="app-header">
        <a className="brand" href="/student/" style={{ textDecoration: "none", color: "inherit" }}>
          <BrandMark /> Mwalimu
        </a>
        <div className="row" style={{ gap: 14 }}>
          <OfflinePill label="Serveur local connecté" />
          <a className="back-pill" href="/student/"><Icon name="chevL" /> Tous les modules</a>
        </div>
      </header>

      <main className="module-wrap">
        <div className="md-crumb">
          <a href="/student/">Modules</a> <Icon name="chevR" /> <span>M{data.moduleIndex}</span>
        </div>

        {/* Hero */}
        <div className="md-hero">
          <Ring pct={data.pct} size={92} stroke={8} color="#fff" track="rgba(255,255,255,.28)" />
          <div className="md-hero-body">
            <div className="md-eyebrow">Module {data.moduleIndex} sur {data.moduleTotal} · {data.subjectName}</div>
            <h1>{data.title}</h1>
            <p>{description}</p>
            <div className="md-cta">
              {data.continueLessonId && (
                <a className="btn btn-primary" href={`/lesson/?id=${data.continueLessonId}`}>
                  <Icon name="play" /> {data.doneCount > 0 ? "Continuer" : "Commencer"}
                </a>
              )}
              <a className="btn btn-secondary" href={`/practice/${data.moduleId}/`}>
                <Icon name="sparkles" /> Aller à l’atelier
              </a>
              <span className="md-count">{data.doneCount}/{data.lessons.length} leçons</span>
            </div>
          </div>
        </div>

        <div className="md-grid">
          {/* Lessons */}
          <section className="md-lessons card">
            <div className="md-sec-head"><h2><Icon name="book" /> Leçons</h2></div>
            {data.lessons.map((l, i) => {
              const fb = l.feedback;
              const open = openRating === l.id;
              return (
                <div className={`md-lesson md-${l.status}`} key={l.id}>
                  <div className="md-lesson-row">
                    <span className={`md-node ${l.status}`}><Icon name={lessonStatusIcon(l)} /></span>
                    <div className="md-lesson-main">
                      <div className="md-lcode">L{data.moduleIndex}.{i + 1}{l.hasQuiz ? " · Quiz" : ""}</div>
                      <a className="md-ltitle" href={`/lesson/?id=${l.id}`}>{l.title}</a>
                    </div>
                    <span className="md-lmin">{l.estMinutes} min</span>
                    {l.done && (
                      <button className={`md-understood u${fb ? fb.understanding : "none"}`} onClick={() => setOpenRating(open ? null : l.id)} title="Mon niveau de compréhension">
                        {fb ? `${fb.understanding}%` : "Évaluer"}
                      </button>
                    )}
                    <a className="md-open" href={`/lesson/?id=${l.id}`}>Ouvrir <Icon name="arrowR" /></a>
                  </div>
                  {open && (
                    <div className="md-rating">
                      <div className="md-rating-q">À quel point as-tu compris cette leçon ?</div>
                      <UnderstandingRating
                        lessonId={l.id}
                        initial={fb}
                        onSaved={(saved) => { setOpenRating(null); load(); }}
                      />
                    </div>
                  )}
                  {l.done && fb && fb.message && !open && (
                    <div className="md-fb-note"><Icon name="message" /> Message envoyé à l’enseignant — <span className="muted">« {fb.message} »</span></div>
                  )}
                </div>
              );
            })}
          </section>

          {/* Sidebar */}
          <aside className="md-side">
            <div className="card md-side-card">
              <h3><Icon name="sparkles" /> Atelier du chapitre</h3>
              <p className="muted">Simulations interactives, illustrations animées et tous les exercices.</p>
              <ul className="md-side-list">
                {data.sims.length > 0 && <li><Icon name="check" /> {data.sims.length} simulation(s)</li>}
                <li><Icon name="check" /> Illustration animée</li>
                {data.exercises.length > 0 && <li><Icon name="check" /> {data.exercises.length} exercice(s) corrigé(s)</li>}
              </ul>
              <a className="btn btn-primary btn-block" href={`/practice/${data.moduleId}/`}>Ouvrir l’atelier</a>
            </div>

            <div className="card md-side-card">
              <h3><Icon name="target" /> Compréhension</h3>
              <p className="muted">Après chaque leçon, indique ce que tu as compris — ton enseignant reçoit tes retours.</p>
            </div>
          </aside>
        </div>

        {/* Module nav */}
        <div className="md-nav">
          <a className="back-pill" href="/student/"><Icon name="chevL" /> Tous les modules</a>
          <div className="row" style={{ gap: 10 }}>
            {data.prevModuleId && <a className="md-navbtn" href={`/module/${data.prevModuleId}/`}><Icon name="chevL" /> Précédent</a>}
            {data.nextModuleId && <a className="md-navbtn" href={`/module/${data.nextModuleId}/`}>Suivant <Icon name="chevR" /></a>}
          </div>
        </div>
      </main>
    </div>
  );
}
