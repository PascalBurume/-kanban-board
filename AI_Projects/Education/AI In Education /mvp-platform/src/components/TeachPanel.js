"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Icon from "@/components/ui/Icon";
import Markdown from "@/components/Markdown";
import { useAgentStream, AgentSteps } from "@/components/TeacherAgentPanel";
import { toast } from "@/lib/toast";
import "./TeachPanel.css";

// « Copilot Enseigner » — the teacher's teaching-support panel.
//
// Two agents behind one surface: a streaming coach, and a rédacteur that turns the
// accumulated conversation into a lesson once there is enough of it to be worth
// writing from. Nothing it produces is ever applied without a click.
//
// The layout has two jobs. The chat is the obvious one. The other is « Ce que dit
// votre classe » — the questions these pupils actually asked on this lesson, and how
// well they said they followed it. That is the same data the coach is reading, and
// showing it is what separates this from a chatbot in a side panel: the teacher can
// see the advice is about their room. On a narrow rail it folds above the chat; with
// room it becomes a second column, which is what fills the space this panel used to
// leave empty.

const CHIPS = [
  { icon: "sparkles", label: "Comment introduire cette leçon ?" },
  { icon: "alert", label: "Où mes élèves se trompent-ils ?" },
  { icon: "list", label: "Donne-moi une séquence au tableau" },
  { icon: "target", label: "Un exemple concret en RDC" },
  { icon: "users", label: "Et pour les élèves en difficulté ?" },
];

function errText(status, code) {
  if (status === 429 || code === "RATE_LIMITED") return "Trop de questions — patientez une minute.";
  if (status === 503 || code === "OLLAMA_OFFLINE") return "Copilot indisponible — le modèle est hors ligne.";
  if (status === 404 || code === "NOT_FOUND") return "Leçon introuvable.";
  if (code === "TOO_SHORT") return "Échangez encore un peu avant de faire rédiger la leçon.";
  return "Une erreur s'est produite. Réessayez.";
}

const NO_SIGNALS = { questionTotal: 0, questions: [], understanding: null, notes: [] };

