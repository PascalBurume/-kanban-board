"use client";
import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";
import { toast } from "@/lib/toast";
import { useSseJob, JobSteps } from "./useSseJob";
import "./AdminContentPanel.css";

// Admin « Contenu » tab: create/update whole books (subjects), modules and
// lessons. Design follows the TEACHER warm-paper theme (src/styles/teacher.css)
// rather than the cool admin slate — subject cards with accent tiles, warm
// module accordion, studio deep-links for lesson editing.

const LEVELS = [
  { v: "5e", l: "5e" },
  { v: "6e", l: "6e" },
  { v: "examen", l: "Examen d'État" },
];

const STATUS_PILL = {
  PUBLISHED: { label: "En ligne", cls: "pub" },
  DRAFT: { label: "Brouillon", cls: "draft" },
};

async function api(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

// ── RAG index control: stats + « (Ré)indexer » SSE job ───────────────────────
function RagIndexControl() {
  const { steps, running, start } = useSseJob("/api/admin/content/reindex/");
  const [stats, setStats] = useState(null);

  const loadStats = useCallback(async () => {
    const r = await fetch("/api/admin/content/reindex/");
    if (r.ok) setStats(await r.json());
  }, []);
  useEffect(() => { loadStats(); }, [loadStats]);

  async function run() {
    await start({});
    await loadStats();
  }

  const embedStep = steps.find((s) => s.id === "embed");

  return (
    <span className="acp-rag">
      {stats && (
        <span className="acp-rag-stats" title="Index sémantique (recherche intelligente + Copilot)">
          <Icon name="database" /> {stats.lessons} leçons · {stats.chunks} extraits
          {!stats.embedModel && <b className="acp-rag-warn"> · modèle d'embedding absent</b>}
        </span>
      )}
      <button className="btn btn-secondary btn-sm" onClick={run} disabled={running}>
        <Icon name="refresh" /> {running ? (embedStep?.detail || "Indexation…") : "(Ré)indexer le contenu"}
      </button>
    </span>
  );
}

// ── authoring assistant: similar existing lessons (duplicate check) ──────────
function SimilarLessons({ lessons }) {
  const [results, setResults] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const titles = lessons.map((l) => l.title).join(" ; ");
      const r = await fetch("/api/admin/content/similar/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: titles }),
      });
      const d = await r.json().catch(() => ({}));
      // Ignore hits that ARE the lessons we just imported.
      const own = new Set(lessons.map((l) => l.id));
      if (!cancelled) setResults((d.results || []).filter((x) => !own.has(x.lessonId)));
    })();
    return () => { cancelled = true; };
  }, [lessons]);

  if (!results?.length) return null;
  return (
    <div className="acp-similar">
      <div className="acp-similar-h"><Icon name="sparkles" /> Leçons similaires existantes</div>
      {results.map((r) => (
        <a className="acp-similar-row" key={r.lessonId} href={`/teacher/studio/?lesson=${r.lessonId}`}>
          <span className="acp-similar-t">{r.title}</span>
          <span className="acp-book-meta">{r.subjectName} · {r.moduleTitle}</span>
          {r.score > 0.85 && <span className="acp-pill warn">doublon possible</span>}
        </a>
      ))}
    </div>
  );
}

