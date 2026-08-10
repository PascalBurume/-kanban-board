"use client";
import "./rediger.css";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Icon from "@/components/ui/Icon";
import Markdown from "@/components/Markdown";
import DocMenuBar from "@/components/ui/DocMenuBar";
import ResizeGrip from "@/components/ui/ResizeGrip";
import { StudioComposePanel } from "@/components/StudioComposePanel";
import TeachPanel from "@/components/TeachPanel";
import LessonWriter from "@/components/LessonWriter";
import QuizMathInput from "@/components/QuizMathInput";
import { auditDocument, auditQuiz } from "@/lib/lessonAudit";
import { repairLatex } from "@/lib/latexRepair";
import { FIGURE_KINDS } from "@/lib/figures";
import { EPURE_TEMPLATES } from "@/lib/epure";
import { isBlankContent } from "@/lib/lessonSkeleton";
import { lintLesson } from "@/lib/lessonLint";
import { bookTopicPool } from "@/lib/copilotSuggestions";
import { saveDoc, loadDoc, markSynced, deleteDoc, requestPersistence } from "@/lib/localDocs";
import { flushPendingImages } from "@/lib/imageUpload";
import { toast } from "@/lib/toast";

// « Rédiger une leçon » — the word processor.
//
// Shaped like Google Docs because that is the shape a teacher already knows: a title
// bar, a menu bar, a toolbar, the page floating on a grey desk, and the assistant
// docked down the right-hand side. The document itself is still LessonWriter, and the
// document is still STORED as markdown (see src/lib/lessonDoc.ts) — this file is the
// chrome around it, plus the outline, the audit and the Copilot rail.
//
// The toolbar and status bar are rendered by LessonWriter but PORTALLED into this
// layout, so they can span the full width above and below the three columns while the
// editor keeps owning its own commands.

const TYPE_FROM_API = { MCQ: "qcm", TF: "vf", SHORT: "court" };
const TYPE_TO_API = { qcm: "MCQ", vf: "TF", court: "SHORT" };
const TYPES = { qcm: "Choix multiple", vf: "Vrai / faux", court: "Réponse courte" };

// Blocks to start from — no model needed, which matters: the school's Ollama is
// unreachable more often than not.
const STARTERS = [
  { id: "aligned", icon: "func", label: "Démonstration", hint: "plusieurs lignes alignées sur le =", block: "$$\n\\begin{aligned}\nI &= a + b \\\\\n  &= c\n\\end{aligned}\n$$" },
  { id: "cases", icon: "layers", label: "Définition par cas", hint: "accolade, si / sinon", block: "$$\nf(x) = \\begin{cases}\n  x^2 & \\text{si } x \\geq 0 \\\\\n  -x & \\text{sinon}\n\\end{cases}\n$$" },
  { id: "system", icon: "func", label: "Système", hint: "deux équations, deux inconnues", block: "$$\n\\begin{cases}\n  2x + 3y = 8 \\\\\n  x - y = 1\n\\end{cases}\n$$" },
  { id: "array", icon: "table", label: "Tableau de valeurs", hint: "filets, en-têtes, cases remplies", block: "$$\n\\begin{array}{|c|c|c|}\n\\hline\n x & x^2 & x^3 \\\\\n\\hline\n 1 & 1 & 1 \\\\\n 2 & 4 & 8 \\\\\n\\hline\n\\end{array}\n$$" },
  { id: "section", icon: "file", label: "Section de leçon", hint: "titre et paragraphe", block: "## Titre de la section\n\nVotre texte ici." },
];

// Same mapping as the studio editor — the API stores answers per type.
function quizFromApi(q) {
  const type = TYPE_FROM_API[q.type] || "qcm";
  const expl = q.explanationMd || "";
  if (type === "vf") return { type, q: q.promptMd || "", opts: ["Vrai", "Faux"], correct: q.answer === false ? 1 : 0, expl };
  if (type === "court") {
    const accepted = Array.isArray(q.answer) ? q.answer : q.answer != null ? [String(q.answer)] : [""];
    return { type, q: q.promptMd || "", opts: accepted.length ? accepted : [""], correct: 0, expl };
  }
  const opts = Array.isArray(q.options) && q.options.length ? q.options : ["Option A", "Option B"];
  return { type, q: q.promptMd || "", opts, correct: typeof q.answer === "number" && q.answer < opts.length ? q.answer : 0, expl };
}
function quizToApi(q) {
  const type = TYPE_TO_API[q.type] || "MCQ";
  const explanationMd = (q.expl || "").trim() || undefined;
  if (type === "TF") return { type, promptMd: q.q, answer: q.correct === 0, explanationMd };
  if (type === "SHORT") return { type, promptMd: q.q, answer: (q.opts[0] || "").split(",").map((s) => s.trim()).filter(Boolean), explanationMd };
  return { type, promptMd: q.q, options: q.opts, answer: q.correct, explanationMd };
}

// The network save waits for a pause in the typing; the device copy does not (see the
// two effects below). SAVE_MAX_MS caps how long steady typing can go unsent.
const SAVE_IDLE_MS = 5000;
const SAVE_MAX_MS = 30000;

/**
 * « il y a 2 h », « hier », « le 3 août ».
 *
 * Relative near the present and absolute once it stops being useful: "il y a 34 jours"
 * is a number a teacher has to do arithmetic on, where a date is one they recognise.
 */
