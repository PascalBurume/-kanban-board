"use client";
import { useEffect, useState, useRef } from "react";
import "../practice.css";
import Icon from "@/components/ui/Icon";
import { BrandMark, OfflinePill } from "@/components/ui/chrome";
import Sims from "@/components/sims";
import ConceptIllustration from "@/components/ConceptIllustration";
import Exercises from "@/components/Exercises";
import CopilotPanel from "@/components/CopilotPanel";
import { useFullscreen } from "@/lib/fullscreen";

const TABS = [
  { key: "sim", label: "Simuler", icon: "sparkles" },
  { key: "illu", label: "Illustrer", icon: "eye" },
  { key: "ex", label: "S’exercer", icon: "edit" },
];

export default function ChapterWorkspace({ params }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("sim");
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [activeEx, setActiveEx] = useState(null); // exercise the student is looking at (S'exercer tab)
  const stageRef = useRef(null);
  const { isFull, toggle } = useFullscreen(stageRef);

  useEffect(() => {
    fetch(`/api/student/chapters/${params.id}/`)
      .then(async (r) => {
        if (r.status === 403) { window.location.href = "/login/"; return null; }
        if (r.status === 404) { setData("notfound"); return null; }
        return r.json();
      })
      .then((d) => d && setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params.id]);

  // Default to the first tab that has content (sims → else illustration).
  useEffect(() => {
    if (data && data !== "notfound" && data.sims?.length === 0) setTab("illu");
  }, [data]);

  // Leaving the exercises tab clears the focused exercise so chips revert.
  useEffect(() => {
    if (tab !== "ex") setActiveEx(null);
  }, [tab]);

  if (loading) return <div className="practice-page"><p className="muted" style={{ padding: 60, textAlign: "center" }}>Chargement…</p></div>;
  if (!data || data === "notfound") {
    return (
      <div className="practice-page">
        <p className="muted" style={{ padding: 60, textAlign: "center" }}>Chapitre introuvable. <a href="/practice/">Retour à l’atelier</a></p>
      </div>
    );
  }

  const hasSim = data.sims?.length > 0;
  const hasEx = data.exercises?.length > 0;
  // Where the student is: their first not-yet-completed lesson, else the first.
  const resumeLesson = data.lessons.find((l) => !l.done) || data.lessons[0];

  return (
    <div className="practice-page">
      <header className="app-header">
        <a className="brand" href="/practice/" style={{ textDecoration: "none", color: "inherit" }}>
          <BrandMark /> Mwalimu
        </a>
        <div className="row" style={{ gap: 14 }}>
          <OfflinePill label="Serveur local connecté" />
          <a className="back-pill" href="/practice/"><Icon name="chevL" /> Atelier</a>
        </div>
      </header>

      <main className="practice-wrap">
        <div className="chap-hero" style={{ "--accent": data.color || "#4f46e5" }}>
          <span className="chap-eyebrow">{data.subjectName}</span>
          <h1>{data.title}</h1>
          <p>{data.lessons.length} leçons · {data.exercises.length} exercices</p>
          {resumeLesson && (
            <a className="chap-resume" href={`/lesson/?id=${resumeLesson.id}`}>
              <Icon name="book" /> Revenir à la leçon
            </a>
          )}
        </div>

        <div className="ws-tabs">
          {TABS.map((t) => {
            const disabled = (t.key === "sim" && !hasSim) || (t.key === "ex" && !hasEx);
            return (
              <button key={t.key} className={`ws-tab${tab === t.key ? " on" : ""}`} disabled={disabled} onClick={() => setTab(t.key)}>
                <Icon name={t.icon} /> {t.label}
                {t.key === "ex" && hasEx ? <span className="ws-badge">{data.exercises.length}</span> : null}
              </button>
            );
          })}
          <span className="grow" />
          <button className="sim-fs" onClick={toggle} title={isFull ? "Quitter le plein écran" : "Plein écran"}>
            <Icon name={isFull ? "x" : "eye"} /> <span>{isFull ? "Quitter" : "Plein écran"}</span>
          </button>
        </div>

        <div className={`ws-stage${isFull ? " is-full" : ""}`} ref={stageRef}>
          {tab === "sim" && (hasSim ? <Sims keys={data.sims} /> : <Empty>Aucune simulation pour ce chapitre — essaie l’illustration animée.</Empty>)}
          {tab === "illu" && <ConceptIllustration lessons={data.lessons} />}
          {tab === "ex" && (hasEx ? <Exercises items={data.exercises} linked onActiveExercise={setActiveEx} /> : <Empty>Pas encore d’exercices extraits pour ce chapitre.</Empty>)}
        </div>
      </main>

      {/* Copilot — chapter-scoped tutor in a slide-over drawer */}
      {resumeLesson && (
        <>
          {!copilotOpen && (
            <button className="cp-fab" onClick={() => setCopilotOpen(true)}>
              <Icon name="sparkles" /> Demander au Copilot
            </button>
          )}
          <div className={`cp-drawer${copilotOpen ? " open" : ""}`}>
            <CopilotPanel
              lessonId={resumeLesson.id}
              subject={data.subjectName}
              tab={tab}
              lesson={resumeLesson}
              exercise={tab === "ex" ? activeEx : null}
              subtitle={`${data.subjectName} · ${data.title}`}
              onClose={() => setCopilotOpen(false)}
            />
          </div>
          {copilotOpen && <div className="cp-scrim" onClick={() => setCopilotOpen(false)} />}
        </>
      )}
    </div>
  );
}

function Empty({ children }) {
  return <div className="ws-empty"><Icon name="info" /><p>{children}</p></div>;
}
