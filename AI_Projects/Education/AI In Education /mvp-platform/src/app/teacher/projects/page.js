"use client";
import { Fragment, useEffect, useState, useRef } from "react";
import "./projects.css";
import Icon from "@/components/ui/Icon";
import Markdown from "@/components/Markdown";
import TeacherShell from "@/components/ui/TeacherShell";
import { CopilotComposePanel, AssignCopilot } from "@/components/CopilotComposePanel";
import ProjectAssignCanvas from "@/components/ProjectAssignCanvas";
import { CanvasAgentPanel, GradingAgent } from "@/components/TeacherAgentPanel";
import { initials } from "@/lib/icons";
import { toast } from "@/lib/toast";

// Subject tile: letter + colour, reusing the design-system subject accents.
const SUBJECT_TILE = {
  math: { l: "M", cls: "subj-math" },
  svt: { l: "S", cls: "subj-svt" },
  physique: { l: "P", cls: "subj-physique" },
  chimie: { l: "C", cls: "subj-chimie" },
  sptic: { l: "I", cls: "subj-sptic" },
};
function tileFor(slug) {
  return SUBJECT_TILE[slug] || { l: (slug || "?")[0].toUpperCase(), cls: "subj-math" };
}

const SUB_STATUS = {
  SUBMITTED: { label: "À corriger", cls: "warn" },
  RETURNED: { label: "Renvoyé", cls: "danger" },
  GRADED: { label: "Noté", cls: "ok" },
  IN_PROGRESS: { label: "En cours", cls: "neutral" },
};

const DIFF = {
  INTRO: { label: "Intro", cls: "diff-intro" },
  INTERMEDIATE: { label: "Intermédiaire", cls: "diff-mid" },
  ADVANCED: { label: "Avancé", cls: "diff-adv" },
};

const FILTER_CHIPS = [
  { k: "", l: "Tous" },
  { k: "SUBMITTED", l: "À corriger" },
  { k: "RETURNED", l: "Renvoyés" },
  { k: "GRADED", l: "Notés" },
];

function relTime(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return "à l’instant";
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "hier" : `il y a ${d} j`;
}

