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
import { splitRep, solutionProvenance } from "@/lib/copilot";

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
      const ask = (id) => fetch(API + (id ? `?class=${encodeURIComponent(id)}` : ""));
      let r = await ask(classId);
      // A remembered class can outlive the teacher's access to it: an admin
      // reassigns them, the class is renamed or deleted, the database is reseeded.
      // The server is right to refuse it — but without this retry the page keeps
      // the refusal, and the class picker renders EMPTY, so there is nothing left
      // to click and no way back. Forget the stale choice and let the server pick.
      if (!r.ok && classId) {
        localStorage.removeItem(CLASS_KEY);
        r = await ask(null);
      }
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

  // The drawer keeps the exercise it was opened with, which goes stale the moment
  // a link is added or removed behind it — the row and the server agree, the open
  // panel still shows the old chip. Re-resolve it from the refetched tree instead,
  // falling back to the snapshot if the exercise has gone (a class switch).
  const drawerBookEx = useMemo(() => {
    if (drawer?.mode !== "book") return null;
    const m = subject?.modules?.find((x) => x.id === drawer.module?.id);
    return m?.bookExercises?.find((e) => String(e.id) === String(drawer.ex.id)) ?? drawer.ex;
  }, [drawer, subject]);
  // Book exercises whose reconstruction the QA audit flagged as incomplete.
  const flaggedCount = useMemo(
    () => (subject?.modules || []).reduce((n, m) => n + (m.bookExercises || []).filter((e) => e.complete === false).length, 0),
    [subject]
  );
  useEffect(() => { if (flaggedCount === 0) setFlaggedOnly(false); }, [flaggedCount]);

  // A selection only makes sense within the book currently on the canvas.
  useEffect(() => { setAgentSel(null); }, [activeSlug, selectedClassId]);

  // ── mutations (canvas refetches after each so links/edges stay truthful) ──

  // A book exercise's id is the number from exercises.json; a teacher's own is a
  // cuid. They persist through different tables — BookExerciseLink vs
  // ExerciseLink — because book exercises are files, not rows.
  const isBookExercise = (id) => /^\d+$/.test(String(id));

  async function connect(exId, target) {
    if (isBookExercise(exId)) {
      // Only lessons: an exercise is already in its chapter by construction, so a
      // chapter link would record nothing.
      if (!target.lessonId) return toast("Reliez un exercice du manuel à une leçon.", { icon: "alert" });
      const r = await fetch(`${API}book/${exId}/links/`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lessonId: target.lessonId }),
      });
      if (r.ok) { toast("Exercice relié à la leçon.", { icon: "check" }); await load(selectedClassId); }
      else toast(r.status === 400 ? "Cette leçon appartient à un autre manuel." : "Connexion impossible.", { icon: "alert" });
      return;
    }
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
    if (isBookExercise(ex.id)) {
      const r = await fetch(`${API}book/${ex.id}/links/?lesson=${encodeURIComponent(link.lessonId)}`, { method: "DELETE" });
      if (r.ok) { toast("Lien retiré.", { icon: "check" }); await load(selectedClassId); }
      else toast("Détachement impossible.", { icon: "alert" });
      return;
    }
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

        {/* Which book the canvas below is showing, said once. The three column
            headers each carried this for a while, which on a multi-subject class
            repeated the same string four times over and still had to ellipsise the
            manual's real title away. Here there is room to print it in full. */}
        {subject && (
          <div className="exp-book">
            <Icon name={subject.icon || "book"} />
            <b>{subject.name}</b>
            {subject.bookTitle && <span className="exp-book-t">{subject.bookTitle}</span>}
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
            {drawer.mode === "book" && <BookViewer ex={drawerBookEx} module={drawer.module} subject={subject} onClose={() => setDrawer(null)} onSaved={() => load(selectedClassId)} onUnlink={(link) => detach(drawer.ex, link)} />}
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
function BookViewer({ ex, module, subject, onClose, onSaved, onUnlink }) {
  const isOcr = ex.quality === "ocr";
  const { q, rep } = isOcr ? splitRep(ex.text) : { q: ex.text, rep: ex.solution || "" };
  // Chips answer "which lesson does this exercise relate to?" — the injected
  // figure lessons ("Manuel illustré (N)") are illustration companions, not
  // distinct topics, and they flood chapters (Ch. 8 has 12), so drop them here.
  // They remain real lessons everywhere else (programme tree, linking).
  const lessons = (module?.lessons ?? []).filter((l) => !/^Manuel illustr[ée]/i.test(l.title));
  const canFix = typeof ex.id === "number"; // colleague exercises come through without one
  const solHead = solutionProvenance(ex);
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
        {/* The book's own numbering wins the title when we have it. Falling back
            to the section first — as this did while every exercise was an
            unnumbered OCR block — now labels six different exercises
            « Exercices résolus » and hides the one thing that tells them apart. */}
        <b>{ex.n ? `Exercice ${ex.n}` : ex.section || "Exercice"}</b>
        <button className="exp-close" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div className="exp-view-meta">
        {subject && <span className="exp-view-subj">{subject.name}</span>}
        {module && <span className="exp-view-src">Ch. {module.order} — {module.title}</span>}
        {/* The book's own section heading, now that the title carries the number. */}
        {ex.n && ex.section && <span className="exp-view-src">{ex.section}</span>}
        <span className="exp-view-lock"><Icon name="lock" /> Extrait du manuel — lecture seule</span>
      </div>
      {/* Book exercises are only tied to a chapter, not one lesson — show the
          chapter's lessons so the teacher sees which lessons this relates to. */}
      {lessons.length > 0 && (
        <div className="exp-view-lessons">
          {/* A teacher's own link is exercise-level and beats the chapter-level
              list below it, so it is stated first and separately — otherwise the
              two read as the same kind of claim. */}
          <span className="exp-view-lessons-lbl">
            <Icon name="book" /> {ex.links?.length ? "Relié à" : "Leçons de ce chapitre"}
          </span>
          <div className="exp-view-lchips">
            {(ex.links ?? []).map((l) => (
              <span key={l.id} className="exp-view-lchip on">
                <a href={`/teacher/studio/?lesson=${l.lessonId}`} title={`Ouvrir « ${l.lessonTitle} » dans le studio`}>
                  {l.lessonTitle}
                </a>
                {/* Placing an exercise under a lesson is a judgement call, so it has
                    to be reversible from the same place it is shown. */}
                <button className="exp-lchip-x" title="Retirer ce lien" onClick={() => onUnlink?.(l)}>
                  <Icon name="x" />
                </button>
              </span>
            ))}
            {lessons
              .filter((l) => !(ex.links ?? []).some((k) => k.lessonId === l.id))
              .map((l) => (
                <a key={l.id} className="exp-view-lchip" href={`/teacher/studio/?lesson=${l.id}`} title={`Ouvrir « ${l.title} » dans le studio`}>
                  {l.title}
                </a>
              ))}
          </div>
        </div>
      )}

      {/* No clean version was ever produced for this one, so what follows is the
          scan's own OCR — the book's wording, but with its reading errors, and
          nothing has checked it. The canvas and the student list already tag these
          « Brouillon »; the drawer said nothing at all, which made the least
          trustworthy text on the page the only text with no warning on it. */}
      {isOcr && (
        <div className="exp-view-warn">
          <Icon name="alert" />
          <span>
            <b>Texte OCR brut.</b> Cet exercice n’a pas encore été mis au propre : le texte ci-dessous
            sort directement du scan et contient des erreurs de lecture. Personne ne l’a vérifié —
            relisez-le avant de le donner à vos élèves.
          </span>
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
          <div className={`exp-view-sec${solHead.cls}`}>
            <Icon name={solHead.icon} /> {solHead.label}
          </div>
          {isOcr ? <pre className="exp-pre raw">{tidy(rep)}</pre> : <div className={`exp-md${ex.reconstructed ? " ai" : " sol"}`}><Markdown breaks>{rep}</Markdown></div>}
        </>
      ) : (
        <div className="exp-view-nosol">Pas de corrigé disponible pour cet exercice.</div>
      )}
    </div>
  );
}