// ── chapter import modal: file → SSE job → review DRAFT lessons ──────────────
function ImportModal({ subject, onClose, onDone }) {
  const { steps, result, error, running, start } = useSseJob("/api/admin/content/import/");
  const [file, setFile] = useState(null);
  const [target, setTarget] = useState("new"); // "new" | moduleId
  const [title, setTitle] = useState("");
  const [classLevel, setClassLevel] = useState("5e");
  const [published, setPublished] = useState(() => new Set());

  const kindOf = (name) => {
    const ext = (name.split(".").pop() || "").toLowerCase();
    return ext === "pdf" ? "pdf" : ext === "md" ? "md" : "txt";
  };

  async function launch() {
    if (!file) return;
    if (target === "new" && !title.trim()) { toast("Donnez un titre au nouveau module", { icon: "alert" }); return; }
    const dataB64 = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
    const final = await start({
      subjectSlug: subject.slug,
      moduleId: target === "new" ? undefined : target,
      newModule: target === "new" ? { title: title.trim(), classLevel } : undefined,
      kind: kindOf(file.name),
      filename: file.name,
      dataB64,
    });
    if (final) { toast(`${final.lessons.length} leçon(s) créée(s) en brouillon ✓`, { icon: "check" }); onDone(); }
  }

  async function publish(lessonId) {
    const r = await fetch(`/api/studio/lessons/${lessonId}/status/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PUBLISHED" }),
    });
    if (r.ok) {
      setPublished((p) => new Set([...p, lessonId]));
      toast("Leçon publiée ✓", { icon: "check" });
      onDone();
    } else toast("Publication impossible.", { icon: "alert" });
  }

  async function publishAll() {
    for (const l of result?.lessons ?? []) if (!published.has(l.id)) await publish(l.id);
  }

  const errMsg = {
    FILE_TOO_LARGE: "Fichier trop volumineux (max 5 Mo texte / 20 Mo PDF).",
    EMPTY_FILE: "Fichier vide ou illisible.",
    RATE_LIMITED: "Trop d'imports — patientez quelques minutes.",
  }[error] || (error ? "Import impossible." : null);

  return (
    <div className="acp-modal-overlay" onClick={running ? undefined : onClose}>
      <div className="acp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="acp-modal-h">
          <h3><Icon name="upload" /> Importer un chapitre — {subject.name}</h3>
          <button className="acp-x" onClick={onClose} disabled={running}><Icon name="x" /></button>
        </div>

        {!result && (
          <>
            <label className="acp-file">
              <input type="file" accept=".md,.txt,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={running} />
              <Icon name="file" />
              <span>{file ? file.name : "Choisir un fichier .md, .txt ou .pdf"}</span>
            </label>

            <div className="acp-import-row">
              <label>Destination</label>
              <select value={target} onChange={(e) => setTarget(e.target.value)} disabled={running}>
                <option value="new">— Nouveau module —</option>
                {subject.modules.map((m) => <option key={m.id} value={m.id}>{m.title} ({m.classLevel || "5e/6e"})</option>)}
              </select>
              {target === "new" && (
                <>
                  <input placeholder="Titre du nouveau module" value={title} onChange={(e) => setTitle(e.target.value)} disabled={running} />
                  <select value={classLevel} onChange={(e) => setClassLevel(e.target.value)} disabled={running}>
                    <option value="5e">5e</option>
                    <option value="6e">6e</option>
                    <option value="examen">Examen d'État</option>
                  </select>
                </>
              )}
            </div>

            <p className="acp-import-hint">
              Les chapitres avec des titres « ## » sont découpés tels quels ; sinon le Copilot propose un plan de leçons
              et rédige chaque leçon à partir du texte. Tout est créé en <b>brouillon</b> — rien n'est visible des élèves avant publication.
            </p>

            <div className="acp-modal-acts">
              <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={running}>Annuler</button>
              <button className="btn btn-primary btn-sm" onClick={launch} disabled={!file || running}>
                <Icon name="sparkles" /> {running ? "Import en cours…" : "Lancer l'import"}
              </button>
            </div>
          </>
        )}

        <JobSteps steps={steps} Icon={Icon} />
        {errMsg && <p className="acp-import-err">{errMsg}</p>}

        {result && (
          <div className="acp-review">
            <div className="acp-review-h">
              <b>{result.lessons.length} leçon(s) en brouillon</b> dans « {result.moduleTitle} »
              <button className="btn btn-primary btn-sm" onClick={publishAll}>Tout publier</button>
            </div>
            {result.lessons.map((l) => (
              <div className="acp-lesson" key={l.id}>
                <span className="acp-ltitle">{l.title}</span>
                {l.degraded && <span className="acp-pill draft">sans IA</span>}
                <span className={`acp-pill ${published.has(l.id) ? "pub" : "draft"}`}>{published.has(l.id) ? "En ligne" : "Brouillon"}</span>
                <a className="acp-edit" href={`/teacher/studio/?lesson=${l.id}`} title="Ouvrir dans le Studio"><Icon name="edit" /></a>
                {!published.has(l.id) && (
                  <button className="btn btn-secondary btn-sm" onClick={() => publish(l.id)}>Publier</button>
                )}
              </div>
            ))}
            <SimilarLessons lessons={result.lessons} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── « Livres ↔ Classes » : Offering links as an arrow diagram ─────────────────
// Books (left) connect to sections (right). Clicking a link reveals the teachers
// already assigned to teach that book there — the admin sees the impact (including
// a class losing its titulaire) BEFORE detaching.
const LINK_ROW = 64; // node stride: 56px node + 8px gap — drives the arrow geometry

export function BookClassLinks() {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null); // offering id
  const [attach, setAttach] = useState(null); // { subjectSlug, sectionKey } | null

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/content/offerings/");
    if (r.ok) setData(await r.json());
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!data) return null;
  const { books, sections, links } = data;
  const bookIdx = new Map(books.map((b, i) => [b.slug, i]));
  const secIdx = new Map(sections.map((s, i) => [s.key, i]));
  const bookOf = (slug) => books[bookIdx.get(slug)];
  const H = Math.max(books.length, sections.length) * LINK_ROW;
  const y = (i) => i * LINK_ROW + 28;
  const link = links.find((l) => l.id === selected) ?? null;
  const linkSection = link ? sections.find((s) => s.key === link.sectionKey) : null;
  const leadLosses = link ? link.teachers.filter((t) => t.loseLead) : [];

  async function doAttach() {
    if (!attach?.subjectSlug || !attach?.sectionKey) return;
    const sec = sections.find((s) => s.key === attach.sectionKey);
    const r = await api("POST", "/api/admin/content/offerings/", { level: sec.level, field: sec.field, subjectSlug: attach.subjectSlug });
    if (!r.ok) { toast(r.status === 409 ? "Ce livre est déjà lié à cette section." : "Liaison impossible.", { icon: "alert" }); return; }
    setData(r.data); setAttach(null);
    toast("Livre lié à la section ✓", { icon: "check" });
  }

  async function doDetach() {
    if (!link) return;
    const lines = [
      `Détacher « ${bookOf(link.subjectSlug)?.name} » de la section ${linkSection.field || linkSection.level} ?`,
      linkSection.classes.length ? `Classes concernées : ${linkSection.classes.map((c) => c.name).join(", ")}.` : null,
      link.teachers.length ? `${link.teachers.length} affectation(s) d'enseignant seront retirées.` : null,
      leadLosses.length ? `⚠ ${leadLosses.map((t) => `${t.className} perdra son titulaire (${t.name})`).join(" ; ")} — la classe disparaîtra de la connexion élèves.` : null,
    ].filter(Boolean);
    if (!window.confirm(lines.join("\n"))) return;
    const r = await api("DELETE", `/api/admin/content/offerings/?id=${link.id}`);
    if (!r.ok) { toast("Détachement impossible.", { icon: "alert" }); return; }
    setData(r.data); setSelected(null);
    toast("Livre détaché de la section", { icon: "x" });
  }

  return (
    <div className="acp-links">
      <div className="acp-col-h">
        <span>Livres ↔ Classes <b className="acp-count">{links.length} liens</b></span>
        {attach ? (
          <span className="acp-links-attach">
            <select value={attach.subjectSlug} onChange={(e) => setAttach((a) => ({ ...a, subjectSlug: e.target.value }))}>
              <option value="">— Livre —</option>
              {books.map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
            </select>
            <select value={attach.sectionKey} onChange={(e) => setAttach((a) => ({ ...a, sectionKey: e.target.value }))}>
              <option value="">— Section —</option>
              {sections.map((s) => <option key={s.key} value={s.key}>{s.level} · {s.field || "—"}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" onClick={doAttach} disabled={!attach.subjectSlug || !attach.sectionKey}>Lier</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setAttach(null)}>Annuler</button>
          </span>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={() => setAttach({ subjectSlug: "", sectionKey: "" })}>
            <Icon name="plus" /> Lier un livre
          </button>
        )}
      </div>

      <div className="acp-links-diagram" style={{ height: H }}>
        <div className="acp-links-col">
          {books.map((b) => (
            <div className="acp-links-node" key={b.slug}>
              <span className="acp-tile" style={{ background: `${b.color}1a`, color: b.color }}>{(b.name || "?")[0].toUpperCase()}</span>
              <span className="acp-book-main">
                <span className="acp-book-name">{b.name}</span>
                <span className="acp-book-meta">{b.lessonCount} leçons</span>
              </span>
            </div>
          ))}
        </div>

        {/* explicit pixel height: with height:100% the svg's own viewBox aspect-ratio
            feeds back into the grid row and stretches the y-axis */}
        <svg className="acp-links-svg" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" style={{ height: H }}>
          {links.map((l) => {
            const y1 = y(bookIdx.get(l.subjectSlug) ?? 0);
            const y2 = y(secIdx.get(l.sectionKey) ?? 0);
            const on = l.id === selected;
            return (
              <path
                key={l.id}
                d={`M 0 ${y1} C 40 ${y1}, 60 ${y2}, 100 ${y2}`}
                fill="none"
                stroke={bookOf(l.subjectSlug)?.color || "#a5b4fc"}
                strokeWidth={on ? 3.5 : 2}
                strokeOpacity={selected && !on ? 0.25 : 0.8}
                vectorEffect="non-scaling-stroke"
                style={{ cursor: "pointer" }}
                onClick={() => setSelected(on ? null : l.id)}
              />
            );
          })}
        </svg>

        <div className="acp-links-col">
          {sections.map((s) => (
            <div className="acp-links-node sec" key={s.key}>
              <span className="acp-book-main">
                <span className="acp-book-name">{s.field || s.level}</span>
                <span className="acp-book-meta">
                  {s.classes.length ? s.classes.map((c) => c.name).join(", ") : "aucune classe"}
                </span>
              </span>
              <span className="acp-level">{s.level}</span>
            </div>
          ))}
        </div>
      </div>

      {link && (
        <div className="acp-links-detail">
          <div className="acp-links-detail-h">
            <b>{bookOf(link.subjectSlug)?.name}</b> ⟶ {linkSection.field || linkSection.level}
            <span className="acp-book-meta">
              {linkSection.classes.length ? ` · ${linkSection.classes.map((c) => c.name).join(", ")}` : " · aucune classe dans cette section"}
            </span>
            <span className="grow" />
            <button className="btn btn-secondary btn-sm danger" onClick={doDetach}><Icon name="x" /> Détacher</button>
          </div>
          {link.teachers.length ? (
            <div className="acp-links-teachers">
              <span className="acp-book-meta">Enseignants affectés à ce livre :</span>
              {link.teachers.map((t) => (
                <span key={`${t.id}:${t.classId}`} className={`acp-pill ${t.isLead ? "pub" : "draft"}`}>
                  {t.name} · {t.className}{t.isLead ? " · titulaire" : ""}
                </span>
              ))}
            </div>
          ) : (
            <p className="acp-book-meta" style={{ margin: "6px 0 0" }}>Aucun enseignant n'est affecté à ce livre dans cette section — détachement sans impact.</p>
          )}
          {leadLosses.length > 0 && (
            <p className="acp-links-warn">
              <Icon name="alert" /> En détachant, {leadLosses.map((t) => `${t.className} perdra son titulaire (${t.name})`).join(" ; ")} —
              ces classes disparaîtront de l'écran de connexion des élèves.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminContentPanel({ active }) {
  const [tree, setTree] = useState(null);
  const [selected, setSelected] = useState(null); // subject slug
  const [openModules, setOpenModules] = useState(() => new Set());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newModule, setNewModule] = useState(null); // { title, classLevel } | null
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/content/tree/");
    if (r.ok) {
      const d = await r.json();
      setTree(d);
      setSelected((cur) => cur && d.subjects.some((s) => s.slug === cur) ? cur : d.subjects[0]?.slug ?? null);
    }
  }, []);

  useEffect(() => { if (active && !tree) load(); }, [active, tree, load]);

  if (!active) return null;
  const subject = tree?.subjects.find((s) => s.slug === selected) ?? null;

  // ── mutations ──
  async function createSubject() {
    if (!newName.trim()) return;
    setBusy(true);
    const r = await api("POST", "/api/admin/content/subjects/", { name: newName.trim() });
    setBusy(false);
    if (!r.ok) { toast("Création impossible.", { icon: "alert" }); return; }
    setNewName(""); setCreating(false);
    toast(`Livre « ${r.data.subject.name} » créé ✓`, { icon: "check" });
    await load();
    setSelected(r.data.subject.slug);
  }

  async function removeSubject(slug) {
    if (!window.confirm("Supprimer ce livre et tous ses modules/leçons ? Action irréversible.")) return;
    const r = await api("DELETE", `/api/admin/content/subjects/${slug}/`);
    if (!r.ok) {
      toast(r.status === 409 ? "Impossible : des élèves ont déjà progressé dans ce livre." : "Suppression impossible.", { icon: "alert" });
      return;
    }
    toast("Livre supprimé", { icon: "x" });
    await load();
  }

  async function addModule() {
    if (!newModule?.title?.trim() || !subject) return;
    setBusy(true);
    const r = await api("POST", "/api/admin/content/modules/", {
      subjectSlug: subject.slug, classLevel: newModule.classLevel, title: newModule.title.trim(),
    });
    setBusy(false);
    if (!r.ok) { toast("Création impossible.", { icon: "alert" }); return; }
    setNewModule(null);
    toast("Module créé ✓", { icon: "check" });
    await load();
  }

  async function removeModule(m) {
    const force = m.lessons.length > 0;
    const msg = force
      ? `Supprimer le module « ${m.title} » et ses ${m.lessons.length} leçon(s) ?`
      : `Supprimer le module « ${m.title} » ?`;
    if (!window.confirm(msg)) return;
    const r = await api("DELETE", `/api/admin/content/modules/${m.id}/${force ? "?force=1" : ""}`);
    if (!r.ok) {
      toast(r.status === 409 ? "Impossible : des élèves ont déjà travaillé dans ce module." : "Suppression impossible.", { icon: "alert" });
      return;
    }
    toast("Module supprimé", { icon: "x" });
    await load();
  }

  async function addLesson(moduleId) {
    const r = await api("POST", `/api/admin/content/modules/${moduleId}/lessons/`);
    if (!r.ok) { toast("Création impossible.", { icon: "alert" }); return; }
    // Jump straight into the studio editor for the new draft.
    window.location.href = `/teacher/studio/?lesson=${r.data.lesson.id}`;
  }

  async function removeLesson(l) {
    if (!window.confirm(`Supprimer la leçon « ${l.title} » ?`)) return;
    const r = await api("DELETE", `/api/admin/content/lessons/${l.id}/`);
    if (!r.ok) {
      toast(r.status === 409 ? "Impossible : des élèves ont déjà travaillé cette leçon (repassez-la en brouillon)." : "Suppression impossible.", { icon: "alert" });
      return;
    }
    toast("Leçon supprimée", { icon: "x" });
    await load();
  }

  async function moveLesson(m, index, dir) {
    const ids = m.lessons.map((l) => l.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    await api("PATCH", `/api/admin/content/modules/${m.id}/lessons/`, { order: ids });
    await load();
  }

  async function moveModule(index, dir) {
    if (!subject) return;
    const ids = subject.modules.map((m) => m.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    await api("PATCH", "/api/admin/content/modules/", { subjectSlug: subject.slug, order: ids });
    await load();
  }

  function toggleModule(id) {
    setOpenModules((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="acp teacher-page">
      <div className="acp-banner">
        <Icon name="info" />
        <span>
          Les livres créés ici apparaissent immédiatement dans le <b>tableau de bord des élèves</b> une fois les leçons publiées.
          La page « Manuels » n’affiche que les manuels importés du bundle hors-ligne.
        </span>
        <RagIndexControl />
      </div>

      <div className="acp-grid">
        {/* ── left: books/subjects ── */}
        <div className="acp-books">
          <div className="acp-col-h">
            <span>Livres &amp; matières <b className="acp-count">{tree?.subjects.length ?? "…"}</b></span>
            <button className="btn btn-primary btn-sm" onClick={() => setCreating((c) => !c)}>
              <Icon name="plus" /> Nouveau livre
            </button>
          </div>

          {creating && (
            <div className="acp-new-subject">
              <input
                autoFocus
                placeholder="Nom du livre / matière (ex. Géographie 5e)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") createSubject(); if (e.key === "Escape") setCreating(false); }}
              />
              <button className="btn btn-primary btn-sm" disabled={busy || !newName.trim()} onClick={createSubject}>Créer</button>
            </div>
          )}

          {!tree ? (
            <p className="acp-empty">Chargement…</p>
          ) : (
            tree.subjects.map((s) => (
              <button
                key={s.slug}
                className={`acp-book${s.slug === selected ? " active" : ""}`}
                onClick={() => setSelected(s.slug)}
              >
                <span className="acp-tile" style={{ background: `${s.color}1a`, color: s.color }}>
                  {(s.name || "?")[0].toUpperCase()}
                </span>
                <span className="acp-book-main">
                  <span className="acp-book-name">{s.name}</span>
                  <span className="acp-book-meta">
                    {s.moduleCount} modules · {s.lessonCount} leçons · <b className="ok">{s.publishedCount} en ligne</b>
                  </span>
                </span>
              </button>
            ))
          )}
        </div>

        {/* ── right: selected book detail ── */}
        <div className="acp-detail">
          {!subject ? (
            <p className="acp-empty">Sélectionnez un livre.</p>
          ) : (
            <>
              <div className="acp-detail-head">
                <span className="acp-tile lg" style={{ background: `${subject.color}1a`, color: subject.color }}>
                  {(subject.name || "?")[0].toUpperCase()}
                </span>
                <div className="acp-detail-t">
                  <h2>{subject.name}</h2>
                  <div className="acp-book-meta">{subject.moduleCount} modules · {subject.lessonCount} leçons · {subject.publishedCount} publiées</div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => setImporting(true)}>
                  <Icon name="upload" /> Importer un chapitre
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setNewModule({ title: "", classLevel: "5e" })}>
                  <Icon name="plus" /> Module
                </button>
                <button className="acp-x" title="Supprimer le livre" onClick={() => removeSubject(subject.slug)}>
                  <Icon name="x" />
                </button>
              </div>

              {importing && (
                <ImportModal
                  subject={subject}
                  onClose={() => setImporting(false)}
                  onDone={async () => { await load(); }}
                />
              )}

              {newModule && (
                <div className="acp-new-module">
                  <input
                    autoFocus
                    placeholder="Titre du module (ex. Les climats)"
                    value={newModule.title}
                    onChange={(e) => setNewModule((m) => ({ ...m, title: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") addModule(); if (e.key === "Escape") setNewModule(null); }}
                  />
                  <select value={newModule.classLevel} onChange={(e) => setNewModule((m) => ({ ...m, classLevel: e.target.value }))}>
                    {LEVELS.map((lv) => <option key={lv.v} value={lv.v}>{lv.l}</option>)}
                  </select>
                  <button className="btn btn-primary btn-sm" disabled={busy || !newModule.title.trim()} onClick={addModule}>Créer</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setNewModule(null)}>Annuler</button>
                </div>
              )}

              {subject.modules.length === 0 && (
                <div className="acp-empty-card">
                  <Icon name="layers" />
                  <p>Aucun module. Créez le premier module de ce livre, puis ajoutez-y des leçons.</p>
                </div>
              )}

              {subject.modules.map((m, mi) => {
                const open = openModules.has(m.id);
                return (
                  <div className={`acp-module${open ? " open" : ""}`} key={m.id}>
                    <div className="acp-module-h" onClick={() => toggleModule(m.id)}>
                      <span className="acp-module-chev"><Icon name={open ? "chevD" : "chevR"} /></span>
                      <span className="acp-module-title">{m.title}</span>
                      <span className="acp-level">{m.classLevel}</span>
                      <span className="acp-count">{m.lessons.length}</span>
                      <span className="acp-module-tools" onClick={(e) => e.stopPropagation()}>
                        <button title="Monter" onClick={() => moveModule(mi, -1)} disabled={mi === 0}>↑</button>
                        <button title="Descendre" onClick={() => moveModule(mi, 1)} disabled={mi === subject.modules.length - 1}>↓</button>
                        <button className="danger" title="Supprimer le module" onClick={() => removeModule(m)}><Icon name="x" /></button>
                      </span>
                    </div>

                    {open && (
                      <div className="acp-lessons">
                        {m.lessons.map((l, li) => {
                          const st = STATUS_PILL[l.status] || STATUS_PILL.DRAFT;
                          return (
                            <div className="acp-lesson" key={l.id}>
                              <span className="acp-lnum">{li + 1}</span>
                              <a className="acp-ltitle" href={`/teacher/studio/?lesson=${l.id}`} title="Ouvrir dans le Studio">
                                {l.title}
                              </a>
                              {l.hasQuiz && <span className="acp-chip" title="Quiz présent"><Icon name="target" /></span>}
                              <span className={`acp-pill ${st.cls}`}>{st.label}</span>
                              <span className="acp-lesson-tools">
                                <button title="Monter" onClick={() => moveLesson(m, li, -1)} disabled={li === 0}>↑</button>
                                <button title="Descendre" onClick={() => moveLesson(m, li, 1)} disabled={li === m.lessons.length - 1}>↓</button>
                                <a className="acp-edit" href={`/teacher/studio/?lesson=${l.id}`} title="Ouvrir dans le Studio"><Icon name="edit" /></a>
                                <button
                                  className="danger"
                                  title={l.progressCount > 0 ? "Des élèves ont travaillé cette leçon" : "Supprimer"}
                                  disabled={l.progressCount > 0}
                                  onClick={() => removeLesson(l)}
                                >
                                  <Icon name="x" />
                                </button>
                              </span>
                            </div>
                          );
                        })}
                        <button className="acp-add-lesson" onClick={() => addLesson(m.id)}>
                          <Icon name="plus" /> Nouvelle leçon dans ce module
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
