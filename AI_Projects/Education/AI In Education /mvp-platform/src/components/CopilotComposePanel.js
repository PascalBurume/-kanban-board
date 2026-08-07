"use client";
import { useState, useRef } from "react";
import Icon from "@/components/ui/Icon";
import Markdown from "@/components/Markdown";
import { toast } from "@/lib/toast";

const AI = "/api/teacher/projects/ai";

function errMsg(status, code) {
  if (status === 503 || code === "OLLAMA_OFFLINE") return "Copilot indisponible — le modèle est hors ligne.";
  if (status === 429) return "Trop de requêtes — patientez une minute.";
  return "Génération impossible — réessayez.";
}

async function postJson(url, body) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let j = null;
  try { j = await r.json(); } catch { /* */ }
  if (!r.ok) throw { status: r.status, code: j?.error };
  return j;
}

// ─────────────────────── Compose panel (project editor) ───────────────────────
const COMPOSE_ACTIONS = [
  { key: "full", label: "Générer un projet complet", icon: "sparkles", primary: true },
  { key: "situation", label: "Proposer une situation", icon: "file" },
  { key: "steps", label: "Générer les étapes", icon: "list" },
  { key: "objectives", label: "Générer les objectifs", icon: "target" },
];

export function CopilotComposePanel({ form, set, setStep }) {
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null); // { action, ... }
  const [error, setError] = useState("");
  const [refineIdx, setRefineIdx] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const lastReq = useRef(null); // { action, extra } for Réessayer

  const noModules = (form.prereqModuleIds || []).length === 0;
  const ctx = () => ({
    subjectSlug: form.subjectSlug,
    classLevel: form.classLevel,
    difficulty: form.difficulty,
    title: form.title || undefined,
    prereqModuleIds: form.prereqModuleIds || [],
    draft: { scenarioMd: form.scenarioMd, objectivesMd: form.objectivesMd, deliverableMd: form.deliverableMd, steps: form.steps },
  });

  async function run(action, extra) {
    lastReq.current = { action, extra };
    setBusy(action);
    setError("");
    if (action !== "refine_step") setResult(null);
    try {
      const r = await postJson(`${AI}/compose/`, { action, ...ctx(), ...extra });
      setResult(r);
    } catch (e) {
      setError(errMsg(e.status, e.code));
    } finally {
      setBusy("");
    }
  }

  const stepsAllBlank = (form.steps || []).every((s) => !s.title?.trim() && !s.instructionMd?.trim());
  const mapSteps = (arr) => (arr || []).map((s) => ({ title: s.title || "", instructionMd: s.instructionMd || "", hintMd: s.hintMd || "" }));
  function applySteps(newSteps, replace) {
    const mapped = mapSteps(newSteps);
    if (!mapped.length) return;
    set({ steps: replace || stepsAllBlank ? mapped : [...form.steps, ...mapped] });
  }
  function insertFull(r, replaceAll) {
    const patch = {};
    if (replaceAll || !form.title.trim()) patch.title = r.title || form.title;
    if (replaceAll || !form.scenarioMd.trim()) patch.scenarioMd = r.scenarioMd || form.scenarioMd;
    if (replaceAll || !form.objectivesMd.trim()) patch.objectivesMd = r.objectivesMd || form.objectivesMd;
    if (replaceAll || !form.deliverableMd.trim()) patch.deliverableMd = r.deliverableMd || form.deliverableMd;
    set(patch);
    applySteps(r.steps, replaceAll);
    setResult(null);
    toast(replaceAll ? "Projet remplacé" : "Projet inséré ✓", { icon: "check" });
  }

  return (
    <div className="cp-panel">
      <div className="cp-head">
        <span className="cp-badge"><Icon name="sparkles" /> Copilot APS</span>
        <span className="cp-sub">Co-auteur — connaît les leçons des modules cochés</span>
      </div>

      {noModules && (
        <div className="cp-hint"><Icon name="info" /> Cochez des modules requis ci-dessous pour que le Copilot s’appuie sur leurs leçons.</div>
      )}

      <div className="cp-actions">
        {COMPOSE_ACTIONS.map((a) => (
          <button key={a.key} className={`btn btn-sm ${a.primary ? "btn-primary" : "btn-secondary"}`} disabled={!!busy} onClick={() => run(a.key)}>
            <Icon name={busy === a.key ? "refresh" : a.icon} /> {busy === a.key ? "Le Copilot réfléchit…" : a.label}
          </button>
        ))}
      </div>

      {/* refine a specific step */}
      {(form.steps || []).length > 0 && (
        <div className="cp-refine">
          <span>Améliorer l’étape</span>
          <select value={refineIdx} onChange={(e) => setRefineIdx(Number(e.target.value))}>
            {form.steps.map((s, i) => <option key={i} value={i}>{i + 1}. {s.title?.trim() || "(sans titre)"}</option>)}
          </select>
          <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => run("refine_step", { stepIndex: refineIdx, stepDraft: form.steps[refineIdx] })}>
            <Icon name={busy === "refine_step" ? "refresh" : "edit"} /> Améliorer
          </button>
        </div>
      )}

      <button className="cp-chat-toggle" onClick={() => setChatOpen((o) => !o)}>
        <Icon name="message" /> {chatOpen ? "Masquer" : "Idées de projets (chat)"}
      </button>
      {chatOpen && <ComposeChat ctx={ctx} onUseSituation={(md) => { set({ scenarioMd: md }); toast("Situation insérée ✓", { icon: "check" }); }} />}

      {error && <div className="cp-error"><Icon name="alert" /> {error} <button className="cp-retry" onClick={() => lastReq.current && run(lastReq.current.action, lastReq.current.extra)}>Réessayer</button></div>}

      {result && (
        <div className="cp-preview">
          {result.action === "full" && (
            <>
              <div className="cp-result-title">Proposition de projet : <b>{result.title}</b></div>
              <CpField label="Situation" md={result.scenarioMd} />
              <CpField label="Objectifs" md={result.objectivesMd} />
              <CpField label="Livrable" md={result.deliverableMd} />
              {(result.steps || []).map((s, i) => (
                <div className="cp-step" key={i}><b>{i + 1}. {s.title}</b><Markdown>{s.instructionMd}</Markdown>{s.hintMd ? <div className="cp-hintline">💡 {s.hintMd}</div> : null}</div>
              ))}
              <div className="cp-insert">
                <button className="btn btn-primary btn-sm" onClick={() => insertFull(result, false)}><Icon name="check" /> Insérer (champs vides)</button>
                <button className="btn btn-secondary btn-sm" onClick={() => insertFull(result, true)}>Remplacer tout</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setResult(null)}>Ignorer</button>
              </div>
            </>
          )}
          {result.action === "situation" && (
            <>
              <CpField label="Situation proposée" md={result.scenarioMd} />
              <div className="cp-insert">
                <button className="btn btn-primary btn-sm" onClick={() => { set({ scenarioMd: result.scenarioMd }); setResult(null); toast("Situation insérée ✓", { icon: "check" }); }}><Icon name="check" /> Utiliser cette situation</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setResult(null)}>Ignorer</button>
              </div>
            </>
          )}
          {result.action === "objectives" && (
            <>
              <CpField label="Objectifs proposés" md={result.objectivesMd} />
              <div className="cp-insert">
                <button className="btn btn-primary btn-sm" onClick={() => { set({ objectivesMd: result.objectivesMd }); setResult(null); toast("Objectifs insérés ✓", { icon: "check" }); }}><Icon name="check" /> Utiliser ces objectifs</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setResult(null)}>Ignorer</button>
              </div>
            </>
          )}
          {result.action === "steps" && (
            <>
              {(result.steps || []).map((s, i) => (
                <div className="cp-step" key={i}><b>{i + 1}. {s.title}</b><Markdown>{s.instructionMd}</Markdown>{s.hintMd ? <div className="cp-hintline">💡 {s.hintMd}</div> : null}</div>
              ))}
              <div className="cp-insert">
                <button className="btn btn-primary btn-sm" onClick={() => { applySteps(result.steps, false); setResult(null); toast("Étapes ajoutées ✓", { icon: "check" }); }}><Icon name="plus" /> Ajouter ces étapes</button>
                <button className="btn btn-secondary btn-sm" onClick={() => { applySteps(result.steps, true); setResult(null); toast("Étapes remplacées", { icon: "check" }); }}>Remplacer les étapes</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setResult(null)}>Ignorer</button>
              </div>
            </>
          )}
          {result.action === "refine_step" && result.step && (
            <>
              <div className="cp-step"><b>Étape {refineIdx + 1} améliorée : {result.step.title}</b><Markdown>{result.step.instructionMd}</Markdown>{result.step.hintMd ? <div className="cp-hintline">💡 {result.step.hintMd}</div> : null}</div>
              <div className="cp-insert">
                <button className="btn btn-primary btn-sm" onClick={() => { setStep(refineIdx, result.step); setResult(null); toast(`Étape ${refineIdx + 1} remplacée ✓`, { icon: "check" }); }}><Icon name="check" /> Remplacer l’étape {refineIdx + 1}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setResult(null)}>Ignorer</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CpField({ label, md }) {
  return (
    <div className="cp-field">
      <div className="cp-field-l">{label}</div>
      <div className="cp-field-md"><Markdown>{md || "—"}</Markdown></div>
    </div>
  );
}

function ComposeChat({ ctx, onUseSituation }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const boxRef = useRef(null);

  async function send() {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    const history = msgs.map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "" }]);
    setBusy(true);
    try {
      const res = await fetch(`${AI}/compose/`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "chat", ...ctx(), message: q, history }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setMsgs((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: errMsg(res.status, j.error) }; return c; });
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "", full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const line = buf.slice(0, idx); buf = buf.slice(idx + 2);
          if (!line.startsWith("data: ")) continue;
          const o = JSON.parse(line.slice(6));
          if (o.delta) { full += o.delta; setMsgs((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: full }; return c; }); }
          if (o.error) full = full || "Génération interrompue.";
        }
      }
    } finally {
      setBusy(false);
      requestAnimationFrame(() => boxRef.current?.scrollTo(0, boxRef.current.scrollHeight));
    }
  }

  return (
    <div className="cp-chat">
      <div className="cp-chat-box" ref={boxRef}>
        {msgs.length === 0 && <div className="cp-chat-empty">Demandez une idée : « une situation sur l’eau pour le module Statistiques », « un projet autour du marché »…</div>}
        {msgs.map((m, i) => (
          <div key={i} className={`cp-msg ${m.role}`}>
            <Markdown>{m.content || "…"}</Markdown>
            {m.role === "assistant" && m.content && !busy && (
              <button className="cp-use" onClick={() => onUseSituation(m.content)}>→ Utiliser comme situation</button>
            )}
          </div>
        ))}
      </div>
      <div className="cp-chat-input">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Votre idée…" disabled={busy} />
        <button className="btn btn-primary btn-sm" onClick={send} disabled={busy || !input.trim()}><Icon name={busy ? "refresh" : "send"} /></button>
      </div>
    </div>
  );
}

