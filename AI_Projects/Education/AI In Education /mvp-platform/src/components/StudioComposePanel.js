"use client";
import { useEffect, useState, useRef } from "react";
import Icon from "@/components/ui/Icon";
import Markdown from "@/components/Markdown";
import TexPreview from "@/components/editor/TexPreview";
import { useAgentStream, AgentSteps } from "@/components/TeacherAgentPanel";
// Both from latexCheck, which is pure and client-safe. studioCopilot re-exports the
// constant, but it also reaches for auth, the database and Ollama — importing it here
// pulls next/headers into the client bundle and the whole page fails to build.
import { checkLatex, LATEX_INSTRUCTION_MAX } from "@/lib/latexCheck";
import "@/components/AgentSteps.css";
import "./StudioComposePanel.css";

const AI = "/api/studio/ai/";
const QTYPE = { MCQ: "QCM", TF: "Vrai / Faux", SHORT: "Réponse courte" };

// A narrow topic gives a usable lesson; "les fonctions" gives a shapeless one. These
// double as a hint about the expected grain size.
// The fallback only. Real suggestions come from the teacher's OWN manual — see
// `suggestions` below. These three were hardcoded, which meant a 6e maths teacher was
// being offered "La loi des gaz parfaits": a physics topic, from a book they do not
// teach, as the example of what to ask for.
const TOPIC_EXAMPLES = ["Les équations du second degré", "Le théorème de Thalès", "La loi des gaz parfaits"];

// Automatic checks from the server (src/lib/lessonLint.ts). Copilot proposes and the
// teacher decides, so these point at what to re-read — they never block insertion.
function Warnings({ items }) {
  if (!items?.length) return null;
  return (
    <div className="cp-warn">
      <div className="cp-warn-h"><Icon name="alert" /> À vérifier avant d'insérer</div>
      <ul>{items.map((w, i) => <li key={i}>{w}</li>)}</ul>
    </div>
  );
}

function errMsg(status, code) {
  if (status === 503 || code === "OLLAMA_OFFLINE") return "Copilot indisponible — le modèle est hors ligne.";
  if (status === 429) return "Trop de requêtes — patientez une minute.";
  return "Génération impossible — réessayez.";
}

