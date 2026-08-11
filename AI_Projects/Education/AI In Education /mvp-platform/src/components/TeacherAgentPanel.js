"use client";
import { useState } from "react";
import Icon from "@/components/ui/Icon";
import { toast } from "@/lib/toast";
import "./AgentSteps.css";

// Teacher agent UI: streams /api/teacher/agent/ SSE runs and shows the agent's
// visible "thinking" as a step checklist (spinner → ✓ / ✗), then the result.

export function useAgentStream() {
  const [steps, setSteps] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);

  // `url` lets another agent reuse this reader — the SSE shape ({step}/{result}/
  // {error}) is the contract, not the endpoint. Defaults to the exercises agent so
  // every existing caller is untouched.
  async function start(body, url = "/api/teacher/agent/") {
    setSteps([]); setResult(null); setError(null); setRunning(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setError(j.error === "RATE_LIMITED" ? "Trop de demandes — patientez une minute." : "Assistant indisponible.");
        return null;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "", final = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const line = buf.slice(0, idx); buf = buf.slice(idx + 2);
          if (!line.startsWith("data: ")) continue;
          let o;
          try { o = JSON.parse(line.slice(6)); } catch { continue; }
          if (o.step) {
            setSteps((s) => {
              const i = s.findIndex((x) => x.id === o.step.id);
              if (i >= 0) { const c = [...s]; c[i] = o.step; return c; }
              return [...s, o.step];
            });
          }
          if (o.result) { final = o.result; setResult(o.result); }
          if (o.error) setError(o.error);
        }
      }
      return final;
    } catch {
      setError("Assistant indisponible.");
      return null;
    } finally {
      setRunning(false);
    }
  }

  return { steps, result, error, running, start };
}

