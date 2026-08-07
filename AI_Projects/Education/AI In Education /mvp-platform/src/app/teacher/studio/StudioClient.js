"use client";
import "./studio.css";
import { useState, useRef, useEffect, useCallback } from "react";
import Icon from "@/components/ui/Icon";
import Markdown from "@/components/Markdown";
import { BrandMark } from "@/components/ui/chrome";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { avatarColor, initials } from "@/lib/icons";
import { isBlankContent } from "@/lib/lessonSkeleton";
import { toast } from "@/lib/toast";
import { StudioComposePanel } from "@/components/StudioComposePanel";
import ModuleConnector from "@/components/ModuleConnector";
import QuizMathInput from "@/components/QuizMathInput";

const TYPES = { qcm: "Choix multiple", vf: "Vrai / faux", court: "Réponse courte" };

// Remembers the class the studio was last scoped to.
const STUDIO_CLASS_KEY = "studio.classId";

// Whether the "what this page is for" banner is expanded.
const STUDIO_INTENT_KEY = "studio.intentOpen";

// UI quiz type <-> API quiz type
const TYPE_TO_API = { qcm: "MCQ", vf: "TF", court: "SHORT" };
const TYPE_FROM_API = { MCQ: "qcm", TF: "vf", SHORT: "court" };

// Map an API quiz question into the editor's local shape.
function quizFromApi(q) {
  const type = TYPE_FROM_API[q.type] || "qcm";
  const expl = q.explanationMd || "";
  if (type === "vf") {
    return { type, q: q.promptMd || "", opts: ["Vrai", "Faux"], correct: q.answer === false ? 1 : 0, expl };
  }
  if (type === "court") {
    const accepted = Array.isArray(q.answer) ? q.answer : q.answer != null ? [String(q.answer)] : [""];
    return { type, q: q.promptMd || "", opts: accepted.length ? accepted : [""], correct: 0, expl };
  }
  // qcm
  const opts = Array.isArray(q.options) && q.options.length ? q.options : ["Option A", "Option B"];
  const correct = typeof q.answer === "number" && q.answer >= 0 && q.answer < opts.length ? q.answer : 0;
  return { type, q: q.promptMd || "", opts, correct, expl };
}