async function postJson(body) {
  const r = await fetch(AI, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let j = null;
  try { j = await r.json(); } catch { /* */ }
  if (!r.ok) throw { status: r.status, code: j?.error };
  return j;
}

/**
 * Write one formula, two ways.
 *
 * « Rapide » asks the model once. « Agent » writes, RENDERS what it wrote, and writes
 * again with the parse error in hand if it did not display — and the teacher watches it
 * do that, one row per step. On a school server running a small model on CPU that
 * verification is the difference between a formula and a plausible-looking wrong one,
 * which is exactly the dangerous case in maths.
 *
 * This lived only in the LaTeX atelier, reachable from a separate page. The atelier
 * stays, but a teacher writing a lesson should not have to leave it to get a formula
 * checked. The SSE endpoint is unchanged — its contract works, and moving it would be
 * churn for no gain.
 */
function FormulaCopilot({ subjectSlug, classLevel, getSelectedTex, onApply }) {
  const [instruction, setInstruction] = useState("");
  const [agentMode, setAgentMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [proposal, setProposal] = useState(null); // { tex, verdict, note, warnings }
  const agent = useAgentStream();

  const selected = getSelectedTex?.() || "";
  const running = busy || agent.running;

  async function ask() {
    const text = instruction.trim();
    if (!text || running) return;
    setErr(""); setProposal(null);
    if (agentMode) {
      const final = await agent.start(
        { instruction: text, tex: selected, subjectSlug: subjectSlug || "", classLevel },
        "/api/studio/latex-agent/",
      );
      if (final?.tex) setProposal({ tex: final.tex, verdict: checkLatex(final.tex, true), note: final.note || "", warnings: final.warnings || [] });
      return;
    }
    setBusy(true);
    try {
      // The selection is the context when there is one: "simplifie ça" means the
      // formula the teacher pointed at, not the whole lesson.
      const r = await postJson({ action: "latex", subjectSlug: subjectSlug || "", classLevel, tex: selected, instruction: text });
      if (r?.tex) setProposal({ tex: r.tex, verdict: checkLatex(r.tex, true), note: r.note || "", warnings: r.warnings || [] });
      else setErr("Copilot n'a pas renvoyé de formule.");
    } catch (e) {
      setErr(errMsg(e.status, e.code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cp-tex">
      <textarea
        className="cp-tex-in"
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        rows={3}
        placeholder="« écris l'intégrale de 0 à 1 de (1+x)^3 et calcule-la étape par étape »"
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ask(); } }}
      />

      <div className="cp-mode" role="radiogroup" aria-label="Mode d'assistance">
        <button role="radio" aria-checked={!agentMode} className={!agentMode ? "on" : ""} onClick={() => setAgentMode(false)}>Rapide</button>
        <button role="radio" aria-checked={agentMode} className={agentMode ? "on" : ""} onClick={() => setAgentMode(true)}><Icon name="cpu" /> Agent</button>
      </div>

      <button className="btn btn-primary btn-sm cp-tex-go" onClick={ask} disabled={running || !instruction.trim()}>
        {agent.running ? "L'agent travaille…" : busy ? "Copilot réfléchit…" : agentMode ? "Lancer l'agent" : "Écrire la formule"}
      </button>

      {/* Said BEFORE the request, not after it fails: the instruction is cut at
          LATEX_INSTRUCTION_MAX and what gets cut is the end — usually the question. */}
      {instruction.length > 500 ? (
        <p className="cp-tex-hint warn">
          <Icon name="alert" /> Consigne très longue ({instruction.length} caractères
          {instruction.length > LATEX_INSTRUCTION_MAX ? `, coupée à ${LATEX_INSTRUCTION_MAX}` : ""}).
          Copilot écrit <b>une</b> formule : donnez la consigne seule, et <b>sélectionnez</b> la formule à retravailler.
        </p>
      ) : (
        <p className="cp-tex-hint">
          {agentMode
            ? "L'agent écrit, vérifie que la formule s'affiche vraiment, et recommence sinon. Plus lent, plus sûr."
            : selected
              ? "Copilot travaillera sur la formule sélectionnée."
              : "Placez le curseur sur une formule pour que Copilot travaille dessus."}
        </p>
      )}

      {/* The visible thinking — one row per step, streamed as it happens. */}
      <AgentSteps steps={agent.steps} />

      {(err || agent.error) && <p className="cp-tex-err"><Icon name="alert" /> {err || agent.error}</p>}

      {proposal && (
        <div className="cp-tex-prop">
          <div className="cp-field-l">Proposition</div>
          <div className="cp-tex-render"><TexPreview tex={proposal.tex} className="cp-tex-katex" /></div>
          {proposal.note && <p className="cp-tex-note">{proposal.note}</p>}
          {/* A formula that PARSES but reads oddly is the failure the agent exists to
              catch; saying so beats inserting it silently. */}
          {proposal.verdict?.suspect && <p className="cp-tex-warn"><Icon name="alert" /> {proposal.verdict.suspect}</p>}
          <Warnings items={proposal.warnings} />
          <code className="cp-tex-src">{proposal.tex}</code>
          <div className="cp-insert">
            <button
              className="btn btn-primary btn-sm"
              disabled={!proposal.verdict?.ok}
              title={proposal.verdict?.ok ? "" : "Cette formule ne s'affiche pas — relancez l'agent"}
              onClick={() => { onApply(proposal.tex); setProposal(null); setInstruction(""); }}
            >
              {selected ? "Remplacer la formule" : "Insérer la formule"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setProposal(null)}>Ignorer</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Copilot APS for lesson authoring. Drives the editor through callbacks so generated
// content is saved by the editor's normal autosave.
export function StudioComposePanel({ subjectSlug, moduleId, classLevel, sourceLessonId = null, allowContent = true, contentReady, getContent, onApplyContent, onApplyTitle, onApplyQuiz, onInsertText, suggestions, fixRequest, getSelectedTex, onApplyFormula }) {
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null); // { action, ... }
  const [error, setError] = useState("");
  const [topic, setTopic] = useState("");
  const [instruction, setInstruction] = useState("");

  // A « À relire » warning can ask for its own fix. The request arrives with a nonce
  // rather than just a string so that clicking the same warning twice runs twice —
  // the teacher may have edited in between.
  useEffect(() => {
    if (!fixRequest?.instruction) return;
    setInstruction(fixRequest.instruction);
    run("improve", { contentMd: getContent(), instruction: fixRequest.instruction });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixRequest?.nonce]);
  const [chatOpen, setChatOpen] = useState(false);
  const [texOpen, setTexOpen] = useState(false);
  const lastReq = useRef(null);

  async function run(action, extra) {
    lastReq.current = { action, extra };
    setBusy(action);
    setError("");
    setResult(null);
    try {
      const r = await postJson({ action, subjectSlug, moduleId, classLevel, sourceLessonId, ...extra });
      setResult(r);
    } catch (e) {
      setError(errMsg(e.status, e.code));
    } finally {
      setBusy("");
    }
  }

  const thinking = (a) => busy === a;

  return (
    <div className="cp-panel">
      <div className="cp-head">
        <span className="cp-badge"><Icon name="sparkles" /> Copilot APS</span>
        <span className="cp-sub">{allowContent ? "Co-auteur — propose, vous décidez et modifiez" : "Génère un quiz à partir de la leçon du manuel"}</span>
      </div>

      {/* Draft a full lesson from a topic (content authoring only) */}
      {allowContent && (
        <>
          <div className="cp-row">
            <input className="cp-text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Thème de la leçon…"
            title="Le sujet de la leçon à rédiger — ex. « Les fractions »" onKeyDown={(e) => e.key === "Enter" && !busy && run("lesson_full", { topic })} />
            <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => run("lesson_full", { topic })}>
              <Icon name={thinking("lesson_full") ? "refresh" : "sparkles"} /> {thinking("lesson_full") ? "Rédaction…" : "Rédiger la leçon"}
            </button>
          </div>
          <div className="cp-hint">
            {suggestions?.length ? "Depuis votre manuel — cliquez pour partir de ce chapitre :" : "Un thème précis donne une meilleure leçon qu'un thème large. Essayez :"}
            {(suggestions?.length ? suggestions : TOPIC_EXAMPLES).map((t) => (
              <button key={t} className="cp-chip" onClick={() => setTopic(t)}>{t}</button>
            ))}
          </div>
        </>
      )}

      {/* Improve (content) + quiz (always) from the current content */}
      <div className="cp-row">
        {allowContent && (
          <>
            <input className="cp-text" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Que faut-il améliorer ?"
            title="Optionnel — ex. « ajoute un exemple concret »" disabled={!contentReady} onKeyDown={(e) => e.key === "Enter" && !busy && contentReady && run("improve", { contentMd: getContent(), instruction })} />
            <button className="btn btn-secondary btn-sm" disabled={!!busy || !contentReady} title={contentReady ? "" : "Écrivez d'abord un peu de contenu"} onClick={() => run("improve", { contentMd: getContent(), instruction })}>
              <Icon name={thinking("improve") ? "refresh" : "edit"} /> {thinking("improve") ? "Amélioration…" : "Améliorer"}
            </button>
          </>
        )}
        <button className="btn btn-primary btn-sm" disabled={!!busy || !contentReady} title={contentReady ? "" : "La leçon doit avoir du contenu"} onClick={() => run("quiz", { contentMd: getContent() })}>
          <Icon name={thinking("quiz") ? "refresh" : "target"} /> {thinking("quiz") ? "Génération…" : "Générer un quiz"}
        </button>
        {allowContent && (
          <button className="btn btn-secondary btn-sm" disabled={!!busy || !contentReady} title={contentReady ? "" : "La leçon doit avoir du contenu"} onClick={() => run("exercise", { contentMd: getContent() })}>
            <Icon name={thinking("exercise") ? "refresh" : "func"} /> {thinking("exercise") ? "Rédaction…" : "Proposer un exercice"}
          </button>
        )}
      </div>

      {/* Formula writing, with the atelier's agent behind the same panel. Folded away
          by default: most of the work here is prose, and a maths-only control open at
          all times would push the rest of Copilot below the fold. */}
      {allowContent && onApplyFormula && (
        <>
          <button className="cp-chat-toggle" onClick={() => setTexOpen((o) => !o)}>
            <Icon name="func" /> {texOpen ? "Masquer l'écriture de formule" : "Écrire une formule (Copilot / Agent)"}
          </button>
          {texOpen && (
            <FormulaCopilot
              subjectSlug={subjectSlug}
              classLevel={classLevel}
              getSelectedTex={getSelectedTex}
              onApply={onApplyFormula}
            />
          )}
        </>
      )}

      {allowContent && (
        <>
          <button className="cp-chat-toggle" onClick={() => setChatOpen((o) => !o)}>
            <Icon name="message" /> {chatOpen ? "Masquer le brainstorming" : "Brainstormer une leçon (chat)"}
          </button>
          {chatOpen && <ComposeChat subjectSlug={subjectSlug} moduleId={moduleId} classLevel={classLevel} sourceLessonId={sourceLessonId} onUse={(md) => onInsertText(md)} />}
        </>
      )}

      {error && <div className="cp-error"><Icon name="alert" /> {error} <button className="cp-retry" onClick={() => lastReq.current && run(lastReq.current.action, lastReq.current.extra)}>Réessayer</button></div>}

      {result && result.action === "lesson_full" && (
        <div className="cp-preview">
          <div className="cp-result-title">Proposition de leçon : <b>{result.title}</b></div>
          <div className="cp-doc"><Markdown>{result.contentMd}</Markdown></div>
          <Warnings items={result.warnings} />
          <div className="cp-insert">
            <button className="btn btn-primary btn-sm" onClick={() => { onApplyTitle(result.title); onApplyContent(result.contentMd, "replace"); setResult(null); }}><Icon name="check" /> Remplacer le contenu</button>
            <button className="btn btn-secondary btn-sm" onClick={() => { onApplyContent(result.contentMd, "append"); setResult(null); }}>Insérer à la fin</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setResult(null)}>Ignorer</button>
          </div>
        </div>
      )}

      {result && result.action === "improve" && (
        <div className="cp-preview">
          <div className="cp-field-l">Version améliorée</div>
          <div className="cp-doc"><Markdown>{result.contentMd}</Markdown></div>
          <Warnings items={result.warnings} />
          <div className="cp-insert">
            <button className="btn btn-primary btn-sm" onClick={() => { onApplyContent(result.contentMd, "replace"); setResult(null); }}><Icon name="check" /> Remplacer le contenu</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setResult(null)}>Ignorer</button>
          </div>
        </div>
      )}

      {result && result.action === "quiz" && (
        <div className="cp-preview">
          <div className="cp-field-l">{result.questions.length} question{result.questions.length > 1 ? "s" : ""} proposée{result.questions.length > 1 ? "s" : ""}</div>
          {result.questions.map((q, i) => (
            <div className="cp-q" key={i}>
              <span className="cp-q-type">{QTYPE[q.type] || q.type}</span>
              {/* Rendered, not raw: quiz questions are as full of LaTeX as the lesson,
                  and "$\Delta$" in the proposal list reads as a mistake to a teacher. */}
              <div className="cp-q-prompt"><Markdown>{q.promptMd}</Markdown></div>
              {q.type === "MCQ" && q.options.map((o, j) => (
                <div className={`cp-q-opt ${j === q.answer ? "correct" : ""}`} key={j}><span className="dot" /> <Markdown>{o}</Markdown></div>
              ))}
              {q.type === "TF" && <div className={`cp-q-opt correct`}><span className="dot" /> {q.answer ? "Vrai" : "Faux"}</div>}
              {q.type === "SHORT" && <div className="cp-q-opt correct"><span className="dot" /> <Markdown>{q.answer.join(" / ")}</Markdown></div>}
            </div>
          ))}
          <div className="cp-insert">
            <button className="btn btn-primary btn-sm" onClick={() => { onApplyQuiz(result.questions, "append"); setResult(null); }}><Icon name="plus" /> Ajouter au quiz</button>
            <button className="btn btn-secondary btn-sm" onClick={() => { onApplyQuiz(result.questions, "replace"); setResult(null); }}>Remplacer le quiz</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setResult(null)}>Ignorer</button>
          </div>
          <div className="cp-disclaim">Vérifiez les bonnes réponses avant d'enregistrer le quiz.</div>
        </div>
      )}

      {result && result.action === "exercise" && (
        <div className="cp-preview">
          <div className="cp-result-title">Exercice proposé : <b>{result.title}</b></div>
          <div className="cp-field-l">Énoncé</div>
          {/* `breaks` runs closeDanglingMath(), which repairs the half-written
              formula a truncated generation leaves behind. */}
          <div className="cp-doc"><Markdown breaks>{result.statementMd}</Markdown></div>
          {result.solutionMd && (
            <>
              <div className="cp-field-l">Solution</div>
              <div className="cp-doc"><Markdown breaks>{result.solutionMd}</Markdown></div>
            </>
          )}
          <Warnings items={result.warnings} />
          <div className="cp-insert">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                const md = `## ${result.title}\n\n${result.statementMd}${result.solutionMd ? `\n\n**Solution.** ${result.solutionMd}` : ""}`;
                onInsertText(md);
                setResult(null);
              }}
            >
              <Icon name="plus" /> Insérer dans la leçon
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setResult(null)}>Ignorer</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ComposeChat({ subjectSlug, moduleId, classLevel, sourceLessonId, onUse }) {
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "chat", subjectSlug, moduleId, classLevel, sourceLessonId, message: q, history }),
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
        {msgs.length === 0 && <div className="cp-chat-empty">Demandez un plan, un angle, une situation réelle : « un plan de leçon sur les pourcentages avec un exemple de marché »…</div>}
        {msgs.map((m, i) => (
          <div key={i} className={`cp-msg ${m.role}`}>
            <Markdown>{m.content || "…"}</Markdown>
            {m.role === "assistant" && m.content && !busy && (
              <button className="cp-use" onClick={() => onUse(m.content)}>→ Insérer dans la leçon</button>
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