// ───────────────────────── Grading assistant (drawer) ─────────────────────────
export function ReviewCopilot({ submissionId, onInsertFeedback, onSuggestGrade }) {
  const [busy, setBusy] = useState(false);
  const [a, setA] = useState(null);
  const [error, setError] = useState("");

  async function analyze() {
    setBusy(true); setError("");
    try {
      const r = await postJson(`${AI}/review/`, { submissionId });
      setA(r.analysis);
      if (r.analysis && onSuggestGrade) onSuggestGrade(r.analysis.gradeMin, r.analysis.gradeMax);
    } catch (e) {
      setError(errMsg(e.status, e.code));
    } finally { setBusy(false); }
  }

  return (
    <div className="rv-ai">
      {!a && (
        <button className="btn btn-secondary btn-sm" onClick={analyze} disabled={busy}>
          <Icon name={busy ? "refresh" : "sparkles"} /> {busy ? "Le Copilot analyse…" : "Analyse Copilot"}
        </button>
      )}
      {error && <div className="cp-error"><Icon name="alert" /> {error} <button className="cp-retry" onClick={analyze}>Réessayer</button></div>}
      {a && (
        <div className="rv-ai-result">
          <div className="rv-ai-head"><span className="cp-badge"><Icon name="sparkles" /> Analyse Copilot</span><span className="rv-ai-grade">Note suggérée : {a.gradeMin}–{a.gradeMax}/100</span></div>
          {a.steps.map((s) => (
            <div className="rv-ai-step" key={s.order}>
              <div className="rv-ai-step-t">Étape {s.order} — {s.title}</div>
              {s.good && <div className="rv-ai-good"><b>Réussi :</b> {s.good}</div>}
              {s.missing && <div className="rv-ai-missing"><b>Manque :</b> {s.missing}</div>}
              {s.misconception && <div className="rv-ai-misc"><b>⚠ Conception erronée :</b> {s.misconception}</div>}
            </div>
          ))}
          {a.draftFeedbackMd && (
            <div className="rv-ai-fb">
              <div className="rv-ai-fb-l">Retour proposé</div>
              <div className="rv-ai-fb-md"><Markdown>{a.draftFeedbackMd}</Markdown></div>
              <button className="btn btn-primary btn-sm" onClick={() => onInsertFeedback(a.draftFeedbackMd)}><Icon name="check" /> Insérer dans le retour</button>
            </div>
          )}
          <div className="cp-disclaim">Le Copilot propose — vous gardez la décision finale de la note.</div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Assign advisor (assign card) ──────────────────────
const READY = {
  READY: { l: "Classe prête", cls: "ok" },
  PARTIAL: { l: "Partiellement prête", cls: "warn" },
  NOT_READY: { l: "Pas encore prête", cls: "danger" },
};
export function AssignCopilot({ projectId, classId, onApplyDate }) {
  const [busy, setBusy] = useState(false);
  const [adv, setAdv] = useState(null);
  const [error, setError] = useState("");

  async function ask() {
    setBusy(true); setError("");
    try {
      const r = await postJson(`${AI}/assign-advice/`, { projectId, classId });
      setAdv(r.advice);
    } catch (e) {
      setError(errMsg(e.status, e.code));
    } finally { setBusy(false); }
  }

  const meta = adv ? READY[adv.readiness] || READY.PARTIAL : null;
  return (
    <div className="pj-ai-advice">
      {!adv && (
        <button className="cp-link" onClick={ask} disabled={busy}>
          <Icon name={busy ? "refresh" : "sparkles"} /> {busy ? "Conseil en cours…" : "Conseil Copilot"}
        </button>
      )}
      {error && <span className="cp-error-inline"><Icon name="alert" /> {error}</span>}
      {adv && meta && (
        <div className="pj-ai-box">
          <div className="pj-ai-top"><span className={`pj-pill ${meta.cls}`}>{meta.l}</span>{adv.suggestedDueDate && <button className="btn btn-secondary btn-sm" onClick={() => onApplyDate(adv.suggestedDueDate)}><Icon name="calendar" /> Échéance : {adv.suggestedDueDate}</button>}</div>
          {adv.readinessNote && <div className="muted" style={{ fontSize: 13 }}>{adv.readinessNote}</div>}
          {adv.rationale && <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{adv.rationale}</div>}
        </div>
      )}
    </div>
  );
}