// The visible thinking: one row per agent step.
export function AgentSteps({ steps }) {
  if (!steps.length) return null;
  return (
    <div className="ag-steps">
      {steps.map((s) => (
        <div key={s.id} className={`ag-step ${s.status}`}>
          <span className="ag-ic">
            <Icon name={s.status === "running" ? "refresh" : s.status === "done" ? "check" : "x"} />
          </span>
          <span>
            <span className="ag-step-l">{s.label}</span>
            {s.detail && <span className="ag-step-d"> — {s.detail}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

// ───────────────────── Group composer (canvas side panel) ─────────────────────

function GroupComposerAgent({ classId, projects, onApplied }) {
  const { steps, result, error, running, start } = useAgentStream();
  const [size, setSize] = useState(3);
  const [projectId, setProjectId] = useState("");
  const [applying, setApplying] = useState(false);

  const plan = result?.data;

  async function apply() {
    if (!plan?.groups?.length) return;
    setApplying(true);
    try {
      for (const g of plan.groups) {
        const r = await fetch("/api/teacher/projects/groups/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classId, name: g.name }),
        });
        const created = await r.json().catch(() => ({}));
        if (!r.ok) continue; // e.g. name taken — skip, teacher can adjust
        for (const s of g.students) {
          await fetch("/api/teacher/projects/groups/members/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ classId, studentId: s.id, groupId: created.id }),
          });
        }
      }
      toast("Groupes créés sur le canevas ✓", { icon: "check" });
      onApplied && onApplied();
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="ag-body">
      <p className="ag-intro">L’assistant analyse la progression, les quiz et les prérequis, puis propose des groupes équilibrés.</p>
      <div className="ag-row">
        <label>Taille</label>
        <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
          {[2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} élèves</option>)}
        </select>
        <label>Projet</label>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">— aucun —</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.title.slice(0, 30)}</option>)}
        </select>
      </div>
      <button
        className="btn btn-primary btn-sm"
        disabled={running}
        onClick={() => start({ agent: "groups", classId, projectId: projectId || undefined, groupSize: size })}
      >
        <Icon name="sparkles" /> Suggérer des groupes
      </button>

      <AgentSteps steps={steps} />
      {error && <p className="ag-intro" style={{ color: "var(--danger-fg)" }}>{error === "TOO_FEW" ? "Pas assez d'élèves dans cette classe." : "L'assistant n'a pas pu terminer."}</p>}

      {plan && (
        <>
          {result.fallback && <span className="ag-fallback"><Icon name="alert" /> Heuristique — Copilot hors ligne</span>}
          {plan.groups.map((g, i) => (
            <div className="ag-group" key={i}>
              <div className="ag-group-t"><Icon name="users" /> {g.name}</div>
              <div className="ag-group-m">{g.students.map((s) => s.firstName).join(", ")}</div>
              {g.rationale && <div className="ag-group-r">{g.rationale}</div>}
            </div>
          ))}
          <div className="ag-acts">
            <button className="btn btn-primary btn-sm" disabled={applying} onClick={apply}>
              <Icon name="check" /> Appliquer ces groupes
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ───────────────────── At-risk detector (canvas side panel) ───────────────────

function AtRiskAgent({ classId }) {
  const { steps, result, error, running, start } = useAgentStream();
  const report = result?.data;

  return (
    <div className="ag-body">
      <p className="ag-intro">Repère les élèves en difficulté (inactivité, progression, quiz, signaux d’incompréhension) et propose une action.</p>
      <button className="btn btn-primary btn-sm" disabled={running} onClick={() => start({ agent: "atrisk", classId })}>
        <Icon name="alert" /> Détecter les élèves à risque
      </button>

      <AgentSteps steps={steps} />
      {error && <p className="ag-intro" style={{ color: "var(--danger-fg)" }}>L’assistant n’a pas pu terminer.</p>}

      {report && (
        <>
          {result.fallback && <span className="ag-fallback"><Icon name="alert" /> Heuristique — Copilot hors ligne</span>}
          {report.students.length === 0 && <p className="ag-intro">Aucun élève à risque détecté 🎉</p>}
          {report.students.map((s) => (
            <div className={`ag-group ag-risk ${s.risk === "HIGH" ? "high" : ""}`} key={s.id}>
              <div className="ag-group-t">{s.name} <span className="ag-risk-pill">{s.risk === "HIGH" ? "Priorité" : "À suivre"}</span></div>
              <div className="ag-group-m">{s.reasons.join(" · ")}</div>
              <div className="ag-action">→ {s.action}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// Tabs wrapper mounted in the canvas side panel.
export function CanvasAgentPanel({ classId, projects, onApplied }) {
  const [tab, setTab] = useState("groups");
  return (
    <div className="ag-panel">
      <div className="ag-tabs">
        <button className={tab === "groups" ? "active" : ""} onClick={() => setTab("groups")}>
          <Icon name="sparkles" /> Groupes
        </button>
        <button className={tab === "atrisk" ? "active" : ""} onClick={() => setTab("atrisk")}>
          <Icon name="alert" /> À risque
        </button>
      </div>
      {tab === "groups"
        ? <GroupComposerAgent classId={classId} projects={projects} onApplied={onApplied} />
        : <AtRiskAgent classId={classId} />}
    </div>
  );
}

// ───────────────────── Grading agent (review drawer) ─────────────────────────

export function GradingAgent({ submissionId, onInsertFeedback, onSuggestGrade }) {
  const { steps, result, error, running, start } = useAgentStream();
  const [open, setOpen] = useState(false);
  const data = result?.data;

  async function run() {
    setOpen(true);
    const final = await start({ agent: "grading", submissionId });
    if (final?.data && typeof final.data.gradeMin === "number") {
      onSuggestGrade && onSuggestGrade(final.data.gradeMin, final.data.gradeMax);
    }
  }

  return (
    <div className="pj-ai-box">
      <div className="pj-ai-top">
        <button className="cp-link" onClick={run} disabled={running}>
          <Icon name="sparkles" /> {running ? "Analyse en cours…" : "Analyser avec le Copilot"}
        </button>
        {data && <span className="pj-pill ok sm">Note suggérée : {data.gradeMin}–{data.gradeMax}/100</span>}
      </div>

      {open && <AgentSteps steps={steps} />}
      {error && (
        <p className="ag-intro" style={{ color: "var(--danger-fg)" }}>
          {error === "OLLAMA_OFFLINE" ? "Copilot hors ligne — corrigez manuellement." : "Analyse impossible."}
        </p>
      )}

      {data && (
        <>
          {data.steps?.map((s) => (
            <div className="ag-group" key={s.order}>
              <div className="ag-group-t">Étape {s.order} · {s.title}</div>
              {s.good && <div className="ag-group-m">✓ {s.good}</div>}
              {s.missing && <div className="ag-group-m">✗ {s.missing}</div>}
              {s.misconception && <div className="ag-group-r">Malentendu possible : {s.misconception}</div>}
            </div>
          ))}
          {data.draftFeedbackMd && (
            <div className="ag-acts" style={{ marginTop: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => onInsertFeedback && onInsertFeedback(data.draftFeedbackMd)}>
                <Icon name="edit" /> Insérer le retour proposé
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
