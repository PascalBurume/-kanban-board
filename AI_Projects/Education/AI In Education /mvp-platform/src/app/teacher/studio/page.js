"use client";
import "./studio.css";
import { useState, useRef, useEffect, useCallback } from "react";
import Icon from "@/components/ui/Icon";
import Markdown from "@/components/Markdown";
import { BrandMark } from "@/components/ui/chrome";
import { avatarColor, initials } from "@/lib/icons";
import { toast } from "@/lib/toast";

const TYPES = { qcm: "Choix multiple", vf: "Vrai / faux", court: "Réponse courte" };

// UI quiz type <-> API quiz type
const TYPE_TO_API = { qcm: "MCQ", vf: "TF", court: "SHORT" };
const TYPE_FROM_API = { MCQ: "qcm", TF: "vf", SHORT: "court" };

// Map an API quiz question into the editor's local shape.
function quizFromApi(q) {
  const type = TYPE_FROM_API[q.type] || "qcm";
  if (type === "vf") {
    return { type, q: q.promptMd || "", opts: ["Vrai", "Faux"], correct: q.answer === false ? 1 : 0 };
  }
  if (type === "court") {
    const accepted = Array.isArray(q.answer) ? q.answer : q.answer != null ? [String(q.answer)] : [""];
    return { type, q: q.promptMd || "", opts: accepted.length ? accepted : [""], correct: 0 };
  }
  // qcm
  const opts = Array.isArray(q.options) && q.options.length ? q.options : ["Option A", "Option B"];
  const correct = typeof q.answer === "number" && q.answer >= 0 && q.answer < opts.length ? q.answer : 0;
  return { type, q: q.promptMd || "", opts, correct };
}

