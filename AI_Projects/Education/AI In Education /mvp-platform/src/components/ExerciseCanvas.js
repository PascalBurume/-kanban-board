"use client";
import { useRef, useState, useLayoutEffect, useEffect, useCallback, useMemo } from "react";
import Icon from "@/components/ui/Icon";
import "./ExerciseCanvas.css";

// Exercise ↔ programme connector for the teacher « Exercices » page. Same
// dependency-free mechanics as ModuleConnector (pointer events + SVG beziers
// recomputed from live DOM rects), but with two edge kinds:
//  • one warm edge per custom-exercise link (module anchor or lesson row);
//  • one dashed "bundle" edge per chapter's book-exercise group — they all
//    point at their own chapter, so individual arrows would only add noise.

function bezier(x1, y1, x2, y2) {
  const dx = Math.max(40, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function excerpt(e) {
  if (e.title) return e.title;
  const t = (e.statementMd || "").replace(/[#*$`>\n]+/g, " ").replace(/\s{2,}/g, " ").trim();
  return t.length > 64 ? `${t.slice(0, 64)}…` : t || "Exercice";
}

export default function ExerciseCanvas({ subject, search, flaggedOnly = false, onConnect, onDetach, onOpenCustom, onOpenBook, onDelete, onAdvise, advisedId }) {
  const modules = useMemo(() => subject?.modules || [], [subject]);
  const custom = useMemo(() => subject?.custom || [], [subject]);

  const innerRef = useRef(null);
  const cardRefs = useRef(new Map()); // custom exercise id -> card el
  const groupRefs = useRef(new Map()); // module id -> book-group header el
  const nodeRefs = useRef(new Map()); // module id -> module header el
  const lessonRefs = useRef(new Map()); // lesson id -> row el

  const [openGroups, setOpenGroups] = useState(() => new Set()); // book accordions
  const [openModules, setOpenModules] = useState(() => new Set()); // right-side nodes
  const [edges, setEdges] = useState([]); // custom links
  const [bundles, setBundles] = useState([]); // chapter book-exercise bundles
  const [drag, setDrag] = useState(null); // { exId, x1, y1, cx, cy, hoverKey }
  const [busyId, setBusyId] = useState(null);
  const [hoverEx, setHoverEx] = useState(null); // dim other edges while hovering a card

  const lessonModule = useMemo(() => {
    const map = new Map();
    for (const m of modules) for (const l of m.lessons) map.set(l.id, m.id);
    return map;
  }, [modules]);
  const moduleTitles = useMemo(() => new Map(modules.map((m) => [m.id, m.title])), [modules]);
  const lessonTitles = useMemo(() => {
    const map = new Map();
    for (const m of modules) for (const l of m.lessons) map.set(l.id, l.title);
    return map;
  }, [modules]);

  const q = (search || "").trim().toLowerCase();
  // A book exercise passes the current filters (search text + "À vérifier" toggle).
  const bookMatch = (e) =>
    (!flaggedOnly || e.complete === false) &&
    (!q || (e.section + " " + e.text).toLowerCase().includes(q));
  const visibleCustom = q
    ? custom.filter((e) => (e.title + " " + e.statementMd).toLowerCase().includes(q))
    : custom;

  const toContent = useCallback((cx, cy) => {
    const ir = innerRef.current?.getBoundingClientRect();
    return { x: cx - (ir?.left || 0), y: cy - (ir?.top || 0) };
  }, []);

  const recompute = useCallback(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const ir = inner.getBoundingClientRect();
    const rel = (el, side) => {
      const r = el.getBoundingClientRect();
      return side === "right"
        ? { x: r.right - ir.left, y: r.top - ir.top + r.height / 2 }
        : { x: r.left - ir.left, y: r.top - ir.top + r.height / 2 };
    };

    const nextEdges = [];
    for (const e of visibleCustom) {
      const c = cardRefs.current.get(e.id);
      if (!c) continue;
      const from = rel(c, "right");
      for (const link of e.links) {
        // Lesson links land on the row when its module is expanded, otherwise
        // they fall back to the module header so the arrow never dangles.
        let targetEl = null;
        if (link.lessonId) targetEl = lessonRefs.current.get(link.lessonId) || nodeRefs.current.get(lessonModule.get(link.lessonId));
        else if (link.moduleId) targetEl = nodeRefs.current.get(link.moduleId);
        if (!targetEl) continue;
        const to = rel(targetEl, "left");
        nextEdges.push({ id: link.id, exId: e.id, lesson: !!link.lessonId && !!lessonRefs.current.get(link.lessonId), x1: from.x, y1: from.y, x2: to.x, y2: to.y });
      }
    }
    setEdges(nextEdges);

    const nextBundles = [];
    for (const m of modules) {
      if (!m.bookExercises?.length) continue;
      const g = groupRefs.current.get(m.id);
      const n = nodeRefs.current.get(m.id);
      if (!g || !n) continue;
      const from = rel(g, "right");
      const to = rel(n, "left");
      nextBundles.push({ id: m.id, count: m.bookExercises.length, x1: from.x, y1: from.y, x2: to.x, y2: to.y });
    }
    setBundles(nextBundles);
  }, [visibleCustom, modules, lessonModule]);

  useLayoutEffect(() => { recompute(); }, [recompute, openGroups, openModules]);
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(recompute); };
    const ro = new ResizeObserver(schedule);
    ro.observe(inner);
    window.addEventListener("resize", schedule);
    return () => { ro.disconnect(); window.removeEventListener("resize", schedule); cancelAnimationFrame(raf); };
  }, [recompute]);

  const toggleSet = (setter) => (id) =>
    setter((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleGroup = toggleSet(setOpenGroups);
  const toggleModule = toggleSet(setOpenModules);

  // Drop target under the cursor: a lesson row (precise link) or a module header.
  function targetAt(cx, cy) {
    const el = document.elementFromPoint(cx, cy);
    const row = el?.closest?.(".exc-lrow");
    if (row) return { lessonId: row.dataset.lid, moduleId: null, key: `l:${row.dataset.lid}` };
    const node = el?.closest?.(".exc-node");
    if (node) return { lessonId: null, moduleId: node.dataset.mid, key: `m:${node.dataset.mid}` };
    return null;
  }

  function startDrag(e, ex) {
    e.preventDefault();
    e.stopPropagation();
    const card = cardRefs.current.get(ex.id);
    const ir = innerRef.current.getBoundingClientRect();
    const cr = card.getBoundingClientRect();
    const p = toContent(e.clientX, e.clientY);
    setDrag({ exId: ex.id, x1: cr.right - ir.left, y1: cr.top - ir.top + cr.height / 2, cx: p.x, cy: p.y, hoverKey: null });
  }

  useEffect(() => {
    if (!drag) return;
    function move(e) {
      const p = toContent(e.clientX, e.clientY);
      const t = targetAt(e.clientX, e.clientY);
      setDrag((d) => (d ? { ...d, cx: p.x, cy: p.y, hoverKey: t?.key || null } : d));
    }
    async function up(e) {
      const t = targetAt(e.clientX, e.clientY);
      const exId = drag.exId;
      setDrag(null);
      if (t) {
        setBusyId(exId);
        await onConnect(exId, { moduleId: t.moduleId, lessonId: t.lessonId });
        setBusyId(null);
      }
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [drag, onConnect, toContent]);

  const dragging = !!drag;
  const dimming = hoverEx != null && !dragging;

  return (
    <div className="exc-scroll">
      <div className="exc-inner" ref={innerRef}>
        <svg className="exc-edges" width="100%" height="100%">
          <defs>
            <marker id="exc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--indigo-400)" />
            </marker>
            <marker id="exc-arrow-book" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--slate-300)" />
            </marker>
          </defs>
          {bundles.map((b) => (
            <g key={b.id} className={dimming ? "exc-dim" : ""}>
              <path className="exc-edge bundle" d={bezier(b.x1, b.y1, b.x2, b.y2)} markerEnd="url(#exc-arrow-book)" />
            </g>
          ))}
          {edges.map((e) => (
            <path
              key={e.id}
              className={`exc-edge custom${e.lesson ? " lesson" : ""}${dimming && hoverEx !== e.exId ? " exc-dim" : ""}${hoverEx === e.exId ? " lit" : ""}`}
              d={bezier(e.x1, e.y1, e.x2, e.y2)}
              markerEnd="url(#exc-arrow)"
            />
          ))}
          {drag && <path className="exc-edge dragging" d={bezier(drag.x1, drag.y1, drag.cx, drag.cy)} markerEnd="url(#exc-arrow)" />}
        </svg>

        {/* ── left: exercises ── */}
        <div className="exc-col exc-col-ex">
          <div className="exc-col-h">Mes exercices <span className="exc-count">{visibleCustom.length}</span></div>
          {visibleCustom.length === 0 && (
            <div className="exc-empty">
              {q ? "Aucun exercice ne correspond à la recherche." : "Créez votre premier exercice — bouton « Nouvel exercice » ci-dessus, ou demandez au Copilot."}
            </div>
          )}
          {visibleCustom.map((e) => (
            <div
              key={e.id}
              ref={(el) => { if (el) cardRefs.current.set(e.id, el); else cardRefs.current.delete(e.id); }}
              className={`exc-card${busyId === e.id ? " busy" : ""}${advisedId === e.id ? " advised" : ""}`}
              onMouseEnter={() => setHoverEx(e.id)}
              onMouseLeave={() => setHoverEx((h) => (h === e.id ? null : h))}
            >
              <div className="exc-card-main" onClick={() => onOpenCustom(e)}>
                <span className="exc-card-dot" />
                <span className="exc-card-title">{excerpt(e)}</span>
                <button
                  className="exc-card-ai"
                  title="Analyser avec le Copilot"
                  onClick={(ev) => { ev.stopPropagation(); onAdvise({ kind: "custom", ex: e }); }}
                >
                  <Icon name="sparkles" />
                </button>
                {e.mine && (
                  <button className="exc-card-x" title="Supprimer mon exercice" onClick={(ev) => { ev.stopPropagation(); onDelete(e); }}>
                    <Icon name="x" />
                  </button>
                )}
              </div>
              <div className="exc-card-meta">
                {e.links.length === 0 && <span className="exc-pill unlinked">Non relié</span>}
                {e.links.map((link) => (
                  <span key={link.id} className={`exc-pill${link.lessonId ? " lesson" : ""}`}>
                    <Icon name={link.lessonId ? "file" : "layers"} />
                    {link.lessonId ? lessonTitles.get(link.lessonId) || "Leçon" : moduleTitles.get(link.moduleId) || "Chapitre"}
                    {e.mine && (
                      <button className="exc-pill-x" title="Détacher" onClick={() => onDetach(e, link)}><Icon name="x" /></button>
                    )}
                  </span>
                ))}
              </div>
              {e.mine && <span className="exc-handle" title="Glisser vers un chapitre ou une leçon" onPointerDown={(ev) => startDrag(ev, e)} />}
            </div>
          ))}

          <div className="exc-col-h book">Exercices du manuel <span className="exc-count">{modules.reduce((n, m) => n + (m.bookExercises?.filter(bookMatch).length || 0), 0)}</span></div>
          {modules.filter((m) => (m.bookExercises || []).some(bookMatch)).map((m) => {
            // When filtering to flagged exercises, force the group open so the
            // teacher sees them without expanding each chapter.
            const open = flaggedOnly || openGroups.has(m.id);
            const list = m.bookExercises.filter(bookMatch);
            return (
              <div key={m.id} className={`exc-group${open ? " open" : ""}`}>
                <div
                  className="exc-group-h"
                  ref={(el) => { if (el) groupRefs.current.set(m.id, el); else groupRefs.current.delete(m.id); }}
                  onClick={() => toggleGroup(m.id)}
                >
                  <span className="exc-group-ic"><Icon name="lock" /></span>
                  <span className="exc-group-title">Ch. {m.order} — {m.title}</span>
                  <span className="exc-count">{m.bookExercises.length}</span>
                  <span className="exc-chev"><Icon name={open ? "chevD" : "chevR"} /></span>
                </div>
                {open && (
                  <div className="exc-group-list">
                    {list.map((e) => (
                      <div key={e.id} className={`exc-brow${advisedId === `book:${e.id}` ? " advised" : ""}`} onClick={() => onOpenBook(e, m)}>
                        <span className="exc-bnum">{e.n ?? "•"}</span>
                        <span className="exc-btitle">{e.section || `Exercice ${e.n ?? ""}`}</span>
                        {e.fixed
                          ? <span className="exc-btag prof" title="Corrigé par un enseignant — remplace la reconstruction IA">Corrigé prof</span>
                          : e.complete === false
                            ? <span className="exc-btag todo" title="La reconstruction a été coupée — à compléter avant de la donner aux élèves">À compléter</span>
                            : e.quality === "ocr"
                              ? <span className="exc-btag draft">Brouillon</span>
                              : e.reconstructed
                                ? <span className="exc-btag ai" title="Énoncé et corrigé reconstruits par l'IA à partir d'un scan — à vérifier">Reconstruit IA</span>
                                : e.solution && <span className="exc-btag">Corrigé</span>}
                        <button
                          className="exc-card-ai"
                          title="Analyser avec le Copilot"
                          onClick={(ev) => { ev.stopPropagation(); onAdvise({ kind: "book", ex: e, module: m, subjectSlug: subject.slug }); }}
                        >
                          <Icon name="sparkles" />
                        </button>
                      </div>
                    ))}
                    {list.length === 0 && <div className="exc-empty">Aucun exercice ne correspond.</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── right: programme (modules → lessons) ── */}
        <div className="exc-col exc-col-prog">
          <div className="exc-col-h">Programme <span className="exc-count">{modules.length}</span></div>
          {modules.map((m) => {
            const open = openModules.has(m.id);
            return (
              <div key={m.id} className={`exc-module${open ? " open" : ""}`}>
                <div
                  ref={(el) => { if (el) nodeRefs.current.set(m.id, el); else nodeRefs.current.delete(m.id); }}
                  className={`exc-node${drag?.hoverKey === `m:${m.id}` ? " hover" : ""}${dragging ? " targetable" : ""}`}
                  data-mid={m.id}
                  onClick={() => toggleModule(m.id)}
                >
                  <span className="exc-anchor" />
                  <span className="exc-node-ic"><Icon name={subject?.icon || "layers"} /></span>
                  <span className="exc-node-title">M{m.order} · {m.title}</span>
                  <span className="exc-count">{m.lessons.length} leçons</span>
                  <span className="exc-chev"><Icon name={open ? "chevD" : "chevR"} /></span>
                </div>
                {open && (
                  <div className="exc-lessons">
                    {m.lessons.map((l, i) => (
                      <div
                        key={l.id}
                        ref={(el) => { if (el) lessonRefs.current.set(l.id, el); else lessonRefs.current.delete(l.id); }}
                        className={`exc-lrow${drag?.hoverKey === `l:${l.id}` ? " hover" : ""}${dragging ? " targetable" : ""}`}
                        data-lid={l.id}
                      >
                        <span className="exc-lnum">{i + 1}</span>
                        <span className="exc-ltitle">{l.title}</span>
                      </div>
                    ))}
                    {m.lessons.length === 0 && <div className="exc-empty">Aucune leçon publiée.</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
