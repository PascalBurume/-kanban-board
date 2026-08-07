"use client";
import { useState, useRef } from "react";
import Icon from "@/components/ui/Icon";
import Markdown from "@/components/Markdown";
import "./StudioComposePanel.css";

const AI = "/api/studio/ai/";

function errMsg(status, code) {
  if (status === 503 || code === "OLLAMA_OFFLINE") return "Copilot indisponible — le modèle est hors ligne.";
  if (status === 429) return "Trop de requêtes — patientez une minute.";
  return "Génération impossible — réessayez.";
}

// Copilot for exercise authoring: generates one {title, statement, solution}
// grounded in the selected module's book content, plus the shared brainstorm
// chat. `onUse` hands the draft to the create form — the teacher reviews and
// saves; nothing is written without their click.
export function ExerciseComposePanel({ subjectSlug, moduleId, classLevel, onUse }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [topic, setTopic] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const lastTopic = useRef("");

  async function run(t) {
    lastTopic.current = t;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const r = await fetch(AI, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "exercise", subjectSlug, moduleId, classLevel, topic: t }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw { status: r.status, code: j?.error };
      setResult(j);
    } catch (e) {
      setError(errMsg(e.status, e.code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cp-panel">
      <div className="cp-head">
        <span className="cp-badge"><Icon name="sparkles" /> Copilot APS</span>
        <span className="cp-sub">Propose un exercice avec corrigé — vous relisez, ajustez, publiez</span>
      </div>

      <div className="cp-row">
        <input
          className="cp-text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Notion à exercer — ex. « bilan d'une réaction de combustion »"
          onKeyDown={(e) => e.key === "Enter" && !busy && run(topic)}
        />
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(topic)}>
          <Icon name={busy ? "refresh" : "sparkles"} /> {busy ? "Rédaction…" : "Générer un exercice"}
        </button>
      </div>

      <button className="cp-chat-toggle" onClick={() => setChatOpen((o) => !o)}>
        <Icon name="message" /> {chatOpen ? "Masquer le brainstorming" : "Brainstormer (chat)"}
      </button>
      {chatOpen && <ExerciseChat subjectSlug={subjectSlug} moduleId={moduleId} classLevel={classLevel} />}

      {error && (
        <div className="cp-error">
          <Icon name="alert" /> {error}
          <button className="cp-retry" onClick={() => run(lastTopic.current)}>Réessayer</button>
        </div>
      )}

      {result && (
        <div className="cp-preview">
          <div className="cp-result-title">Proposition : <b>{result.title}</b></div>
          <div className="cp-field-l">Énoncé</div>
          <div className="cp-doc"><Markdown>{result.statementMd}</Markdown></div>
          {result.solutionMd && (
            <>
              <div className="cp-field-l">Corrigé</div>
              <div className="cp-doc"><Markdown>{result.solutionMd}</Markdown></div>
            </>
          )}
          <div className="cp-insert">
            <button className="btn btn-primary btn-sm" onClick={() => { onUse(result); setResult(null); }}>
              <Icon name="check" /> Utiliser cet exercice
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setResult(null)}>Ignorer</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ExerciseChat({ subjectSlug, moduleId, classLevel }) {
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
      const res = await fetch(AI, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "chat", subjectSlug, moduleId, classLevel, message: q, history }),
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
        {msgs.length === 0 && <div className="cp-chat-empty">Cherchez un angle : « un exercice sur les proportions avec les prix du marché de Kinshasa »…</div>}
        {msgs.map((m, i) => (
          <div key={i} className={`cp-msg ${m.role}`}>
            <Markdown>{m.content || "…"}</Markdown>
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
