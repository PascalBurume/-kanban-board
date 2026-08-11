"use client";
import "./latex.css";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import katex from "katex";
import Icon from "@/components/ui/Icon";
import Markdown from "@/components/Markdown";
import SymbolPalette from "@/components/editor/SymbolPalette";
import { useAgentStream, AgentSteps } from "@/components/TeacherAgentPanel";
import "@/components/AgentSteps.css";
import { extractFormulas } from "@/lib/formulas";
import { parseFigure } from "@/lib/figures";
import { checkLatex, latexReason, LATEX_INSTRUCTION_MAX } from "@/lib/latexCheck";
import { expandTrigger } from "@/lib/mathInput";
import { saveDoc, loadDoc, markSynced, deleteDoc, requestPersistence } from "@/lib/localDocs";
import { toast } from "@/lib/toast";

// The LaTeX workspace — source on the left, the rendered document on the right, and
// Copilot able to write the maths into it.
//
// The document is ordinary lesson markdown, saved through the same endpoint as every
// other lesson. Nothing here is a private format: a worksheet written on this page can
// be opened in the lesson editor, read by a student, and indexed for search, because
// what it contains is "$$…$$" and prose. That is the lesson of the drawing canvas this
// replaced — it stored its pictures as JSON only its own renderer understood, so
// everything else in the platform was blind to them.
//
// Autosave follows RedigerClient exactly: the device copy is written BEFORE the
// network request, so a dropped Wi-Fi or a closed tab still leaves the work
// recoverable, and a newer local draft is OFFERED rather than applied — on a shared
// lesson the server copy may hold a colleague's newer edit.

const TABS = [
  ["apercu", "Aperçu"],
  ["problemes", "Problèmes"],
  ["plan", "Plan"],
  ["stats", "Stats"],
];

// The rail may not shrink past the point where its own controls stop fitting, nor grow
// so far that the source pane it sits beside becomes the narrow one.
const RAIL_MIN = 240;
const RAIL_MAX = 560;
const RAIL_DEFAULT = 320;

// Blocks to start from. The Copilot rail is a full-height column with four controls in
// it, so below the prompt there was nothing but empty grey — and the one thing a
// teacher facing an empty document needs is somewhere to start. These need no model,
// which matters: the school's Ollama is unreachable more often than not.
const STARTERS = [
  { id: "aligned", label: "Démonstration", hint: "plusieurs lignes alignées sur le =", block: "$$\n\\begin{aligned}\nI &= a + b \\\\\n  &= c\n\\end{aligned}\n$$" },
  { id: "cases", label: "Définition par cas", hint: "accolade, si / sinon", block: "$$\nf(x) = \\begin{cases}\n  x^2 & \\text{si } x \\geq 0 \\\\\n  -x & \\text{sinon}\n\\end{cases}\n$$" },
  { id: "system", label: "Système", hint: "deux équations, deux inconnues", block: "$$\n\\begin{cases}\n  2x + 3y = 8 \\\\\n  x - y = 1\n\\end{cases}\n$$" },
  { id: "table", label: "Tableau", hint: "filets, en-têtes, cases remplies", block: "$$\n\\begin{array}{|c|c|c|}\n\\hline\n x & x^2 & x^3 \\\\\n\\hline\n 1 & 1 & 1 \\\\\n 2 & 4 & 8 \\\\\n\\hline\n\\end{array}\n$$" },
  { id: "section", label: "Section de leçon", hint: "titre et paragraphe", block: "## Titre de la section\n\nVotre texte ici." },
];

// Every ``` fenced block in the document, as offsets into the source.
//
// A fenced block is a PAYLOAD, not prose: a ```figure holds JSON that a parser has to
// read back. Splicing anything into the middle of one destroys it — a "$$…$$" dropped
// between the "t" and the "rue," of `"grid": true,` leaves JSON that no longer parses,
// and the figure renders as a red slab of its own source with no clue what happened.
// So insertion has to know where these blocks are, and stay out of them.
function fences(md) {
  const out = [];
  let pos = 0;
  let open = null; // { start, lang }
  for (const line of (md || "").split("\n")) {
    const end = pos + line.length;
    if (/^\s*```/.test(line)) {
      if (open) {
        out.push({ ...open, end: Math.min(end + 1, (md || "").length) });
        open = null;
      } else {
        open = { start: pos, lang: line.replace(/^\s*```/, "").trim() };
      }
    }
    pos = end + 1;
  }
  // An unterminated fence still owns everything after it — the teacher is part-way
  // through typing one, and that is exactly when an insert would land inside it.
  if (open) out.push({ ...open, end: (md || "").length });
  return out;
}