function sinceLabel(ms) {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} jours`;
  return `le ${new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`;
}

const num = (key, fallback) => {
  if (typeof window === "undefined") return fallback;
  const v = Number(window.localStorage.getItem(key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

export default function RedigerClient() {
  const [lessonId, setLessonId] = useState(null);
  const [meta, setMeta] = useState(null);
  const [bookLessons, setBookLessons] = useState([]);
  const [classLevel, setClassLevel] = useState("");
  const [title, setTitle] = useState("");
  const [md, setMd] = useState("");
  const [quiz, setQuiz] = useState([]);
  const [sourceId, setSourceId] = useState("");
  const [status, setStatus] = useState("DRAFT");
  const [rail, setRail] = useState("copilot"); // copilot | problemes | quiz
  const [saveState, setSaveState] = useState("Enregistré");
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [saveFailed, setSaveFailed] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [start, setStart] = useState(null);
  const [localDraft, setLocalDraft] = useState(null);

  // Panels. Both fold away on a tablet: 768px of height spent on context is height not
  // spent on the lesson.
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [railOpen, setRailOpen] = useState(true);
  const [outlineW, setOutlineW] = useState(240);
  const [railW, setRailW] = useState(340);
  const [narrow, setNarrow] = useState(false);

  // Portal hosts for the toolbar and status bar owned by LessonWriter.
  const [toolHost, setToolHost] = useState(null);
  const [statusHost, setStatusHost] = useState(null);

  const writer = useRef(null);
  // Whether the caret is sitting on a formula. It has to be STATE, not a read of
  // writer.current during render: the editor's selection changes re-render
  // LessonWriter, not this component, so a ref read here would stay stale and the
  // « Modifier la formule » item would never enable. LessonWriter calls onReady on
  // every one of its renders, which makes this the one place the parent can observe
  // the selection without reaching into the editor mid-render.
  const [mathSelected, setMathSelected] = useState(false);
  const [inTable, setInTable] = useState(false);
  const onWriterReady = useCallback((api) => {
    writer.current = api;
    // Ignore the null the effect's cleanup passes, or every render would flicker.
    if (api) { setMathSelected(Boolean(api.ed?.mathSel)); setInTable(Boolean(api.ed?.inTable?.())); }
  }, []);
  const docRef = useRef(null);

  useEffect(() => {
    setOutlineW(num("mwalimu.rediger.outlineW", 240));
    // Migrate the atelier's stored width once, so a teacher who sized the rail there
    // finds it the same here.
    setRailW(num("mwalimu.rediger.railW", num("mwalimu.latex.railW", 340)));
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1100px)");
    const apply = () => {
      setNarrow(mq.matches);
      if (mq.matches) { setOutlineOpen(false); setRailOpen(false); }
      else { setOutlineOpen(true); setRailOpen(true); }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // ---- load ----

  /** Every subject the teacher may write in and every lesson they own, newest first.
   *
   *  NOT /api/studio/tree/ — that is scoped to one class, and with no ?class= a teacher
   *  gets classes[0]. Building this screen from it showed the books of a single class and
   *  hid the lessons written for all the others. /library is unscoped by design. */
  const loadStart = useCallback(async () => {
    const d = await fetch("/api/studio/library/", { credentials: "same-origin", cache: "no-store" })
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null);
    setStart({ subjects: d?.subjects || [], drafts: d?.drafts || [] });
  }, []);

  /**
   * Re-fetch whenever this page comes back into view.
   *
   * Editing a lesson and pressing Back restores this page from the browser's cache with
   * the React state it had on the way out — so a lesson you just renamed or published
   * still showed its old title and its old badge, which read as the app not saving.
   * `pageshow`/`persisted` is the bfcache restore; `visibilitychange` covers coming
   * back to a tab that was left open on this screen.
   */
  useEffect(() => {
    if (!start) return undefined;
    const refresh = () => { if (!document.hidden) loadStart(); };
    const onShow = (e) => { if (e.persisted) refresh(); };
    window.addEventListener("pageshow", onShow);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [start, loadStart]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) {
      loadStart();
      return;
    }
    setLessonId(id);
    (async () => {
      const r = await fetch(`/api/studio/lessons/${id}/`, { credentials: "same-origin", cache: "no-store" });
      if (!r.ok) {
        setLoadError(r.status === 404 ? "Leçon introuvable." : "Accès refusé.");
        return;
      }
      const d = await r.json();
      setMeta(d.lesson);
      setTitle(d.lesson.title || "");
      setMd(d.lesson.contentMd || "");
      setStatus(d.lesson.status || "DRAFT");
      setSourceId(d.lesson.companionOfId || "");
      setBookLessons(d.bookLessons || []);
      setQuiz((d.quiz?.questions || []).map(quizFromApi));
      const t = await fetch(`/api/studio/tree/?lesson=${id}`, { credentials: "same-origin", cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (t?.classLevel) setClassLevel(t.classLevel);

      requestPersistence();
      const draft = await loadDoc("lesson-draft", id);
      if (draft?.dirty && draft.contentMd !== (d.lesson.contentMd || "")) setLocalDraft(draft);
      else if (draft && !draft.dirty) deleteDoc("lesson-draft", id);
    })();
  }, []);

  // ---- save ----
  const save = useCallback(async ({ force = false } = {}) => {
    if (!lessonId || !meta?.canEdit) return;
    setSaveState("Enregistrement…");

    // Drain any pictures queued while the server was down, and take the rewritten
    // markdown if some went up. This runs BEFORE the text is sent but never blocks it:
    // flushPendingImages resolves whatever happens, so a still-unreachable server means
    // the words go up with their placeholders and the pictures wait for the next save.
    let body = md;
    const flushed = await flushPendingImages(lessonId, md).catch(() => null);
    if (flushed?.drained) {
      body = flushed.md;
      setMd(flushed.md);
      toast(flushed.drained > 1 ? `${flushed.drained} images envoyées ✓` : "Image envoyée ✓", { icon: "check" });
    }

    // The device copy is written before the request goes out, so a failure — or a tab
    // closed mid-request — still leaves the work recoverable.
    const local = await saveDoc({ kind: "lesson-draft", id: lessonId, title, contentMd: body }).catch(() => null);
    try {
      const r = await fetch(`/api/studio/lessons/${lessonId}/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ contentMd: body, title, force }),
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

  // Two clocks, because the two writes cost very different things.
  //
  // The device copy is free and it is the recovery guarantee, so it stays quick. The
  // network PUT is the expensive one, so it waits for a pause in the typing — but
  // never longer than SAVE_MAX_MS, or a teacher who types steadily for ten minutes
  // would have nothing on the server.
  const dirtySince = useRef(0);
  useEffect(() => {
    if (!dirty) { dirtySince.current = 0; return undefined; }
    if (!dirtySince.current) dirtySince.current = Date.now();
    const waited = Date.now() - dirtySince.current;
    const delay = Math.max(0, Math.min(SAVE_IDLE_MS, SAVE_MAX_MS - waited));
    const t = setTimeout(() => save(), delay);
    return () => clearTimeout(t);
  }, [dirty, md, title, save]);

  useEffect(() => {
    const localOnly = () => {
      if (!lessonId || !meta?.canEdit) return;
      saveDoc({ kind: "lesson-draft", id: lessonId, title, contentMd: md }).catch(() => {});
    };
    // Leaving the page is the one moment the delay above is not affordable. A forced
    // save also earns its own version — this IS the end of a writing session.
    const flush = () => { if (dirty) save({ force: true }); else localOnly(); };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
    };
  }, [dirty, save, lessonId, meta, md, title]);

  const touch = useCallback(() => {
    setSaveState("Modifications non enregistrées");
    setDirty(true);
  }, []);

  async function saveSource(id) {
    setSourceId(id);
    if (!lessonId) return;
    await fetch(`/api/studio/lessons/${lessonId}/companion/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ bookLessonId: id || null }),
    });
    toast(id ? "Leçon source enregistrée ✓" : "Leçon source retirée", { icon: "check" });
  }

  async function saveQuiz(next) {
    setQuiz(next);
    if (!lessonId) return;
    await fetch(`/api/studio/lessons/${lessonId}/quiz/`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ questions: next.map(quizToApi) }),
    });
  }

  async function togglePublish() {
    const next = status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    // Publishing is the moment the lesson reaches pupils, so it is the right place to
    // stop a broken formula or an unanswerable question — the audit has been sitting
    // there the whole time, but nothing made a teacher look at it. Unpublishing is
    // never blocked: withdrawing a bad lesson must always be possible.
    if (next === "PUBLISHED" && blocking.length) {
      setRail("problemes");
      setRailOpen(true);
      toast(`${blocking.length} problème${blocking.length > 1 ? "s" : ""} à corriger avant de publier`, { icon: "alert", color: "var(--danger)" });
      return;
    }
    const r = await fetch(`/api/studio/lessons/${lessonId}/status/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ status: next }),
    });
    if (!r.ok) return toast("Changement de statut impossible", { icon: "alert" });
    setStatus(next);
    toast(next === "PUBLISHED" ? "Leçon publiée ✓" : "Leçon repassée en brouillon", { icon: "check" });
  }

  // ---- derived ----
  const docAudit = useMemo(() => auditDocument(md), [md]);
  const quizProblems = useMemo(() => auditQuiz(quiz), [quiz]);
  const audit = useMemo(
    () => ({ ...docAudit, problems: [...docAudit.problems, ...quizProblems] }),
    [docAudit, quizProblems]
  );
  // Suspects are advisory (a formula that renders but reads oddly, a quiz with no
  // explanation). Only the genuine breakages block publication.
  const blocking = useMemo(() => audit.problems.filter((p) => !p.suspect), [audit]);
  const warnings = useMemo(() => (isBlankContent(md) ? [] : lintLesson(md)), [md]);
  const sourceTitle = bookLessons.find((b) => b.id === sourceId);
  const problemCount = audit.problems.length;
  const quizIssues = quizProblems.filter((p) => !p.suspect).length;

  // Suggestions drawn from the teacher's own manual rather than three hardcoded
  // examples, and re-aimed at whichever manual lesson is selected: chapters while
  // they are still orienting, that chapter's own lessons once they have picked one.
  // The panel rotates through the pool, so this is the whole ordered list, not a
  // window of three.
  const topicPool = useMemo(() => bookTopicPool(bookLessons, sourceId), [bookLessons, sourceId]);

  const applyContent = useCallback((raw, mode) => {
    // Undo any collapsed LaTeX before it lands in the document. The JSON actions are
    // already repaired server-side by studioCopilot's clean(), but the CHAT action
    // streams straight from the model — "\text{D}" written into a JSON string arrives
    // as a bare TAB, and the "→ Insérer dans la leçon" button put it in the lesson
    // untouched. Repairing at the one funnel every Copilot insertion passes through
    // covers chat, lesson_full, improve and exercise alike.
    const content = repairLatex(raw);
    // "append" means "put it where I am": a teacher who asked for an exercise
    // mid-lesson wants it at the caret, not pushed past the end of the page.
    if (mode === "append" && writer.current?.insertMarkdown?.(content)) {
      touch();
      toast("Contenu inséré ✓", { icon: "check" });
      return;
    }
    setMd((cur) => (mode === "append" && !isBlankContent(cur) ? `${cur}\n\n${content}` : content));
    touch();
    toast(mode === "append" ? "Contenu inséré ✓" : "Contenu remplacé ✓", { icon: "check" });
  }, [touch]);

  const [fixing, setFixing] = useState(null); // index of the problem being repaired

  // "Corriger avec Copilot" — the same `latex` action the formula editor uses, fed the
  // broken source and the checker's own complaint as the instruction. The result is
  // re-verified server-side before it comes back, so what lands in the document has
  // already rendered once.
  async function fixProblem(problem, index) {
    if (!problem.fixable || fixing != null) return;
    if (problem.kind === "quiz") return fixQuestion(problem, index);
    setFixing(index);
    try {
      const r = await fetch("/api/studio/ai/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "latex",
          subjectSlug: meta.subjectSlug,
          classLevel,
          tex: problem.source,
          instruction: `Corrige cette formule. Le vérificateur signale : ${problem.why}`,
        }),
      });
      if (!r.ok) {
        const code = r.status === 503 ? "Le modèle de l'école n'est pas joignable." : "Correction impossible.";
        return toast(code, { icon: "alert" });
      }
      const { tex } = await r.json();
      if (!tex || tex === problem.source) return toast("Copilot n'a rien trouvé à changer.", { icon: "info" });
      // Replace only the FIRST occurrence: two identical broken formulas are two
      // separate problems, and fixing both from one click would hide the second.
      const at = md.indexOf(problem.source);
      if (at === -1) return toast("La formule a changé entre-temps — relancez l'analyse.", { icon: "alert" });
      setMd(md.slice(0, at) + tex + md.slice(at + problem.source.length));
      touch();
      toast("Formule corrigée ✓", { icon: "check" });
    } catch {
      toast("Correction impossible", { icon: "alert" });
    } finally {
      setFixing(null);
    }
  }

  // Quiz repairs are PROPOSED, never applied straight in. "Deux propositions sont
  // identiques" needs a teacher to say which distractor was intended — a model picking
  // for them would quietly invent pedagogy. So the corrected question is shown next to
  // the problem and waits for Appliquer.
  const [quizFix, setQuizFix] = useState(null); // { index, at, question }
  // A lint warning asking Copilot to fix it. Sent to StudioComposePanel rather than
  // called directly, so the result lands in the panel's existing preview with
  // Remplacer / Ignorer — an "improve" rewrites the WHOLE lesson, and that is never
  // something to apply behind the teacher's back.
  const [fixRequest, setFixRequest] = useState(null);
  const [improving, setImproving] = useState(false);

  const askFix = useCallback((warning) => {
    setRail("copilot");
    setRailOpen(true);
    setImproving(true);
    setFixRequest({ instruction: `Corrige ce point précis, sans réécrire le reste : ${warning}`, nonce: Date.now() });
    // The panel owns the request from here; this only drives the button's own label.
    setTimeout(() => setImproving(false), 1500);
  }, []);

  async function fixQuestion(problem, index) {
    setFixing(index);
    setQuizFix(null);
    try {
      const r = await fetch("/api/studio/ai/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "quiz_fix",
          subjectSlug: meta.subjectSlug,
          classLevel,
          question: quiz[problem.question],
          problem: problem.why,
        }),
      });
      if (!r.ok) {
        return toast(r.status === 503 ? "Le modèle de l'école n'est pas joignable." : "Correction impossible.", { icon: "alert" });
      }
      const { questions } = await r.json();
      const fixed = (questions || []).map(quizFromApi)[0];
      if (!fixed) return toast("Copilot n'a rien proposé.", { icon: "info" });
      setQuizFix({ index, at: problem.question, question: fixed });
    } catch {
      toast("Correction impossible", { icon: "alert" });
    } finally {
      setFixing(null);
    }
  }

  function applyQuizFix() {
    if (!quizFix) return;
    saveQuiz(quiz.map((q, i) => (i === quizFix.at ? quizFix.question : q)));
    setQuizFix(null);
    toast("Question corrigée ✓", { icon: "check" });
  }

  async function createLesson(subjectSlug) {
    const r = await fetch("/api/studio/library/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ subjectSlug }),
    });
    if (!r.ok) return toast("Création impossible", { icon: "alert" });
    const { lesson } = await r.json();
    window.location.href = `/teacher/studio/rediger/?id=${lesson.id}`;
  }

  // Scroll the nth heading of the rendered document into view. The editor DOM has no
  // line numbers, but the nth h1/h2/h3 in the prose is exactly the nth heading in the
  // outline — see lessonOutline.ts.
  // Jump, don't glide: a smooth scroll here gets cancelled the moment the editor
  // takes focus back, which left the click doing nothing at all.
  const goToHeading = useCallback((index) => {
    const root = docRef.current;
    if (!root) return;
    const hs = root.querySelectorAll(".lw-prose h1, .lw-prose h2, .lw-prose h3");
    hs[index]?.scrollIntoView({ block: "center" });
  }, []);

  // ---- menus ----
  const ed = writer.current?.ed;
  const canEdit = Boolean(meta?.canEdit);
  const visual = ed?.mode === "visual";

  const menus = useMemo(() => {
    const off = !canEdit;
    const noVisual = off || !visual;
    return [
      {
        label: "Fichier",
        items: [
          { id: "save", icon: "save", label: "Enregistrer maintenant", keys: "Ctrl+S", disabled: off },
          { id: "publish", icon: "check", label: status === "PUBLISHED" ? "Repasser en brouillon" : "Publier la leçon", disabled: off },
          { type: "sep" },
          { id: "preview", icon: "eye", label: "Aperçu côté élève", disabled: !meta?.moduleId, hint: meta?.moduleId ? "" : "Reliez la leçon à un module d'abord" },
          { id: "print", icon: "print", label: "Imprimer / PDF", keys: "Ctrl+P" },
          { type: "sep" },
          { id: "settings", icon: "settings", label: "Paramètres du document…" },
          { id: "studio", icon: "grid", label: "Retour au studio de contenu" },
        ],
      },
      {
        label: "Édition",
        items: [
          { id: "undo", icon: "undo", label: "Annuler", keys: "Ctrl+Z", disabled: noVisual },
          { id: "redo", icon: "redo", label: "Rétablir", keys: "Ctrl+Y", disabled: noVisual },
          { type: "sep" },
          { id: "find", icon: "search", label: "Rechercher et remplacer…", keys: "Ctrl+F", disabled: noVisual },
        ],
      },
      {
        label: "Affichage",
        items: [
          { id: "toggle-outline", icon: "list", label: "Plan du document", checked: outlineOpen },
          { id: "toggle-rail", icon: "sparkles", label: "Copilot", checked: railOpen },
          { type: "sep" },
          { id: "mode-visual", icon: "eye", label: "Mode visuel", checked: visual, disabled: !ed?.gate?.ok, hint: ed?.gate?.ok ? "" : ed?.gate?.reason },
          { id: "mode-source", icon: "code", label: "Mode Markdown (source)", checked: ed?.mode === "source" },
          { id: "mode-split", icon: "columns", label: "Côte à côte", hint: "Source à gauche, rendu élève à droite", checked: ed?.mode === "split" },
        ],
      },
      {
        label: "Insertion",
        items: [
          { id: "image", icon: "image", label: "Image…", hint: "Photo ou schéma — réduite avant l'envoi", disabled: off },
          { id: "table", icon: "table", label: "Tableau 3 × 3", hint: "La barre d'outils propose toutes les tailles", disabled: noVisual },
          { id: "link", icon: "link", label: "Lien…", keys: "Ctrl+K", disabled: noVisual },
          { id: "rule", icon: "rule", label: "Trait horizontal", disabled: noVisual },
          { id: "codeblock", icon: "code", label: "Bloc de code", disabled: noVisual },
          { type: "sep" },
          ...EPURE_TEMPLATES.map((t) => ({ id: `epure:${t.id}`, icon: t.icon, label: t.label, hint: t.hint, disabled: noVisual })),
          { type: "sep" },
          ...FIGURE_KINDS.map((k) => ({ id: `figure:${k.kind}`, icon: k.icon, label: k.label, hint: k.hint, disabled: noVisual })),
          { id: "catalogue", icon: "grid", label: "Catalogue de figures…", hint: "76 figures prêtes à insérer", disabled: off },
          { type: "sep" },
          ...STARTERS.map((s) => ({ id: `starter:${s.id}`, icon: s.icon, label: s.label, hint: s.hint, disabled: off })),
        ],
      },
      // Formulas get their own menu rather than three lines buried under Insertion.
      // Maths is most of what these lessons are, and until now the formula editor was
      // reachable ONLY by clicking a formula already on the page — so there was no way
      // to discover it, and no way at all to edit one from the keyboard.
      {
        label: "Formule",
        items: [
          { id: "formula", icon: "func", label: "Formule dans le texte", keys: "Ctrl+M", disabled: noVisual },
          { id: "formula-block", icon: "func", label: "Formule centrée", keys: "Ctrl+Maj+M", disabled: noVisual },
          { type: "sep" },
          {
            id: "edit-formula",
            label: "Modifier la formule sélectionnée…",
            hint: mathSelected ? "" : "Placez le curseur sur une formule",
            disabled: noVisual || !mathSelected,
          },
          { id: "latex", icon: "func", label: "Éditeur LaTeX…", hint: "Plusieurs lignes, aperçu, Copilot", disabled: noVisual },
          { type: "sep" },
          { id: "symbols", icon: "grid", label: "Symboles et figures…", hint: "76 figures au catalogue", disabled: off },
        ],
      },
      ...(inTable
        ? [{
            label: "Tableau",
            items: [
              { id: "row-after", icon: "plus", label: "Insérer une ligne en dessous" },
              { id: "row-delete", icon: "x", label: "Supprimer la ligne" },
              { type: "sep" },
              { id: "col-after", icon: "plus", label: "Insérer une colonne à droite" },
              { id: "col-delete", icon: "x", label: "Supprimer la colonne" },
              { type: "sep" },
              { id: "table-delete", icon: "x", label: "Supprimer le tableau" },
            ],
          }]
        : []),
      {
        label: "Format",
        items: [
          { id: "bold", icon: "bold", label: "Gras", keys: "Ctrl+B", checked: ed?.active?.("bold"), disabled: noVisual },
          { id: "italic", icon: "italic", label: "Italique", keys: "Ctrl+I", checked: ed?.active?.("italic"), disabled: noVisual },
          { type: "sep" },
          { id: "p", icon: "file", label: "Texte normal", disabled: noVisual },
          { id: "h2", icon: "file", label: "Titre de section", disabled: noVisual },
          { id: "h3", icon: "file", label: "Sous-titre", disabled: noVisual },
          { type: "sep" },
          { id: "ul", icon: "list", label: "Liste à puces", checked: ed?.active?.("bulletList"), disabled: noVisual },
          { id: "ol", icon: "sort", label: "Liste numérotée", checked: ed?.active?.("orderedList"), disabled: noVisual },
          { id: "quote", icon: "message", label: "Citation", checked: ed?.active?.("blockquote"), disabled: noVisual },
        ],
      },
      {
        label: "Outils",
        items: [
          { id: "copilot", icon: "sparkles", label: "Copilot APS" },
          { id: "enseigner", icon: "message", label: "Copilot Enseigner", hint: "Comment enseigner cette leçon" },
          // The atelier stays part of the platform: it is the only surface with the
          // agent's visible verify-and-retry steps and a raw source pane beside a live
          // render, and a teacher deep in a derivation wants both.
          { id: "atelier", icon: "func", label: "Atelier LaTeX", hint: "Source et rendu côte à côte, mode agent" },
          { id: "problemes", icon: "alert", label: `Problèmes du document${problemCount ? ` (${problemCount})` : ""}` },
          { id: "quiz", icon: "check", label: `Quiz${quiz.length ? ` (${quiz.length})` : ""}` },
        ],
      },
    ];
  }, [canEdit, visual, mathSelected, inTable, ed, status, meta, outlineOpen, railOpen, problemCount, quiz.length]);

  const onCommand = useCallback(
    (id) => {
      const e = writer.current?.ed;
      const openRail = (tab) => { setRail(tab); setRailOpen(true); };
      if (id.startsWith("starter:")) {
        const s = STARTERS.find((x) => x.id === id.slice(8));
        if (s) applyContent(s.block, "append");
        return;
      }
      if (id.startsWith("figure:")) return void e?.insertFigure(id.slice(7));
      if (id.startsWith("epure:")) {
        const t = EPURE_TEMPLATES.find((x) => x.id === id.slice(6));
        return void (t && e?.insertEpure(t.spec));
      }
      switch (id) {
        case "save": return void save({ force: true });
        case "publish": return void togglePublish();
        case "preview": return void window.open(`/lesson/?id=${lessonId}`, "_blank", "noopener");
        case "print": return void window.print();
        case "settings": return void writer.current?.openSettings?.();
        case "studio": return void (window.location.href = "/teacher/studio/");
        case "find": return void writer.current?.openFind?.();
        case "undo": return void e?.chain()?.undo().run();
        case "redo": return void e?.chain()?.redo().run();
        case "toggle-outline": return void setOutlineOpen((o) => !o);
        case "toggle-rail": return void setRailOpen((o) => !o);
        case "mode-visual": return void (e?.gate?.ok && e.setMode("visual"));
        case "mode-source": return void e?.setMode("source");
        case "mode-split": return void e?.setMode("split");
        case "formula": return void e?.insertFormula(false);
        case "formula-block": return void e?.insertFormula(true);
        // The inline editor is already on screen whenever a formula is selected, so
        // this puts the caret in it. That is the point: it is how a teacher finds out
        // the panel exists and that it takes the keyboard.
        case "edit-formula": {
          const input = document.getElementById("fe-input");
          if (input) { input.focus(); input.select?.(); return; }
          return void e?.openLatex();
        }
        case "latex": return void e?.openLatex();
        case "symbols": case "catalogue": return void writer.current?.openPalette?.();
        case "image": return void writer.current?.chooseImage?.();
        case "table": return void e?.insertTable(3, 3);
        case "row-after": return void e?.tableCmd("rowAfter");
        case "row-delete": return void e?.tableCmd("rowDelete");
        case "col-after": return void e?.tableCmd("colAfter");
        case "col-delete": return void e?.tableCmd("colDelete");
        case "table-delete": return void e?.tableCmd("delete");
        case "link": return void e?.setLink();
        case "rule": return void e?.insertRule();
        case "codeblock": return void e?.insertCodeBlock();
        case "bold": return void e?.chain()?.toggleBold().run();
        case "italic": return void e?.chain()?.toggleItalic().run();
        case "p": case "h2": case "h3": return void e?.setBlock(id);
        case "ul": return void e?.chain()?.toggleBulletList().run();
        case "ol": return void e?.chain()?.toggleOrderedList().run();
        case "quote": return void e?.chain()?.toggleBlockquote().run();
        case "atelier": return void window.open(`/teacher/studio/latex/?id=${lessonId}`, "_blank", "noopener");
        case "copilot": return openRail("copilot");
        case "enseigner": return openRail("enseigner");
        case "problemes": return openRail("problemes");
        case "quiz": return openRail("quiz");
        default: return undefined;
      }
    },
    [applyContent, save, lessonId]
  );

  // Ctrl+S is muscle memory, and the browser's own Save-page dialog is never what a
  // teacher means by it here.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "s") { e.preventDefault(); save({ force: true }); }
      if (e.key === "k") { e.preventDefault(); writer.current?.ed?.setLink(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  // ---- start screen ----
  if (start) {
    return (
      // The theme host must be full-bleed: `teacher-page` paints --bg, and when it was
      // also the 1040px column the warm paper showed as a stripe down the middle of the
      // app's cool body. Host outside, measure inside.
      <div className="rd-startpage teacher-page">
        <div className="rd-start-band">
          <div className="rd-start-in">
            <header className="rd-start-hd">
              <div>
                <h1>Rédiger une leçon</h1>
                <p className="rd-start-sub">Écrivez, mettez en forme, insérez vos formules et vos figures, puis reliez la leçon au manuel.</p>
              </div>
              <a className="rd-start-back" href="/teacher/studio/"><Icon name="chevL" /> Studio de contenu</a>
            </header>

            <section className="rd-start-new">
              <h2>Commencer une nouvelle leçon</h2>
              {start.subjects.length === 0 ? (
                <p className="rd-start-none">Aucune matière ne vous est attribuée. Voyez avec la direction.</p>
              ) : (
                <div className="rd-start-row">
                  {start.subjects.map((s) => (
                    <button key={s.slug} className="rd-newcard" onClick={() => createLesson(s.slug)}>
                      <span className="rd-newcard-i"><Icon name="plus" /></span>
                      <span className="rd-newcard-t">{s.name}</span>
                      <span className="rd-newcard-h">Page blanche</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>

        <div className="rd-start-in rd-start-list">
          <div className="rd-start-h2">
            <h2>Reprendre une leçon</h2>
            {start.drafts.length > 0 && <span className="rd-start-count">{start.drafts.length}</span>}
          </div>
          {start.drafts.length === 0 ? (
            <p className="rd-start-none">Vous n'avez pas encore de leçon personnelle. Commencez-en une ci-dessus.</p>
          ) : (
            <ul className="rd-start-grid">
              {start.drafts.map((d) => (
                <li key={d.id}>
                  <a href={`/teacher/studio/rediger/?id=${d.id}`} className="rd-card">
                    <span className="rd-card-hd">
                      {/* Every lesson is created as « Nouvelle leçon », so repeating that
                          name tells a teacher with three of them nothing. */}
                      <span className={`rd-card-t${d.untitled ? " untitled" : ""}`}>
                        {d.untitled ? "Sans titre" : d.title}
                      </span>
                      <span className={`rd-card-st${d.status === "PUBLISHED" ? " pub" : ""}`}>
                        {d.status === "PUBLISHED" ? "Publiée" : "Brouillon"}
                      </span>
                    </span>
                    <span className="rd-card-x">
                      {d.blank ? <i>Page encore vide</i> : d.excerpt || <i>Sans texte</i>}
                    </span>
                    <span className="rd-card-ft">
                      <span>{d.subjectName}</span>
                      <span className="rd-card-dot">·</span>
                      <span>{d.blank ? "à écrire" : `${d.words} mot${d.words > 1 ? "s" : ""}`}</span>
                      {d.editedAt && <><span className="rd-card-dot">·</span><span>{sinceLabel(d.editedAt)}</span></>}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rd-empty teacher-page">
        <Icon name="alert" />
        <p>{loadError}</p>
        <a className="btn btn-secondary btn-sm" href="/teacher/studio/">Retour au studio</a>
      </div>
    );
  }
  if (!meta) return <div className="rd-empty teacher-page"><p>Chargement…</p></div>;

  // One definition of the rail's tabs, rendered both in the desktop rail and inside
  // the tablet drawer. It used to exist only in the rail — so on a tablet, where the
  // rail collapses, « Enseigner » was unreachable however the pane was opened.
  const railTabs = (
    <nav className="rd-railtabs">
      {[
        ["copilot", "Copilot", null],
        ["enseigner", "Enseigner", null],
        ["problemes", "Problèmes", problemCount || null],
        ["quiz", "Quiz", quizIssues || quiz.length || null],
      ].map(([k, label, badge]) => (
        <button key={k} className={`rd-railtab${rail === k ? " active" : ""}`} onClick={() => setRail(k)}>
          {label}
          {badge != null && <span className={`rd-badge${k === "problemes" ? " warn" : ""}`}>{badge}</span>}
        </button>
      ))}
    </nav>
  );

  const cols = [
    outlineOpen && !narrow ? `${outlineW}px` : null,
    "minmax(0,1fr)",
    railOpen && !narrow ? `${railW}px` : null,
  ].filter(Boolean).join(" ");

  return (
    <div className={`rd-page teacher-page${narrow ? " rd-narrow" : ""}`}>
      <header className="rd-titlebar">
        <a className="rd-appicon" href="/teacher/studio/" title="Retour au studio"><Icon name="grid" /></a>
        {/* Mirrors the Copilot toggle at the far right: each panel's switch sits on the
            side that panel opens from. Without this the outline's ✕ removed the panel
            AND every trace of it, leaving the menu bar as the only way back — a close
            button that erases its own way back is a control you have to be taught. */}
        <button
          className={`rd-railtoggle${outlineOpen ? " on" : ""}`}
          onClick={() => setOutlineOpen((o) => !o)}
          aria-expanded={outlineOpen}
          aria-label={outlineOpen ? "Masquer le plan du document" : "Afficher le plan du document"}
          title="Plan du document"
        >
          <Icon name="list" />
        </button>
        <input
          className="rd-title"
          value={title}
          onChange={(e) => { setTitle(e.target.value); touch(); }}
          disabled={!meta.canEdit}
          placeholder="Titre de la leçon"
          aria-label="Titre de la leçon"
        />
        <span className="badge badge-primary rd-chip">{meta.subjectName}</span>
        <span className={`badge rd-chip ${status === "PUBLISHED" ? "badge-success" : ""}`}>{status === "PUBLISHED" ? "Publiée" : "Brouillon"}</span>

        <span className="rd-gap" />

        <span className={`rd-server${saveFailed ? " bad" : ""}`} title={saveFailed ? "Le serveur de l'école n'a pas répondu" : "Vos leçons restent sur le serveur de votre école"}>
          <span className="dot" />
          {saveFailed ? "Serveur injoignable" : savedAt ? `Enregistré · ${savedAt}` : "Serveur de l'école"}
        </span>
        <a
          className="btn btn-secondary btn-sm"
          href={meta.moduleId ? `/lesson/?id=${lessonId}` : "#"}
          target="_blank"
          rel="noopener noreferrer"
          style={meta.moduleId ? undefined : { pointerEvents: "none", opacity: 0.5 }}
          title={meta.moduleId ? "Aperçu côté élève" : "Reliez la leçon à un module pour la prévisualiser"}
        >
          <Icon name="eye" /> Vue élève
        </a>
        <button className="btn btn-primary btn-sm" onClick={togglePublish} disabled={!meta.canEdit}>
          <Icon name="check" /> {status === "PUBLISHED" ? "Dépublier" : "Publier"}
        </button>
        <button
          className={`rd-railtoggle${railOpen ? " on" : ""}`}
          onClick={() => setRailOpen((o) => !o)}
          aria-expanded={railOpen}
          aria-label={railOpen ? "Masquer Copilot" : "Afficher Copilot"}
          title="Copilot"
        >
          <Icon name="sparkles" />
        </button>
      </header>

      <DocMenuBar menus={menus} onCommand={onCommand} />

      {localDraft && (
        <div className="rd-draft">
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
        <div className="rd-savefail">
          <Icon name="alert" />
          <span>Votre texte est toujours là et il est enregistré sur cet appareil, mais le serveur de l'école n'a pas répondu. Il repartira dès que la connexion revient.</span>
          <button className="btn btn-sm btn-secondary" onClick={() => save({ force: true })}>Réessayer</button>
        </div>
      )}

      <div className="rd-body" style={{ gridTemplateColumns: cols }}>
        <div className="rd-tool" ref={setToolHost} />

        {outlineOpen && !narrow && (
          <aside className="rd-outline">
            <div className="rd-pane-head">
              <span>Plan du document</span>
              <button onClick={() => setOutlineOpen(false)} title="Masquer le plan" aria-label="Masquer le plan"><Icon name="x" /></button>
            </div>
            <div className="rd-pane-body">
              {/* Above the outline, and outside the collapsible « Contexte » box: a
                  warning folded away is a warning nobody reads. */}
              {warnings.length > 0 && (
                <section className="rd-side rd-warn">
                  <p className="rd-side-l"><Icon name="alert" /> À relire</p>
                  <ul>
                    {warnings.map((w, i) => (
                      <li key={i}>
                        {w}
                        {meta.canEdit && (
                          <button className="rd-warn-fix" onClick={() => askFix(w)} disabled={improving}>
                            <Icon name={improving ? "refresh" : "sparkles"} />
                            {improving ? "Copilot…" : "Corriger avec Copilot"}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {audit.plan.length === 0 ? (
                <p className="rd-none">Aucun titre. Commencez une section avec « ## ».</p>
              ) : (
                <ol className="rd-plan">
                  {audit.plan.map((h) => (
                    <li key={`${h.line}-${h.index}`} className={`lv${h.level}`}>
                      <button onClick={() => goToHeading(h.index)}>{h.text}</button>
                    </li>
                  ))}
                </ol>
              )}

              <details className="rd-ctxbox" open>
                <summary>Contexte</summary>

                <section className="rd-side">
                  <p className="rd-side-l">Leçon du manuel</p>
                  <select value={sourceId} onChange={(e) => saveSource(e.target.value)} disabled={!meta.canEdit}>
                    <option value="">— Aucune (leçon indépendante) —</option>
                    {bookLessons.map((b) => (
                      <option key={b.id} value={b.id}>{b.moduleTitle ? `${b.moduleTitle} · ` : ""}{b.title}</option>
                    ))}
                  </select>
                  {sourceTitle ? (
                    <span className="rd-pill on"><Icon name="sparkles" /> transmise à Copilot</span>
                  ) : (
                    <span className="rd-hint">Choisissez-la : Copilot saura alors de quoi parle votre leçon.</span>
                  )}
                </section>

                <section className="rd-side">
                  <p className="rd-side-l">Copilot APS</p>
                  <ul className="rd-ctx">
                    <li><span>Matière</span><b>{meta.subjectName}</b></li>
                    <li><span>Niveau</span><b>{classLevel || "—"}</b></li>
                    <li><span>Sujet</span><b>{sourceTitle ? sourceTitle.title : "libre"}</b></li>
                  </ul>
                </section>

              </details>
            </div>
            <ResizeGrip
              value={outlineW}
              min={180}
              max={380}
              side="right"
              label="Largeur du plan"
              onChange={setOutlineW}
              onCommit={(v) => window.localStorage.setItem("mwalimu.rediger.outlineW", String(v))}
            />
          </aside>
        )}

        <main className="rd-doc" ref={docRef}>
          <LessonWriter
            value={md}
            onChange={(v) => { if (v === md) return; setMd(v); touch(); }}
            disabled={!meta.canEdit}
            saveState={saveState}
            lessonId={lessonId}
            onReady={onWriterReady}
            subjectSlug={meta.subjectSlug}
            classLevel={classLevel}
            toolbarHost={toolHost}
            statusHost={statusHost}
          />
        </main>

        {railOpen && !narrow && (
          <aside className="rd-rail">
            <ResizeGrip
              value={railW}
              min={280}
              max={560}
              side="left"
              label="Largeur du panneau Copilot"
              onChange={setRailW}
              onCommit={(v) => window.localStorage.setItem("mwalimu.rediger.railW", String(v))}
            />
            {railTabs}

            <div className="rd-pane-body">
              {rail === "copilot" && (
                <StudioComposePanel
                  subjectSlug={meta.subjectSlug}
                  moduleId={meta.moduleId}
                  classLevel={classLevel}
                  sourceLessonId={sourceId || null}
                  allowContent={meta.canEdit}
                  contentReady={!isBlankContent(md) && md.trim().length > 40}
                  getContent={() => md}
                  onApplyContent={applyContent}
                  onApplyTitle={(t) => { if (t) { setTitle(t); touch(); } }}
                  onApplyQuiz={(qs, mode) => { const mapped = qs.map(quizFromApi); saveQuiz(mode === "replace" ? mapped : [...quiz, ...mapped]); setRail("quiz"); }}
                  onInsertText={(t) => applyContent(t, "append")}
                  suggestions={topicPool.topics}
                  suggestionsGrain={topicPool.grain}
                  fixRequest={fixRequest}
                  // The atelier's agent, in the rail: Copilot works on the formula the
                  // caret is sitting on, and puts its answer back over that one.
                  getSelectedTex={() => writer.current?.ed?.getSelectedTex?.() ?? ""}
                  onApplyFormula={(tex) => { writer.current?.ed?.applyFormula?.(tex); touch(); }}
                />
              )}

              {/* The teaching coach. Same rail, different question: Copilot APS writes
                  the lesson, Enseigner talks about how to teach it — and only writes
                  when the conversation has become a brief worth writing from. */}
              {rail === "enseigner" && <TeachPanel lessonId={lessonId} onApplyContent={applyContent} />}

              {rail === "problemes" && (
                <div className="rd-problems">
                  {audit.problems.length === 0 ? (
                    <p className="rd-none">Rien à signaler : {audit.stats.formulas} formule{audit.stats.formulas > 1 ? "s" : ""}, {audit.stats.figures} figure{audit.stats.figures > 1 ? "s" : ""} et {quiz.length} question{quiz.length > 1 ? "s" : ""} — la leçon peut être publiée.</p>
                  ) : (
                    audit.problems.map((p, i) => (
                      <div className={`rd-problem${p.suspect ? " suspect" : ""}`} key={i}>
                        <span className="rd-problem-n">
                          <Icon name={p.kind === "figure" ? "chart" : p.kind === "quiz" ? "check" : "func"} />
                          {p.kind === "quiz" ? `question ${p.question + 1}` : `ligne ${p.line}`}
                          {!p.suspect && <span className="rd-problem-block">bloque la publication</span>}
                        </span>
                        <p className="rd-problem-why">{p.why}</p>
                        <code className="rd-problem-src">{p.source.slice(0, 160)}</code>
                        <div className="rd-problem-act">
                          {p.fixable && meta.canEdit && (
                            <button className="btn btn-secondary btn-sm" onClick={() => fixProblem(p, i)} disabled={fixing != null}>
                              <Icon name={fixing === i ? "refresh" : "sparkles"} />
                              {fixing === i ? "Correction…" : "Corriger avec Copilot"}
                            </button>
                          )}
                          {p.kind === "quiz" && (
                            <button className="btn btn-secondary btn-sm" onClick={() => setRail("quiz")}>
                              <Icon name="arrowR" /> Ouvrir la question
                            </button>
                          )}
                        </div>
                        {quizFix?.index === i && (
                          <div className="rd-fix">
                            <p className="rd-fix-l">Proposition de Copilot — relisez avant d'appliquer</p>
                            <p className="rd-fix-q">{quizFix.question.q || "(énoncé vide)"}</p>
                            <ul className="rd-fix-o">
                              {quizFix.question.opts.map((o, k) => (
                                <li key={k} className={k === quizFix.question.correct ? "ok" : ""}>{o}</li>
                              ))}
                            </ul>
                            {quizFix.question.expl && <p className="rd-fix-e">{quizFix.question.expl}</p>}
                            <div className="rd-problem-act">
                              <button className="btn btn-primary btn-sm" onClick={applyQuizFix}><Icon name="check" /> Appliquer</button>
                              <button className="btn btn-secondary btn-sm" onClick={() => setQuizFix(null)}>Ignorer</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  <dl className="rd-stats">
                    <div><dt>Mots</dt><dd>{audit.stats.words}</dd></div>
                    <div><dt>Formules</dt><dd>{audit.stats.formulas}</dd></div>
                    <div><dt>Figures</dt><dd>{audit.stats.figures}</dd></div>
                    <div><dt>Titres</dt><dd>{audit.stats.headings}</dd></div>
                  </dl>
                </div>
              )}

              {rail === "quiz" && (
                <div className="rd-quiz">
                  {quiz.length === 0 && (
                    <p className="rd-none">Pas encore de question. Ajoutez-en une vous-même, ou générez-en depuis l'onglet Copilot.</p>
                  )}
                  {quiz.map((q, i) => (
                    <div className="rd-q" key={i}>
                      <div className="rd-q-top">
                        <select value={q.type} onChange={(e) => saveQuiz(quiz.map((x, j) => j === i ? { ...x, type: e.target.value, opts: e.target.value === "vf" ? ["Vrai", "Faux"] : x.opts, correct: 0 } : x))}>
                          {Object.entries(TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <button className="rd-q-del" onClick={() => saveQuiz(quiz.filter((_, j) => j !== i))} title="Supprimer"><Icon name="x" /></button>
                      </div>
                      <QuizMathInput
                        value={q.q}
                        onChange={(v) => saveQuiz(quiz.map((x, j) => j === i ? { ...x, q: v } : x))}
                        placeholder="Question"
                        disabled={!meta.canEdit}
                        multiline
                      />
                      {q.type !== "court" && q.opts.map((o, oi) => (
                        <div className={`rd-q-opt${q.correct === oi ? " correct" : ""}`} key={oi}>
                          <input
                            type="radio"
                            name={`rd-q-${i}`}
                            checked={q.correct === oi}
                            aria-label={`Bonne réponse : option ${oi + 1}`}
                            disabled={!meta.canEdit}
                            onChange={() => saveQuiz(quiz.map((x, j) => j === i ? { ...x, correct: oi } : x))}
                          />
                          <QuizMathInput
                            value={o}
                            onChange={(v) => saveQuiz(quiz.map((x, j) => j === i ? { ...x, opts: x.opts.map((y, k) => k === oi ? v : y) } : x))}
                            placeholder={`Option ${oi + 1}`}
                            disabled={!meta.canEdit}
                            compact
                          />
                        </div>
                      ))}
                      {q.type === "court" && (
                        <QuizMathInput
                          value={q.opts[0] || ""}
                          onChange={(v) => saveQuiz(quiz.map((x, j) => j === i ? { ...x, opts: [v] } : x))}
                          placeholder="Réponses acceptées, séparées par des virgules"
                          disabled={!meta.canEdit}
                          compact
                        />
                      )}
                    </div>
                  ))}
                  <button
                    className="btn btn-secondary btn-sm rd-q-add"
                    onClick={() => saveQuiz([...quiz, { type: "qcm", q: "", opts: ["", ""], correct: 0, expl: "" }])}
                    disabled={!meta.canEdit}
                  >
                    <Icon name="plus" /> Ajouter une question
                  </button>
                  {quiz.length > 0 && <p className="rd-disclaim">Vérifiez chaque bonne réponse — Copilot se trompe régulièrement sur les calculs.</p>}
                </div>
              )}
            </div>
          </aside>
        )}

        <div className="rd-statusbar" ref={setStatusHost} />
      </div>

      {/* On a tablet the panels are drawers rather than columns — a 1024px screen has
          no room for three, and the document is what the teacher came for. */}
      {narrow && (outlineOpen || railOpen) && (
        <>
          <div className="drawer-overlay show" onClick={() => { setOutlineOpen(false); setRailOpen(false); }} />
          <aside className="drawer show rd-drawer">
            <div className="rd-pane-head">
              <span>{outlineOpen ? "Plan du document" : "Assistant"}</span>
              <button onClick={() => { setOutlineOpen(false); setRailOpen(false); }} aria-label="Fermer"><Icon name="x" /></button>
            </div>
            {!outlineOpen && railOpen && railTabs}
            <div className="rd-pane-body">
              {outlineOpen && (
                audit.plan.length === 0 ? <p className="rd-none">Aucun titre.</p> : (
                  <ol className="rd-plan">
                    {audit.plan.map((h) => (
                      <li key={`${h.line}-${h.index}`} className={`lv${h.level}`}>
                        <button onClick={() => { goToHeading(h.index); setOutlineOpen(false); }}>{h.text}</button>
                      </li>
                    ))}
                  </ol>
                )
              )}
              {/* The drawer used to hardcode the Copilot and ignore `rail`, which would
                  have made Enseigner desktop-only — on the one device teachers carry
                  into class. */}
              {railOpen && !outlineOpen && rail === "enseigner" && (
                <TeachPanel lessonId={lessonId} onApplyContent={applyContent} />
              )}
              {/* The drawer's tabs can now select Problèmes and Quiz too, so send the
                  teacher back to the desktop-shaped panes rather than silently showing
                  the Copilot under a tab that says something else. */}
              {railOpen && !outlineOpen && (rail === "problemes" || rail === "quiz") && (
                <p className="rd-none">
                  {rail === "problemes"
                    ? "Les problèmes du document s'affichent dans le panneau latéral, sur un écran plus large."
                    : "Le quiz s'édite dans le panneau latéral, sur un écran plus large."}
                </p>
              )}
              {railOpen && !outlineOpen && rail === "copilot" && (
                <StudioComposePanel
                  subjectSlug={meta.subjectSlug}
                  moduleId={meta.moduleId}
                  classLevel={classLevel}
                  sourceLessonId={sourceId || null}
                  allowContent={meta.canEdit}
                  contentReady={!isBlankContent(md) && md.trim().length > 40}
                  getContent={() => md}
                  onApplyContent={applyContent}
                  onApplyTitle={(t) => { if (t) { setTitle(t); touch(); } }}
                  onApplyQuiz={(qs, mode) => { const mapped = qs.map(quizFromApi); saveQuiz(mode === "replace" ? mapped : [...quiz, ...mapped]); }}
                  onInsertText={(t) => applyContent(t, "append")}
                  suggestions={topicPool.topics}
                  suggestionsGrain={topicPool.grain}
                  getSelectedTex={() => writer.current?.ed?.getSelectedTex?.() ?? ""}
                  onApplyFormula={(tex) => { writer.current?.ed?.applyFormula?.(tex); touch(); }}
                />
              )}
            </div>
          </aside>
        </>
      )}

      {narrow && (
        <nav className="rd-narrowbar">
          <button onClick={() => { setOutlineOpen(true); setRailOpen(false); }}><Icon name="list" /> Plan</button>
          <button onClick={() => { setRailOpen(true); setOutlineOpen(false); }}><Icon name="sparkles" /> Copilot</button>
        </nav>
      )}
    </div>
  );
}
