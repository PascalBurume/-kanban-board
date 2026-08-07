"use client";
import { useEffect, useState } from "react";
import "./projects.css";
import Icon from "@/components/ui/Icon";
import { BrandMark, OfflinePill } from "@/components/ui/chrome";
import { toast } from "@/lib/toast";

const DIFF = { INTRO: "Initiation", INTERMEDIATE: "Intermédiaire", ADVANCED: "Avancé" };

function StatusChip({ p }) {
  switch (p.status) {
    case "LOCKED":
      return <span className="chip locked"><Icon name="lock" /> Verrouillé · {p.reqDone}/{p.reqTotal} modules</span>;
    case "AVAILABLE":
      return <span className="chip available"><Icon name="play" /> Disponible</span>;
    case "IN_PROGRESS":
      return <span className="chip inprogress"><Icon name="edit" /> En cours · {p.pct}%</span>;
    case "SUBMITTED":
      return <span className="chip submitted"><Icon name="clock" /> Rendu — en attente</span>;
    case "RETURNED":
      return <span className="chip returned"><Icon name="refresh" /> À revoir</span>;
    case "GRADED":
      return <span className="chip graded"><Icon name="check" /> Noté {p.grade}/100</span>;
    default:
      return null;
  }
}

function Card({ p, accent }) {
  const locked = p.status === "LOCKED";
  const inner = (
    <>
      <div className="proj-top">
        <span className="proj-diff">{DIFF[p.difficulty] || p.difficulty}</span>
        <span style={{ marginLeft: "auto" }}><StatusChip p={p} /></span>
      </div>
      <h3>{p.title}</h3>
      <div className="proj-meta">
        <span><Icon name="layers" /> {p.stepCount} étapes</span>
        <span><Icon name="clock" /> {p.estMinutes} min</span>
        {p.dueDate && <span><Icon name="calendar" /> {new Date(p.dueDate).toLocaleDateString("fr-FR")}</span>}
      </div>
      {locked && p.lockedModules?.length > 0 && (
        <p className="muted" style={{ fontSize: 12, margin: "10px 0 0" }}>
          À terminer d’abord : {p.lockedModules.join(", ")}
        </p>
      )}
      {p.status === "IN_PROGRESS" && (
        <div className="proj-foot"><div className="proj-prog"><i style={{ width: `${p.pct}%` }} /></div></div>
      )}
    </>
  );
  if (locked) {
    return (
      <div className="proj-card locked" style={{ "--accent": accent }} role="button" tabIndex={0}
        onClick={() => toast("Termine les modules requis pour débloquer ce projet.", { icon: "lock" })}>
        {inner}
      </div>
    );
  }
  return <a className="proj-card" href={`/projects/${p.id}/`} style={{ "--accent": accent }}>{inner}</a>;
}

export default function ProjectsHub() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/student/projects/")
      .then(async (r) => {
        if (r.status === 403) { window.location.href = "/login/"; return null; }
        return r.json();
      })
      .then((d) => d && setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const subjects = data?.subjects || [];
  const empty = !loading && subjects.every((s) => (s.projects || []).length === 0);

  return (
    <div className="proj-page">
      <header className="app-header">
        <a className="brand" href="/student/" style={{ textDecoration: "none", color: "inherit" }}>
          <BrandMark /> Mwalimu
        </a>
        <div className="row" style={{ gap: 14 }}>
          <OfflinePill label="Serveur local connecté" />
          <a className="back-pill" href="/student/"><Icon name="chevL" /> Tableau de bord</a>
        </div>
      </header>

      <main className="proj-wrap">
        <div className="proj-hero">
          <div className="ph-ic"><Icon name="layers" /></div>
          <div>
            <h1>Projets appliqués</h1>
            <p>Mets en pratique ce que tu as appris sur un cas réel. Chaque projet se débloque une fois ses modules terminés, puis te guide étape par étape jusqu’au rendu corrigé par ton enseignant.</p>
          </div>
        </div>

        {loading ? (
          <p className="muted" style={{ padding: 40, textAlign: "center" }}>Chargement…</p>
        ) : empty ? (
          <p className="muted" style={{ padding: 40, textAlign: "center" }}>Aucun projet disponible pour le moment. Continue tes leçons pour en débloquer&nbsp;!</p>
        ) : (
          subjects.filter((s) => s.projects.length).map((s) => (
            <section key={s.slug} className="subj-block">
              <div className="subj-head">
                <span className="subj-ic" style={{ background: (s.color || "#4f46e5") + "22", color: s.color || "#4f46e5" }}>
                  <Icon name={s.icon || "book"} />
                </span>
                <h2>{s.name}</h2>
                <span className="subj-count">{s.projects.length} projet{s.projects.length > 1 ? "s" : ""}</span>
              </div>
              <div className="proj-grid">
                {s.projects.map((p) => <Card key={p.id} p={p} accent={s.color || "#4f46e5"} />)}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
