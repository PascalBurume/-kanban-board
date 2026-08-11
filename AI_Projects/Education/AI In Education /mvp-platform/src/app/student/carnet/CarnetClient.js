"use client";
import "./carnet.css";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Icon from "@/components/ui/Icon";
import LessonWriter from "@/components/LessonWriter";
import CarnetCopilot from "@/components/CarnetCopilot";
import ResizeGrip from "@/components/ui/ResizeGrip";
import { useOfflineDoc, syncAllDirty, saveLabel } from "@/lib/useOfflineDoc";
import { listDocs, loadDoc, putServerDoc, saveDoc, markDeleted, deleteDoc } from "@/lib/localDocs";
import { extractFormulas } from "@/lib/formulas";
import { toast } from "@/lib/toast";

const KIND = "notebook";

// One notebook -> the server. Offline creates and edits use the same idempotent
// upsert, so a doc replayed twice after a reconnect is harmless.
async function pushNotebook(doc) {
  if (doc.deleted) {
    const r = await fetch(`/api/student/notebooks/${doc.id}/`, { method: "DELETE", credentials: "same-origin" });
    // A tombstone for something the server never received is already satisfied.
    if (r.ok || r.status === 404) return { ok: true };
    if (r.status === 401 || r.status === 403) return { ok: false, auth: true };
    return { ok: false };
  }
  const r = await fetch("/api/student/notebooks/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      id: doc.id,
      title: doc.title,
      subjectSlug: doc.subjectSlug,
      contentMd: doc.contentMd,
      clientUpdatedAt: doc.updatedAt,
    }),
  });
  if (r.ok) return { ok: true };
  if (r.status === 401 || r.status === 403) return { ok: false, auth: true };
  if (r.status === 409) {
    const body = await r.json().catch(() => ({}));
    return { ok: false, conflict: body.notebook || null };
  }
  return { ok: false };
}