// Build an API question from the editor's local shape.
function quizToApi(q) {
  const type = TYPE_TO_API[q.type] || "MCQ";
  if (type === "TF") {
    return { type, promptMd: q.q, answer: q.correct === 0 };
  }
  if (type === "SHORT") {
    const accepted = (q.opts[0] || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return { type, promptMd: q.q, answer: accepted };
  }
  return { type, promptMd: q.q, options: q.opts, answer: q.correct };
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

export default function StudioPage() {
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);

  // ---- fetched data ----
  const [subjects, setSubjects] = useState([]); // [{ slug,name,icon,color, modules:[{id,title,order,open, lessons:[{id,title,status,order}]}] }]
  const [classes, setClasses] = useState([]); // [{ id, name }]

  // ---- current lesson ----
  const [currentId, setCurrentId] = useState(null);
  const [title, setTitle] = useState("");
  const [estMinutes, setEstMinutes] = useState(null);
  const [status, setStatus] = useState("draft"); // "draft" | "pub"
  const [subjectName, setSubjectName] = useState("");
  const [moduleTitle, setModuleTitle] = useState("");
  const [md, setMd] = useState("");
  const [saveState, setSaveState] = useState("Enregistré");
  const [dirty, setDirty] = useState(false);

  const [tab, setTab] = useState("content");
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

  const userName = "Grâce Mukendi";

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
      setModuleTitle(L.moduleTitle || "");
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

  // ---- initial load: tree + first/queried lesson + optional topic toast ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/studio/tree/", { credentials: "same-origin" });
        if (res.status === 403) {
          window.location.href = "/login/";
          return;
        }
        if (!res.ok) {
          if (!cancelled) setLoading(false);
          return;
        }
        const data = await res.json();
        if (cancelled) return;

        const subj = (data.subjects || []).map((s) => ({
          ...s,
          modules: (s.modules || []).map((m) => ({ ...m, open: true })),
        }));
        setSubjects(subj);
        setClasses(data.classes || []);

        // pick lesson: ?lesson=<id> if valid, else first lesson found
        const params = new URLSearchParams(window.location.search);
        const wanted = params.get("lesson");
        const allLessons = subj.flatMap((s) => s.modules.flatMap((m) => m.lessons));
        const pick =
          (wanted && allLessons.find((l) => l.id === wanted)) || allLessons[0] || null;
        if (pick) await loadLesson(pick.id);

        const topic = params.get("topic");
        if (topic) toast(`Sujet : ${topic} — ajoute-le à une leçon`, { icon: "sparkles" });
      } catch {
        // leave shell visible
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadLesson]);

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
    if (!currentId) return;
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
      // reflect in tree
      setSubjects((prev) =>
        prev.map((sub) => ({
          ...sub,
          modules: sub.modules.map((m) => ({
            ...m,
            lessons: m.lessons.map((l) =>
              l.id === currentId ? { ...l, status: data.status } : l
            ),
          })),
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
  async function saveLesson() {
    if (!currentId) return;
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
      // reflect possible title change in tree
      setSubjects((prev) =>
        prev.map((sub) => ({
          ...sub,
          modules: sub.modules.map((m) => ({
            ...m,
            lessons: m.lessons.map((l) => (l.id === currentId ? { ...l, title } : l)),
          })),
        }))
      );
      toast(`Enregistré · v${data.version}`, { icon: "save" });
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
    setMd(e.target.value);
    setSaveState("Modifications non enregistrées");
    setDirty(true);
  }
  function insertMd(kind) {
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

  // ---- quiz builder ----
  function setQuestionType(i, type) {
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
    setQuiz((prev) => prev.map((q, j) => (j === i ? { ...q, correct: oi } : q)));
  }
  function delQuestion(i) {
    setQuiz((prev) => prev.filter((_, j) => j !== i));
    toast("Question supprimée", { icon: "x" });
  }
  function setQuestionText(i, val) {
    setQuiz((prev) => prev.map((q, j) => (j === i ? { ...q, q: val } : q)));
  }
  function addOption(i) {
    setQuiz((prev) =>
      prev.map((q, j) => (j === i ? { ...q, opts: [...q.opts, "Nouvelle option"] } : q))
    );
  }
  function setOptionText(i, oi, val) {
    setQuiz((prev) =>
      prev.map((q, j) =>
        j === i ? { ...q, opts: q.opts.map((o, k) => (k === oi ? val : o)) } : q
      )
    );
  }
  function delOption(i, oi) {
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
    setQuiz((prev) => [
      ...prev,
      { type: "qcm", q: "Nouvelle question", opts: ["Option A", "Option B"], correct: 0 },
    ]);
  }
  async function saveQuiz() {
    if (!currentId) return;
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

  // ---- restore a version ----
  async function restoreVersion(version) {
    if (!currentId) return;
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

  function navToast(label) {
    toast(label, { icon: "info" });
  }

  const quizCount = quiz.length;

  return (
    <div className="teacher-page">
      <div className={`t-app${collapsed ? " collapsed" : ""}`}>
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
            <a href="/teacher/insights/">
              <Icon name="sparkles" />
              <span className="lbl">Analyses Copilot</span>
              <span className="pill">14</span>
            </a>
            <a href="/teacher/studio/" className="active">
              <Icon name="edit" />
              <span className="lbl">Studio de contenu</span>
            </a>
            <span className="grouplabel">Compte</span>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                navToast("Paramètres — version démo");
              }}
            >
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
                <div className="un">Mme Grâce Mukendi</div>
                <div className="ur">Enseignante · Mathématiques</div>
              </a>
              <a className="lo" href="/api/auth/logout/" title="Se déconnecter">
                <Icon name="logout" />
              </a>
            </div>
          </div>
        </aside>

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
                Studio de contenu
                <b>{subjectName ? `${subjectName}${moduleTitle ? ` · ${moduleTitle}` : ""}` : "Leçons"}</b>
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
                onClick={() => setAsOpen(true)}
              >
                <Icon name="calendar" />
              </button>
            </div>
          </header>

          <div className="studio">
            {/* course tree */}
            <div className="tree">
              <div className="tree-head">
                <div className="tt">
                  Arborescence du cours<small>{subjectName || "Mathématiques"}</small>
                </div>
                <button
                  className="btn-icon btn btn-ghost"
                  title="Ajouter un module"
                  onClick={() => navToast("Nouveau module — version démo")}
                >
                  <Icon name="plus" />
                </button>
              </div>
              <div className="tree-scroll">
                {subjects.map((subj, si) =>
                  subj.modules.map((mod, mi) => (
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
                                  background: pub ? "var(--success)" : "var(--slate-300)",
                                }}
                              />
                              <span className="nm">{l.title}</span>
                              <span className={`st ${pub ? "pub" : "draft"}`}>
                                {pub ? "En ligne" : "Brouillon"}
                              </span>
                            </div>
                          );
                        })}
                        <div
                          className="tree-add"
                          onClick={() => navToast("Nouvelle leçon — version démo")}
                        >
                          <Icon name="plus" /> Ajouter une leçon
                        </div>
                      </div>
                    </div>
                  ))
                )}
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
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setSaveState("Modifications non enregistrées");
                    setDirty(true);
                  }}
                />
                <div className="ed-status">
                  <button
                    className={`draft${status === "draft" ? " active" : ""}`}
                    onClick={() => changeStatus("draft")}
                  >
                    Brouillon
                  </button>
                  <button
                    className={`pub${status === "pub" ? " active" : ""}`}
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
                    className="btn btn-secondary btn-sm"
                    onClick={() => navToast("Ouverture de la vue élève — version démo")}
                  >
                    <Icon name="eye" /> Vue élève
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={saveLesson}>
                    <Icon name="save" /> Enregistrer
                  </button>
                </div>
              </div>

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

              {/* content tab */}
              <div className={`ed-body${tab === "content" ? "" : " pane-hidden"}`}>
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
                    <button
                      className="md-btn"
                      title="Formule mathématique (LaTeX)"
                      onClick={() => insertMd("formula")}
                    >
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
                <div className="ed-pane preview-pane">
                  <div className="preview-head">
                    <Icon name="eye" /> Aperçu en direct · LaTeX
                  </div>
                  <div className="preview-doc">
                    <Markdown>{md}</Markdown>
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
                      <input
                        className="qb-q"
                        value={q.q}
                        onChange={(e) => setQuestionText(i, e.target.value)}
                      />
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
                            <input
                              value={o}
                              placeholder={
                                q.type === "court" ? "Réponses acceptées (séparées par des virgules)" : undefined
                              }
                              onChange={(e) => setOptionText(i, oi, e.target.value)}
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
                    </div>
                  ))}
                  <button
                    className="btn btn-secondary btn-block"
                    style={{ borderStyle: "dashed" }}
                    onClick={addQuestion}
                  >
                    <Icon name="plus" /> Ajouter une question
                  </button>
                  <button
                    className="btn btn-primary btn-block"
                    style={{ marginTop: "10px" }}
                    onClick={saveQuiz}
                  >
                    <Icon name="save" /> Enregistrer le quiz
                  </button>
                </div>
              </div>
            </div>
          </div>
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
                  <span
                    className="vrestore"
                    onClick={() => restoreVersion(v.version)}
                  >
                    ↶ Restaurer cette version
                  </span>
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
                  {classes.map((c) => (
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