// Build an API question from the editor's local shape.
function quizToApi(q) {
  const type = TYPE_TO_API[q.type] || "MCQ";
  const explanationMd = (q.expl || "").trim() || undefined;
  if (type === "TF") {
    return { type, promptMd: q.q, answer: q.correct === 0, explanationMd };
  }
  if (type === "SHORT") {
    const accepted = (q.opts[0] || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return { type, promptMd: q.q, answer: accepted, explanationMd };
  }
  return { type, promptMd: q.q, options: q.opts, answer: q.correct, explanationMd };
}

function fmtDue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function fmtVersionMeta(v) {
  const d = new Date(v.createdAt);
  const when = Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return `${when}${when && v.editedBy ? " · " : ""}${v.editedBy || ""}`;
}

export default function StudioClient({ initialIsAdmin = false }) {
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("editor"); // "editor" | "connector"

  // ---- fetched data ----
  const [subjects, setSubjects] = useState([]); // [{ slug,name,icon,color, modules:[{id,title,order,open, lessons:[{id,title,status,order}]}] }]
  const [classes, setClasses] = useState([]); // [{ id, name, level }]

  // ---- class scope: the studio shows only the book(s) of the selected class ----
  const [selectedClassId, setSelectedClassId] = useState(null); // null = admin's "tous les manuels"
  const [classLevel, setClassLevel] = useState(null);

  // ---- current lesson ----
  const [currentId, setCurrentId] = useState(null);
  const [title, setTitle] = useState("");
  const [estMinutes, setEstMinutes] = useState(null);
  const [status, setStatus] = useState("draft"); // "draft" | "pub"
  const [subjectName, setSubjectName] = useState("");
  const [subjectSlug, setSubjectSlug] = useState("");
  // Which subject's tree is shown when the teacher has several books in the
  // same class (e.g. physique + chimie). null = follow the open lesson.
  const [activeSubject, setActiveSubject] = useState(null);
  const [moduleTitle, setModuleTitle] = useState("");
  const [currentModuleId, setCurrentModuleId] = useState(null);
  const [canEdit, setCanEdit] = useState(true); // content editing — ADMIN, or author of own lesson
  const [canQuizApi, setCanQuizApi] = useState(true); // quiz authoring right from the API
  const [isBook, setIsBook] = useState(false);
  const [isOwn, setIsOwn] = useState(false); // teacher's own authored lesson (complément)
  const [companionOfId, setCompanionOfId] = useState(null); // book lesson this lesson complements
  const [bookLessons, setBookLessons] = useState([]); // book lessons this lesson may complement
  const [copilotOpen, setCopilotOpen] = useState(false);
  // Collapsed unless the teacher opens it. Expanded it costs 184px of a 720px
  // screen, which pushed the editor itself below the fold — guidance must not
  // compete with the text being written.
  const [intentOpen, setIntentOpen] = useState(false);
  useEffect(() => {
    setIntentOpen(localStorage.getItem(STUDIO_INTENT_KEY) === "1");
  }, []);
  function toggleIntent() {
    setIntentOpen((o) => {
      localStorage.setItem(STUDIO_INTENT_KEY, o ? "0" : "1");
      return !o;
    });
  }
  const [md, setMd] = useState("");
  const [saveState, setSaveState] = useState("Enregistré");
  const [dirty, setDirty] = useState(false);

  const [tab, setTab] = useState("content");
  const [device, setDevice] = useState("desktop"); // desktop | mobile preview
  const [quiz, setQuiz] = useState([]);
  const [quizTitle, setQuizTitle] = useState("");
  const [versions, setVersions] = useState([]);
  const [assignments, setAssignments] = useState([]);

  // ---- assign drawer form ----
  const [assignClassId, setAssignClassId] = useState("");
  const [assignDue, setAssignDue] = useState("");

  const [vhOpen, setVhOpen] = useState(false);
  const [asOpen, setAsOpen] = useState(false);
  const mdRef = useRef(null);

  // Role gate: content authoring (create/connect/delete/restore) is ADMIN-only.
  const [isAdmin, setIsAdmin] = useState(initialIsAdmin);
  useEffect(() => {
    fetch("/api/auth/me/")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user?.role !== "ADMIN") return;
        setIsAdmin(true);
        const name = `${d.user.firstName || ""} ${d.user.lastName || ""}`.trim();
        setWho({ name: name || "Administration", role: "Administrateur · contenu" });
      })
      .catch(() => {});
  }, []);

  // Real teacher identity for the sidebar footer (no hard-coded name).
  const [who, setWho] = useState({ name: "", role: "Enseignant" });
  useEffect(() => {
    fetch("/api/teacher/badges/")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.teacher) return;
        const name = `${d.teacher.firstName || ""} ${d.teacher.lastName || ""}`.trim();
        setWho({ name, role: d.teacher.subjectLabel ? `Enseignante · ${d.teacher.subjectLabel}` : "Enseignante" });
      })
      .catch(() => {});
  }, []);
  const userName = who.name || "Grâce Mukendi";

  // Content editing is admin-only; quiz authoring stays open to teachers — the
  // API decides per lesson (canQuiz flag).
  const canQuiz = canEdit || canQuizApi;

  // Debounced autosave: persist content ~2.5s after the teacher stops typing.
  useEffect(() => {
    if (!dirty || !currentId || !canEdit) return;
    const t = setTimeout(() => { saveLesson(true); }, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [md, title, dirty, currentId, canEdit]);

  // ---- load a single lesson into the editor ----
  const loadLesson = useCallback(async (id, { announce } = {}) => {
    if (!id) return;
    try {
      const res = await fetch(`/api/studio/lessons/${id}/`, { credentials: "same-origin" });
      if (res.status === 403) {
        window.location.href = "/login/";
        return;
      }
      if (!res.ok) {
        toast("Impossible de charger la leçon", { icon: "x" });
        return;
      }
      const data = await res.json();
      const L = data.lesson;
      setCurrentId(L.id);
      setTitle(L.title || "");
      setEstMinutes(L.estMinutes ?? null);
      setStatus(L.status === "PUBLISHED" ? "pub" : "draft");
      setSubjectName(L.subjectName || "");
      setSubjectSlug(L.subjectSlug || "");
      setModuleTitle(L.moduleTitle || "");
      setCurrentModuleId(L.moduleId || null);
      setCanEdit(L.canEdit !== false);
      setCanQuizApi(L.canQuiz !== false);
      setIsBook(!!L.isBook);
      setIsOwn(!!L.isOwn);
      setCompanionOfId(L.companionOfId ?? null);
      setBookLessons(data.bookLessons || []);
      setMd(L.contentMd || "");
      setSaveState("Enregistré");
      setDirty(false);
      setQuiz((data.quiz?.questions || []).map(quizFromApi));
      setQuizTitle(data.quiz?.title || "");
      setVersions(data.versions || []);
      setAssignments(data.assignments || []);
      if (announce) toast(`« ${L.title} » ouverte`, { icon: "file" });
    } catch {
      toast("Impossible de charger la leçon", { icon: "x" });
    }
  }, []);

  // ---- load the tree for a class (null = admin's "tous les manuels") ----
  // `wantedLesson` is only passed on first load, so the server can resolve which
  // class a ?lesson=<id> deep link belongs to.
  const loadTree = useCallback(
    async (classId, wantedLesson) => {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (classId) qs.set("class", classId);
        if (wantedLesson) qs.set("lesson", wantedLesson);
        const res = await fetch(`/api/studio/tree/${qs.toString() ? `?${qs}` : ""}`, { credentials: "same-origin" });
        if (res.status === 403) {
          if (!classId) {
            window.location.href = "/login/";
            return;
          }
          // A remembered class we can no longer see (unassigned, archived) — drop
          // it and fall back to the server's default class.
          localStorage.removeItem(STUDIO_CLASS_KEY);
          await loadTree(null, null);
          return;
        }
        if (!res.ok) {
          toast("Impossible de charger cette classe", { icon: "x" });
          return;
        }
        const data = await res.json();

        const subj = (data.subjects || []).map((s) => ({
          ...s,
          modules: (s.modules || []).map((m) => ({ ...m, open: true })),
        }));
        setSubjects(subj);
        setClasses(data.classes || []);
        setSelectedClassId(data.selectedClassId ?? null);
        setClassLevel(data.classLevel ?? null);

        // Remember the class, and keep it in the URL so a reload/share stays scoped.
        if (data.selectedClassId) localStorage.setItem(STUDIO_CLASS_KEY, data.selectedClassId);
        else localStorage.removeItem(STUDIO_CLASS_KEY);
        const url = new URL(window.location.href);
        if (data.selectedClassId) url.searchParams.set("class", data.selectedClassId);
        else url.searchParams.delete("class");
        url.searchParams.delete("lesson");
        window.history.replaceState(null, "", url);

        // Pick a lesson inside the new scope: the deep-linked one, else the one
        // already open if it survived the switch, else the first available.
        const allLessons = subj.flatMap((s) => s.modules.flatMap((m) => m.lessons));
        if (wantedLesson && !allLessons.some((l) => l.id === wantedLesson)) {
          toast("Cette leçon n’est pas dans vos classes", { icon: "alert" });
        }
        const keep = wantedLesson || currentId;
        const pick = (keep && allLessons.find((l) => l.id === keep)) || allLessons[0] || null;
        if (pick) {
          if (pick.id !== currentId) await loadLesson(pick.id);
        } else {
          setCurrentId(null);
          setTitle(""); setMd(""); setQuiz([]); setCurrentModuleId(null); setSubjectName(""); setModuleTitle("");
        }
      } catch {
        // leave shell visible
      } finally {
        setLoading(false);
      }
    },
    [loadLesson, currentId]
  );

  // ---- initial load: resolve the class from ?class= → localStorage → server default ----
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wantedLesson = params.get("lesson") || null;
    // An explicit ?class= wins; otherwise a ?lesson= deep link must beat the
    // remembered class, or the server can't resolve which class the lesson is
    // in (a chimie link would stay stuck on a remembered physique class).
    const initialClass = params.get("class") || (wantedLesson ? "" : localStorage.getItem(STUDIO_CLASS_KEY)) || "";
    loadTree(initialClass || null, wantedLesson);

    const topic = params.get("topic");
    if (topic) toast(`Sujet : ${topic} — ajoute-le à une leçon`, { icon: "sparkles" });
    // Runs once on mount; loadTree is stable enough for this initial fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- tree interactions ----
  function toggleModule(si, mi) {
    setSubjects((prev) =>
      prev.map((s, i) =>
        i !== si
          ? s
          : { ...s, modules: s.modules.map((m, j) => (j === mi ? { ...m, open: !m.open } : m)) }
      )
    );
  }
  function selectLesson(id) {
    if (id === currentId) return;
    loadLesson(id, { announce: true });
  }

  // ---- status toggle ----
  async function changeStatus(s) {
    if (!currentId || !canEdit) return;
    const apiStatus = s === "pub" ? "PUBLISHED" : "DRAFT";
    try {
      const res = await fetch(`/api/studio/lessons/${currentId}/status/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ status: apiStatus }),
      });
      if (res.status === 403) {
        window.location.href = "/login/";
        return;
      }
      if (!res.ok) {
        toast("Impossible de mettre à jour le statut", { icon: "x" });
        return;
      }
      const data = await res.json();
      const next = data.status === "PUBLISHED" ? "pub" : "draft";
      setStatus(next);
      // reflect in tree (modules + library)
      setSubjects((prev) =>
        prev.map((sub) => ({
          ...sub,
          modules: sub.modules.map((m) => ({
            ...m,
            lessons: m.lessons.map((l) =>
              l.id === currentId ? { ...l, status: data.status } : l
            ),
          })),
          library: (sub.library || []).map((l) =>
            l.id === currentId ? { ...l, status: data.status } : l
          ),
        }))
      );
      toast(next === "pub" ? "Leçon publiée" : "Repassée en brouillon", {
        icon: next === "pub" ? "check" : "edit",
      });
    } catch {
      toast("Impossible de mettre à jour le statut", { icon: "x" });
    }
  }

  // ---- save lesson content ----
  async function saveLesson(silent = false) {
    if (!currentId || !canEdit) return;
    setSaveState("Enregistrement…");
    try {
      const res = await fetch(`/api/studio/lessons/${currentId}/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ contentMd: md, title, ...(estMinutes != null ? { estMinutes } : {}) }),
      });
      if (res.status === 403) {
        window.location.href = "/login/";
        return;
      }
      if (!res.ok) {
        setSaveState("Modifications non enregistrées");
        toast("Impossible d’enregistrer", { icon: "x" });
        return;
      }
      const data = await res.json();
      setSaveState("Enregistré");
      setDirty(false);
      // reflect possible title change in tree (modules + library)
      setSubjects((prev) =>
        prev.map((sub) => ({
          ...sub,
          modules: sub.modules.map((m) => ({
            ...m,
            lessons: m.lessons.map((l) => (l.id === currentId ? { ...l, title } : l)),
          })),
          library: (sub.library || []).map((l) => (l.id === currentId ? { ...l, title } : l)),
        }))
      );
      if (!silent) toast(`Enregistré · v${data.version}`, { icon: "save" });
      // refresh versions/assignments without disturbing the editor buffer
      refreshLessonMeta();
    } catch {
      setSaveState("Modifications non enregistrées");
      toast("Impossible d’enregistrer", { icon: "x" });
    }
  }

  // refresh versions + assignments (and quiz title) after a save/restore
  async function refreshLessonMeta() {
    if (!currentId) return;
    try {
      const res = await fetch(`/api/studio/lessons/${currentId}/`, { credentials: "same-origin" });
      if (!res.ok) return;
      const data = await res.json();
      setVersions(data.versions || []);
      setAssignments(data.assignments || []);
    } catch {
      /* ignore */
    }
  }

  // ---- markdown editor ----
  function onMdChange(e) {
    if (!canEdit) return;
    setMd(e.target.value);
    setSaveState("Modifications non enregistrées");
    setDirty(true);
  }
  function insertMd(kind) {
    if (!canEdit) return;
    const map = {
      bold: "**texte en gras**",
      italic: "*italique*",
      h: "\n## Titre\n",
      list: "\n- élément\n",
      formula: "\n$$ \\frac{x}{3} = 2 $$\n",
      img: "\n[Image : schéma]\n",
    };
    const ins = map[kind] || "";
    const el = mdRef.current;
    const s = el ? el.selectionStart : md.length;
    const e = el ? el.selectionEnd : md.length;
    const next = md.slice(0, s) + ins + md.slice(e);
    setMd(next);
    setSaveState("Modifications non enregistrées");
    setDirty(true);
    if (el) {
      requestAnimationFrame(() => {
        el.focus();
        const pos = s + ins.length;
        el.setSelectionRange(pos, pos);
      });
    }
  }

  // ---- Copilot APS: apply generated output into the editor ----
  function applyCopilotContent(content, mode) {
    // Appending onto an untouched skeleton left the placeholder prompts at the top of
    // every generated lesson — treat "still all placeholders" as empty.
    setMd((cur) => (mode === "append" && !isBlankContent(cur) ? `${cur}\n\n${content}` : content));
    setSaveState("Modifications non enregistrées");
    setDirty(true);
    toast(mode === "append" ? "Contenu inséré ✓" : "Contenu remplacé ✓", { icon: "check" });
  }
  function applyCopilotTitle(t) {
    if (!t) return;
    setTitle(t);
    setSaveState("Modifications non enregistrées");
    setDirty(true);
  }
  function applyCopilotQuiz(questions, mode) {
    const mapped = (questions || []).map(quizFromApi);
    if (!mapped.length) return;
    setQuiz((prev) => (mode === "replace" ? mapped : [...prev, ...mapped]));
    setTab("quiz");
    toast(mode === "replace" ? "Quiz remplacé — vérifiez les réponses" : `${mapped.length} question(s) ajoutée(s)`, { icon: "target" });
  }
  function insertCopilotText(text) {
    const el = mdRef.current;
    const s = el ? el.selectionStart : md.length;
    const e = el ? el.selectionEnd : md.length;
    const block = `\n\n${text}\n`;
    setMd(md.slice(0, s) + block + md.slice(e));
    setSaveState("Modifications non enregistrées");
    setDirty(true);
    toast("Texte inséré dans la leçon ✓", { icon: "check" });
  }

  // ---- quiz builder (editable on own lessons AND book lessons — see canQuiz) ----
  function setQuestionType(i, type) {
    if (!canQuiz) return;
    setQuiz((prev) =>
      prev.map((q, j) => {
        if (j !== i) return q;
        if (type === "vf") return { ...q, type, opts: ["True", "False"], correct: q.correct > 1 ? 0 : q.correct };
        if (type === "court") return { ...q, type, opts: [q.opts[0] || ""], correct: 0 };
        return { ...q, type, opts: q.opts.length ? q.opts : ["Option A", "Option B"] };
      })
    );
  }
  function setCorrect(i, oi) {
    if (!canQuiz) return;
    setQuiz((prev) => prev.map((q, j) => (j === i ? { ...q, correct: oi } : q)));
  }
  function delQuestion(i) {
    if (!canQuiz) return;
    setQuiz((prev) => prev.filter((_, j) => j !== i));
    toast("Question supprimée", { icon: "x" });
  }
  function setQuestionText(i, val) {
    if (!canQuiz) return;
    setQuiz((prev) => prev.map((q, j) => (j === i ? { ...q, q: val } : q)));
  }
  function setQuestionExpl(i, val) {
    if (!canQuiz) return;
    setQuiz((prev) => prev.map((q, j) => (j === i ? { ...q, expl: val } : q)));
  }
  function addOption(i) {
    if (!canQuiz) return;
    setQuiz((prev) =>
      prev.map((q, j) => (j === i ? { ...q, opts: [...q.opts, "Nouvelle option"] } : q))
    );
  }
  function setOptionText(i, oi, val) {
    if (!canQuiz) return;
    setQuiz((prev) =>
      prev.map((q, j) =>
        j === i ? { ...q, opts: q.opts.map((o, k) => (k === oi ? val : o)) } : q
      )
    );
  }
  function delOption(i, oi) {
    if (!canQuiz) return;
    setQuiz((prev) =>
      prev.map((q, j) => {
        if (j !== i) return q;
        const opts = q.opts.filter((_, k) => k !== oi);
        let correct = q.correct;
        if (correct >= opts.length) correct = 0;
        return { ...q, opts, correct };
      })
    );
  }
  function addQuestion() {
    if (!canQuiz) return;
    setQuiz((prev) => [
      ...prev,
      { type: "qcm", q: "Nouvelle question", opts: ["Option A", "Option B"], correct: 0 },
    ]);
  }
  async function saveQuiz() {
    if (!currentId || !canQuiz) return;
    try {
      const res = await fetch(`/api/studio/lessons/${currentId}/quiz/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          title: quizTitle || undefined,
          questions: quiz.map(quizToApi),
        }),
      });
      if (res.status === 403) {
        window.location.href = "/login/";
        return;
      }
      if (!res.ok) {
        toast("Impossible d’enregistrer le quiz", { icon: "x" });
        return;
      }
      toast("Quiz enregistré", { icon: "save" });
    } catch {
      toast("Impossible d’enregistrer le quiz", { icon: "x" });
    }
  }

  // ---- attach this complément to a book lesson (or detach) ----
  async function saveCompanion(bookLessonId) {
    if (!currentId || !isOwn) return;
    const next = bookLessonId || null;
    setCompanionOfId(next); // optimistic
    try {
      const res = await fetch(`/api/studio/lessons/${currentId}/companion/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ bookLessonId: next }),
      });
      if (!res.ok) { toast("Association impossible", { icon: "x" }); return; }
      toast(next ? "Complément associé à la leçon du manuel" : "Association retirée", { icon: "check" });
    } catch {
      toast("Association impossible", { icon: "x" });
    }
  }

  // ---- restore a version ----
  async function restoreVersion(version) {
    if (!currentId || !canEdit) return;
    try {
      const res = await fetch(`/api/studio/lessons/${currentId}/restore/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ version }),
      });
      if (res.status === 403) {
        window.location.href = "/login/";
        return;
      }
      if (!res.ok) {
        toast("Impossible de restaurer la version", { icon: "x" });
        return;
      }
      const data = await res.json();
      setMd(data.contentMd || "");
      setSaveState("Enregistré");
      setDirty(false);
      toast(`v${version} restaurée`, { icon: "history" });
      setVhOpen(false);
      refreshLessonMeta();
    } catch {
      toast("Impossible de restaurer la version", { icon: "x" });
    }
  }

  // ---- assign to a class ----
  async function saveAssignment() {
    if (!currentId) return;
    if (!assignClassId) {
      toast("Choisissez d’abord une classe", { icon: "info" });
      return;
    }
    try {
      const res = await fetch(`/api/studio/assignments/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ classId: assignClassId, lessonId: currentId, dueDate: assignDue }),
      });
      if (res.status === 403) {
        window.location.href = "/login/";
        return;
      }
      if (!res.ok) {
        toast("Impossible d’attribuer la leçon", { icon: "x" });
        return;
      }
      toast("Affectation enregistrée", { icon: "check" });
      setAssignClassId("");
      setAssignDue("");
      refreshLessonMeta();
    } catch {
      toast("Impossible d’attribuer la leçon", { icon: "x" });
    }
  }

  // ---- create a new draft lesson in a module ----
  async function addLesson(moduleId) {
    try {
      const res = await fetch("/api/studio/lessons/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ moduleId }),
      });
      if (res.status === 403) { window.location.href = "/login/"; return; }
      if (!res.ok) { toast("Impossible de créer la leçon", { icon: "x" }); return; }
      const { lesson } = await res.json();
      // insert into the tree under its module, then open it
      setSubjects((prev) =>
        prev.map((sub) => ({
          ...sub,
          modules: sub.modules.map((m) =>
            m.id === moduleId ? { ...m, lessons: [...m.lessons, { id: lesson.id, title: lesson.title, status: lesson.status, order: lesson.order }] } : m
          ),
        }))
      );
      toast("Nouvelle leçon créée", { icon: "plus" });
      loadLesson(lesson.id, { announce: false });
    } catch {
      toast("Impossible de créer la leçon", { icon: "x" });
    }
  }

  // ---- create a new unattached lesson in the teacher's library ----
  async function addLibraryLesson(slug) {
    try {
      const res = await fetch("/api/studio/library/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ subjectSlug: slug }),
      });
      if (res.status === 403) { window.location.href = "/login/"; return; }
      if (!res.ok) { toast("Impossible de créer la leçon", { icon: "x" }); return; }
      const { lesson } = await res.json();
      setSubjects((prev) =>
        prev.map((s) =>
          s.slug === slug
            ? { ...s, library: [...(s.library || []), { id: lesson.id, title: lesson.title, status: lesson.status, moduleId: null }] }
            : s
        )
      );
      toast("Leçon ajoutée à la bibliothèque", { icon: "plus" });
      loadLesson(lesson.id, { announce: false });
    } catch {
      toast("Impossible de créer la leçon", { icon: "x" });
    }
  }

  // Authored ("perso") lesson ids across subjects — to badge them in the tree.
  const authoredIds = new Set(subjects.flatMap((s) => (s.library || []).map((l) => l.id)));

  // ---- connector: relink a library lesson to a module at a position (or detach) ----
  async function connectLessonToModule(lessonId, moduleId, position = null) {
    try {
      const res = await fetch("/api/studio/connect/", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ lessonId, moduleId, position }),
      });
      if (res.status === 403) { window.location.href = "/login/"; return false; }
      if (!res.ok) { toast("Connexion impossible", { icon: "x" }); return false; }
      setSubjects((prev) =>
        prev.map((s) => {
          const meta = (s.library || []).find((l) => l.id === lessonId);
          if (!meta) return s; // lesson not in this subject
          const library = (s.library || []).map((l) => (l.id === lessonId ? { ...l, moduleId } : l));
          let modules = s.modules.map((m) => ({ ...m, lessons: m.lessons.filter((l) => l.id !== lessonId) }));
          if (moduleId) {
            modules = modules.map((m) => {
              if (m.id !== moduleId) return m;
              const arr = [...m.lessons];
              const pos = position == null ? arr.length : Math.max(0, Math.min(arr.length, position));
              arr.splice(pos, 0, { id: lessonId, title: meta.title, status: meta.status, order: pos, authorId: "self" });
              return { ...m, lessons: arr };
            });
          }
          return { ...s, library, modules };
        })
      );
      if (lessonId === currentId) {
        setCurrentModuleId(moduleId);
        setModuleTitle(moduleId ? (subjects.flatMap((s) => s.modules).find((m) => m.id === moduleId)?.title || "") : "Bibliothèque");
      }
      toast(moduleId ? "Leçon reliée au module ✓" : "Leçon détachée — de retour en bibliothèque", { icon: moduleId ? "check" : "edit" });
      return true;
    } catch {
      toast("Connexion impossible", { icon: "x" });
      return false;
    }
  }

  // ---- delete one of the teacher's own lessons ----
  async function deleteLessonById(lessonId) {
    if (!window.confirm("Supprimer définitivement cette leçon et son quiz ? Cette action est irréversible.")) return false;
    try {
      const res = await fetch(`/api/studio/lessons/${lessonId}/`, { method: "DELETE", credentials: "same-origin" });
      if (res.status === 403) { window.location.href = "/login/"; return false; }
      if (!res.ok) { toast("Suppression impossible", { icon: "x" }); return false; }
      setSubjects((prev) =>
        prev.map((s) => ({
          ...s,
          library: (s.library || []).filter((l) => l.id !== lessonId),
          modules: s.modules.map((m) => ({ ...m, lessons: m.lessons.filter((l) => l.id !== lessonId) })),
        }))
      );
      if (lessonId === currentId) {
        setCurrentId(null);
        setTitle(""); setMd(""); setQuiz([]); setCurrentModuleId(null); setSubjectName(""); setModuleTitle("");
      }
      toast("Leçon supprimée", { icon: "x" });
      return true;
    } catch {
      toast("Suppression impossible", { icon: "x" });
      return false;
    }
  }

  // ---- connector: publish a lesson by id ("Diffuser aux élèves") ----
  async function publishLessonById(lessonId) {
    try {
      const res = await fetch(`/api/studio/lessons/${lessonId}/status/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ status: "PUBLISHED" }),
      });
      if (res.status === 403) { window.location.href = "/login/"; return false; }
      if (!res.ok) { toast("Impossible de publier", { icon: "x" }); return false; }
      const data = await res.json();
      setSubjects((prev) =>
        prev.map((s) => ({
          ...s,
          modules: s.modules.map((m) => ({ ...m, lessons: m.lessons.map((l) => (l.id === lessonId ? { ...l, status: data.status } : l)) })),
          library: (s.library || []).map((l) => (l.id === lessonId ? { ...l, status: data.status } : l)),
        }))
      );
      if (lessonId === currentId) setStatus(data.status === "PUBLISHED" ? "pub" : "draft");
      toast("Leçon diffusée aux élèves ✓", { icon: "check" });
      return true;
    } catch {
      toast("Impossible de publier", { icon: "x" });
      return false;
    }
  }

  // Active subject: the tab the teacher picked, else the open lesson's subject,
  // else the first book. Falls back gracefully when the class scope changes.
  const multiSubject = subjects.length > 1;
  const activeSlug =
    [activeSubject, subjectSlug, subjects[0]?.slug].find((sl) => sl && subjects.some((s) => s.slug === sl)) || null;
  const activeSubjectName = subjects.find((s) => s.slug === activeSlug)?.name || subjectName;
  const connectorSubject = subjects.find((s) => s.slug === activeSlug) || subjects[0] || null;

  const quizCount = quiz.length;

  return (
    <div className="teacher-page">
      <div className={`t-app${collapsed ? " collapsed" : ""}`}>
        {/* The Studio is a shared tool: an admin keeps the admin nav, a teacher
            keeps the teacher nav — nobody is dropped into the other's shell. */}
        {isAdmin ? (
          <AdminSidebar active="studio" />
        ) : (
        <aside className="t-side">
          <div className="t-side-top">
            <BrandMark />
            <span className="nm">Mwalimu</span>
          </div>
          <nav className="t-nav">
            <span className="grouplabel">Enseignement</span>
            <a href="/teacher/">
              <Icon name="grid" />
              <span className="lbl">Tableau de bord</span>
            </a>
            <a href="/teacher/class/">
              <Icon name="users" />
              <span className="lbl">Mes classes</span>
            </a>
            <a href="/teacher/feedback/">
              <Icon name="message" />
              <span className="lbl">Retours</span>
            </a>
            <a href="/teacher/insights/">
              <Icon name="sparkles" />
              <span className="lbl">Analyses Copilot</span>
            </a>
            <a href="/teacher/studio/" className="active">
              <Icon name="edit" />
              <span className="lbl">Studio de contenu</span>
            </a>
            <a href="/teacher/studio/rediger/">
              <Icon name="file" />
              <span className="lbl">Rédiger une leçon</span>
            </a>
            <a href="/teacher/studio/latex/">
              <Icon name="func" />
              <span className="lbl">Atelier LaTeX</span>
            </a>
            {/* Keep in sync with NAV in components/ui/TeacherShell.js — this
                page predates the shell and renders its own sidebar. */}
            <a href="/teacher/exercises/">
              <Icon name="book" />
              <span className="lbl">Exercices</span>
            </a>
            <a href="/teacher/projects/">
              <Icon name="layers" />
              <span className="lbl">Projets</span>
            </a>
            <span className="grouplabel">Compte</span>
            <a href="/profile/">
              <Icon name="settings" />
              <span className="lbl">Paramètres</span>
            </a>
          </nav>
          <div className="t-side-foot">
            <div className="t-userbox">
              <div
                className="avatar avatar-sm"
                style={{ background: avatarColor(userName) }}
              >
                {initials(userName)}
              </div>
              <a className="meta" href="/profile/" style={{textDecoration:"none",color:"inherit"}}>
                <div className="un">{userName ? `Mme ${userName}` : "Mme Grâce Mukendi"}</div>
                <div className="ur">{who.role}</div>
              </a>
              <a className="lo" href="/api/auth/logout/" title="Se déconnecter">
                <Icon name="logout" />
              </a>
            </div>
          </div>
        </aside>
        )}

        <div className="t-main">
          <header className="t-top">
            <div className="t-top-left">
              <button
                className="t-burger"
                onClick={() => setCollapsed((c) => !c)}
                aria-label="Afficher/masquer la navigation"
              >
                <Icon name="grid" />
              </button>
              <div className="t-crumb">
                <span className="t-crumb-eyebrow">Studio de contenu</span>
                <b>{subjectName ? `${subjectName}${moduleTitle ? ` · ${moduleTitle}` : ""}` : "Leçons"}</b>
              </div>
              <label className="t-classpicker" title="Les manuels affichés sont ceux de cette classe">
                <Icon name="users" />
                <select
                  value={selectedClassId || ""}
                  onChange={(e) => loadTree(e.target.value || null, null)}
                  disabled={loading || (!isAdmin && classes.length === 0)}
                >
                  {isAdmin && <option value="">Tous les manuels</option>}
                  {classes.length === 0 && !isAdmin && <option value="">Aucune classe assignée</option>}
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <div className="t-viewseg">
                <button className={view === "editor" ? "active" : ""} onClick={() => setView("editor")}>
                  <Icon name="edit" /> Éditeur
                </button>
                <button className={view === "connector" ? "active" : ""} onClick={() => setView("connector")}>
                  <Icon name="layers" /> Connecteur
                </button>
              </div>
            </div>
            <div className="t-top-right">
              <span className="offline-pill">
                <span className="dot" /> Serveur local connecté
              </span>
              <button
                className="t-iconbtn"
                title="Historique des versions"
                onClick={() => setVhOpen(true)}
              >
                <Icon name="history" />
              </button>
              <button
                className="t-iconbtn"
                title="Attribuer"
                onClick={() => {
                  if (selectedClassId) setAssignClassId(selectedClassId);
                  setAsOpen(true);
                }}
              >
                <Icon name="calendar" />
              </button>
            </div>
          </header>

          {view === "connector" ? (
            <div className="studio-canvas">
              {connectorSubject ? (
                <ModuleConnector
                  subject={connectorSubject}
                  onConnect={connectLessonToModule}
                  onPublish={publishLessonById}
                  onOpenLesson={(id) => { setView("editor"); selectLesson(id); }}
                  onDelete={deleteLessonById}
                />
              ) : (
                <div className="mc-empty" style={{ padding: 40 }}>Aucune matière à connecter.</div>
              )}
            </div>
          ) : (
          <div className="studio">
            {/* course tree */}
            <div className="tree">
              <div className="tree-head">
                <div className="tt">
                  Arborescence du cours<small>{activeSubjectName || "Mathématiques"}</small>
                </div>
              </div>
              {multiSubject && (
                <div className="tree-tabs" role="tablist" aria-label="Matières de la classe">
                  {subjects.map((s) => (
                    <button
                      key={s.slug}
                      role="tab"
                      aria-selected={s.slug === activeSlug}
                      className={`tree-tab${s.slug === activeSlug ? " active" : ""}`}
                      title={s.name}
                      onClick={() => setActiveSubject(s.slug)}
                    >
                      <Icon name={s.icon} /> <span>{s.name}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="tree-scroll">
                {subjects.map((subj, si) => {
                  if (multiSubject && subj.slug !== activeSlug) return null;
                  const libUnattached = (subj.library || []).filter((l) => !l.moduleId);
                  return (
                    <div className="tree-subject" key={subj.slug}>
                      {/* Personal library — unattached lessons authored by the teacher */}
                      <div className="tree-lib">
                        <div className="tree-lib-head">
                          <span className="tll-title"><Icon name="book" /> Ma bibliothèque</span>
                          <button className="tll-add" onClick={() => addLibraryLesson(subj.slug)} title="Nouvelle leçon perso">
                            <Icon name="plus" />
                          </button>
                        </div>
                        {libUnattached.length === 0 ? (
                          <div className="tree-lib-empty">{isAdmin ? "Créez une leçon avec +, puis reliez-la à un module." : "Créez une leçon avec + pour rédiger votre propre complément, puis associez-le à une leçon du manuel."}</div>
                        ) : (
                          libUnattached.map((l) => (
                            <div
                              className={`tree-lesson${l.id === currentId ? " active" : ""}`}
                              key={l.id}
                              onClick={() => selectLesson(l.id)}
                            >
                              <span className="ldot" style={{ background: "var(--warning-fg)" }} />
                              <span className="nm">{l.title}</span>
                              <span className="st biblio">Biblio</span>
                              {(
                                <button className="tree-del" title="Supprimer la leçon" onClick={(e) => { e.stopPropagation(); deleteLessonById(l.id); }}>
                                  <Icon name="x" />
                                </button>
                              )}
                            </div>
                          ))
                        )}
                      </div>

                      {subj.modules.map((mod, mi) => (
                        <div className="tree-mod" key={mod.id}>
                          <div
                            className={`tree-modhead${mod.open ? "" : " collapsed"}`}
                            onClick={() => toggleModule(si, mi)}
                          >
                            <span className="drag">
                              <Icon name={subj.icon} />
                            </span>
                            <span className="chev">
                              <Icon name="chevD" />
                            </span>
                            {mod.title}
                            <span className="mc">{mod.lessons.length}</span>
                          </div>
                          <div
                            className="tree-lessons"
                            style={{
                              maxHeight: mod.open
                                ? `${mod.lessons.length * 40 + 44}px`
                                : "0px",
                            }}
                          >
                            {mod.lessons.map((l) => {
                              const pub = l.status === "PUBLISHED";
                              const mine = authoredIds.has(l.id);
                              const active = l.id === currentId;
                              return (
                                <div
                                  className={`tree-lesson${active ? " active" : ""}`}
                                  key={l.id}
                                  onClick={() => selectLesson(l.id)}
                                >
                                  <span
                                    className="ldot"
                                    style={{
                                      background: pub ? (mine ? "var(--danger-fg)" : "var(--success)") : "var(--slate-300)",
                                    }}
                                  />
                                  <span className="nm">{l.title}</span>
                                  {mine && <span className="st perso" title="Votre leçon">perso</span>}
                                  <span className={`st ${pub ? (mine ? "live" : "pub") : "draft"}`}>
                                    {pub ? "En ligne" : "Brouillon"}
                                  </span>
                                  {mine && isAdmin && (
                                    <button className="tree-del" title="Supprimer la leçon" onClick={(e) => { e.stopPropagation(); deleteLessonById(l.id); }}>
                                      <Icon name="x" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                            {isAdmin && (
                              <div
                                className="tree-add"
                                onClick={() => addLesson(mod.id)}
                              >
                                <Icon name="plus" /> Ajouter une leçon
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* editor */}
            <div className="editor">
              <div className="ed-toolbar">
                <span style={{ color: "var(--slate-300)", display: "flex" }}>
                  <Icon name="drag" />
                </span>
                <input
                  className="ed-title"
                  value={title}
                  readOnly={!canEdit}
                  onChange={(e) => {
                    if (!canEdit) return;
                    setTitle(e.target.value);
                    setSaveState("Modifications non enregistrées");
                    setDirty(true);
                  }}
                />
                <div className="ed-status">
                  <button
                    className={`draft${status === "draft" ? " active" : ""}`}
                    disabled={!canEdit}
                    onClick={() => changeStatus("draft")}
                  >
                    Brouillon
                  </button>
                  <button
                    className={`pub${status === "pub" ? " active" : ""}`}
                    disabled={!canEdit}
                    onClick={() => changeStatus("pub")}
                  >
                    Publié
                  </button>
                </div>
                <div className="ed-actions">
                  <span className="tiny muted">
                    {dirty ? "Modifications non enregistrées" : saveState}
                  </span>
                  <button
                    className={`btn btn-sm ${copilotOpen ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setCopilotOpen((o) => !o)}
                    disabled={!currentId || !canQuiz}
                    title={canEdit ? "Assistant de rédaction Copilot" : "Copilot — génération de quiz"}
                  >
                    <Icon name="sparkles" /> Copilot APS
                  </button>
                  {isOwn && (
                    <a className="btn btn-secondary btn-sm" href={`/teacher/studio/rediger/?id=${currentId}`} title="Rédiger sur une page dédiée, sans l'arborescence">
                      <Icon name="edit" /> Rédiger en grand
                    </a>
                  )}
                  <a
                    className="btn btn-secondary btn-sm"
                    href={currentId && currentModuleId ? `/lesson/?id=${currentId}` : "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={currentId && !currentModuleId ? "Reliez la leçon à un module pour la prévisualiser côté élève" : "Aperçu côté élève"}
                    style={currentId && currentModuleId ? undefined : { pointerEvents: "none", opacity: 0.5 }}
                  >
                    <Icon name="eye" /> Vue élève
                  </a>
                  <button className="btn btn-primary btn-sm" onClick={() => saveLesson()} disabled={!canEdit}>
                    <Icon name="save" /> Enregistrer
                  </button>
                </div>
              </div>

              {isOwn && (
                <div className={`ed-intent${intentOpen ? " open" : ""}`}>
                  <button className="ed-intent-h" onClick={() => toggleIntent()} aria-expanded={intentOpen}>
                    <Icon name="sparkles" />
                    <b>Votre espace de rédaction</b>
                    <span>— une leçon qui suit l’Approche Par les Situations (APS)</span>
                    <span className="ed-intent-caret" aria-hidden="true">▾</span>
                  </button>
                  {intentOpen && (
                    <div className="ed-intent-body">
                      <ol>
                        <li><b>Situation</b> — partez d’un cas réel de RDC, avec des chiffres. L’élève agit avant d’apprendre la règle.</li>
                        <li><b>Savoirs essentiels</b> — dégagez les notions que la situation met en jeu, pas à pas.</li>
                        <li><b>Compétence</b> — l’élève traite la situation et produit quelque chose de concret.</li>
                      </ol>
                      <p>
                        Le squelette dans l’éditeur suit cet ordre : remplacez chaque ligne d’exemple par votre texte.
                        <b> Copilot APS</b> peut rédiger un premier jet — il propose, vous décidez, vous corrigez.
                        Reliez enfin votre leçon à une leçon du manuel ci-dessus pour qu’elle apparaisse à vos élèves.
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="ed-tabs">
                <div
                  className={`ed-tab${tab === "content" ? " active" : ""}`}
                  onClick={() => setTab("content")}
                >
                  <Icon name="file" /> Contenu de la leçon
                </div>
                <div
                  className={`ed-tab${tab === "quiz" ? " active" : ""}`}
                  onClick={() => setTab("quiz")}
                >
                  <Icon name="target" /> Quiz{" "}
                  <span
                    className="badge"
                    style={{ padding: "1px 7px", fontSize: "10.5px" }}
                  >
                    {quizCount}
                  </span>
                </div>
              </div>

              {!canEdit && (
                <div className="ed-readonly">
                  <Icon name="lock" />
                  <span><b>Contenu géré par l’administration</b> — la leçon du manuel est en lecture seule. Votre espace : <b>créer le quiz</b> de cette leçon (onglet <b>Quiz</b>, formules LaTeX prises en charge), ou rédiger un <b>complément</b> depuis « Ma bibliothèque » et l’associer à cette leçon.</span>
                </div>
              )}

              {isOwn && (
                <div className="ed-companion">
                  <Icon name="layers" />
                  <label htmlFor="companion-select">Complète la leçon du manuel :</label>
                  <select
                    id="companion-select"
                    value={companionOfId || ""}
                    onChange={(e) => saveCompanion(e.target.value)}
                  >
                    <option value="">— Aucune (leçon indépendante) —</option>
                    {bookLessons.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.moduleTitle ? `${b.moduleTitle} · ` : ""}{b.title}
                      </option>
                    ))}
                  </select>
                  {companionOfId && <span className="ed-companion-on"><Icon name="check" /> Visible sous cette leçon pour vos classes</span>}
                </div>
              )}

              {copilotOpen && currentId && canQuiz && (
                <div className="ed-copilot">
                  <StudioComposePanel
                    subjectSlug={subjectSlug}
                    moduleId={currentModuleId}
                    classLevel={classLevel}
                    allowContent={canEdit}
                    contentReady={!isBlankContent(md) && md.trim().length > 40}
                    getContent={() => md}
                    onApplyContent={applyCopilotContent}
                    onApplyTitle={applyCopilotTitle}
                    onApplyQuiz={applyCopilotQuiz}
                    onInsertText={insertCopilotText}
                  />
                </div>
              )}

              {/* content tab — full editor when editable; read-only rendered page otherwise */}
              <div
                className={`ed-body${tab === "content" ? "" : " pane-hidden"}`}
                style={!canEdit ? { gridTemplateColumns: "1fr" } : undefined}
              >
                {canEdit && (
                  <div className="ed-pane">
                    <div className="md-toolbar">
                      <button className="md-btn" title="Gras" onClick={() => insertMd("bold")}>
                        <Icon name="bold" />
                      </button>
                      <button className="md-btn" title="Italique" onClick={() => insertMd("italic")}>
                        <Icon name="italic" />
                      </button>
                      <div className="md-sep" />
                      <button className="md-btn" title="Titre" onClick={() => insertMd("h")}>
                        <b style={{ fontSize: "14px" }}>H</b>
                      </button>
                      <button className="md-btn" title="Liste" onClick={() => insertMd("list")}>
                        <Icon name="list" />
                      </button>
                      <div className="md-sep" />
                      <button className="md-btn" title="Formule mathématique (LaTeX)" onClick={() => insertMd("formula")}>
                        <Icon name="func" />
                      </button>
                      <button className="md-btn" title="Image" onClick={() => insertMd("img")}>
                        <Icon name="book" />
                      </button>
                    </div>
                    <textarea
                      ref={mdRef}
                      className="md-input"
                      spellCheck="false"
                      value={md}
                      onChange={onMdChange}
                    />
                  </div>
                )}
                <div className="ed-pane preview-pane">
                  <div className="preview-head">
                    <span><Icon name="eye" /> {canEdit ? "Aperçu en direct · LaTeX" : "Leçon du manuel · lecture seule"}</span>
                    {canEdit && (
                      <div className="device-toggle">
                        <button
                          className={device === "desktop" ? "active" : ""}
                          title="Bureau"
                          onClick={() => setDevice("desktop")}
                        >
                          <Icon name="grid" />
                        </button>
                        <button
                          className={device === "mobile" ? "active" : ""}
                          title="Mobile"
                          onClick={() => setDevice("mobile")}
                        >
                          <Icon name="book" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className={`preview-scroll dev-${device}`}>
                    <div className="preview-doc">
                      <Markdown>{md}</Markdown>
                    </div>
                  </div>
                </div>
              </div>

              {/* quiz tab */}
              <div
                className={`ed-body${tab === "quiz" ? "" : " pane-hidden"}`}
                style={{ display: tab === "quiz" ? "block" : undefined, gridTemplateColumns: "1fr", overflowY: "auto" }}
              >
                <div className="quiz-build">
                  {quiz.map((q, i) => (
                    <div className="qb-item" key={i}>
                      <div className="qb-top">
                        <span className="qb-num">{i + 1}</span>
                        <div className="qb-type">
                          {Object.keys(TYPES).map((t) => (
                            <button
                              key={t}
                              className={q.type === t ? "active" : ""}
                              onClick={() => setQuestionType(i, t)}
                            >
                              {TYPES[t]}
                            </button>
                          ))}
                        </div>
                        <span className="grow" />
                        <button
                          className="qb-del"
                          title="Supprimer"
                          onClick={() => delQuestion(i)}
                        >
                          <Icon name="x" />
                        </button>
                      </div>
                      <div className="qb-qwrap">
                        <QuizMathInput
                          value={q.q}
                          onChange={(val) => setQuestionText(i, val)}
                          placeholder="Énoncé de la question — utilisez ƒx pour insérer une formule, ex. $\frac{x}{3}=2$"
                          disabled={!canQuiz}
                        />
                      </div>
                      <div className="qb-opts">
                        {q.opts.map((o, oi) => (
                          <div
                            className={`qb-opt${oi === q.correct ? " correct" : ""}`}
                            key={oi}
                          >
                            <span
                              className={`qb-radio${oi === q.correct ? " correct" : ""}`}
                              onClick={() => setCorrect(i, oi)}
                            />
                            <QuizMathInput
                              compact
                              value={o}
                              placeholder={
                                q.type === "court" ? "Réponses acceptées (séparées par des virgules)" : undefined
                              }
                              onChange={(val) => setOptionText(i, oi, val)}
                              disabled={!canQuiz}
                            />
                            {q.type === "qcm" && (
                              <button
                                className="qb-del"
                                onClick={() => delOption(i, oi)}
                              >
                                <Icon name="x" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {q.type === "qcm" && (
                        <span className="qb-addopt" onClick={() => addOption(i)}>
                          <Icon name="plus" /> Ajouter une option
                        </span>
                      )}
                      <div className="qb-expl">
                        <span className="qb-expl-l">Explication (montrée après la réponse)</span>
                        <QuizMathInput
                          compact
                          multiline
                          value={q.expl || ""}
                          onChange={(val) => setQuestionExpl(i, val)}
                          placeholder="Pourquoi cette réponse est correcte… (LaTeX pris en charge)"
                          disabled={!canQuiz}
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    className="btn btn-secondary btn-block"
                    style={{ borderStyle: "dashed" }}
                    onClick={addQuestion}
                    disabled={!canQuiz}
                  >
                    <Icon name="plus" /> Ajouter une question
                  </button>
                  <button
                    className="btn btn-primary btn-block"
                    style={{ marginTop: "10px" }}
                    onClick={saveQuiz}
                    disabled={!canQuiz}
                  >
                    <Icon name="save" /> Enregistrer le quiz
                  </button>
                </div>
              </div>
            </div>
          </div>
          )}
        </div>
      </div>

      {/* version history drawer */}
      <div
        className={`drawer-overlay${vhOpen ? " show" : ""}`}
        onClick={() => setVhOpen(false)}
      />
      <aside
        className={`drawer${vhOpen ? " show" : ""}`}
        style={{ width: "min(440px,94vw)" }}
      >
        <div className="drawer-head">
          <div className="dmeta">
            <h2 style={{ fontSize: "19px" }}>Historique des versions</h2>
            <div className="dsub">{title}</div>
          </div>
          <button className="t-iconbtn" onClick={() => setVhOpen(false)}>
            <Icon name="x" />
          </button>
        </div>
        <div className="drawer-body">
          <div className="vh-list">
            {versions.length === 0 && (
              <div className="tiny muted" style={{ padding: "14px 0" }}>
                Aucune version enregistrée pour le moment.
              </div>
            )}
            {versions.map((v) => (
              <div className="vh-row" key={v.version}>
                <span className="vh-dot">v{v.version}</span>
                <div className="vh-body">
                  <div className="vt">{v.preview || `Version ${v.version}`}</div>
                  <div className="vm">{fmtVersionMeta(v)}</div>
                  {canEdit && (
                    <span
                      className="vrestore"
                      onClick={() => restoreVersion(v.version)}
                    >
                      ↶ Restaurer cette version
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* assign drawer */}
      <div
        className={`drawer-overlay${asOpen ? " show" : ""}`}
        onClick={() => setAsOpen(false)}
      />
      <aside
        className={`drawer${asOpen ? " show" : ""}`}
        style={{ width: "min(460px,94vw)" }}
      >
        <div className="drawer-head">
          <div className="dmeta">
            <h2 style={{ fontSize: "19px" }}>Attribuer la leçon</h2>
            <div className="dsub">{title}</div>
          </div>
          <button className="t-iconbtn" onClick={() => setAsOpen(false)}>
            <Icon name="x" />
          </button>
        </div>
        <div className="drawer-body">
          <div className="card panel">
            <div className="panel-head">
              <h3>Classes assignées</h3>
            </div>
            <div>
              {assignments.length === 0 && (
                <div className="tiny muted" style={{ padding: "13px 0" }}>
                  Pas encore attribuée à une classe.
                </div>
              )}
              {assignments.map((a) => (
                <div className="assign-row" key={a.id}>
                  <button className="tg on" />
                  <div className="ai">
                    <div className="an">{a.className}</div>
                    <div className="ad">Assignée</div>
                  </div>
                  <span className="due">
                    <Icon name="calendar" /> {a.dueDate ? `Échéance ${fmtDue(a.dueDate)}` : "Aucune date d’échéance"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card panel">
            <div className="panel-head">
              <h3>Attribuer à une classe</h3>
            </div>
            <div className="assign-row" style={{ borderBottom: 0 }}>
              <div className="ai">
                <select
                  className="qb-q"
                  style={{ marginBottom: "10px" }}
                  value={assignClassId}
                  onChange={(e) => setAssignClassId(e.target.value)}
                >
                  <option value="">Sélectionner une classe…</option>
                  {/* Same-level classes only — a 5e lesson doesn't belong in a 6e class. */}
                  {classes
                    .filter((c) => !classLevel || c.level === classLevel)
                    .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  className="qb-q"
                  style={{ marginBottom: 0 }}
                  value={assignDue}
                  onChange={(e) => setAssignDue(e.target.value)}
                />
              </div>
            </div>
          </div>

          <button
            className="btn btn-primary btn-block btn-lg"
            onClick={saveAssignment}
          >
            <Icon name="check" /> Attribuer la leçon
          </button>
        </div>
      </aside>
    </div>
  );
}
