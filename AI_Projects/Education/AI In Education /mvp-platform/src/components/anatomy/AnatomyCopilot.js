"use client";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen, Send, Sparkles, User } from "lucide-react";
import { tidyAnswer } from "@/lib/anatomyAnswer";

// The Copilot panel, on Mwalimu's own chat pattern (the .cp-* bubbles used in a
// lesson and in Practice): an avatar per turn, a tailed bubble, the student on
// the right. The accent is violet rather than the app's indigo, because inside
// the atlas everything else is warm paper and indigo would read as a foreign
// component pasted in.
//
// react-markdown, not the shared <Markdown> component: that one drags in KaTeX,
// rehype-raw and the figure renderer for a page with no formulas and no figures.

const ERRORS = {
  COPILOT_DISABLED: "Votre enseignant a désactivé le Copilote pour le moment.",
  OLLAMA_OFFLINE: "Le modèle local n'est pas joignable. Demandez à l'administrateur de démarrer le service.",
  RATE_LIMITED: "Trop de questions d'un coup — patientez une minute.",
  NO_CLASS: "Votre compte n'est rattaché à aucune classe.",
  GEN_FAILED: "La génération s'est interrompue. Réessayez.",
};

// Three openers that always work, so a student who doesn't yet know what to ask
// still has a way in. They follow the selection: once a structure is open the
// questions are about that structure, not the whole organ.
function suggestions(organ, hotspot) {
  if (!organ) return [];
  const subject = hotspot ? hotspot.label.toLowerCase() : organ.name.toLowerCase();
  return [
    `À quoi sert ${subject} ?`,
    `Explique ${subject} avec un exemple de la vie courante.`,
    `Pose-moi une question d'examen sur ${subject}.`,
  ];
}

export default function AnatomyCopilot({ organ, hotspot, isStaff }) {
  const [turns, setTurns] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [sources, setSources] = useState([]);
  const scroller = useRef(null);
  const abortRef = useRef(null);

  // The conversation belongs to the specimen on screen. Switching organs starts
  // a fresh thread rather than dragging the old context along; switching
  // structure within an organ does not, since that is the same discussion.
  useEffect(() => {
    abortRef.current?.abort();
    setTurns([]);
    setSources([]);
    setErr(null);
    setBusy(false);
  }, [organ?.id]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, busy]);

  async function ask(question) {
    const q = question.trim();
    if (!q || busy) return;
    setDraft("");
    setErr(null);
    setSources([]);
    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((t) => [...t, { role: "user", content: q }, { role: "assistant", content: "" }]);
    setBusy(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      // Trailing slash matters: without it Next answers 308 and the POST is
      // replayed, which doubles the model's queue slot on a slow school box.
      const res = await fetch("/api/anatomy/copilot/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organId: organ?.id ?? "", hotspotId: hotspot?.id ?? "", content: q, history }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const payload = await res.json().catch(() => ({}));
        setErr(ERRORS[payload.error] || "Le Copilote est indisponible.");
        setTurns((t) => t.slice(0, -2));
        setBusy(false);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let evt;
          try {
            evt = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (evt.sources) setSources(evt.sources);
          if (evt.error) setErr(ERRORS[evt.error] || "La génération a échoué.");
          if (evt.delta) {
            setTurns((t) => {
              const next = [...t];
              next[next.length - 1] = { role: "assistant", content: next[next.length - 1].content + evt.delta };
              return next;
            });
          }
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") setErr("Connexion au serveur local interrompue.");
    } finally {
      setBusy(false);
    }
  }

  const tips = suggestions(organ, hotspot);
  const subject = hotspot ? hotspot.label : organ?.name;

  return (
    <section className="an-copilot">
      <header className="an-cop-head">
        <span className="an-cop-avatar">
          <Sparkles size={17} />
        </span>
        <div className="an-cop-id">
          <b>Copilote</b>
          <small>{subject ? `À propos de : ${subject}` : "Sélectionnez un spécimen"}</small>
        </div>
      </header>

      <div className="an-cop-log" ref={scroller}>
        {!turns.length && (
          <div className="an-cop-empty">
            <p>
              {isStaff
                ? "Demandez un angle d'explication, une analogie de classe ou une question d'évaluation."
                : "Posez une question sur le spécimen affiché. Le Copilote répond hors-ligne, sur le serveur de l'école."}
            </p>
            <div className="an-cop-tips">
              {tips.map((t) => (
                <button key={t} onClick={() => ask(t)} disabled={!organ}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => {
          const me = t.role === "user";
          const thinking = !t.content && busy && i === turns.length - 1;
          return (
            <div key={i} className={`an-msg${me ? " me" : ""}`}>
              <span className="an-msg-av">{me ? <User size={13} /> : <Sparkles size={13} />}</span>
              <div className="an-bubble">
                {thinking ? (
                  <span className="an-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : me ? (
                  t.content
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{tidyAnswer(t.content)}</ReactMarkdown>
                )}
              </div>
            </div>
          );
        })}

        {!!sources.length && (
          <p className="an-cop-src">
            <BookOpen size={12} /> D'après : {sources.join(" · ")}
          </p>
        )}
        {err && <p className="an-cop-err">{err}</p>}
      </div>

      <form
        className="an-cop-form"
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={subject ? `Question sur ${subject.toLowerCase()}…` : "Sélectionnez un spécimen…"}
          disabled={!organ || busy}
          maxLength={2000}
        />
        <button type="submit" disabled={!organ || busy || !draft.trim()} aria-label="Envoyer">
          <Send size={15} />
        </button>
      </form>
    </section>
  );
}
