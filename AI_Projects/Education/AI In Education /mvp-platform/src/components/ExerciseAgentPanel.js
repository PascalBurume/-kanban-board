"use client";
import { useState, useRef, useMemo, useEffect } from "react";
import Icon from "@/components/ui/Icon";
import Markdown from "@/components/Markdown";
import { useAgentStream, AgentSteps } from "@/components/TeacherAgentPanel";
import { toast } from "@/lib/toast";

// « Conseiller d'exercices » — the exercises-canvas agent panel. Select an
// exercise (book or custom), run the advisor, watch it think, then apply its
// link suggestions in one click. The follow-up chat is grounded server-side in
// this exercise plus the suggested lessons only.

const AI = "/api/studio/ai/";
const DIFF = { 1: "Facile", 2: "Moyen", 3: "Difficile" };

// The wire identity of the selected exercise — the server re-resolves it.
function refOf(sel) {
  if (!sel) return null;
  return sel.kind === "custom"
    ? { kind: "custom", exerciseId: sel.ex.id }
    : { kind: "book", subjectSlug: sel.subjectSlug, moduleOrder: sel.module.order, bookId: String(sel.ex.id) };
}

function titleOf(sel) {
  if (!sel) return "";
  if (sel.kind === "custom") return sel.ex.title || sel.ex.statementMd.replace(/[#*$`>\n]+/g, " ").slice(0, 64);
  return sel.ex.section || (sel.ex.n ? `Exercice ${sel.ex.n}` : "Exercice du manuel");
}

export default function ExerciseAgentPanel({ subject, classId, classLevel, selected, onLink }) {
  const { steps, result, error, running, start } = useAgentStream();
  const [linking, setLinking] = useState(null); // lessonId being applied
  const advice = result?.data;

  // Reset the run when the teacher picks another exercise.
  const key = useMemo(() => JSON.stringify(refOf(selected)), [selected]);
  const [ranKey, setRanKey] = useState(null);
  const stale = ranKey !== null && ranKey !== key;

  // Live link state — after onLink refetches the tree, suggestions flip to
  // « Relié » without re-running the agent.
  const liveLinks = useMemo(() => {
    if (selected?.kind !== "custom") return null;
    const ex = subject?.custom?.find((e) => e.id === selected.ex.id);
    if (!ex) return null;
    return {
      lessons: new Set(ex.links.map((l) => l.lessonId).filter(Boolean)),
      modules: new Set(ex.links.map((l) => l.moduleId).filter(Boolean)),
    };
  }, [subject, selected]);

  const editable = selected?.kind === "custom" && selected.ex.mine;

  async function run() {
    setRanKey(key);
    await start({ agent: "exercise_advisor", ref: refOf(selected), classId });
  }

  async function link(s) {
    setLinking(s.lessonId);
    try {
      await onLink(selected.ex.id, { lessonId: s.lessonId, moduleId: null });
    } finally {
      setLinking(null);
    }
  }

  if (!selected) {
    return (
      <div className="ag-panel">
        <div className="exa-head"><Icon name="sparkles" /> Conseiller d’exercices</div>
        <div className="ag-body">
          <p className="ag-intro">
            Cliquez sur <Icon name="sparkles" /> à côté d’un exercice — le Copilot l’analyse, explique ce qu’il travaille,
            et propose les leçons auxquelles le relier.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ag-panel">
      <div className="exa-head"><Icon name="sparkles" /> Conseiller d’exercices</div>
      <div className="ag-body">
        <div className="exa-sel">
          <div className="exa-sel-t">{titleOf(selected)}</div>
          <span className={`exa-sel-pill${editable ? " mine" : ""}`}>
            <Icon name={editable ? "edit" : "lock"} />
            {editable ? "Mon exercice" : "Manuel — lecture seule"}
          </span>
        </div>

        <button className="btn btn-primary btn-sm" disabled={running} onClick={run}>
          <Icon name={running ? "refresh" : "sparkles"} /> {running ? "Analyse en cours…" : stale || !advice ? "Analyser" : "Relancer l’analyse"}
        </button>

        <AgentSteps steps={stale ? [] : steps} />
        {error && !stale && (
          <p className="ag-intro" style={{ color: "var(--danger-fg)" }}>
            {error === "RATE_LIMITED" || error.startsWith?.("Trop") ? error : error === "NOT_FOUND" ? "Exercice introuvable." : "L’assistant n’a pas pu terminer."}
          </p>
        )}

        {advice && !stale && (
          <>
            {result.fallback && <span className="ag-fallback"><Icon name="alert" /> Analyse simplifiée — Copilot hors ligne</span>}

            <div className="exa-expl">
              {advice.explanation.notions.length > 0 && (
                <div className="exa-chips">
                  {advice.explanation.notions.map((n) => <span className="exa-chip" key={n}>{n}</span>)}
                </div>
              )}
              <div className="exa-diff-row">
                <span className="exa-diff-l">Difficulté</span>
                <span className={`exa-diff d${advice.explanation.difficulty}`}>
                  <i /><i /><i />
                </span>
                <span className="exa-diff-v">{DIFF[advice.explanation.difficulty]}</span>
              </div>
              {advice.explanation.difficultyWhy && <p className="exa-why">{advice.explanation.difficultyWhy}</p>}
              {advice.explanation.summary && <div className="exa-summary"><Markdown>{advice.explanation.summary}</Markdown></div>}
              {advice.explanation.prerequisites.length > 0 && (
                <div className="exa-prereq">
                  <span className="exa-prereq-l">Prérequis</span>
                  <ul>{advice.explanation.prerequisites.map((p) => <li key={p}>{p}</li>)}</ul>
                </div>
              )}
            </div>

            <div className="exa-sug-h">
              Leçons suggérées
              {advice.suggestions.length > 0 && <span className="exc-count">{advice.suggestions.length}</span>}
            </div>
            {advice.suggestions.length === 0 && (
              <p className="ag-intro">
                Aucune leçon candidate — l’index de recherche est vide pour ce manuel (un administrateur peut le construire
                depuis l’onglet « Contenu »).
              </p>
            )}
            {advice.suggestions.map((s) => {
              const linked = liveLinks ? liveLinks.lessons.has(s.lessonId) || liveLinks.modules.has(s.moduleId) : s.alreadyLinked;
              return (
                <div className="exa-sug" key={s.lessonId}>
                  <div className="exa-sug-t">{s.lessonTitle}</div>
                  <div className="exa-sug-m">{s.moduleTitle}</div>
                  <div className="exa-sug-r">{s.reason}</div>
                  <div className="exa-sug-f">
                    <span className="exa-conf" title={`Confiance ${s.confidence}%`}>
                      <i style={{ width: `${s.confidence}%` }} />
                    </span>
                    <span className="exa-conf-v">{s.confidence}%</span>
                    {editable ? (
                      linked ? (
                        <span className="exa-linked"><Icon name="check" /> Relié</span>
                      ) : (
                        <button className="btn btn-secondary btn-sm" disabled={linking === s.lessonId} onClick={() => link(s)}>
                          <Icon name={linking === s.lessonId ? "refresh" : "arrowR"} /> Relier
                        </button>
                      )
                    ) : (
                      linked && <span className="exa-linked"><Icon name="check" /> Relié</span>
                    )}
                  </div>
                </div>
              );
            })}
            {!editable && advice.suggestions.length > 0 && (
              <p className="ag-intro"><Icon name="lock" /> Exercice du manuel — la liaison est en lecture seule.</p>
            )}

            <ExerciseChatBox
              exerciseRef={refOf(selected)}
              classId={classId}
              lessonIds={advice.suggestions.map((s) => s.lessonId).slice(0, 4)}
            />
          </>
        )}
      </div>
    </div>
  );
}

// Follow-up chat: same {delta} SSE dialect as the studio brainstorm, but the
// server rebuilds the context from the exercise + lesson ids we send.
function ExerciseChatBox({ exerciseRef, classId, lessonIds }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => { setMsgs([]); }, [exerciseRef?.exerciseId, exerciseRef?.bookId]);

  async function send(text) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput("");
    const history = msgs.map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "" }]);
    setBusy(true);
    try {
      const res = await fetch(AI, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "exercise_chat", exerciseRef, classId, lessonIds, message: q, history }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        const msg = res.status === 503 || j.error === "OLLAMA_OFFLINE" ? "Copilot indisponible — le modèle est hors ligne."
          : res.status === 429 ? "Trop de requêtes — patientez une minute."
          : "Réponse impossible — réessayez.";
        setMsgs((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: msg }; return c; });
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
          let o;
          try { o = JSON.parse(line.slice(6)); } catch { continue; }
          if (o.delta) { full += o.delta; setMsgs((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: full }; return c; }); }
          if (o.error) full = full || "Génération interrompue.";
        }
      }
    } catch {
      toast("Copilot injoignable.", { icon: "alert" });
    } finally {
      setBusy(false);
      requestAnimationFrame(() => boxRef.current?.scrollTo(0, boxRef.current.scrollHeight));
    }
  }

  if (!open) {
    return (
      <button className="exa-chat-toggle" onClick={() => setOpen(true)}>
        <Icon name="message" /> Poser une question sur cet exercice
      </button>
    );
  }

  return (
    <div className="exa-chat">
      <div className="exa-chat-box" ref={boxRef}>
        {msgs.length === 0 && (
          <div className="exa-chat-empty">
            <span>Le Copilot ne voit que cet exercice et les leçons suggérées.</span>
            {["Quelle leçon travailler avant cet exercice ?", "Simplifie l’énoncé pour des débutants.", "Donne un indice à donner en classe."].map((p) => (
              <button key={p} className="exa-chip suggest" onClick={() => send(p)}>{p}</button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`exa-msg ${m.role}`}><Markdown>{m.content || "…"}</Markdown></div>
        ))}
      </div>
      <div className="exa-chat-input">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Votre question…" disabled={busy} />
        <button className="btn btn-primary btn-sm" onClick={() => send()} disabled={busy || !input.trim()}><Icon name={busy ? "refresh" : "send"} /></button>
      </div>
    </div>
  );
}