/** Where the coach's advice comes from, shown rather than merely used. */
function ClassPanel({ signals }) {
  const s = signals || NO_SIGNALS;
  const has = s.questionTotal > 0 || s.understanding;
  const pct = s.understanding?.avg ?? null;
  const tone = pct == null ? "" : pct >= 70 ? " ok" : pct >= 45 ? " mid" : " low";

  return (
    <aside className="tp-class">
      <h3 className="tp-class-h"><Icon name="users" /> Ce que dit votre classe</h3>

      {!has && (
        <p className="tp-class-empty">
          Aucun signal encore sur cette leçon. Dès que vos élèves la travailleront — leurs
          questions au Copilot, leurs retours de compréhension — ils apparaîtront ici et
          le Copilot s’en servira.
        </p>
      )}

      {s.understanding && (
        <div className="tp-gauge">
          <div className="tp-gauge-top">
            <span>Compréhension déclarée</span>
            <b className={`tp-gauge-n${tone}`}>{pct}%</b>
          </div>
          <div className="tp-gauge-bar"><span className={`tp-gauge-fill${tone}`} style={{ width: `${pct}%` }} /></div>
          <span className="tp-gauge-sub">{s.understanding.count} retour{s.understanding.count > 1 ? "s" : ""} d’élèves</span>
        </div>
      )}

      {s.questionTotal > 0 && (
        <div className="tp-block">
          <div className="tp-block-h">
            <span>Leurs questions</span>
            <span className="tp-count">{s.questionTotal}</span>
          </div>
          <ul className="tp-qs">
            {s.questions.slice(0, 5).map((q, i) => (
              <li key={i}>
                <span className="tp-q-t">« {q.text} »</span>
                <span className="tp-q-m">{q.count}×</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {s.notes?.length > 0 && (
        <div className="tp-block">
          <div className="tp-block-h"><span>Ce qu’ils ont écrit</span></div>
          <ul className="tp-notes">
            {s.notes.slice(0, 3).map((n, i) => (
              <li key={i}>
                <span className="tp-note-m">« {n.message} »</span>
                <span className="tp-note-w">{n.student} · {n.understanding}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {has && <p className="tp-class-foot"><Icon name="sparkles" /> Le Copilot lit ces signaux à chaque réponse.</p>}
    </aside>
  );
}

export default function TeachPanel({ lessonId, seed = "", onSeedUsed, onApplyContent }) {
  const [msgs, setMsgs] = useState([]);      // [{role, content}]
  const [turns, setTurns] = useState(0);
  const [ready, setReady] = useState(false); // the server's unlock verdict
  const [minTurns, setMinTurns] = useState(3);
  const [signals, setSignals] = useState(NO_SIGNALS);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState(null);  // the composed lesson awaiting a decision
  const [applying, setApplying] = useState(false);
  const [classOpen, setClassOpen] = useState(false); // the narrow-layout disclosure
  const agent = useAgentStream();
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const load = useCallback(async () => {
    if (!lessonId) return;
    try {
      const r = await fetch(`/api/teacher/teach/thread/?lessonId=${encodeURIComponent(lessonId)}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!r.ok) return;
      const d = await r.json();
      setMsgs(d.messages || []);
      setTurns(d.turns || 0);
      setReady(!!d.canCompose);
      setMinTurns(d.minTurns || 3);
      setSignals(d.signals || NO_SIGNALS);
    } catch { /* an unreachable thread is not worth an error state; the chat still works */ }
  }, [lessonId]);

  useEffect(() => { setDraft(null); setErr(""); load(); }, [load]);

  // A topic handed over from Analyses Copilot. Pre-filled rather than sent: the
  // teacher arrived from a chart, and gets to see and edit the question first.
  useEffect(() => {
    if (!seed) return;
    setQ(`Mes élèves bloquent sur « ${seed} ». Comment le reprendre en classe ?`);
    inputRef.current?.focus();
    onSeedUsed?.();
  }, [seed, onSeedUsed]);

  // Pin to the bottom on a new message — not on every token, which is what the
  // student panel does and what makes it judder on a slow tablet.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [msgs.length, busy]);

  async function ask(text) {
    const v = (text ?? q).trim();
    if (!v || busy || !lessonId) return;
    setQ("");
    setErr("");
    setMsgs((m) => [...m, { role: "user", content: v }, { role: "assistant", content: "" }]);
    setBusy(true);
    try {
      const res = await fetch("/api/teacher/teach/message/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ lessonId, content: v }),
      });
      if (!res.ok) {
        const code = await res.json().then((j) => j?.error).catch(() => null);
        setMsgs((m) => m.slice(0, -2));
        setErr(errText(res.status, code));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      // Accumulate locally and rewrite the last bubble — one state write per token
      // instead of a map over the whole list.
      let buf = "";
      let full = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 2);
          if (!line.startsWith("data: ")) continue;
          let o;
          try { o = JSON.parse(line.slice(6)); } catch { continue; }
          if (o.delta) {
            full += o.delta;
            setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: full }]);
          } else if (o.error) {
            setErr(errText(0, o.error));
          }
        }
      }
      if (!full.trim()) setMsgs((m) => m.slice(0, -1));
      load(); // the server owns the unlock rule; re-read rather than counting here
    } catch {
      setMsgs((m) => m.slice(0, -2));
      setErr("Connexion au Copilot impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function compose() {
    setErr("");
    setDraft(null);
    const final = await agent.start({ lessonId }, "/api/teacher/teach/compose/");
    if (final?.data?.contentMd) setDraft(final.data);
    else if (agent.error) setErr(errText(0, agent.error));
  }

  // The complément path: create a library lesson, write the content into it, attach it
  // to the book lesson, then open the word processor on it. Three existing endpoints —
  // no new server code for the landing.
  async function createComplement() {
    if (!draft || applying) return;
    setApplying(true);
    try {
      const c = await fetch("/api/studio/library/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ subjectSlug: draft.target.subjectSlug }),
      });
      if (!c.ok) throw new Error("create");
      const { lesson } = await c.json();
      const put = await fetch(`/api/studio/lessons/${lesson.id}/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ title: draft.title, contentMd: draft.contentMd }),
      });
      if (!put.ok) throw new Error("write");
      await fetch(`/api/studio/lessons/${lesson.id}/companion/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ bookLessonId: draft.target.sourceId }),
      });
      window.location.href = `/teacher/studio/rediger/?id=${lesson.id}`;
    } catch {
      setApplying(false);
      toast("Création du complément impossible", { icon: "x" });
    }
  }

  const inline = draft?.target?.kind === "inline";
  const hasSignals = signals.questionTotal > 0 || signals.understanding;
  const left = Math.max(0, minTurns - turns);

  return (
    <div className={`tp${hasSignals ? " has-class" : ""}`}>
      <div className="tp-main">
        <header className="tp-head">
          <span className="tp-av"><Icon name="sparkles" /></span>
          <span className="tp-id">
            <b>Copilot Enseigner</b>
            <small>Comment enseigner cette leçon — pas quoi écrire</small>
          </span>
          {msgs.length > 0 && (
            <button
              className="tp-reset"
              title="Recommencer la conversation"
              onClick={async () => {
                await fetch(`/api/teacher/teach/thread/?lessonId=${encodeURIComponent(lessonId)}`, { method: "DELETE", credentials: "same-origin" });
                setMsgs([]); setTurns(0); setReady(false); setDraft(null);
              }}
            >
              <Icon name="refresh" />
            </button>
          )}
        </header>

        {/* On a narrow rail the class panel cannot be a column, so it becomes a
            disclosure directly under the header — still one tap from the chat. */}
        {hasSignals && (
          <button className={`tp-classtoggle${classOpen ? " open" : ""}`} onClick={() => setClassOpen((o) => !o)}>
            <Icon name="users" />
            <span>
              {signals.questionTotal > 0 && `${signals.questionTotal} question${signals.questionTotal > 1 ? "s" : ""} de vos élèves`}
              {signals.questionTotal > 0 && signals.understanding && " · "}
              {signals.understanding && `${signals.understanding.avg}% de compréhension`}
            </span>
            <Icon name={classOpen ? "chevD" : "chevR"} />
          </button>
        )}
        {hasSignals && classOpen && <div className="tp-classinline"><ClassPanel signals={signals} /></div>}

        <div className="tp-msgs" ref={listRef}>
          {msgs.length === 0 && !draft && (
            <div className="tp-welcome">
              <span className="tp-welcome-av"><Icon name="sparkles" /></span>
              <p>
                Posez vos questions sur la <b>manière d’enseigner</b> cette leçon : par où
                commencer, où les élèves trébuchent, quoi mettre au tableau.
              </p>
              <p className="tp-welcome-s">
                Après {minTurns} échanges, le Copilot pourra rédiger une leçon complète à
                partir de ce que vous lui aurez dit.
              </p>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`tp-msg ${m.role}`}>
              {m.role === "assistant" && <span className="tp-mav"><Icon name="sparkles" /></span>}
              <div className="tp-bubble">
                {m.content ? <Markdown breaks>{m.content}</Markdown> : <span className="tp-dots"><i /><i /><i /></span>}
              </div>
            </div>
          ))}

          {draft && (
            <div className="tp-draft">
              <div className="tp-draft-h">
                <span className="tp-draft-b"><Icon name="file" /> Leçon rédigée</span>
                <span>{draft.contentMd.split(/\s+/).filter(Boolean).length} mots</span>
              </div>
              <h4 className="tp-draft-t">{draft.title}</h4>
              {draft.warnings?.length > 0 && (
                <ul className="tp-warn">
                  {draft.warnings.map((w, i) => <li key={i}><Icon name="alert" /> {w}</li>)}
                </ul>
              )}
              <div className="tp-preview prose-reader"><Markdown>{draft.contentMd}</Markdown></div>
              {!inline && (
                <p className="tp-note">
                  « {draft.target.sourceTitle} » est une leçon du manuel, en lecture seule.
                  Le Copilot crée une leçon <b>à vous</b>, rattachée à celle-ci pour vos élèves.
                </p>
              )}
              <div className="tp-acts">
                {inline ? (
                  <>
                    <button className="btn btn-primary btn-sm" disabled={applying} onClick={() => { onApplyContent?.(draft.contentMd, "replace"); setDraft(null); }}>
                      <Icon name="check" /> Remplacer le contenu
                    </button>
                    <button className="btn btn-sm" disabled={applying} onClick={() => { onApplyContent?.(draft.contentMd, "append"); setDraft(null); }}>
                      Insérer
                    </button>
                  </>
                ) : (
                  <button className="btn btn-primary btn-sm" disabled={applying} onClick={createComplement}>
                    <Icon name="plus" /> {applying ? "Création…" : "Créer un complément"}
                  </button>
                )}
                <button className="btn btn-sm" disabled={applying} onClick={() => setDraft(null)}>Ignorer</button>
              </div>
            </div>
          )}

          {agent.running && !draft && (
            <div className="tp-running">
              <AgentSteps steps={agent.steps} />
            </div>
          )}
        </div>

        {err && <p className="tp-err"><Icon name="alert" /> {err}</p>}

        {!draft && (
          <footer className="tp-foot">
            <div className="tp-chips">
              {CHIPS.slice(0, msgs.length ? 3 : 5).map((c) => (
                <button key={c.label} className="tp-chip" disabled={busy || agent.running} onClick={() => ask(c.label)}>
                  <Icon name={c.icon} /> {c.label}
                </button>
              ))}
            </div>

            <div className="tp-input">
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
                placeholder={busy ? "Copilot écrit…" : "Votre question…"}
                disabled={busy || agent.running}
              />
              <button className="tp-send" onClick={() => ask()} disabled={busy || agent.running || !q.trim()} aria-label="Envoyer">
                <Icon name="send" />
              </button>
            </div>

            {/* The hand-off to agent 2. It appears once the conversation is worth
                writing from, and says what it will be written from. */}
            <div className={`tp-compose${ready ? " ready" : ""}`}>
              <button className="tp-composebtn" onClick={compose} disabled={!ready || agent.running || busy}>
                <Icon name="file" /> {agent.running ? "Rédaction en cours…" : "Rédiger la leçon"}
              </button>
              <span className="tp-hint">
                {ready
                  ? `d’après vos ${turns} échanges`
                  : `encore ${left} échange${left > 1 ? "s" : ""}`}
              </span>
            </div>
          </footer>
        )}
      </div>

      {hasSignals && <ClassPanel signals={signals} />}
    </div>
  );
}