function fmtDate(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? `aujourd'hui · ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
    : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function CarnetClient() {
  const [docId, setDocId] = useState(null);
  const [ready, setReady] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [notebooks, setNotebooks] = useState([]); // list view rows
  const [title, setTitle] = useState("");
  const [subjectSlug, setSubjectSlug] = useState(null);
  const [md, setMd] = useState("");
  const [tab, setTab] = useState("contenu");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Auto-hidden: the carnet opens as a page to write and read on, not as a word
  // processor. The ribbon wraps to four rows on a laptop and took more height
  // than the text under it, so it is summoned from the header when wanted rather
  // than sitting there by default. The choice is remembered, so a student who
  // does want it open keeps it open.
  const [ribbonOpen, setRibbonOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  // Panel width. 320px is fine for a chip and one sentence, and cramped for a
  // worked answer with a formula in it — which is most of what this panel
  // returns. Remembered per device: it is a screen-size preference, not account data.
  const [copilotW, setCopilotW] = useState(320);
  const [notFound, setNotFound] = useState(false);
  const seeded = useRef(false);
  // Handed over by LessonWriter once TipTap is live, so Copilot text can land at
  // the caret instead of being appended to the bottom of the page.
  const writerRef = useRef(null);

  // Restore the remembered panel width. After mount, so the server render and the
  // first client render agree.
  useEffect(() => {
    const saved = Number(window.localStorage.getItem("mwalimu.carnet.copilotW"));
    if (Number.isFinite(saved) && saved >= 280 && saved <= 620) setCopilotW(saved);
    // Only an explicit "1" reopens it — an absent key means a first visit, which
    // should get the hidden default.
    if (window.localStorage.getItem("mwalimu.carnet.ribbon") === "1") setRibbonOpen(true);
  }, []);

  // ---- routing: ?id= selects the notebook, list view otherwise ----
  useEffect(() => {
    const read = () => setDocId(new URLSearchParams(window.location.search).get("id"));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  function openDoc(id) {
    window.history.pushState({}, "", `/student/carnet/?id=${id}`);
    seeded.current = false;
    setDocId(id);
    setTab("contenu");
  }
  function backToList() {
    window.history.pushState({}, "", "/student/carnet/");
    setDocId(null);
  }

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const apply = () => setSidebarOpen(!mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const push = useCallback((doc) => pushNotebook(doc), []);
  const { status, lastSyncedAt, saveLocal, forceSync } = useOfflineDoc({ kind: KIND, id: docId, push });

  // ---- the local list is authoritative; the server list is merged on top ----
  const refreshList = useCallback(async () => {
    const local = await listDocs(KIND);
    const byId = new Map(local.filter((d) => !d.deleted).map((d) => [d.id, { ...d, source: "local" }]));

    const server = await fetch("/api/student/notebooks/", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

    if (server) {
      setSubjects(server.subjects || []);
      for (const n of server.notebooks || []) {
        const localDoc = byId.get(n.id);
        if (n.deleted) {
          // Deleted elsewhere: drop it here too, unless this device has unsent edits.
          if (!localDoc?.dirty) {
            byId.delete(n.id);
            await deleteDoc(KIND, n.id);
          }
          continue;
        }
        // Only adopt the server row when this device has nothing newer pending.
        if (!localDoc || (!localDoc.dirty && n.clientUpdatedAt > localDoc.updatedAt)) {
          byId.set(n.id, { id: n.id, title: n.title, subjectSlug: n.subjectSlug, updatedAt: n.clientUpdatedAt, dirty: false });
        }
      }
      syncAllDirty(KIND, pushNotebook).then((n) => {
        if (n > 0) refreshList();
      });
    }

    setNotebooks([...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt));
    setReady(true);
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  // ---- load the open notebook: device copy first, server only if it is ahead ----
  useEffect(() => {
    if (!docId) return;
    let cancelled = false;
    (async () => {
      const local = await loadDoc(KIND, docId);
      if (!cancelled && local) {
        setTitle(local.title);
        setSubjectSlug(local.subjectSlug ?? null);
        setMd(local.contentMd);
        seeded.current = true;
      }

      const r = await fetch(`/api/student/notebooks/${docId}/`, { credentials: "same-origin" }).catch(() => null);
      if (cancelled) return;
      if (!r?.ok) {
        // No server answer is normal offline — only a real 404 with nothing local is fatal.
        if (r && r.status === 404 && !local) setNotFound(true);
        if (!local) setReady(true);
        return;
      }
      const { notebook } = await r.json();
      const staleLocal = local && !local.dirty && notebook.clientUpdatedAt > local.updatedAt;
      if (!local || staleLocal) {
        await putServerDoc({
          kind: KIND,
          id: notebook.id,
          title: notebook.title,
          subjectSlug: notebook.subjectSlug,
          contentMd: notebook.contentMd || "",
          updatedAt: notebook.clientUpdatedAt,
        });
        setTitle(notebook.title);
        setSubjectSlug(notebook.subjectSlug ?? null);
        setMd(notebook.contentMd || "");
        seeded.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docId]);

  const edit = useCallback(
    (next) => {
      if (!docId || !seeded.current) return;
      const fields = { title, subjectSlug, contentMd: md, ...next };
      if (next.title !== undefined) setTitle(next.title);
      if (next.contentMd !== undefined) setMd(next.contentMd);
      if (next.subjectSlug !== undefined) setSubjectSlug(next.subjectSlug);
      saveLocal(fields);
    },
    [docId, title, subjectSlug, md, saveLocal],
  );

  async function createNotebook(slug) {
    const id = crypto.randomUUID();
    const subject = subjects.find((s) => s.slug === slug);
    await saveDoc({
      kind: KIND,
      id,
      title: subject ? `Notes — ${subject.name}` : "Sans titre",
      subjectSlug: slug ?? null,
      contentMd: "",
    });
    // Fire-and-forget: if the server is down the doc is already safe on the device.
    pushNotebook({ id, title: subject ? `Notes — ${subject.name}` : "Sans titre", subjectSlug: slug ?? null, contentMd: "", updatedAt: Date.now() });
    await refreshList();
    openDoc(id);
  }

  async function removeNotebook(id) {
    if (!window.confirm("Supprimer ce carnet ? Cette action est définitive.")) return;
    await markDeleted(KIND, id);
    const res = await pushNotebook({ id, deleted: true });
    if (res.ok) await deleteDoc(KIND, id);
    await refreshList();
    toast("Carnet supprimé", { icon: "check" });
    if (docId === id) backToList();
  }

  const onWriterReady = useCallback((api) => { writerRef.current = api; }, []);

  // Copilot reads the notes server-side, so the server's copy has to be the current
  // one before the student can ask anything about it. Opening the panel flushes the
  // pending save instead of waiting out the debounce.
  useEffect(() => {
    if (copilotOpen) forceSync();
  }, [copilotOpen, forceSync]);

  // Cursor insert when the editor can model the text; otherwise append the source,
  // because dropping a Copilot answer on the floor is worse than a plainer paste.
  function insertFromCopilot(text) {
    const trimmed = (text || "").trim();
    if (!trimmed) return;
    setTab("contenu");
    if (writerRef.current?.insertMarkdown?.(trimmed)) {
      toast("Inséré dans le carnet ✓", { icon: "check" });
      return;
    }
    edit({ contentMd: md ? `${md}\n\n${trimmed}` : trimmed });
    toast("Ajouté à la fin du carnet ✓", { icon: "check" });
  }

  const formulas = useMemo(() => extractFormulas(md), [md]);
  const brokenCount = formulas.filter((f) => !f.ok || f.suspect).length;
  const grouped = useMemo(() => {
    const bySubject = new Map();
    for (const n of notebooks) {
      const key = n.subjectSlug || "";
      if (!bySubject.has(key)) bySubject.set(key, []);
      bySubject.get(key).push(n);
    }
    return bySubject;
  }, [notebooks]);

  const subjectName = (slug) => subjects.find((s) => s.slug === slug)?.name || "Autres notes";

  // ───────────────────────── list view ─────────────────────────
  if (!docId) {
    return (
      <div className="cn-start">
        <header className="cn-start-head">
          <div>
            <h1>Mon carnet</h1>
            <p className="cn-start-sub">
              Vos notes de maths, physique et chimie. Tout s'enregistre d'abord sur cet appareil : vous pouvez
              écrire même sans connexion.
            </p>
          </div>
          <a className="cn-start-back" href="/student/">← Tableau de bord</a>
        </header>

        <section>
          <h2>Nouveau carnet</h2>
          <div className="cn-start-row">
            {subjects.map((s) => (
              <button key={s.slug} className="btn btn-primary btn-sm" onClick={() => createNotebook(s.slug)}>
                <Icon name="plus" /> {s.name}
              </button>
            ))}
            <button className="btn btn-secondary btn-sm" onClick={() => createNotebook(null)}>
              <Icon name="plus" /> Note libre
            </button>
          </div>
        </section>

        <section>
          <h2>Mes carnets</h2>
          {!ready ? (
            <p className="cn-start-none">Chargement…</p>
          ) : notebooks.length === 0 ? (
            <p className="cn-start-none">Vous n'avez pas encore de carnet. Choisissez une matière ci-dessus pour commencer.</p>
          ) : (
            [...grouped.entries()].map(([slug, rows]) => (
              <div key={slug || "libre"} className="cn-group">
                <h3>{subjectName(slug)}</h3>
                <ul className="cn-list">
                  {rows.map((n) => (
                    <li key={n.id}>
                      <button className="cn-item" onClick={() => openDoc(n.id)}>
                        <Icon name="book" />
                        <span className="t">{n.title}</span>
                        <span className="d">{fmtDate(n.updatedAt)}</span>
                        {n.dirty && <span className="cn-dot" title="Pas encore synchronisé" />}
                      </button>
                      <button className="cn-del" onClick={() => removeNotebook(n.id)} title="Supprimer">
                        <Icon name="x" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="cn-empty">
        <Icon name="alert" />
        <p>Carnet introuvable.</p>
        <button className="btn btn-secondary btn-sm" onClick={backToList}>Retour à mes carnets</button>
      </div>
    );
  }

  // ───────────────────────── editor view ─────────────────────────
  return (
    <div className="cn-page">
      <header className="cn-head">
        <button className="cn-back" onClick={backToList} title="Mes carnets"><Icon name="grid" /></button>
        <button className="cn-sidetoggle" onClick={() => setSidebarOpen((o) => !o)} aria-expanded={sidebarOpen}>
          <Icon name="layers" /> {sidebarOpen ? "Masquer" : "Carnets"}
        </button>
        {/* Summons the auto-hidden ribbon. It has to look like an available tool
            rather than a state readout, or a student who has never seen the
            toolbar has no reason to guess there is one. */}
        <button
          className={`cn-tooltoggle${ribbonOpen ? " on" : ""}`}
          onClick={() =>
            setRibbonOpen((o) => {
              window.localStorage.setItem("mwalimu.carnet.ribbon", o ? "0" : "1");
              return !o;
            })
          }
          aria-expanded={ribbonOpen}
          aria-controls="cn-ribbon"
          title={ribbonOpen ? "Masquer la barre d'outils" : "Afficher la barre d'outils (mise en forme, formules, symboles)"}
        >
          <Icon name="edit" /> <span>{ribbonOpen ? "Masquer les outils" : "Outils d'écriture"}</span>
        </button>
        <input
          className="cn-title"
          value={title}
          onChange={(e) => edit({ title: e.target.value })}
          placeholder="Titre du carnet"
        />
        <select className="cn-subject" value={subjectSlug || ""} onChange={(e) => edit({ subjectSlug: e.target.value || null })}>
          <option value="">Note libre</option>
          {subjects.map((s) => (
            <option key={s.slug} value={s.slug}>{s.name}</option>
          ))}
        </select>
        <span className={`cn-save${status === "offline" ? " off" : ""}${status === "auth" ? " bad" : ""}`}>
          <span className="dot" />
          {saveLabel(status, lastSyncedAt)}
        </span>
        {(status === "offline" || status === "auth") && (
          <button className="btn btn-secondary btn-sm" onClick={forceSync}>Réessayer</button>
        )}
        <button
          className={`btn btn-sm ${copilotOpen ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setCopilotOpen((o) => !o)}
          title="Assistant de révision"
        >
          <Icon name="sparkles" /> Copilot
        </button>
        <button className="btn btn-secondary btn-sm cn-print" onClick={() => window.print()} title="Imprimer ou enregistrer en PDF">
          <Icon name="download" /> Imprimer
        </button>
      </header>

      <div className="cn-body" style={{ "--cop-w": `${copilotW}px` }}>
        <aside className="cn-side" hidden={!sidebarOpen}>
          <p className="cn-side-l">Mes carnets</p>
          <ul>
            {notebooks.map((n) => (
              <li key={n.id}>
                <button className={n.id === docId ? "on" : ""} onClick={() => openDoc(n.id)}>
                  <span className="t">{n.title}</span>
                  <span className="s">{subjectName(n.subjectSlug)}</span>
                </button>
              </li>
            ))}
          </ul>
          <button className="btn btn-secondary btn-sm cn-side-new" onClick={() => createNotebook(subjectSlug)}>
            <Icon name="plus" /> Nouveau
          </button>
        </aside>

        <main className="cn-main">
          <nav className="cn-tabs">
            {[
              ["contenu", "Contenu", null],
              ["formules", "Formules", brokenCount || null],
            ].map(([k, label, badge]) => (
              <button key={k} className={`cn-tab${tab === k ? " active" : ""}`} onClick={() => setTab(k)}>
                {label}
                {badge != null && <span className="cn-badge warn">{badge}</span>}
              </button>
            ))}
          </nav>

          {/* The editor stays mounted across tabs: unmounting it would drop the
              caret Copilot inserts at, and rebuild the whole document for nothing. */}
          <div className="cn-writer" hidden={tab !== "contenu"}>
            <LessonWriter
              value={md}
              onChange={(v) => { if (v === md) return; edit({ contentMd: v }); }}
              saveState={saveLabel(status, lastSyncedAt)}
              onReady={onWriterReady}
              ribbonHidden={!ribbonOpen}
            />
          </div>

          {tab === "formules" && (
            <div className="cn-pane">
              {formulas.length === 0 ? (
                <p className="cn-none">Aucune formule dans ce carnet.</p>
              ) : (
                <ul className="cn-formulas">
                  {formulas.map((f, i) => (
                    <li key={i} className={!f.ok || f.suspect ? "bad" : ""}>
                      <code>{f.tex}</code>
                      {!f.ok && <span className="why">{f.error || "ne s'affiche pas"}</span>}
                      {f.ok && f.suspect && <span className="why">à vérifier — une commande semble incomplète</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </main>

        {copilotOpen && (
          <aside className="cn-copilot">
            <ResizeGrip
              value={copilotW}
              min={280}
              max={620}
              side="left"
              label="Largeur du Copilot"
              onChange={setCopilotW}
              onCommit={(v) => window.localStorage.setItem("mwalimu.carnet.copilotW", String(v))}
            />
            {/* The server reads the notes straight from the database, so the panel
                does not need the text — only which notebook is open. */}
            <CarnetCopilot notebookId={docId} onInsert={insertFromCopilot} onClose={() => setCopilotOpen(false)} />
          </aside>
        )}
      </div>
    </div>
  );
}
