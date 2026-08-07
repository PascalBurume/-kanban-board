"use client";
import "./exercises.css";
import { useState, useEffect, useCallback, useMemo } from "react";
import Icon from "@/components/ui/Icon";
import Markdown from "@/components/Markdown";
import TeacherShell from "@/components/ui/TeacherShell";
import ExerciseCanvas from "@/components/ExerciseCanvas";
import ExerciseAgentPanel from "@/components/ExerciseAgentPanel";
import { ExerciseComposePanel } from "@/components/ExerciseComposePanel";
import QuizMathInput from "@/components/QuizMathInput";
import { toast } from "@/lib/toast";
import { splitRep } from "@/lib/copilot";

const API = "/api/teacher/exercises/";
const CLASS_KEY = "exercises.classId";
const AGENT_KEY = "exercises.agentOpen";

// OCR drafts: collapse scanner artifacts so the raw text stays readable.
function tidy(t) {
  return (t || "").replace(/[ \t]{2,}/g, " ").replace(/[—–-]{3,}/g, " … ").replace(/\n{3,}/g, "\n\n").trim();
}

const EMPTY_DRAFT = { title: "", statementMd: "", solutionMd: "", moduleId: "" };

export default function TeacherExercisesPage() {
  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [classLevel, setClassLevel] = useState(null);
  const [activeSlug, setActiveSlug] = useState(null);
  const [search, setSearch] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  // drawer: null | {mode:"book", ex, module} | {mode:"edit", ex} | {mode:"create"}
  const [drawer, setDrawer] = useState(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  // agent panel: selection is {kind:"custom"|"book", ex, module?, subjectSlug?}
  const [agentSel, setAgentSel] = useState(null);
  const [agentOpen, setAgentOpen] = useState(true);

  useEffect(() => { setAgentOpen(localStorage.getItem(AGENT_KEY) !== "0"); }, []);
  function toggleAgent(open) {
    setAgentOpen(open);
    localStorage.setItem(AGENT_KEY, open ? "1" : "0");
  }

  const load = useCallback(async (classId) => {
    setLoading(true);
    try {
      const qs = classId ? `?class=${encodeURIComponent(classId)}` : "";
      const r = await fetch(API + qs);
      if (!r.ok) throw new Error();
      const d = await r.json();
      setSubjects(d.subjects || []);
      setClasses(d.classes || []);
      setSelectedClassId(d.selectedClassId || null);
      setClassLevel(d.classLevel || null);
      setActiveSlug((cur) => (d.subjects?.some((s) => s.slug === cur) ? cur : d.subjects?.[0]?.slug ?? null));
      if (d.selectedClassId) localStorage.setItem(CLASS_KEY, d.selectedClassId);
    } catch {
      toast("Impossible de charger les exercices.", { icon: "alert" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(localStorage.getItem(CLASS_KEY) || null);
  }, [load]);

  const subject = useMemo(() => subjects.find((s) => s.slug === activeSlug) || null, [subjects, activeSlug]);
  // Book exercises whose reconstruction the QA audit flagged as incomplete.
  const flaggedCount = useMemo(
    () => (subject?.modules || []).reduce((n, m) => n + (m.bookExercises || []).filter((e) => e.complete === false).length, 0),
    [subject]
  );
  useEffect(() => { if (flaggedCount === 0) setFlaggedOnly(false); }, [flaggedCount]);

  // A selection only makes sense within the book currently on the canvas.
  useEffect(() => { setAgentSel(null); }, [activeSlug, selectedClassId]);

  // ── mutations (canvas refetches after each so links/edges stay truthful) ──

  async function connect(exId, target) {
    const ex = subject?.custom.find((e) => e.id === exId);
    if (!ex) return;
    const links = [
      ...ex.links.map((l) => ({ moduleId: l.moduleId, lessonId: l.lessonId })),
      { moduleId: target.moduleId || undefined, lessonId: target.lessonId || undefined },
    ];
    const r = await fetch(`${API}${ex.id}/links/`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ links }),
    });
    if (r.ok) { toast("Exercice relié.", { icon: "check" }); await load(selectedClassId); }
    else toast("Connexion impossible.", { icon: "alert" });
  }

  async function detach(ex, link) {
    const links = ex.links.filter((l) => l.id !== link.id).map((l) => ({ moduleId: l.moduleId, lessonId: l.lessonId }));
    const r = await fetch(`${API}${ex.id}/links/`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ links }),
    });
    if (r.ok) { toast("Lien retiré.", { icon: "check" }); await load(selectedClassId); }
    else toast("Détachement impossible.", { icon: "alert" });
  }

  async function remove(ex) {
    if (!confirm("Supprimer définitivement cet exercice ?")) return;
    const r = await fetch(`${API}${ex.id}/`, { method: "DELETE" });
    if (r.ok) {
      toast("Exercice supprimé.", { icon: "check" });
      setDrawer((d) => (d?.ex?.id === ex.id ? null : d));
      setAgentSel((s) => (s?.kind === "custom" && s.ex.id === ex.id ? null : s));
      await load(selectedClassId);
    } else toast("Suppression impossible.", { icon: "alert" });
  }

  async function createExercise() {
    if (!draft.statementMd.trim() || !subject) return;
    setSaving(true);
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectSlug: subject.slug,
          title: draft.title,
          statementMd: draft.statementMd,
          solutionMd: draft.solutionMd,
          moduleId: draft.moduleId || undefined,
        }),
      });
      if (!r.ok) throw new Error();
      toast("Exercice créé — visible dans l'Atelier de vos élèves.", { icon: "check" });
      setDrawer(null);
      setDraft(EMPTY_DRAFT);
      await load(selectedClassId);
    } catch {
      toast("Création impossible.", { icon: "alert" });
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    const ex = drawer?.ex;
    if (!ex || !draft.statementMd.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}${ex.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: draft.title, statementMd: draft.statementMd, solutionMd: draft.solutionMd }),
      });
      if (!r.ok) throw new Error();
      toast("Exercice mis à jour.", { icon: "check" });
      setDrawer(null);
      await load(selectedClassId);
    } catch {
      toast("Enregistrement impossible.", { icon: "alert" });
    } finally {
      setSaving(false);
    }
  }

  function openCreate() {
    setDraft({ ...EMPTY_DRAFT, moduleId: subject?.modules?.[0]?.id ?? "" });
    setDrawer({ mode: "create" });
  }
  function openCustom(ex) {
    if (ex.mine) {
      setDraft({ title: ex.title, statementMd: ex.statementMd, solutionMd: ex.solutionMd, moduleId: "" });
      setDrawer({ mode: "edit", ex });
    } else {
      setDrawer({ mode: "book", ex: { section: ex.title || "Exercice", quality: "clean", text: ex.statementMd, solution: ex.solutionMd }, module: null });
    }
  }

  return (
    <TeacherShell active="/teacher/exercises/" crumbGroup="Enseignement" crumbPage="Exercices">
      <div className="exp-wrap">
        <div className="exp-bar card">
          <div className="exp-bar-title">
            <Icon name="book" /> <b>Exercices</b>
            <span className="exp-bar-hint">Les exercices du manuel sont en lecture seule — les vôtres arrivent directement dans l'Atelier des élèves.</span>
          </div>
          <div className="exp-bar-controls">
            <select
              className="exp-select"
              value={selectedClassId ?? ""}
              onChange={(e) => load(e.target.value)}
              aria-label="Classe"
            >
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="exp-search">
              <Icon name="search" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un exercice…" />
            </div>
            {flaggedCount > 0 && (
              <button
                className={`exp-flagbtn${flaggedOnly ? " on" : ""}`}
                onClick={() => setFlaggedOnly((v) => !v)}
                title="Afficher uniquement les exercices dont la reconstruction est incomplète"
              >
                <Icon name="alert" /> À vérifier <span className="exp-flagn">{flaggedCount}</span>
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={openCreate} disabled={!subject}>
              <Icon name="plus" /> Nouvel exercice
            </button>
          </div>
        </div>

        {subjects.length > 1 && (
          <div className="exp-tabs">
            {subjects.map((s) => (
              <button key={s.slug} className={`exp-tab${s.slug === activeSlug ? " on" : ""}`} onClick={() => setActiveSlug(s.slug)}>
                {s.name}
                <span className="exp-tab-n">{s.custom.length + s.modules.reduce((n, m) => n + (m.bookExercises?.length || 0), 0)}</span>
              </button>
            ))}
          </div>
        )}

        {/* The agent aside is a sibling of the canvas, not a child of the
            loading branch: a refetch after « Relier » must not unmount it and
            throw away the analysis the teacher is reading. */}
        <div className="exp-canvas card">
          {loading && !subject ? (
            <div className="exp-loading"><Icon name="refresh" /> Chargement…</div>
          ) : !subject ? (
            <div className="exp-loading">Aucun manuel pour cette classe.</div>
          ) : (
            <ExerciseCanvas
              subject={subject}
              search={search}
              flaggedOnly={flaggedOnly}
              onConnect={connect}
              onDetach={detach}
              onOpenCustom={openCustom}
              onOpenBook={(ex, module) => setDrawer({ mode: "book", ex, module })}
              onDelete={remove}
              onAdvise={(sel) => { setAgentSel(sel); toggleAgent(true); }}
              advisedId={agentSel ? (agentSel.kind === "custom" ? agentSel.ex.id : `book:${agentSel.ex.id}`) : null}
            />
          )}

          {subject && (agentOpen ? (
            <aside className="exa-side">
              <button className="exa-collapse" title="Masquer le Copilot" onClick={() => toggleAgent(false)}><Icon name="chevR" /></button>
              <ExerciseAgentPanel
                subject={subject}
                classId={selectedClassId}
                classLevel={classLevel}
                selected={agentSel}
                onLink={connect}
              />
            </aside>
          ) : (
            <button className="exa-reopen" onClick={() => toggleAgent(true)}>
              <Icon name="sparkles" /> <span>Copilot</span>
            </button>
          ))}
        </div>
      </div>

      {drawer && (
        <>
          <div className="exp-scrim" onClick={() => setDrawer(null)} />
          <aside className="exp-drawer">
            {drawer.mode === "book" && <BookViewer ex={drawer.ex} module={drawer.module} subject={subject} onClose={() => setDrawer(null)} onSaved={() => load(selectedClassId)} />}
            {(drawer.mode === "create" || drawer.mode === "edit") && (
              <div className="exp-form">
                <div className="exp-drawer-head">
                  <b>{drawer.mode === "create" ? "Nouvel exercice" : "Modifier l'exercice"}</b>
                  <button className="exp-close" onClick={() => setDrawer(null)}><Icon name="x" /></button>
                </div>

                {drawer.mode === "create" && subject && (
                  <ExerciseComposePanel
                    subjectSlug={subject.slug}
                    moduleId={draft.moduleId || null}
                    classLevel={classLevel || undefined}
                    onUse={(r) => setDraft((d) => ({ ...d, title: r.title, statementMd: r.statementMd, solutionMd: r.solutionMd }))}
                  />
                )}

                <label className="exp-l">Titre (court)</label>
                <input className="exp-input" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="ex. Proportions au marché" />

                <label className="exp-l">Énoncé *</label>
                <p className="exp-hint">Markdown accepté. Écrivez les formules entre <code>$…$</code> — la barre d’outils insère les symboles courants.</p>
                <QuizMathInput multiline rows={9} value={draft.statementMd} onChange={(v) => setDraft((d) => ({ ...d, statementMd: v }))} placeholder="Ex. Au marché, 3 kg de riz coûtent 4500 FC…" />

                <label className="exp-l">Corrigé</label>
                <p className="exp-hint">Visible par les élèves une fois qu’ils cherchent la solution.</p>
                <QuizMathInput multiline rows={9} value={draft.solutionMd} onChange={(v) => setDraft((d) => ({ ...d, solutionMd: v }))} placeholder="Solution étape par étape…" />

                {drawer.mode === "create" && (
                  <>
                    <label className="exp-l">Relier au chapitre</label>
                    <select className="exp-select" value={draft.moduleId} onChange={(e) => setDraft((d) => ({ ...d, moduleId: e.target.value }))}>
                      <option value="">— plus tard, sur le canevas —</option>
                      {subject?.modules.map((m) => <option key={m.id} value={m.id}>M{m.order} · {m.title}</option>)}
                    </select>
                  </>
                )}

                <div className="exp-form-acts">
                  <button className="btn btn-primary" disabled={saving || !draft.statementMd.trim()} onClick={drawer.mode === "create" ? createExercise : saveEdit}>
                    <Icon name={saving ? "refresh" : "check"} /> {drawer.mode === "create" ? "Créer l'exercice" : "Enregistrer"}
                  </button>
                  {drawer.mode === "edit" && (
                    <button className="btn btn-ghost" onClick={() => remove(drawer.ex)}><Icon name="x" /> Supprimer</button>
                  )}
                </div>
              </div>
            )}
          </aside>
        </>
      )}
    </TeacherShell>
  );
}

// Viewer for a book (or colleague's) exercise: statement + solution. Book
// exercises (numeric JSON id) are correctable: the teacher's fix is stored as a
// BookExerciseFix override and replaces the AI/OCR text for everyone.
function BookViewer({ ex, module, subject, onClose, onSaved }) {
  const isOcr = ex.quality === "ocr";
  const { q, rep } = isOcr ? splitRep(ex.text) : { q: ex.text, rep: ex.solution || "" };
  // Chips answer "which lesson does this exercise relate to?" — the injected
  // figure lessons ("Manuel illustré (N)") are illustration companions, not
  // distinct topics, and they flood chapters (Ch. 8 has 12), so drop them here.
  // They remain real lessons everywhere else (programme tree, linking).
  const lessons = (module?.lessons ?? []).filter((l) => !/^Manuel illustr[ée]/i.test(l.title));
  const canFix = typeof ex.id === "number"; // colleague exercises come through without one
  const [editing, setEditing] = useState(false);
  const [stmt, setStmt] = useState("");
  const [sol, setSol] = useState("");
  const [busy, setBusy] = useState(false);

  function startEdit() {
    setStmt(isOcr ? tidy(q) : q);
    setSol(isOcr ? tidy(rep) : rep);
    setEditing(true);
  }
  async function save() {
    if (!stmt.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/teacher/exercises/book/${ex.id}/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statementMd: stmt, solutionMd: sol }),
      });
      if (!r.ok) throw new Error();
      toast("Correction enregistrée — visible par vos élèves.", { icon: "check" });
      onSaved?.();
      onClose();
    } catch {
      toast("Enregistrement impossible.", { icon: "alert" });
    } finally {
      setBusy(false);
    }
  }
  async function revert() {
    setBusy(true);
    try {
      const r = await fetch(`/api/teacher/exercises/book/${ex.id}/`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      toast("Version automatique rétablie.", { icon: "refresh" });
      onSaved?.();
      onClose();
    } catch {
      toast("Impossible de rétablir.", { icon: "alert" });
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="exp-form">
        <div className="exp-drawer-head">
          <b>Corriger l’exercice</b>
          <button className="exp-close" onClick={() => setEditing(false)}><Icon name="x" /></button>
        </div>
        <label className="exp-l">Énoncé *</label>
        <p className="exp-hint">Markdown accepté, formules entre <code>$…$</code>. Votre version remplace la reconstruction IA pour toutes les classes.</p>
        <QuizMathInput multiline rows={10} value={stmt} onChange={setStmt} />
        <label className="exp-l">Corrigé</label>
        <QuizMathInput multiline rows={10} value={sol} onChange={setSol} />
        <div className="exp-form-acts">
          <button className="btn btn-primary" disabled={busy || !stmt.trim()} onClick={save}>
            <Icon name={busy ? "refresh" : "check"} /> Enregistrer la correction
          </button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => setEditing(false)}>Annuler</button>
        </div>
      </div>
    );
  }

  return (
    <div className="exp-view">
      <div className="exp-drawer-head">
        <b>{ex.section || (ex.n ? `Exercice ${ex.n}` : "Exercice")}</b>
        <button className="exp-close" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div className="exp-view-meta">
        {subject && <span className="exp-view-subj">{subject.name}</span>}
        {module && <span className="exp-view-src">Ch. {module.order} — {module.title}</span>}
        <span className="exp-view-lock"><Icon name="lock" /> Extrait du manuel — lecture seule</span>
      </div>
      {/* Book exercises are only tied to a chapter, not one lesson — show the
          chapter's lessons so the teacher sees which lessons this relates to. */}
      {lessons.length > 0 && (
        <div className="exp-view-lessons">
          <span className="exp-view-lessons-lbl"><Icon name="book" /> Leçons de ce chapitre</span>
          <div className="exp-view-lchips">
            {lessons.map((l) => (
              <a key={l.id} className="exp-view-lchip" href={`/teacher/studio/?lesson=${l.id}`} title={`Ouvrir « ${l.title} » dans le studio`}>
                {l.title}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Where the scan was unreadable, the énoncé and corrigé below were
          rebuilt by the Copilot and may differ from the printed book. */}
      {ex.reconstructed && (
        <div className="exp-view-warn">
          <Icon name="alert" />
          <span>
            <b>Reconstruit par l’IA.</b> Le scan de cette page était illisible : l’énoncé et le corrigé
            ont été reconstitués et peuvent différer du manuel. Vérifiez-les avant de les donner à vos élèves.
          </span>
        </div>
      )}
      {ex.complete === false && !ex.fixed && (
        <div className="exp-view-todo">
          <Icon name="alert" />
          <span><b>Corrigé incomplet.</b> Le texte a été coupé (le modèle a manqué de place). Complétez-le avant de le donner aux élèves.</span>
        </div>
      )}
      {ex.fixed && (
        <div className="exp-view-fixed">
          <Icon name="check" />
          <span><b>Corrigé par l’enseignant.</b> Cette version remplace la reconstruction automatique.</span>
        </div>
      )}
      {canFix && (
        <div className="exp-view-fixacts">
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={startEdit}>
            <Icon name="edit" /> {ex.fixed ? "Modifier la correction" : "Corriger cet exercice"}
          </button>
          {ex.fixed && (
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={revert}>
              <Icon name="refresh" /> Rétablir la version IA
            </button>
          )}
        </div>
      )}

      <div className="exp-view-sec">Énoncé</div>
      {isOcr ? <pre className="exp-pre">{tidy(q)}</pre> : <div className="exp-md"><Markdown breaks>{q}</Markdown></div>}
      {rep ? (
        <>
          <div className={`exp-view-sec${ex.reconstructed ? " ai" : " sol"}`}>
            <Icon name={ex.reconstructed ? "sparkles" : "check"} /> {ex.complete === false ? "Corrigé reconstruit — incomplet" : ex.reconstructed ? "Corrigé reconstruit — à vérifier" : "Corrigé"}
          </div>
          {isOcr ? <pre className="exp-pre sol">{tidy(rep)}</pre> : <div className={`exp-md${ex.reconstructed ? " ai" : " sol"}`}><Markdown breaks>{rep}</Markdown></div>}
        </>
      ) : (
        <div className="exp-view-nosol">Pas de corrigé disponible pour cet exercice.</div>
      )}
    </div>
  );
}