const fenceAt = (md, caret) => fences(md).find((f) => caret > f.start && caret < f.end) || null;

// Whether the caret sits inside $…$ maths. Fenced blocks are cut out first: a stray
// "$" inside a ```figure payload would otherwise flip the parity and make the whole
// rest of the document look like maths.
function inMathAt(md, caret) {
  let before = (md || "").slice(0, caret);
  for (const f of fences(md).slice().reverse()) {
    if (f.start >= caret) continue;
    before = before.slice(0, f.start) + before.slice(Math.min(f.end, caret));
  }
  return (before.match(/(?<!\\)\$/g) || []).length % 2 === 1;
}

// Headings, for the outline. Fenced blocks are skipped so a "# comment" inside code is
// not mistaken for a section.
function outline(md) {
  const out = [];
  let fence = false;
  (md || "").split("\n").forEach((line, i) => {
    if (/^\s*```/.test(line)) { fence = !fence; return; }
    if (fence) return;
    const m = line.match(/^(#{1,4})\s+(.*)$/);
    if (m) out.push({ level: m[1].length, text: m[2].trim(), line: i + 1 });
  });
  return out;
}

export default function LatexClient() {
  const [lessonId, setLessonId] = useState(null);
  const [meta, setMeta] = useState(null);
  const [title, setTitle] = useState("");
  const [md, setMd] = useState("");
  const [classLevel, setClassLevel] = useState("");
  const [tab, setTab] = useState("apercu");
  const [saveState, setSaveState] = useState("Enregistré");
  const [savedAt, setSavedAt] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [start, setStart] = useState(null);
  const [localDraft, setLocalDraft] = useState(null);

  // Width of the Copilot rail, in pixels, dragged by the teacher and kept.
  //
  // It was a fixed fraction, and no fixed fraction is right: writing a prompt wants a
  // wide rail, reading an agent's steps wants a wide rail, and typing LaTeX wants it
  // out of the way. Reading it on the client only — localStorage does not exist during
  // server rendering, and seeding state from it would make the first paint differ from
  // the markup.
  const [railW, setRailW] = useState(RAIL_DEFAULT);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const railWRef = useRef(RAIL_DEFAULT);
  useEffect(() => {
    const saved = Number(localStorage.getItem("mwalimu.latex.railW"));
    if (Number.isFinite(saved) && saved >= RAIL_MIN && saved <= RAIL_MAX) {
      setRailW(saved);
      railWRef.current = saved;
    }
  }, []);

  const [palTab, setPalTab] = useState("math");
  const [palQuery, setPalQuery] = useState("");
  const [showPalette, setShowPalette] = useState(true);

  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState(null);
  const [aiError, setAiError] = useState("");
  // The agent: same request, but it shows its work and re-checks the result. Slower
  // than the one-shot button and worth it when the formula matters.
  const [agentMode, setAgentMode] = useState(false);
  const agent = useAgentStream();

  const taRef = useRef(null);

  // ---- load ----
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) {
      (async () => {
        const t = await fetch("/api/studio/tree/", { credentials: "same-origin" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
        setStart({
          subjects: (t?.subjects || []).map((s) => ({ slug: s.slug, name: s.name })),
          drafts: (t?.subjects || []).flatMap((s) => (s.library || []).map((l) => ({ ...l, subjectName: s.name }))),
        });
      })();
      return;
    }
    setLessonId(id);
    (async () => {
      const r = await fetch(`/api/studio/lessons/${id}/`, { credentials: "same-origin" });
      if (!r.ok) {
        setLoadError(r.status === 404 ? "Document introuvable." : "Accès refusé.");
        return;
      }
      const d = await r.json();
      setMeta(d.lesson);
      setTitle(d.lesson.title || "");
      setMd(d.lesson.contentMd || "");
      const t = await fetch(`/api/studio/tree/?lesson=${id}`, { credentials: "same-origin" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (t?.classLevel) setClassLevel(t.classLevel);

      requestPersistence();
      const draft = await loadDoc("lesson-draft", id);
      if (draft?.dirty && draft.contentMd !== (d.lesson.contentMd || "")) setLocalDraft(draft);
      else if (draft && !draft.dirty) deleteDoc("lesson-draft", id);
    })();
  }, []);

  // ---- save ----
  const save = useCallback(async () => {
    if (!lessonId || !meta?.canEdit) return;
    setSaveState("Enregistrement…");
    const local = await saveDoc({ kind: "lesson-draft", id: lessonId, title, contentMd: md }).catch(() => null);
    try {
      const r = await fetch(`/api/studio/lessons/${lessonId}/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ contentMd: md, title }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setSaveState("Enregistré");
      setSavedAt(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
      setSaveFailed(false);
      setDirty(false);
      if (local) await markSynced("lesson-draft", lessonId, local.updatedAt);
    } catch {
      setSaveFailed(true);
      setSaveState("Non enregistré");
    }
  }, [lessonId, meta, md, title]);

  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(save, 1500);
    return () => clearTimeout(t);
  }, [dirty, save]);

  function touch() {
    setSaveState("Modifications non enregistrées");
    setDirty(true);
  }

  // ---- the rail grip ----
  const clampRail = (px) => Math.min(Math.max(Math.round(px), RAIL_MIN), RAIL_MAX);
  const persistRail = (px) => localStorage.setItem("mwalimu.latex.railW", String(px));

  // Pointer capture rather than window listeners: it keeps the drag alive when the
  // cursor crosses the source textarea, and it ends by itself if the pointer is lost.
  //
  // The live flag is a ref, not the state. React state is not updated synchronously, so
  // a pointermove arriving in the same tick as the pointerdown reads the stale `false`
  // and the first movement of every drag is dropped. `dragging` state still exists —
  // but only to drive the CSS class, where a frame of lag costs nothing.
  function gripDown(e) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setDragging(true);
  }
  function gripMove(e) {
    if (!draggingRef.current) return;
    const left = e.currentTarget.parentElement?.getBoundingClientRect().left ?? 0;
    const w = clampRail(e.clientX - left);
    railWRef.current = w;
    setRailW(w);
  }
  function gripUp(e) {
    if (!draggingRef.current) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    draggingRef.current = false;
    setDragging(false);
    // From the ref: `railW` in this closure is the value from the render that
    // installed the handler, which is one drag behind by the time it is released.
    persistRail(railWRef.current);
  }
  // Keyboard-operable, because a separator that only responds to a drag is unusable
  // for anyone who is not using a mouse.
  function gripKey(e) {
    const step = e.shiftKey ? 48 : 16;
    let next = null;
    if (e.key === "ArrowLeft") next = railW - step;
    else if (e.key === "ArrowRight") next = railW + step;
    else if (e.key === "Home") next = RAIL_MIN;
    else if (e.key === "End") next = RAIL_MAX;
    else if (e.key === "Enter" || e.key === " ") next = RAIL_DEFAULT;
    if (next == null) return;
    e.preventDefault();
    const w = clampRail(next);
    setRailW(w);
    railWRef.current = w;
    persistRail(w);
  }

  // ---- editing ----
  const setSelection = useCallback((at, len) => {
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(at, at + len);
    });
  }, []);

  // Drop a whole block — a formula, a figure — separated from its neighbours by exactly
  // one blank line.
  //
  // It pads only what is MISSING. Wrapping the snippet in a fixed "\n\n…\n\n" looked
  // simpler and stacked: the previous insert had already left a blank line behind it,
  // so three formulas in a row arrived three blank lines apart and the source filled up
  // with empty space.
  const insertBlock = useCallback((block) => {
    const el = taRef.current;
    const at = el?.selectionStart ?? md.length;
    const before = md.slice(0, at).replace(/\s+$/, "");
    const after = md.slice(at).replace(/^\s+/, "");
    const text = (before ? before + "\n\n" : "") + block + (after ? "\n\n" + after : "\n");
    setMd(text);
    touch();
    const caret = (before ? before.length + 2 : 0) + block.length;
    setSelection(caret, 0);
  }, [md, setSelection]);

  // `replaceSelection` is false for anything additive — a catalogue figure, an agent's
  // formula. Those arrive from a panel on the other side of the screen, and the
  // selection they would overwrite is usually the passage the teacher highlighted to
  // ask Copilot about in the first place: pressing "Insérer" would silently delete it.
  const insertAtCaret = useCallback((snippet, select, replaceSelection = true) => {
    const el = taRef.current;
    let from = el?.selectionStart ?? md.length;
    let to = replaceSelection ? (el?.selectionEnd ?? from) : from;
    // Never write into a fenced block. Landing after it is the only harmless place —
    // refusing outright would leave the teacher pressing a button that does nothing,
    // and writing where they asked would silently destroy the figure.
    const fence = fenceAt(md, from);
    if (fence) {
      from = to = fence.end;
      toast("Insérée après le bloc — on ne peut pas écrire à l'intérieur d'une figure.", { icon: "alert" });
    }
    setMd(md.slice(0, from) + snippet + md.slice(to));
    touch();
    const at = from + (select ? select[0] : snippet.length);
    setSelection(at, select ? select[1] : 0);
  }, [md, setSelection]);

  // A symbol pressed in a document (rather than inside a formula) has to land inside
  // maths delimiters, or "\sqrt{x}" is typeset as literal text in the middle of a
  // sentence. Inside an existing $…$ it is inserted bare.
  const insertSymbol = useCallback((sym) => {
    const el = taRef.current;
    const at = el?.selectionStart ?? md.length;
    // A symbol pressed with the caret inside a figure is going after the block, so it
    // is starting a fresh formula there — not continuing one.
    const inMath = !fenceAt(md, at) && inMathAt(md, at);
    const body = sym.insert.trimEnd();
    const snippet = inMath ? body : `$${body}$`;
    const shift = inMath ? 0 : 1;
    insertAtCaret(snippet, sym.select ? [sym.select[0] + shift, sym.select[1]] : undefined);
  }, [md, insertAtCaret]);

  function onInput(e) {
    const value = e.target.value;
    const at = e.target.selectionStart ?? value.length;
    // Type-to-convert only inside maths — "somme" in a French sentence is a word, and
    // "true" inside a ```figure payload must stay the four characters the parser needs.
    const r = !fenceAt(value, at) && inMathAt(value, at) ? expandTrigger(value, at) : null;
    if (r) {
      setMd(value.slice(0, r.from) + r.insert + value.slice(r.to));
      touch();
      setSelection(r.select ? r.select[0] : r.from + r.insert.length, r.select ? r.select[1] : 0);
      return;
    }
    setMd(value);
    touch();
  }

  // ---- derived ----
  const formulas = useMemo(() => extractFormulas(md), [md]);
  const brokenFormulas = formulas.filter((f) => !f.ok || f.suspect);

  // A ```figure whose JSON stopped parsing renders as a red slab of its own source and
  // says nothing about why. extractFormulas deliberately skips fenced blocks, so
  // without this the one problem the teacher can actually SEE is the one the Problèmes
  // tab stays silent about.
  const brokenFigures = useMemo(
    () =>
      fences(md)
        .filter((f) => f.lang === "figure")
        .map((f) => ({ ...f, body: md.slice(md.indexOf("\n", f.start) + 1, md.lastIndexOf("```", f.end)) }))
        .filter((f) => !parseFigure(f.body))
        .map((f) => ({
          line: md.slice(0, f.start).split("\n").length,
          body: f.body,
          // The overwhelmingly common cause, and the one worth naming: something was
          // inserted into the payload. Say so rather than "invalid JSON".
          why: /\$\$?[\s\S]*\$\$?/.test(f.body)
            ? "Une formule a été insérée à l'intérieur du bloc et a coupé ses données en deux. Retirez le « $$…$$ » et recollez la ligne qu'il a séparée."
            : "Les données de la figure ne sont plus lisibles (JSON invalide).",
        })),
    [md],
  );
  const broken = [...brokenFormulas, ...brokenFigures];
  const plan = useMemo(() => outline(md), [md]);
  const stats = useMemo(() => {
    const text = (md || "").replace(/\$[^$]*\$/g, " ");
    const words = text.trim() ? text.split(/\s+/).filter(Boolean).length : 0;
    return { words, chars: (md || "").length, formulas: formulas.length, sections: plan.length };
  }, [md, formulas.length, plan.length]);

  // ---- Copilot ----
  const selectedTex = () =>
    taRef.current && taRef.current.selectionStart !== taRef.current.selectionEnd
      ? md.slice(taRef.current.selectionStart, taRef.current.selectionEnd)
      : "";

  // The agent path. Same endpoint contract as the exercises agent, so the SSE reader is
  // shared — what differs is that this one verifies its own output before handing it
  // over, and the teacher watches it do so.
  async function runAgent() {
    const instruction = prompt.trim();
    if (!instruction || agent.running) return;
    setProposal(null);
    setAiError("");
    const final = await agent.start(
      { instruction, tex: selectedTex(), subjectSlug: meta?.subjectSlug || "", classLevel },
      "/api/studio/latex-agent/",
    );
    if (final?.tex) setProposal({ tex: final.tex, verdict: checkLatex(final.tex, true), note: final.note || "", warnings: final.warnings || [] });
  }

  async function ask() {
    const instruction = prompt.trim();
    if (!instruction || busy) return;
    setBusy(true);
    setAiError("");
    setProposal(null);
    try {
      const r = await fetch("/api/studio/ai/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "latex",
          subjectSlug: meta?.subjectSlug || "",
          classLevel,
          // The selection is the context when there is one — "simplifie ça" means the
          // formula the teacher highlighted, not the whole document.
          tex: (taRef.current && taRef.current.selectionStart !== taRef.current.selectionEnd
            ? md.slice(taRef.current.selectionStart, taRef.current.selectionEnd)
            : ""),
          instruction,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setAiError(
          r.status === 403 ? "Copilot n'écrit des formules que pour les enseignants. Tout le reste de l'éditeur fonctionne."
          : r.status === 503 ? "Copilot est hors ligne — le modèle de l'école ne répond pas. Vous pouvez continuer à écrire à la main."
          : r.status === 429 ? "Trop de demandes d'affilée. Attendez une minute."
          : latexReason(body?.error) ?? "Copilot n'a pas pu répondre. Rien n'a été inséré."
        );
        return;
      }
      const data = await r.json();
      const v = checkLatex(String(data.tex ?? ""), true);
      if (!v.ok) {
        setAiError(`Copilot a répondu quelque chose que KaTeX refuse (${v.error}). Rien n'a été inséré.`);
        return;
      }
      // The server already retries a blank answer; this catches one that slipped past
      // rather than offering the teacher an empty preview to accept.
      if (v.blank) {
        setAiError("Copilot a répondu une formule qui ne montre rien. Précisez ce que doivent contenir les cases et réessayez.");
        return;
      }
      setProposal({ tex: v.tex, verdict: v, note: data.note || "" });
    } catch {
      setAiError("Copilot est injoignable. Vous pouvez continuer à écrire à la main.");
    } finally {
      setBusy(false);
    }
  }

  function insertProposal() {
    if (!proposal) return;
    // Additive: the selection is what the teacher asked Copilot about, not a target.
    insertBlock(`$$\n${proposal.tex}\n$$`);
    setProposal(null);
    setPrompt("");
    toast("Formule insérée ✓", { icon: "check" });
  }

  const proposalHtml = useMemo(() => {
    if (!proposal) return "";
    try { return katex.renderToString(proposal.tex, { throwOnError: false, displayMode: true }); } catch { return ""; }
  }, [proposal]);

  async function createLesson(subjectSlug) {
    const r = await fetch("/api/studio/library/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ subjectSlug }),
    });
    if (!r.ok) return toast("Création impossible", { icon: "alert" });
    const { lesson } = await r.json();
    window.location.href = `/teacher/studio/latex/?id=${lesson.id}`;
  }

  // ---- screens ----
  if (start) {
    return (
      <div className="lxp-start">
        <h1>Atelier LaTeX</h1>
        <p className="lxp-start-sub">
          Pour les documents faits surtout de mathématiques : une démonstration, une interrogation, un formulaire.
          Vous écrivez le LaTeX à gauche, la classe le voit à droite.
        </p>
        <section>
          <h2>Commencer un nouveau document</h2>
          <div className="lxp-start-row">
            {start.subjects.map((s) => (
              <button key={s.slug} className="btn btn-primary btn-sm" onClick={() => createLesson(s.slug)}>
                <Icon name="plus" /> {s.name}
              </button>
            ))}
            {start.subjects.length === 0 && <p className="lxp-start-none">Aucune matière ne vous est attribuée.</p>}
          </div>
        </section>
        <section>
          <h2>Reprendre un document</h2>
          {start.drafts.length === 0 ? (
            <p className="lxp-start-none">Vous n'avez pas encore de document personnel.</p>
          ) : (
            <ul className="lxp-start-list">
              {start.drafts.map((d) => (
                <li key={d.id}>
                  <a href={`/teacher/studio/latex/?id=${d.id}`}>
                    <span className="t">{d.title}</span>
                    <span className="s">{d.subjectName}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
        <a className="lxp-start-back" href="/teacher/studio/">← Retour au studio de contenu</a>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="lxp-empty">
        <Icon name="alert" />
        <p>{loadError}</p>
        <a className="btn btn-secondary btn-sm" href="/teacher/studio/">Retour au studio</a>
      </div>
    );
  }
  if (!meta) return <div className="lxp-empty"><p>Chargement…</p></div>;

  return (
    <div className="lxp">
      <header className="lxp-head">
        <a className="lxp-back" href="/teacher/studio/" title="Retour au studio"><Icon name="grid" /></a>
        <input
          className="lxp-title"
          value={title}
          onChange={(e) => { setTitle(e.target.value); touch(); }}
          disabled={!meta.canEdit}
          placeholder="Titre du document"
        />
        <span className="lxp-subject">{meta.subjectName}</span>
        <span className={`lxp-server${saveFailed ? " bad" : ""}`}>
          <span className="dot" />
          {saveFailed ? "Serveur injoignable" : savedAt ? `Enregistré · ${savedAt}` : "Serveur de l'école"}
        </span>
        <span className="lxp-save">{saveState}</span>
        <a className="btn btn-secondary btn-sm" href="/teacher/studio/rediger/" title="Ouvrir l'éditeur de leçon">
          <Icon name="file" /> Éditeur de leçon
        </a>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={!meta.canEdit}><Icon name="save" /> Enregistrer</button>
      </header>

      {localDraft && (
        <div className="lxp-draft">
          <Icon name="history" />
          <span>
            Un brouillon plus récent est enregistré sur cet appareil ({new Date(localDraft.updatedAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}).
            Il n'a jamais été envoyé au serveur.
          </span>
          <button className="btn btn-sm btn-primary" onClick={() => { setMd(localDraft.contentMd); setTitle(localDraft.title); setLocalDraft(null); touch(); }}>Restaurer</button>
          <button className="btn btn-sm btn-secondary" onClick={() => { deleteDoc("lesson-draft", lessonId); setLocalDraft(null); }}>Ignorer</button>
        </div>
      )}
      {saveFailed && (
        <div className="lxp-savefail">
          <Icon name="alert" />
          <span>Votre texte est toujours là et il est enregistré sur cet appareil, mais le serveur de l'école n'a pas répondu.</span>
          <button className="btn btn-sm btn-secondary" onClick={save}>Réessayer</button>
        </div>
      )}

      <div
        className={`lxp-body${dragging ? " dragging" : ""}`}
        style={{ "--rail": `${railW}px` }}
      >
        {/* ── Copilot ── */}
        <aside className="lxp-ai">
          <p className="lxp-l">
            <Icon name="sparkles" /> Copilot
            {/* The number only while it is moving — a permanent readout would be
                chrome nobody asked for. */}
            {dragging && <span className="lxp-w">{railW} px</span>}
          </p>
          <textarea
            className="lxp-ai-in"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="« écris l'intégrale de 0 à 1 de (1+x)^3 et calcule-la étape par étape »"
            rows={4}
            disabled={!meta.canEdit || busy}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ask(); } }}
          />
          <div className="lxp-mode" role="radiogroup" aria-label="Mode d'assistance">
            <button role="radio" aria-checked={!agentMode} className={!agentMode ? "on" : ""} onClick={() => setAgentMode(false)}>
              Rapide
            </button>
            <button role="radio" aria-checked={agentMode} className={agentMode ? "on" : ""} onClick={() => setAgentMode(true)}>
              <Icon name="cpu" /> Agent
            </button>
          </div>
          <button
            className="btn btn-primary btn-sm lxp-ai-go"
            onClick={agentMode ? runAgent : ask}
            disabled={!meta.canEdit || busy || agent.running || !prompt.trim()}
          >
            {agent.running ? "L'agent travaille…" : busy ? "Copilot réfléchit…" : agentMode ? "Lancer l'agent" : "Écrire la formule"}
          </button>
          {/* Said before the request, not after it fails. A pasted lesson is cut at
              LATEX_INSTRUCTION_MAX, and what gets cut is the end — usually the actual
              question — leaving the model a page of headings to "solve". */}
          {prompt.length > 500 ? (
            <p className="lxp-toolong">
              <Icon name="alert" />
              <span>
                Consigne très longue ({prompt.length} caractères{prompt.length > LATEX_INSTRUCTION_MAX ? `, coupée à ${LATEX_INSTRUCTION_MAX}` : ""}).
                Copilot écrit <b>une</b> formule : donnez-lui la consigne seule, et <b>sélectionnez</b> dans le texte la formule à retravailler.
              </span>
            </p>
          ) : (
            <p className="lxp-hint">
              {agentMode
                ? "L'agent écrit, puis vérifie que la formule s'affiche vraiment, et recommence si ce n'est pas le cas. Plus lent, plus sûr."
                : "Sélectionnez une formule dans le texte pour que Copilot travaille dessus."}
            </p>
          )}

          {/* The visible thinking — one row per step, streamed as it happens. */}
          <AgentSteps steps={agent.steps} />

          {(aiError || agent.error) && <p className="lxp-err"><Icon name="alert" /> {aiError || agent.error}</p>}

          {proposal && (
            <div className="lxp-prop">
              <p className="lxp-l">Proposition</p>
              <div className="lxp-prop-r" dangerouslySetInnerHTML={{ __html: proposalHtml }} />
              {proposal.note && <p className="lxp-note">{proposal.note}</p>}
              {proposal.verdict.suspect && <p className="lxp-warn"><Icon name="alert" /> {proposal.verdict.suspect}</p>}
              <code className="lxp-prop-s">{proposal.tex}</code>
              <div className="lxp-prop-a">
                <button className="btn btn-primary btn-sm" onClick={insertProposal}>Insérer</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setProposal(null)}>Annuler</button>
              </div>
              <p className="lxp-disclaim">Vérifiez chaque calcul — Copilot se trompe régulièrement.</p>
            </div>
          )}

          {/* Fills the rest of the rail while nothing is proposed. Hidden once there is
              a proposal to read, so the two never compete for attention. */}
          {!proposal && !agent.running && (
            <div className="lxp-starters">
              <p className="lxp-l">Ou partir d'un bloc</p>
              {STARTERS.map((s) => (
                <button key={s.id} className="lxp-starter" onClick={() => insertBlock(s.block)} disabled={!meta.canEdit}>
                  <b>{s.label}</b>
                  <span>{s.hint}</span>
                </button>
              ))}
              <p className="lxp-starters-note">
                Les 76 figures du catalogue sont dans l'onglet <b>Figures</b> de la palette, sous la source.
              </p>
            </div>
          )}
        </aside>

        {/* Drag to resize the rail; arrows to nudge it; Entrée to reset. */}
        <div
          className="lxp-grip"
          role="separator"
          aria-orientation="vertical"
          aria-label="Largeur du panneau Copilot"
          aria-valuenow={railW}
          aria-valuemin={RAIL_MIN}
          aria-valuemax={RAIL_MAX}
          tabIndex={0}
          title={`${railW} px — glissez, ou flèches ← →, Entrée pour réinitialiser`}
          onPointerDown={gripDown}
          onPointerMove={gripMove}
          onPointerUp={gripUp}
          onPointerCancel={gripUp}
          onKeyDown={gripKey}
          onDoubleClick={() => { setRailW(RAIL_DEFAULT); persistRail(RAIL_DEFAULT); }}
        >
          <span />
        </div>

        {/* ── source ── */}
        <main className="lxp-src">
          <p className="lxp-l">Source — markdown et LaTeX</p>
          <textarea
            ref={taRef}
            className="lxp-ta"
            value={md}
            spellCheck="false"
            disabled={!meta.canEdit}
            placeholder={"## Intégrale de Gauss\n\nOn pose $I = \\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx$.\n\n$$\n\\begin{aligned}\nI^2 &= \\iint_{\\mathbb{R}^2} e^{-(x^2+y^2)}\\,dx\\,dy \\\\\n    &= \\pi\n\\end{aligned}\n$$"}
            onChange={onInput}
          />
          {showPalette && (
            <div className={`lxp-pal${palTab === "figures" ? " tall" : ""}`}>
              <SymbolPalette
                tab={palTab}
                onTab={setPalTab}
                query={palQuery}
                onQuery={setPalQuery}
                onPick={insertSymbol}
                // Here the document IS markdown, so the catalogue can offer the chart
                // as well as the formula. A formula goes in as display maths; a chart
                // goes in as the ```figure block it already is.
                onInsertFigure={(code, kind, fig) => {
                  // "figure" is inline SVG and "chart" a ```figure block — both are
                  // already markdown-ready; only a bare formula needs $$ around it.
                  insertBlock(kind === "math" ? `$$\n${code}\n$$` : code);
                  toast(`${fig.code} inséré ✓`, { icon: "check" });
                }}
                onClose={() => setShowPalette(false)}
                disabled={!meta.canEdit}
                compact
              />
            </div>
          )}
          {!showPalette && (
            <button className="btn btn-secondary btn-sm lxp-palopen" onClick={() => setShowPalette(true)}>
              <Icon name="grid" /> Symboles
            </button>
          )}
        </main>

        {/* ── render / audit ── */}
        <section className="lxp-out">
          <nav className="lxp-tabs">
            {TABS.map(([k, label]) => (
              <button key={k} className={`lxp-tab${tab === k ? " active" : ""}`} onClick={() => setTab(k)}>
                {label}
                {k === "problemes" && broken.length > 0 && <span className="lxp-badge warn">{broken.length}</span>}
              </button>
            ))}
          </nav>

          <div className="lxp-pane">
            {tab === "apercu" && (md.trim() ? <Markdown>{md}</Markdown> : <p className="lxp-none">Le document s'affichera ici pendant que vous l'écrivez.</p>)}

            {tab === "problemes" && (
              broken.length === 0 ? (
                formulas.length === 0 ? (
                  <p className="lxp-none">Aucune formule dans ce document.</p>
                ) : (
                  <p className="lxp-none"><Icon name="check" /> Les {formulas.length} formules s'affichent correctement.</p>
                )
              ) : (
                <>
                  {brokenFigures.map((f, i) => (
                    <div className="lxp-f bad" key={`fig-${i}`}>
                      <span className="lxp-f-n">figure · ligne {f.line}</span>
                      <code>{f.body.trim()}</code>
                      <p className="lxp-f-e"><Icon name="alert" /> {f.why}</p>
                    </div>
                  ))}
                  {brokenFormulas.map((f, i) => (
                    <div className={`lxp-f${!f.ok ? " bad" : " suspect"}`} key={`f-${i}`}>
                      <span className="lxp-f-n">ligne {f.line}</span>
                      {f.ok ? <Markdown>{f.display ? `$$${f.tex}$$` : `$${f.tex}$`}</Markdown> : <code>{f.tex}</code>}
                      <p className="lxp-f-e"><Icon name="alert" /> {f.error || f.suspect}</p>
                    </div>
                  ))}
                </>
              )
            )}

            {tab === "plan" && (
              plan.length === 0 ? (
                <p className="lxp-none">Aucun titre. Commencez une section avec « ## ».</p>
              ) : (
                <ul className="lxp-plan">
                  {plan.map((h, i) => (
                    <li key={i} className={`l${h.level}`}><span>{h.text}</span><b>ligne {h.line}</b></li>
                  ))}
                </ul>
              )
            )}

            {tab === "stats" && (
              <ul className="lxp-stats">
                <li><span>Mots</span><b>{stats.words}</b></li>
                <li><span>Caractères</span><b>{stats.chars}</b></li>
                <li><span>Formules</span><b>{stats.formulas}</b></li>
                <li><span>Sections</span><b>{stats.sections}</b></li>
                <li><span>À vérifier</span><b className={broken.length ? "warn" : ""}>{broken.length}</b></li>
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
