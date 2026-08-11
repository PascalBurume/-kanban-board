"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import Icon from "@/components/ui/Icon";
import Markdown from "@/components/Markdown";
import { chipPool, rotateChips } from "@/lib/copilotSuggestions";

let CP_ID = 0;

// Self-contained Copilot chat scoped to a lesson context (lessonId). Streams
// from /api/copilot/message. Reusable as an inline panel or inside a drawer.
// `tab`/`lesson`/`exercise` drive contextual suggestion chips and are forwarded
// to the backend so the tutor can reference the exercise the student is on.
export default function CopilotPanel({ lessonId, subtitle, onClose, subject, tab, lesson, exercise }) {
  const [messages, setMessages] = useState([
    { id: ++CP_ID, who: "bot", text: "Salut 👋 Je suis ton Copilot. Pose-moi une question sur ce chapitre ou un exercice." },
  ]);
  const [val, setVal] = useState("");
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const msgsRef = useRef(null);
  // Contextual suggestion pool + a rotating window that advances each turn so a
  // fresh set of suggestions appears after the student picks or answers one.
  const pool = useMemo(() => chipPool({ subject, tab, lesson, exercise }), [subject, tab, lesson, exercise]);
  const [cursor, setCursor] = useState(0);
  useEffect(() => { setCursor(0); }, [pool]); // reset rotation when context changes
  const chips = useMemo(() => rotateChips(pool, cursor, 3), [pool, cursor]);

  useEffect(() => {
    msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  async function send(text) {
    const v = (text ?? val).trim();
    if (!v || busy || !lessonId) return;
    setVal("");
    setCursor((c) => c + 3); // rotate suggestions for the next turn
    const userId = ++CP_ID, botId = ++CP_ID;
    setMessages((m) => [...m, { id: userId, who: "me", text: v }, { id: botId, who: "bot", text: "" }]);
    setTyping(true);
    setBusy(true);
    try {
      const res = await fetch("/api/copilot/message/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId,
          content: v,
          context: { tab: tab || null, exerciseN: exercise?.n ?? exercise?.section ?? null },
          exerciseText: exercise?.text ? exercise.text.slice(0, 1200) : undefined,
        }),
      });
      const setBot = (t) => setMessages((m) => m.map((x) => (x.id === botId ? { ...x, text: t } : x)));
      if (res.status === 429) { setBot("Trop de questions — patiente une minute."); return; }
      if (res.status === 503) { setBot("Le tuteur est indisponible hors-ligne pour le moment."); return; }
      if (res.status === 403) { setBot("Le Copilot est désactivé pour cette classe."); return; }
      if (!res.ok || !res.body) throw new Error("net");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "", got = false, full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          if (!line.startsWith("data: ")) continue;
          let o;
          try { o = JSON.parse(line.slice(6)); } catch { continue; }
          if (o.delta) { if (!got) { got = true; setTyping(false); } full += o.delta; setBot(full); }
          if (o.error) setBot(full || "Désolé, une erreur s'est produite. Réessaie.");
        }
      }
    } catch {
      setMessages((m) => m.map((x) => (x.id === botId ? { ...x, text: x.text || "Connexion au Copilot impossible." } : x)));
    } finally {
      setTyping(false);
      setBusy(false);
    }
  }

  return (
    <div className="cp-panel">
      <div className="cp-head">
        <span className="cp-avatar"><Icon name="sparkles" /></span>
        <div className="cp-id">
          <div className="cp-name">Copilot</div>
          <div className="cp-sub">{subtitle || "Ton tuteur IA"}</div>
        </div>
        {onClose && <button className="cp-x" onClick={onClose} title="Fermer"><Icon name="x" /></button>}
      </div>

      <div className="cp-msgs" ref={msgsRef}>
        {messages.map((m) => (
          <div key={m.id} className={`cp-msg ${m.who}`}>
            {m.who === "bot" && <span className="cp-mav"><Icon name="sparkles" /></span>}
            <div className="cp-bubble">{m.text ? <Markdown>{m.text}</Markdown> : <span className="cp-dots"><i /><i /><i /></span>}</div>
          </div>
        ))}
        {typing && (
          <div className="cp-msg bot">
            <span className="cp-mav"><Icon name="sparkles" /></span>
            <div className="cp-bubble"><span className="cp-dots"><i /><i /><i /></span></div>
          </div>
        )}
      </div>

      <div className="cp-chips">
        {chips.map((c) => (
          <button key={c} className="cp-chip" onClick={() => send(c)} disabled={busy}>{c}</button>
        ))}
      </div>
      <div className="cp-input">
        <input
          className="input"
          placeholder="Pose une question…"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
        />
        <button className="cp-send" onClick={() => send()} disabled={busy}><Icon name="send" /></button>
      </div>
    </div>
  );
}
