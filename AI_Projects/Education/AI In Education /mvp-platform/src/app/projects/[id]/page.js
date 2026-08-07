"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import "../projects.css";
import Icon from "@/components/ui/Icon";
import Markdown from "@/components/Markdown";
import { BrandMark, OfflinePill } from "@/components/ui/chrome";
import { toast } from "@/lib/toast";

const DIFF = { INTRO: "Initiation", INTERMEDIATE: "Intermédiaire", ADVANCED: "Avancé" };

export default function ProjectWorkspace() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [steps, setSteps] = useState([]);
  const [active, setActive] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [saveState, setSaveState] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // coach
  const [coach, setCoach] = useState([]);
  const [coachIn, setCoachIn] = useState("");
  const [coachBusy, setCoachBusy] = useState(false);
  const coachBodyRef = useRef(null);

  const load = () =>
    fetch(`/api/student/projects/${id}/`)
      .then(async (r) => {
        if (r.status === 403) { window.location.href = "/login/"; return null; }
        if (!r.ok) return null;
        return r.json();
      })
      .then((d) => {
        if (d) { setData(d); setSteps(d.steps || []); }
      })
      .finally(() => setLoading(false));

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => { setShowHint(false); setCoach([]); }, [active]);
  useEffect(() => { if (coachBodyRef.current) coachBodyRef.current.scrollTop = coachBodyRef.current.scrollHeight; }, [coach]);

  const readOnly = data?.readOnly;
  const cur = steps[active];

  function setResponse(idx, val) {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, response: val } : s)));
  }

  async function saveStep(idx, opts = {}) {
    const s = steps[idx];
    if (!s) return;
    setSaveState("Enregistrement…");
    try {
      const r = await fetch(`/api/student/projects/${id}/step/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepId: s.id, responseMd: s.response, ...opts }),
      });
      if (!r.ok) { setSaveState("Échec"); return null; }
      const j = await r.json();
      setSaveState("Enregistré ✓");
      setTimeout(() => setSaveState(""), 1500);
      return j;
    } catch {
      setSaveState("Hors ligne");
      return null;
    }
  }

  async function toggleDone(idx) {
    const s = steps[idx];
    const next = !s.done;
    const j = await saveStep(idx, { done: next });
    if (j) {
      setSteps((prev) => prev.map((x, i) => (i === idx ? { ...x, done: next } : x)));
      // refresh canSubmit from server truth
      if (j.allDone !== undefined) setData((d) => ({ ...d, canSubmit: j.allDone && !readOnly }));
    }
  }

  async function submit() {
    setSubmitting(true);
    try {
      const r = await fetch(`/api/student/projects/${id}/submit/`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { toast("Projet rendu ✓ Ton enseignant le corrigera.", { icon: "check" }); await load(); }
      else if (j.error === "INCOMPLETE") toast("Termine toutes les étapes avant de rendre.", { icon: "alert" });
      else toast("Impossible de rendre le projet pour le moment.", { icon: "alert" });
    } finally {
      setSubmitting(false);
    }
  }

  async function askCoach() {
    const q = coachIn.trim();
    if (!q || coachBusy || !cur) return;
    setCoachIn("");
    const history = coach.map((m) => ({ role: m.role, content: m.text }));
    setCoach((c) => [...c, { role: "user", text: q }, { role: "assistant", text: "" }]);
    setCoachBusy(true);
    try {
      const r = await fetch("/api/copilot/project/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id, stepId: cur.id, content: q, draft: cur.response || "", history }),
      });
      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({}));
        const msg = j.error === "COPILOT_DISABLED" ? "Le Copilot est désactivé par ton enseignant."
          : j.error === "OLLAMA_OFFLINE" ? "Le tuteur local est hors ligne."
          : j.error === "RATE_LIMITED" ? "Doucement 🙂 attends un instant." : "Le tuteur n’a pas pu répondre.";
        setCoach((c) => c.map((m, i) => (i === c.length - 1 ? { ...m, text: msg } : m)));
        return;
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";
        for (const p of parts) {
          const line = p.replace(/^data:\s*/, "").trim();
          if (!line) continue;
          try {
            const ev = JSON.parse(line);
            if (ev.delta) setCoach((c) => c.map((m, i) => (i === c.length - 1 ? { ...m, text: m.text + ev.delta } : m)));
          } catch {}
        }
      }
    } catch {
      setCoach((c) => c.map((m, i) => (i === c.length - 1 ? { ...m, text: "Connexion interrompue." } : m)));
    } finally {
      setCoachBusy(false);
    }
  }

  return (
    <div className="proj-page">
      <header className="app-header">
        <a className="brand" href="/student/" style={{ textDecoration: "none", color: "inherit" }}>
          <BrandMark /> Mwalimu
        </a>
        <div className="row" style={{ gap: 14 }}>
          <OfflinePill label="Serveur local connecté" />
          <a className="back-pill" href="/projects/"><Icon name="chevL" /> Projets</a>
        </div>
      </header>

      <main className="proj-wrap">
        {loading ? (
          <p className="muted" style={{ padding: 40, textAlign: "center" }}>Chargement…</p>
        ) : !data ? (
          <p className="muted" style={{ padding: 40, textAlign: "center" }}>Projet introuvable.</p>
        ) : (
          <>
            <div className="ws-brief">
              <span className="proj-diff">{DIFF[data.difficulty] || data.difficulty}</span>
              <h1>{data.title}</h1>
              <div className="sub">
                <span><Icon name={data.icon || "book"} /> {data.subjectName}</span>
                <span><Icon name="layers" /> {data.stepCount} étapes</span>
                <span><Icon name="clock" /> {data.estMinutes} min</span>
              </div>
              <Markdown>{data.scenarioMd}</Markdown>
              <div className="brief-grid" style={{ marginTop: 16 }}>
                {data.objectivesMd && (
                  <div className="brief-box">
                    <h4>Objectifs</h4>
                    <Markdown>{data.objectivesMd}</Markdown>
                  </div>
                )}
                <div className="brief-box">
                  <h4>Modules requis</h4>
                  <ul className="req-list">
                    {data.requiredModules.map((m, i) => (
                      <li key={i}>
                        {m.complete ? <span className="ok"><Icon name="check" /></span> : <span className="no"><Icon name="lock" /></span>}
                        {m.title}
                      </li>
                    ))}
                    {data.requiredModules.length === 0 && <li className="muted">Aucun — projet libre.</li>}
                  </ul>
                </div>
                {data.deliverableMd && (
                  <div className="brief-box">
                    <h4>À rendre</h4>
                    <Markdown>{data.deliverableMd}</Markdown>
                  </div>
                )}
              </div>
            </div>

            {data.locked ? (
              <div className="locked-note">
                <p style={{ fontSize: 16, fontWeight: 600, color: "#475569" }}>
                  <Icon name="lock" /> Ce projet se débloquera quand tu auras terminé les modules requis ci-dessus.
                </p>
                <a className="btn btn-primary" href="/student/" style={{ marginTop: 8 }}>Continuer mes leçons</a>
              </div>
            ) : (
              <>
                {data.submission?.status === "RETURNED" && data.submission.feedbackMd && (
                  <div className="feedback-box" style={{ background: "#fef2f2", borderColor: "#fecaca" }}>
                    <h4 style={{ color: "#b91c1c", margin: "0 0 6px" }}>À revoir — note de l’enseignant</h4>
                    <Markdown>{data.submission.feedbackMd}</Markdown>
                  </div>
                )}
                {data.submission?.status === "GRADED" && (
                  <div className="feedback-box">
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <span className="grade">{data.submission.grade}/100</span>
                      <div>
                        <h4 style={{ margin: "0 0 4px", color: "#047857" }}>Projet corrigé</h4>
                        {data.submission.feedbackMd ? <Markdown>{data.submission.feedbackMd}</Markdown> : <span className="muted">Pas de commentaire.</span>}
                      </div>
                    </div>
                  </div>
                )}
                {data.submission?.status === "SUBMITTED" && (
                  <div className="submit-bar">
                    <p><Icon name="clock" /> Projet rendu — en attente de correction par ton enseignant.</p>
                  </div>
                )}

                <div className="ws">
                  <nav className="stepper">
                    {steps.map((s, i) => (
                      <button key={s.id} className={i === active ? "active" : ""} onClick={() => setActive(i)}>
                        <span className={`step-dot ${s.done ? "done" : ""}`}>{s.done ? <Icon name="check" /> : i + 1}</span>
                        <span style={{ flex: 1 }}>{s.title}</span>
                      </button>
                    ))}
                  </nav>

                  <div>
                    {cur && (
                      <div className="step-panel">
                        <div className="step-no">Étape {active + 1} / {steps.length}</div>
                        <h2>{cur.title}</h2>
                        <Markdown>{cur.instructionMd}</Markdown>
                        {cur.hintMd && (
                          <>
                            <button className="hint-btn" onClick={() => setShowHint((v) => !v)}>
                              <Icon name="info" /> {showHint ? "Masquer l’indice" : "Voir un indice"}
                            </button>
                            {showHint && <div className="hint-box"><Markdown>{cur.hintMd}</Markdown></div>}
                          </>
                        )}

                        <textarea
                          value={cur.response}
                          disabled={readOnly}
                          placeholder="Rédige ta réponse pour cette étape…"
                          onChange={(e) => setResponse(active, e.target.value)}
                          onBlur={() => !readOnly && saveStep(active)}
                        />
                        {!readOnly && (
                          <div className="step-actions">
                            <button className="btn btn-ghost" onClick={() => saveStep(active)}><Icon name="save" /> Enregistrer</button>
                            <button className={`btn btn-done ${cur.done ? "on" : ""}`} onClick={() => toggleDone(active)}>
                              <Icon name="check" /> {cur.done ? "Étape terminée" : "Marquer terminée"}
                            </button>
                            <span className="save-state">{saveState}</span>
                          </div>
                        )}

                        {/* Copilot coach */}
                        {!readOnly && (
                          <div className="coach">
                            <div className="coach-head"><Icon name="sparkles" /> Copilot — coach de projet</div>
                            <div className="coach-body" ref={coachBodyRef}>
                              {coach.length === 0 ? (
                                <div className="coach-empty">Bloqué·e sur cette étape ? Demande un coup de main — je te guide sans donner la réponse 🙂</div>
                              ) : (
                                coach.map((m, i) => (
                                  <div key={i} className={`coach-msg ${m.role === "user" ? "user" : "bot"}`}>{m.text || "…"}</div>
                                ))
                              )}
                            </div>
                            <div className="coach-input">
                              <input
                                value={coachIn}
                                placeholder="Pose ta question sur cette étape…"
                                onChange={(e) => setCoachIn(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && askCoach()}
                                disabled={coachBusy}
                              />
                              <button className="btn btn-primary" onClick={askCoach} disabled={coachBusy || !coachIn.trim()}><Icon name="send" /></button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {!readOnly && (
                      <div className="submit-bar">
                        <p>
                          {data.canSubmit
                            ? "Toutes les étapes sont terminées. Tu peux rendre ton projet 🎉"
                            : "Termine toutes les étapes (bouton « Marquer terminée ») pour pouvoir rendre le projet."}
                        </p>
                        <button className="btn btn-primary" disabled={!data.canSubmit || submitting} onClick={submit}>
                          <Icon name="check" /> {submitting ? "Envoi…" : data.submission?.status === "RETURNED" ? "Rendre à nouveau" : "Rendre le projet"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
