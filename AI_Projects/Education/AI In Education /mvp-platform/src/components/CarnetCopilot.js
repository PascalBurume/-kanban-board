"use client";
import { useState, useRef, useEffect } from "react";
import Icon from "@/components/ui/Icon";
import Markdown from "@/components/Markdown";
import "./CarnetCopilot.css";

let NB_ID = 0;

const CHIPS = [
  "Explique cette formule",
  "Vérifie mon raisonnement",
  "Propose un exercice",
  "Résume mes notes",
];

const HELLO =
  "Bonjour 👋 Je peux expliquer une formule, relire un calcul ou te proposer un exercice à partir de tes notes.";

// Opening line drawn from what the student has actually finished. The old
// greeting offered help "à partir de tes notes" and then, on a carnet opened for
// the first time, refused for exactly that reason. Naming a module they have
// completed makes the offer one the assistant can honour straight away.
function greeting(rec) {
  if (!rec?.totalDone) return HELLO;
  const bits = [];
  // Lead with where the student actually is. Opening on the count of finished
  // modules described a history; this describes the work in front of them.
  if (rec.current) {
    const where = rec.current.lesson ? ` (en cours : « ${rec.current.lesson} »)` : "";
    bits.push(`Tu en es à « ${rec.current.module} », ${rec.current.doneCount}/${rec.current.lessonCount} leçons${where}.`);
  } else if (rec.lastLessons?.length) {
    bits.push(`Ta dernière leçon terminée : « ${rec.lastLessons[0]} ».`);
  } else if (rec.finishedModules?.length) {
    bits.push(`Tu as terminé le module « ${rec.finishedModules[0]} ».`);
  }
  if (rec.weakest) bits.push(`Ton quiz le plus faible est « ${rec.weakest.lesson} » (${rec.weakest.score}/100).`);
  bits.push("Je peux te faire réviser tout ça, même si ton carnet est encore vide.");
  return `Bonjour 👋 ${bits.join(" ")}`;
}

/**
 * Chips anchored on the work in progress, then the generic ones.
 *
 * The first version offered `finishedModules[0]`, which is the first module in
 * curriculum order — fixed for the whole year. It read as a label rather than a
 * suggestion, because it never changed no matter what the student was doing.
 */
function chipsFor(rec) {
  if (!rec?.totalDone) return CHIPS;
  const out = [];
  if (rec.current?.lesson) out.push(`Explique « ${rec.current.lesson} »`);
  if (rec.current?.module) out.push(`Interroge-moi sur « ${rec.current.module} »`);
  if (rec.weakest) out.push(`Révise « ${rec.weakest.lesson} »`);
  // Nothing in flight: fall back to the most recent lesson, still more current
  // than the first module of the year.
  if (!out.length && rec.lastLessons?.length) out.push(`Révise « ${rec.lastLessons[0]} »`);
  // De-duplicate: a weak quiz on the lesson in progress would otherwise appear twice.
  const seen = new Set();
  return [...out, ...CHIPS].filter((c) => !seen.has(c) && seen.add(c)).slice(0, 5);
}

// Study assistant docked beside the notebook. Two things make it different from the
// lesson tutor: it reads the student's OWN notes (so it can catch their mistakes),
// and every answer can be dropped into the page at the caret.
//
// Ollama runs on the school server, so this panel is the one part of the notebook
// that genuinely needs the network. It says so plainly and gets out of the way —
// writing never depends on it.
export default function CarnetCopilot({ notebookId, onInsert, onClose }) {
  const [messages, setMessages] = useState([{ id: ++NB_ID, who: "bot", text: HELLO }]);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [record, setRecord] = useState(null);
  const msgsRef = useRef(null);

  // Rewrite the greeting once the student's record arrives. Only while the panel
  // is still untouched — replacing the first line after a conversation has begun
  // would rewrite history under the student.
  useEffect(() => {
    if (!notebookId) return;
    let alive = true;
    fetch(`/api/copilot/notebook/?notebookId=${encodeURIComponent(notebookId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((rec) => {
        if (!alive || !rec?.totalDone) return;
        setRecord(rec);
        setMessages((m) => (m.length === 1 && m[0].who === "bot" ? [{ ...m[0], text: greeting(rec) }] : m));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [notebookId]);

  useEffect(() => {
    msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(text) {
    const v = (text ?? val).trim();
    if (!v || busy || !notebookId) return;
    setVal("");
    const userId = ++NB_ID, botId = ++NB_ID;
    // Only the last few turns are replayed; the notes themselves carry the context.
    const history = messages
      .filter((m) => m.text)
      .slice(-6)
      .map((m) => ({ role: m.who === "me" ? "user" : "assistant", content: m.text }));
    setMessages((m) => [...m, { id: userId, who: "me", text: v }, { id: botId, who: "bot", text: "" }]);
    setBusy(true);
    const setBot = (t) => setMessages((m) => m.map((x) => (x.id === botId ? { ...x, text: t } : x)));
    try {
      const res = await fetch("/api/copilot/notebook/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ notebookId, content: v, history }),
      });
      if (res.status === 429) return setBot("Trop de questions — patiente une minute.");
      if (res.status === 503) return setBot("Copilot est hors ligne : le serveur de l'école n'est pas joignable. Tes notes, elles, restent enregistrées.");
      if (res.status === 403) return setBot("Copilot est désactivé pour ta classe.");
      if (!res.ok || !res.body) throw new Error("net");

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "", full = "";
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
          if (o.delta) { full += o.delta; setBot(full); }
          if (o.error) setBot(full || "Désolé, une erreur s'est produite. Réessaie.");
        }
      }
    } catch {
      setBot("Connexion à Copilot impossible. Tu peux continuer à écrire : tes notes sont enregistrées sur cet appareil.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cp-panel">
      <div className="cp-head">
        <span className="cp-avatar"><Icon name="sparkles" /></span>
        <div className="cp-id">
          <div className="cp-name">Copilot</div>
          <div className="cp-sub">Assistant de révision</div>
        </div>
        {onClose && <button className="cp-x" onClick={onClose} title="Fermer"><Icon name="x" /></button>}
      </div>

      <div className="cp-msgs" ref={msgsRef}>
        {messages.map((m) => (
          <div key={m.id} className={`cp-msg ${m.who}`}>
            {m.who === "bot" && <span className="cp-mav"><Icon name="sparkles" /></span>}
            <div className="cp-bubble">
              {m.text ? <Markdown breaks>{m.text}</Markdown> : <span className="cp-dots"><i /><i /><i /></span>}
              {/* Insertion is always the student's call — nothing is written for them. */}
              {m.who === "bot" && m.text && onInsert && (
                <button className="cn-use" onClick={() => onInsert(m.text)}>
                  <Icon name="plus" /> Insérer dans mon carnet
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="cp-chips">
        {chipsFor(record).map((c) => (
          <button key={c} className="cp-chip" onClick={() => send(c)} disabled={busy}>{c}</button>
        ))}
      </div>
      <div className="cp-input">
        <input
          className="input"
          placeholder="Pose une question sur tes notes…"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
        />
        <button className="cp-send" onClick={() => send()} disabled={busy}><Icon name="send" /></button>
      </div>
    </div>
  );
}