// ───────────────────────── Review drawer ─────────────────────────
function ReviewDrawer({ id, onClose, onReviewed }) {
  const [d, setD] = useState(null);
  const [grade, setGrade] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [gradeHint, setGradeHint] = useState(null); // [min,max] from Copilot

  useEffect(() => {
    setD(null);
    fetch(`/api/teacher/projects/${id}/`)
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => {
        if (x) { setD(x); setGrade(x.grade ?? ""); setFeedback(x.feedbackMd ?? ""); }
      });
  }, [id]);

  async function review(action) {
    if (action === "grade" && grade === "") return;
    setBusy(true);
    try {
      const r = await fetch(`/api/teacher/projects/${id}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, grade: Number(grade), feedbackMd: feedback }),
      });
      if (r.ok) {
        toast(action === "grade" ? "Note enregistrée ✓" : "Renvoyé à l’élève pour révision", { icon: "check" });
        onReviewed();
        onClose();
      } else toast("Action impossible.", { icon: "alert" });
    } finally { setBusy(false); }
  }

  const st = d ? SUB_STATUS[d.status] || SUB_STATUS.SUBMITTED : null;

  return (
    <>
      <div className="rv-overlay show" onClick={onClose} />
      <aside className="rv-drawer show">
        <div className="rv-head">
          {d?.isGroup ? (
            <span className="rv-avstack">
              {(d.members || []).slice(0, 3).map((m, i) => (
                <span className="rv-av sm" key={i} style={m.avatarColor ? { background: m.avatarColor } : undefined}>
                  {initials(`${m.firstName} ${m.lastName}`)}
                </span>
              ))}
            </span>
          ) : (
            <span className="rv-av">{d ? initials(d.studentName) : "…"}</span>
          )}
          <div className="rv-meta">
            <div className="rv-name">{d ? d.studentName : "Chargement…"}</div>
            {d && (
              <div className="rv-sub">
                {d.isGroup && d.members ? `${d.members.map((m) => m.firstName).join(", ")} · ` : ""}
                {d.project.title} · {d.className}
              </div>
            )}
          </div>
          {d?.isGroup && <span className="pj-pill neutral">Groupe</span>}
          {st && <span className={`pj-pill ${st.cls}`}>{st.label}</span>}
          <button className="rv-x" onClick={onClose} aria-label="Fermer"><Icon name="x" /></button>
        </div>

        {d ? (
          <>
            <div className="rv-body">
              <div className="rv-context">
                <h4>Contexte du projet</h4>
                <Markdown>{d.project.scenarioMd}</Markdown>
              </div>
              {d.steps.map((s) => (
                <div className="rv-step" key={s.id}>
                  <div className="rv-step-h">
                    <span className="rv-step-n">{s.order}</span>
                    <span className="rv-step-t">{s.title}</span>
                    {s.done && <span className="pj-pill ok sm">terminée</span>}
                  </div>
                  <div className="rv-instr"><Markdown>{s.instructionMd}</Markdown></div>
                  <div className={`rv-ans ${s.response ? "" : "empty"}`}>{s.response || "— Pas de réponse —"}</div>
                </div>
              ))}
            </div>

            <div className="rv-foot">
              <GradingAgent
                submissionId={id}
                onInsertFeedback={(md) => setFeedback((f) => (f ? `${f}\n\n${md}` : md))}
                onSuggestGrade={(min, max) => setGradeHint([min, max])}
              />
              <div className="rv-grade">
                <label>Note</label>
                <input type="number" min="0" max="100" placeholder="0" value={grade} onChange={(e) => setGrade(e.target.value)} />
                <span className="rv-over">/ 100</span>
                {gradeHint && (
                  <button type="button" className="rv-grade-hint" title="Appliquer la note suggérée" onClick={() => setGrade(String(Math.round((gradeHint[0] + gradeHint[1]) / 2)))}>
                    Copilot : {gradeHint[0]}–{gradeHint[1]}
                  </button>
                )}
              </div>
              <textarea
                className="rv-feedback"
                placeholder="Votre retour à l’élève (markdown)…"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
              <div className="rv-actions">
                <button className="btn btn-secondary" disabled={busy} onClick={() => review("return")}>
                  Renvoyer pour révision
                </button>
                <button className="btn btn-primary" disabled={busy || grade === ""} onClick={() => review("grade")}>
                  <Icon name="check" /> Noter
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="rv-body"><p className="muted">Chargement…</p></div>
        )}
      </aside>
    </>
  );
}

// ───────────────────────── Assign tab ─────────────────────────
function AssignCard({ p, classes, onAssigned }) {
  const tile = tileFor(p.subjectSlug);
  const diff = DIFF[p.difficulty] || DIFF.INTERMEDIATE;
  const [classId, setClassId] = useState(classes[0]?.id || "");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [assigned, setAssigned] = useState(p.assigned || []);

  async function assign() {
    if (!classId) return;
    setBusy(true);
    try {
      const r = await fetch("/api/teacher/projects/assign/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: p.id, classId, dueDate: due || null }),
      });
      if (r.ok) {
        const cls = classes.find((c) => c.id === classId);
        if (cls && !assigned.includes(cls.name)) setAssigned((a) => [...a, cls.name]);
        toast("Projet assigné à la classe ✓", { icon: "check" });
        onAssigned && onAssigned();
      } else toast("Assignation impossible.", { icon: "alert" });
    } finally { setBusy(false); }
  }

  return (
    <div className="pj-assign-card">
      <div className="pj-assign-top">
        <span className={`pj-tile ${tile.cls}`}>{tile.l}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3>{p.title}</h3>
          <div className="pj-assign-meta">
            <span className={`pj-diff ${diff.cls}`}>{diff.label}</span>
            <span className="muted">{p.stepCount} étapes · {p.estMinutes} min · {p.classLevel}</span>
          </div>
        </div>
      </div>

      {p.prereqs.length > 0 && (
        <div className="pj-prereqs">
          <div className="pj-prereqs-l">Modules requis</div>
          <div className="pj-prereqs-list">
            {p.prereqs.map((pr) => (
              <span className="pj-prereq" key={pr}><Icon name="check" /> {pr}</span>
            ))}
          </div>
        </div>
      )}

      <div className="pj-assign-row">
        <select value={classId} onChange={(e) => setClassId(e.target.value)}>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        <button className="btn btn-primary btn-sm" disabled={busy || !classId} onClick={assign}>Assigner</button>
      </div>
      {classId && <AssignCopilot projectId={p.id} classId={classId} onApplyDate={setDue} />}
      <div className={`pj-assigned ${assigned.length ? "on" : ""}`}>
        {assigned.length ? `Assigné · ${assigned.join(", ")}` : "Pas encore assigné"}
      </div>
    </div>
  );
}

// Projects + classes the teacher may assign — shared by the two assign tabs.
/**
 * « Rendus à corriger » as a progress board rather than a flat list.
 *
 * The list told you a submission existed. It could not tell you WHERE the work stopped,
 * so "en cours" covered both "started this morning" and "stuck on step 2 for a
 * fortnight". One row per group, one column per step of the project, and the cell says
 * what happened there.
 *
 * Grouped by project because the columns ARE that project's steps — two projects with
 * different steps cannot share a grid. Ordered by what needs a teacher: handed in and
 * waiting first, then sent back, then everything already graded, which collapses onto a
 * single line since a finished group needs no cells.
 */
const BOARD_RANK = { SUBMITTED: 0, RETURNED: 1, IN_PROGRESS: 2, GRADED: 3 };

function ProgressBoard({ items, onOpen }) {
  // Preserve the API's ordering (newest first) within each project.
  const byProject = [];
  const seen = new Map();
  for (const it of items) {
    let bucket = seen.get(it.projectTitle);
    if (!bucket) {
      bucket = { title: it.projectTitle, subjectSlug: it.subjectSlug, steps: it.steps || [], rows: [] };
      seen.set(it.projectTitle, bucket);
      byProject.push(bucket);
    }
    // A project whose steps were edited after a submission: trust the longest list.
    if ((it.steps?.length || 0) > bucket.steps.length) bucket.steps = it.steps;
    bucket.rows.push(it);
  }
  for (const b of byProject) {
    b.rows.sort((a, z) => (BOARD_RANK[a.status] ?? 9) - (BOARD_RANK[z.status] ?? 9));
  }

  return (
    <div className="pb-wrap">
      {byProject.map((b) => {
        const tile = tileFor(b.subjectSlug);
        return (
          <section className="pb" key={b.title}>
            <header className="pb-h">
              <span className={`pj-tile sm ${tile.cls}`}>{tile.l}</span>
              <h3>{b.title}</h3>
              <span className="pb-h-count">{b.rows.length} rendu{b.rows.length > 1 ? "s" : ""}</span>
            </header>

            <div className="pb-scroll">
              <div className="pb-grid" style={{ "--steps": b.steps.length }}>
                <div className="pb-col-h">Groupe</div>
                {b.steps.map((s, i) => (
                  <div className="pb-col-h" key={s.id} title={s.title}>{i + 1} · {s.title}</div>
                ))}

                {b.rows.map((r) => {
                  const done = new Set(r.doneStepIds || []);
                  const graded = r.status === "GRADED";
                  const firstOpen = b.steps.findIndex((s) => !done.has(s.id));
                  return (
                    <Fragment key={r.id}>
                      <button className="pb-who" onClick={() => onOpen(r.id)} title="Ouvrir le rendu">
                        <span className="pb-who-n">{r.studentName}</span>
                        <span className="pb-who-m">
                          {r.className}
                          {r.submittedAt ? ` · ${relTime(r.submittedAt)}` : ""}
                        </span>
                      </button>

                      {/* A corrected group needs no cells — the verdict is the whole row. */}
                      {graded ? (
                        <button className="pb-cell done full" onClick={() => onOpen(r.id)}>
                          Les {b.steps.length} étapes faites · corrigé{r.grade != null ? `, ${r.grade}/100` : ""}
                        </button>
                      ) : (
                        b.steps.map((s, i) => {
                          const isDone = done.has(s.id);
                          // On a returned submission, exactly ONE step is the one to redo:
                          // the first unfinished. Marking every empty cell "à reprendre"
                          // would say the group must redo work it never started.
                          const isRedo = !isDone && r.status === "RETURNED" && i === firstOpen;
                          const cls = isDone ? "done" : isRedo ? "redo" : "todo";
                          const label = isDone ? "Fait" : isRedo ? "À reprendre" : "—";
                          return (
                            <button className={`pb-cell ${cls}`} key={s.id} onClick={() => onOpen(r.id)} title={s.title}>
                              {label}
                            </button>
                          );
                        })
                      )}
                    </Fragment>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })}
      <p className="pb-note">Les rendus qui demandent une action passent devant ; ceux qui sont corrigés se replient sur une seule ligne.</p>
    </div>
  );
}

function useAssignOptions() {
  const [opts, setOpts] = useState(null);
  useEffect(() => {
    fetch("/api/teacher/projects/assign/").then((r) => (r.ok ? r.json() : null)).then((x) => x && setOpts(x));
  }, []);
  return opts;
}

function AssignTab() {
  const opts = useAssignOptions();

  if (!opts) return <p className="pj-empty">Chargement…</p>;
  if (!opts.projects.length) return <p className="pj-empty">Aucun projet publié pour vos matières.</p>;

  return (
    <ProjectAssignCanvas
      classes={opts.classes}
      agentPanel={(ctx) => <CanvasAgentPanel {...ctx} />}
    />
  );
}

// Whole-class assignment: the same project handed to every student of a class,
// no groups involved.
function DirectAssignTab() {
  const opts = useAssignOptions();

  if (!opts) return <p className="pj-empty">Chargement…</p>;
  if (!opts.projects.length) return <p className="pj-empty">Aucun projet publié pour vos matières.</p>;

  return (
    <>
      <p className="pj-empty" style={{ textAlign: "left", padding: "0 0 14px" }}>
        Chaque élève de la classe reçoit le projet individuellement. Pour un travail en groupes, utilisez l’onglet « Assigner ».
      </p>
      <div className="pj-assign-grid">
        {opts.projects.map((p) => (
          <AssignCard key={p.id} p={p} classes={opts.classes} />
        ))}
      </div>
    </>
  );
}

// ───────────────────────── Manage: editor ─────────────────────────
const BLANK_STEP = { title: "", instructionMd: "", hintMd: "" };
const blankForm = (subjects) => ({
  title: "",
  subjectSlug: subjects[0]?.slug || "",
  classLevel: "5e",
  difficulty: "INTERMEDIATE",
  estMinutes: 120,
  scenarioMd: "",
  objectivesMd: "",
  deliverableMd: "",
  steps: [{ ...BLANK_STEP }],
  prereqModuleIds: [],
});

// Textarea + a small formatting toolbar, so a teacher who doesn't know markdown
// can apply bold / lists / headings without typing syntax. Edits go through the
// same onChange, so the live preview updates instantly.
function MarkdownField({ label, value, onChange, rows = 3, placeholder, span2 }) {
  const ref = useRef(null);
  const v = value ?? "";

  function wrap(token) {
    const el = ref.current; if (!el) return;
    const s = el.selectionStart, e = el.selectionEnd;
    const sel = v.slice(s, e) || "texte";
    const next = v.slice(0, s) + token + sel + token + v.slice(e);
    onChange(next);
    requestAnimationFrame(() => { el.focus(); el.selectionStart = s + token.length; el.selectionEnd = s + token.length + sel.length; });
  }
  function linePrefix(prefix) {
    const el = ref.current; if (!el) return;
    const s = el.selectionStart, e = el.selectionEnd;
    const lineStart = v.lastIndexOf("\n", s - 1) + 1;
    const nl = v.indexOf("\n", e);
    const lineEnd = nl === -1 ? v.length : nl;
    const block = v.slice(lineStart, lineEnd) || "texte";
    const newBlock = block.split("\n").map((ln) => (ln.trim() ? prefix + ln : ln)).join("\n");
    const next = v.slice(0, lineStart) + newBlock + v.slice(lineEnd);
    onChange(next);
    requestAnimationFrame(() => { el.focus(); el.selectionStart = lineStart; el.selectionEnd = lineStart + newBlock.length; });
  }

  return (
    <div className={`pj-f md-field ${span2 ? "span2" : ""}`}>
      <div className="md-field-top">
        {label && <span>{label}</span>}
        <div className="md-toolbar">
          <button type="button" title="Gras" onMouseDown={(e) => e.preventDefault()} onClick={() => wrap("**")}><b>G</b></button>
          <button type="button" title="Italique" onMouseDown={(e) => e.preventDefault()} onClick={() => wrap("*")}><i>I</i></button>
          <button type="button" title="Sous-titre" onMouseDown={(e) => e.preventDefault()} onClick={() => linePrefix("### ")}>H</button>
          <button type="button" title="Liste à puces" onMouseDown={(e) => e.preventDefault()} onClick={() => linePrefix("- ")}><Icon name="list" /></button>
        </div>
      </div>
      <textarea ref={ref} rows={rows} value={v} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function ProjectEditor({ subjects, projectId, onSaved, onCancel }) {
  const [form, setForm] = useState(projectId ? null : blankForm(subjects));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/teacher/projects/manage/${projectId}/`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) { toast("Projet introuvable", { icon: "alert" }); onCancel(); return; }
        setForm({
          title: d.title, subjectSlug: d.subjectSlug, classLevel: d.classLevel,
          difficulty: d.difficulty, estMinutes: d.estMinutes,
          scenarioMd: d.scenarioMd || "", objectivesMd: d.objectivesMd || "", deliverableMd: d.deliverableMd || "",
          steps: d.steps.length ? d.steps.map((s) => ({ id: s.id, title: s.title, instructionMd: s.instructionMd, hintMd: s.hintMd || "" })) : [{ ...BLANK_STEP }],
          prereqModuleIds: d.prereqModuleIds || [],
        });
      });
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!form) return <p className="pj-empty">Chargement…</p>;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const subject = subjects.find((s) => s.slug === form.subjectSlug);
  // null classLevel = book shared across levels → module matches any level
  const modulesForLevel = (subject?.modules || []).filter((m) => !m.classLevel || m.classLevel === form.classLevel);

  const setStep = (i, patch) => setForm((f) => ({ ...f, steps: f.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const addStep = () => setForm((f) => ({ ...f, steps: [...f.steps, { ...BLANK_STEP }] }));
  const delStep = (i) => setForm((f) => ({ ...f, steps: f.steps.filter((_, j) => j !== i) }));
  const moveStep = (i, dir) => setForm((f) => {
    const j = i + dir;
    if (j < 0 || j >= f.steps.length) return f;
    const steps = [...f.steps];
    [steps[i], steps[j]] = [steps[j], steps[i]];
    return { ...f, steps };
  });
  const togglePrereq = (id) => setForm((f) => ({
    ...f,
    prereqModuleIds: f.prereqModuleIds.includes(id) ? f.prereqModuleIds.filter((x) => x !== id) : [...f.prereqModuleIds, id],
  }));

  async function save() {
    if (!form.title.trim()) { toast("Donnez un titre au projet", { icon: "alert" }); return; }
    if (form.steps.some((s) => !s.title.trim())) { toast("Chaque étape a besoin d’un titre", { icon: "alert" }); return; }
    setBusy(true);
    try {
      const url = projectId ? `/api/teacher/projects/manage/${projectId}/` : "/api/teacher/projects/manage/";
      const method = projectId ? "PUT" : "POST";
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (r.ok) {
        toast(projectId ? "Projet enregistré ✓" : "Projet créé ✓", { icon: "check" });
        onSaved();
      } else {
        const e = await r.json().catch(() => ({}));
        toast(`Enregistrement impossible (${e.error || r.status})`, { icon: "alert" });
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="pj-editor">
      <div className="pj-editor-head">
        <button className="pj-back" onClick={onCancel}><Icon name="chevL" /> Retour</button>
        <h2>{projectId ? "Modifier le projet" : "Nouveau projet"}</h2>
        <div className="grow" />
        <button className="btn btn-secondary btn-sm" onClick={onCancel} disabled={busy}>Annuler</button>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}><Icon name="save" /> Enregistrer</button>
      </div>

      <CopilotComposePanel form={form} set={set} setStep={setStep} />

      <div className="pj-editor-split">
        <div className="pj-editor-form">
          <div className="pj-editor-grid">
            <label className="pj-f span2"><span>Titre du projet</span>
              <input value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ex. : Mini-enquête statistique…" />
            </label>
            <label className="pj-f"><span>Matière</span>
              <select value={form.subjectSlug} onChange={(e) => set({ subjectSlug: e.target.value, prereqModuleIds: [] })}>
                {subjects.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
              </select>
            </label>
            <label className="pj-f"><span>Niveau</span>
              <select value={form.classLevel} onChange={(e) => set({ classLevel: e.target.value, prereqModuleIds: [] })}>
                <option value="5e">5e</option>
                <option value="6e">6e</option>
              </select>
            </label>
            <label className="pj-f"><span>Difficulté</span>
              <select value={form.difficulty} onChange={(e) => set({ difficulty: e.target.value })}>
                <option value="INTRO">Intro</option>
                <option value="INTERMEDIATE">Intermédiaire</option>
                <option value="ADVANCED">Avancé</option>
              </select>
            </label>
            <label className="pj-f"><span>Durée estimée (min)</span>
              <input type="number" min="5" max="600" value={form.estMinutes} onChange={(e) => set({ estMinutes: e.target.value })} />
            </label>
          </div>

          <MarkdownField label="Scénario / contexte" rows={5} value={form.scenarioMd} onChange={(val) => set({ scenarioMd: val })} placeholder="Décrivez la situation réelle que l’élève va explorer…" />
          <div className="pj-editor-grid">
            <MarkdownField label="Objectifs" rows={4} value={form.objectivesMd} onChange={(val) => set({ objectivesMd: val })} placeholder="- Objectif 1&#10;- Objectif 2" />
            <MarkdownField label="Livrable attendu" rows={4} value={form.deliverableMd} onChange={(val) => set({ deliverableMd: val })} placeholder="Ce que l’élève doit rendre…" />
          </div>

          <div className="pj-steps-head">
            <h3>Étapes <span className="muted">({form.steps.length})</span></h3>
            <button className="btn btn-secondary btn-sm" onClick={addStep}><Icon name="plus" /> Ajouter une étape</button>
          </div>
          <div className="pj-steps">
            {form.steps.map((s, i) => (
              <div className="pj-step-card" key={i}>
                <div className="pj-step-card-h">
                  <span className="rv-step-n">{i + 1}</span>
                  <input className="pj-step-title" value={s.title} onChange={(e) => setStep(i, { title: e.target.value })} placeholder="Titre de l’étape" />
                  <div className="pj-step-tools">
                    <button onClick={() => moveStep(i, -1)} disabled={i === 0} title="Monter">↑</button>
                    <button onClick={() => moveStep(i, 1)} disabled={i === form.steps.length - 1} title="Descendre">↓</button>
                    <button onClick={() => delStep(i)} disabled={form.steps.length === 1} title="Supprimer"><Icon name="x" /></button>
                  </div>
                </div>
                <MarkdownField rows={2} value={s.instructionMd} onChange={(val) => setStep(i, { instructionMd: val })} placeholder="Consigne donnée à l’élève…" />
                <input value={s.hintMd} onChange={(e) => setStep(i, { hintMd: e.target.value })} placeholder="Indice (optionnel)…" />
              </div>
            ))}
          </div>

          <div className="pj-prereq-edit">
            <h3>Modules requis <span className="muted">(débloquent le projet)</span></h3>
            {modulesForLevel.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>Aucun module pour cette matière / ce niveau.</p>
            ) : (
              <div className="pj-prereq-grid">
                {modulesForLevel.map((m) => (
                  <label key={m.id} className={`pj-prereq-chk ${form.prereqModuleIds.includes(m.id) ? "on" : ""}`}>
                    <input type="checkbox" checked={form.prereqModuleIds.includes(m.id)} onChange={() => togglePrereq(m.id)} />
                    <span>{m.title}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="pj-ed-preview">
          <div className="pj-ed-preview-head"><Icon name="eye" /> Aperçu élève <span>· mis à jour en direct</span></div>
          <div className="pj-ed-preview-body">
            <ProjectPreview
              p={{
                title: form.title, subjectSlug: form.subjectSlug, subjectName: subject?.name,
                classLevel: form.classLevel, difficulty: form.difficulty, estMinutes: form.estMinutes,
                scenarioMd: form.scenarioMd, objectivesMd: form.objectivesMd, deliverableMd: form.deliverableMd,
                steps: form.steps, prereqModuleIds: form.prereqModuleIds,
              }}
              subjects={subjects}
              live
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

// ───────────────────────── Manage: read-only view ─────────────────────────
const LEVEL_LABEL = { "5e": "5e année", "6e": "6e année" };

// Renders a project-shaped object exactly as a student would see it. Shared by
// the read-only "Voir" view and the live preview inside the editor.
// `live` = author mode: keep empty sections visible with guidance placeholders
// and show every step (even blank) so the teacher sees the structure forming.
function ProjectPreview({ p, subjects, live = false }) {
  const subject = subjects.find((s) => s.slug === p.subjectSlug);
  const tile = tileFor(p.subjectSlug);
  const diff = DIFF[p.difficulty] || DIFF.INTERMEDIATE;
  const moduleById = new Map((subject?.modules || []).map((m) => [m.id, m.title]));
  const prereqTitles = (p.prereqModuleIds || []).map((id) => moduleById.get(id)).filter(Boolean);
  const has = (s) => !!(s && String(s).trim());
  const steps = live ? (p.steps || []) : (p.steps || []).filter((s) => has(s.title) || has(s.instructionMd));
  const showObj = has(p.objectivesMd) || live;
  const showDeliv = has(p.deliverableMd) || live;

  return (
    <div className="pj-view-body">
      <div className="pj-view-hero">
        <span className={`pj-tile ${tile.cls}`}>{tile.l}</span>
        <div className="pj-view-hero-main">
          <h1 className={`pj-view-title ${has(p.title) ? "" : "is-ph"}`}>{has(p.title) ? p.title : "Titre du projet…"}</h1>
          <div className="pj-view-chips">
            <span className="pj-chip">{p.subjectName || subject?.name || p.subjectSlug}</span>
            <span className="pj-chip">{LEVEL_LABEL[p.classLevel] || p.classLevel}</span>
            <span className={`pj-diff ${diff.cls}`}>{diff.label}</span>
            <span className="pj-chip"><Icon name="clock" /> {p.estMinutes || 0} min</span>
            <span className="pj-chip"><Icon name="list" /> {steps.length} étape{steps.length > 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>

      {(has(p.scenarioMd) || live) && (
        <section className="pj-view-sec">
          <h3>Scénario / contexte</h3>
          {has(p.scenarioMd)
            ? <div className="pj-view-md"><Markdown>{p.scenarioMd}</Markdown></div>
            : <div className="pj-view-ph">La situation réelle que l’élève va explorer apparaîtra ici.</div>}
        </section>
      )}

      {(showObj || showDeliv) && (
        <div className="pj-view-two">
          {showObj && (
            <section className="pj-view-sec">
              <h3>Objectifs</h3>
              {has(p.objectivesMd)
                ? <div className="pj-view-md"><Markdown>{p.objectivesMd}</Markdown></div>
                : <div className="pj-view-ph">Les compétences visées apparaîtront ici.</div>}
            </section>
          )}
          {showDeliv && (
            <section className="pj-view-sec">
              <h3>Livrable attendu</h3>
              {has(p.deliverableMd)
                ? <div className="pj-view-md"><Markdown>{p.deliverableMd}</Markdown></div>
                : <div className="pj-view-ph">Ce que l’élève doit rendre apparaîtra ici.</div>}
            </section>
          )}
        </div>
      )}

      <section className="pj-view-sec">
        <h3>Étapes <span className="muted">({steps.length})</span></h3>
        {steps.length === 0 ? (
          <div className="pj-view-ph">Les étapes du projet apparaîtront ici.</div>
        ) : (
          <div className="pj-view-steps">
            {steps.map((s, i) => (
              <div className="pj-view-step" key={s.id || i}>
                <span className="rv-step-n">{i + 1}</span>
                <div className="pj-view-step-main">
                  <div className={`pj-view-step-title ${has(s.title) ? "" : "is-ph"}`}>{has(s.title) ? s.title : "Titre de l’étape…"}</div>
                  {has(s.instructionMd)
                    ? <div className="pj-view-md"><Markdown>{s.instructionMd}</Markdown></div>
                    : (live && <div className="pj-view-ph sm">Consigne…</div>)}
                  {has(s.hintMd) && <div className="pj-view-hint"><Icon name="sparkles" /> <span><Markdown>{s.hintMd}</Markdown></span></div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {prereqTitles.length > 0 && (
        <section className="pj-view-sec">
          <h3>Modules requis <span className="muted">(débloquent le projet)</span></h3>
          <div className="pj-view-prereqs">
            {prereqTitles.map((t, i) => <span className="pj-chip" key={i}><Icon name="book" /> {t}</span>)}
          </div>
        </section>
      )}
    </div>
  );
}

function ProjectView({ subjects, projectId, onEdit, onClose }) {
  const [p, setP] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    fetch(`/api/teacher/projects/manage/${projectId}/`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d ? setP(d) : setMissing(true)));
  }, [projectId]);

  if (missing) return <p className="pj-empty">Projet introuvable.</p>;
  if (!p) return <p className="pj-empty">Chargement…</p>;

  const pub = p.status === "PUBLISHED";

  return (
    <div className="pj-view">
      <div className="pj-editor-head">
        <button className="pj-back" onClick={onClose}><Icon name="chevL" /> Retour</button>
        <h2>Aperçu du projet</h2>
        <div className="grow" />
        <span className={`pj-pill ${pub ? "ok" : "neutral"}`}>{pub ? "Publié" : "Brouillon"}</span>
        <button className="btn btn-primary btn-sm" onClick={onEdit}><Icon name="edit" /> Modifier</button>
      </div>
      <ProjectPreview p={p} subjects={subjects} />
    </div>
  );
}

// ───────────────────────── Manage: list ─────────────────────────
function ManageTab() {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null); // null | "new" | projectId
  const [viewing, setViewing] = useState(null); // null | projectId (read-only preview)

  const load = () => fetch("/api/teacher/projects/manage/").then((r) => (r.ok ? r.json() : null)).then((d) => d && setData(d));
  useEffect(() => { load(); }, []);

  async function toggleStatus(p) {
    const next = p.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    const r = await fetch(`/api/teacher/projects/manage/${p.id}/`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
    if (r.ok) { toast(next === "PUBLISHED" ? "Projet publié — visible par les élèves" : "Repassé en brouillon", { icon: next === "PUBLISHED" ? "check" : "edit" }); load(); }
    else toast("Action impossible.", { icon: "alert" });
  }

  async function del(p) {
    const r = await fetch(`/api/teacher/projects/manage/${p.id}/`, { method: "DELETE" });
    if (r.ok) { toast("Projet supprimé", { icon: "x" }); load(); }
    else if (r.status === 409) toast("Impossible : des élèves ont déjà rendu ce projet.", { icon: "alert" });
    else toast("Suppression impossible.", { icon: "alert" });
  }

  if (viewing) {
    return (
      <ProjectView
        subjects={data?.subjects || []}
        projectId={viewing}
        onClose={() => setViewing(null)}
        onEdit={() => { setEditing(viewing); setViewing(null); }}
      />
    );
  }

  if (editing) {
    return (
      <ProjectEditor
        subjects={data?.subjects || []}
        projectId={editing === "new" ? null : editing}
        onCancel={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    );
  }

  if (!data) return <p className="pj-empty">Chargement…</p>;

  return (
    <>
      <div className="pj-manage-top">
        <p className="muted" style={{ fontSize: 13.5 }}>Créez et modifiez les projets que vos élèves réaliseront. Un projet n’est visible qu’une fois <b>publié</b>.</p>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing("new")}><Icon name="plus" /> Nouveau projet</button>
      </div>
      {data.projects.length === 0 ? (
        <div className="pj-empty-card">
          <div className="pj-empty-emoji">📋</div>
          <div className="pj-empty-title">Aucun projet pour vos matières</div>
          <div className="muted">Créez votre premier projet appliqué avec « Nouveau projet ».</div>
        </div>
      ) : (
        <div className="pj-dossiers">
          {data.projects.map((p) => {
            const tile = tileFor(p.subjectSlug);
            const diff = DIFF[p.difficulty] || DIFF.INTERMEDIATE;
            const pub = p.status === "PUBLISHED";
            // The ring answers "is this project done with?" — corrected out of handed in.
            const total = p.submissionCount || 0;
            const pct = total ? Math.round((p.gradedCount / total) * 100) : 0;
            const R = 26, C = 2 * Math.PI * R;
            return (
              <article className="pj-dossier" key={p.id}>
                <div className="pj-d-ring" title={total ? `${p.gradedCount} rendu(s) corrigé(s) sur ${total}` : "Aucun rendu pour l’instant"}>
                  <svg viewBox="0 0 64 64" aria-hidden="true">
                    <circle cx="32" cy="32" r={R} className="pj-d-track" />
                    <circle cx="32" cy="32" r={R} className={`pj-d-fill${pct === 100 ? " full" : ""}`}
                      strokeDasharray={`${(C * pct) / 100} ${C}`} transform="rotate(-90 32 32)" />
                  </svg>
                  <span className="pj-d-ring-n">{total ? `${p.gradedCount}/${total}` : "—"}</span>
                  <span className="pj-d-ring-l">{total ? "corrigés" : "aucun rendu"}</span>
                </div>

                <div className="pj-d-main">
                  <div className="pj-d-h">
                    <span className={`pj-tile sm ${tile.cls}`}>{tile.l}</span>
                    <button className="pj-d-title" onClick={() => setViewing(p.id)} title="Voir le projet">{p.title}</button>
                    <span className={`pj-pill ${pub ? "ok" : "neutral"}`}>{pub ? "Publié" : "Brouillon"}</span>
                    {p.pendingCount > 0 && <span className="pj-d-flag">{p.pendingCount} à corriger</span>}
                  </div>
                  <div className="pj-d-meta">
                    {p.subjectName} · {p.classLevel} · {p.estMinutes} min
                    <span className={`pj-diff ${diff.cls}`}>{diff.label}</span>
                  </div>

                  {p.prereqs?.length > 0 && (
                    <div className="pj-d-req">
                      <span className="pj-d-req-l">Prérequis</span>
                      {p.prereqs.map((t) => <span className="pj-d-chip" key={t}>{t}</span>)}
                    </div>
                  )}

                  {/* The steps ARE the project — the spine, as in the dossier view. */}
                  {p.steps?.length > 0 && (
                    <ol className="pj-d-steps">
                      {p.steps.map((t, i) => (
                        <li key={i}><span className="pj-d-step-n">{i + 1}</span>{t}</li>
                      ))}
                    </ol>
                  )}
                </div>

                <div className="pj-d-acts">
                  <button className="btn btn-secondary btn-sm" onClick={() => setViewing(p.id)}><Icon name="eye" /> Voir</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditing(p.id)}><Icon name="edit" /> Modifier</button>
                  <button className="pj-icon-btn" title={pub ? "Dépublier" : "Publier"} onClick={() => toggleStatus(p)}>
                    <Icon name={pub ? "eye" : "check"} />
                  </button>
                  <button className="pj-icon-btn danger" title={p.submissionCount > 0 ? "Des élèves ont déjà rendu" : "Supprimer"} onClick={() => del(p)} disabled={p.submissionCount > 0}>
                    <Icon name="x" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

// ───────────────────────── Page ─────────────────────────
export default function TeacherProjects() {
  const [tab, setTab] = useState("review");
  const [items, setItems] = useState(null);
  const [status, setStatus] = useState("");
  const [ready, setReady] = useState(false); // URL seeding done — gates the first load
  const [openId, setOpenId] = useState(null);

  // Deep-link from the dashboard ("rendus à corriger") — seed the status filter
  // from the URL once, before the first fetch, so the list loads already scoped
  // in a single request (no race) and without an SSR hydration mismatch.
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("status");
    if (s && FILTER_CHIPS.some((c) => c.k === s)) setStatus(s);
    setReady(true);
  }, []);

  const load = () => {
    const qs = status ? `?status=${status}` : "";
    fetch(`/api/teacher/projects/${qs}`).then(async (r) => {
      if (r.status === 403) { window.location.href = "/login/"; return null; }
      return r.ok ? r.json() : null;
    }).then((x) => x && setItems(x.items));
  };

  useEffect(() => { if (ready && tab === "review") load(); /* eslint-disable-next-line */ }, [ready, tab, status]);

  const toCorrect = (items || []).filter((i) => i.status === "SUBMITTED").length;

  return (
    <>
      <TeacherShell active="/teacher/projects/" crumbGroup="Enseignement" crumbPage="Projets">
        <div className="pj-head">
          <h1>Projets appliqués</h1>
          <p className="muted">
            Des cas réels que vos élèves réalisent étape par étape, puis vous soumettent pour correction.
          </p>
        </div>

        <div className="pj-tabs">
          <button className={tab === "review" ? "active" : ""} onClick={() => { setTab("review"); setOpenId(null); }}>
            Rendus à corriger
            {toCorrect > 0 && <span className="pj-tabbadge">{toCorrect}</span>}
          </button>
          <button className={tab === "assign" ? "active" : ""} onClick={() => { setTab("assign"); setOpenId(null); }}>Assigner</button>
          <button className={tab === "manage" ? "active" : ""} onClick={() => { setTab("manage"); setOpenId(null); }}>Gérer les projets</button>
          <button className={tab === "direct" ? "active" : ""} onClick={() => { setTab("direct"); setOpenId(null); }}>Assignation directe</button>
        </div>

        {tab === "review" ? (
          <>
            <div className="pj-filters">
              {FILTER_CHIPS.map((c) => (
                <button key={c.k || "all"} className={`schip ${status === c.k ? "on" : ""}`.trim()} onClick={() => setStatus(c.k)}>
                  {c.l}
                </button>
              ))}
            </div>

            {items === null ? (
              <p className="pj-empty">Chargement…</p>
            ) : items.length === 0 ? (
              <div className="pj-empty-card">
                <div className="pj-empty-emoji">🎉</div>
                <div className="pj-empty-title">Aucun rendu dans ce filtre</div>
                <div className="muted">Tout est corrigé — vos élèves sont sur la bonne voie.</div>
              </div>
            ) : (
              <ProgressBoard items={items} onOpen={setOpenId} />
            )}
          </>
        ) : tab === "assign" ? (
          <AssignTab />
        ) : tab === "direct" ? (
          <DirectAssignTab />
        ) : (
          <ManageTab />
        )}
      </TeacherShell>

      {openId && <ReviewDrawer id={openId} onClose={() => setOpenId(null)} onReviewed={load} />}
    </>
  );
}
