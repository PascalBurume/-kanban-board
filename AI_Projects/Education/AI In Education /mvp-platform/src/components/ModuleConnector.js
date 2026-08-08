"use client";
import { useRef, useState, useLayoutEffect, useEffect, useCallback } from "react";
import Icon from "@/components/ui/Icon";
import "./ModuleConnector.css";

// Visual connector: drag a library lesson's handle onto a module (or, when the module is
// expanded, onto a precise slot among its lessons) to draw an arrow + set its position.
// Connect + publish = delivered to students. Dependency-free: pointer events + SVG.

function bezier(x1, y1, x2, y2) {
  const dx = Math.max(40, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

// Classify a lesson for colour + label. "mine" = authored by this teacher (in the library
// set); own + published is flagged RED so the teacher spots their live lessons to update.
function mark(l, mineIds) {
  const mine = mineIds.has(l.id);
  const pub = l.status === "PUBLISHED";
  if (mine) return { mine, color: pub ? "var(--danger-fg)" : "var(--warning-fg)", label: pub ? "En ligne" : "Brouillon", live: pub };
  if (l.authorId == null) return { mine, color: pub ? "var(--success)" : "var(--slate-300)", label: pub ? "Manuel" : "Brouillon", live: false };
  return { mine, color: "var(--slate-300)", label: pub ? "En ligne" : "Brouillon", live: false };
}

export default function ModuleConnector({ subject, onConnect, onPublish, onOpenLesson, onDelete }) {
  const library = subject?.library || [];
  const modules = subject?.modules || [];
  const mineIds = new Set(library.map((l) => l.id));
  const moduleTitle = useCallback((id) => modules.find((m) => m.id === id)?.title || "", [modules]);

  const innerRef = useRef(null);
  const cardRefs = useRef(new Map());
  const nodeRefs = useRef(new Map()); // moduleId -> header element (arrow anchor + drop)
  const [expanded, setExpanded] = useState(() => new Set());
  const [edges, setEdges] = useState([]);
  const [drag, setDrag] = useState(null); // { lessonId, x1, y1, cx, cy, hoverKey }
  const [busyId, setBusyId] = useState(null);

  const toContent = useCallback((cx, cy) => {
    const ir = innerRef.current?.getBoundingClientRect();
    return { x: cx - (ir?.left || 0), y: cy - (ir?.top || 0) };
  }, []);

  const recompute = useCallback(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const ir = inner.getBoundingClientRect();
    const next = [];
    for (const l of library) {
      if (!l.moduleId) continue;
      const c = cardRefs.current.get(l.id);
      const n = nodeRefs.current.get(l.moduleId);
      if (!c || !n) continue;
      const cr = c.getBoundingClientRect();
      const nr = n.getBoundingClientRect();
      next.push({ id: l.id, x1: cr.right - ir.left, y1: cr.top - ir.top + cr.height / 2, x2: nr.left - ir.left, y2: nr.top - ir.top + nr.height / 2 });
    }
    setEdges(next);
  }, [library]);

  useLayoutEffect(() => { recompute(); }, [recompute, modules, expanded]);
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => recompute());
    ro.observe(inner);
    window.addEventListener("resize", recompute);
    return () => { ro.disconnect(); window.removeEventListener("resize", recompute); };
  }, [recompute]);

  function toggle(moduleId) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(moduleId) ? next.delete(moduleId) : next.add(moduleId);
      return next;
    });
  }

  // Resolve the drop target under the cursor: a precise slot (module + position) or a
  // module header (append). Returns { moduleId, position, key } or null.
  function targetAt(cx, cy) {
    const el = document.elementFromPoint(cx, cy);
    const slot = el?.closest?.(".mc-slot");
    if (slot) return { moduleId: slot.dataset.mid, position: Number(slot.dataset.pos), key: `${slot.dataset.mid}:${slot.dataset.pos}` };
    const node = el?.closest?.(".mc-node");
    if (node) return { moduleId: node.dataset.mid, position: null, key: node.dataset.mid };
    return null;
  }

  function startDrag(e, lesson) {
    e.preventDefault();
    e.stopPropagation();
    const card = cardRefs.current.get(lesson.id);
    const ir = innerRef.current.getBoundingClientRect();
    const cr = card.getBoundingClientRect();
    const p = toContent(e.clientX, e.clientY);
    setDrag({ lessonId: lesson.id, x1: cr.right - ir.left, y1: cr.top - ir.top + cr.height / 2, cx: p.x, cy: p.y, hoverKey: null });
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
      const lessonId = drag.lessonId;
      setDrag(null);
      if (t) {
        setBusyId(lessonId);
        await onConnect(lessonId, t.moduleId, t.position);
        setBusyId(null);
      }
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [drag, onConnect, toContent]);

  async function act(fn, lessonId) { setBusyId(lessonId); await fn(lessonId); setBusyId(null); }

  const unattached = library.filter((l) => !l.moduleId);
  const attached = library.filter((l) => l.moduleId);

  return (
    <div className="mc-wrap">
      <div className="mc-bar">
        <div className="mc-bar-title"><Icon name="layers" /> Connecteur — <b>{subject?.name}</b></div>
        <div className="mc-bar-hint">Glissez la <span className="mc-dot-inline" /> d’une leçon vers un module — ou dépliez un module pour choisir <b>où</b> l’insérer. <span className="mc-legend-live" /> = vos leçons en ligne.</div>
      </div>

      <div className="mc-scroll">
        <div className="mc-inner" ref={innerRef}>
          <svg className="mc-edges" width="100%" height="100%">
            <defs>
              <marker id="mc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--indigo-400)" />
              </marker>
            </defs>
            {edges.map((e) => <path key={e.id} className="mc-edge" d={bezier(e.x1, e.y1, e.x2, e.y2)} markerEnd="url(#mc-arrow)" />)}
            {drag && <path className="mc-edge dragging" d={bezier(drag.x1, drag.y1, drag.cx, drag.cy)} markerEnd="url(#mc-arrow)" />}
          </svg>

          {/* ── left: the teacher's lessons ── */}
          <div className="mc-col mc-col-lessons">
            <div className="mc-col-h">Mes leçons <span className="mc-count">{library.length}</span></div>

            <div className="mc-group-l">À relier ({unattached.length})</div>
            {unattached.length === 0 && <div className="mc-empty">Toutes vos leçons sont reliées.</div>}
            {unattached.map((l) => (
              <LessonCard key={l.id} l={l} m={mark(l, mineIds)} reg={cardRefs} busy={busyId === l.id}
                onOpen={onOpenLesson} onDrag={startDrag} onDelete={() => act(onDelete, l.id)} />
            ))}

            {attached.length > 0 && <div className="mc-group-l">Reliées ({attached.length})</div>}
            {attached.map((l) => (
              <LessonCard key={l.id} l={l} m={mark(l, mineIds)} reg={cardRefs} busy={busyId === l.id}
                onOpen={onOpenLesson} onDrag={startDrag} onDelete={() => act(onDelete, l.id)}
                moduleLabel={moduleTitle(l.moduleId)} onDetach={() => act((id) => onConnect(id, null, null), l.id)}
                onPublish={l.status !== "PUBLISHED" ? () => act(onPublish, l.id) : null} />
            ))}
          </div>

          {/* ── right: modules (expandable, drop targets) ── */}
          <div className="mc-col mc-col-modules">
            <div className="mc-col-h">Modules <span className="mc-count">{modules.length}</span></div>
            {modules.map((m) => {
              const open = expanded.has(m.id);
              const dragging = !!drag;
              return (
                <div className={`mc-module${open ? " open" : ""}`} key={m.id}>
                  <div
                    ref={(el) => { if (el) nodeRefs.current.set(m.id, el); else nodeRefs.current.delete(m.id); }}
                    className={`mc-node${drag?.hoverKey === m.id ? " hover" : ""}${dragging ? " targetable" : ""}`}
                    data-mid={m.id}
                    onClick={() => toggle(m.id)}
                  >
                    <span className="mc-anchor" />
                    <span className="mc-node-ic"><Icon name={subject?.icon || "layers"} /></span>
                    <span className="mc-node-title">{m.title}</span>
                    <span className="mc-node-count">{m.lessons.length}</span>
                    <span className="mc-node-chev"><Icon name={open ? "chevD" : "chevR"} /></span>
                  </div>

                  {open && (
                    <div className="mc-lessons">
                      <DropSlot mid={m.id} pos={0} dragging={dragging} active={drag?.hoverKey === `${m.id}:0`} />
                      {m.lessons.map((l, i) => {
                        const lm = mark(l, mineIds);
                        return (
                          <div key={l.id}>
                            <div className={`mc-lrow${lm.mine ? " mine" : ""}`} onClick={() => lm.mine && onOpenLesson(l.id)} title={lm.mine ? "Ouvrir pour modifier" : ""}>
                              <span className="mc-lnum">{i + 1}</span>
                              <span className="mc-ldot" style={{ background: lm.color }} />
                              <span className="mc-ltitle">{l.title}</span>
                              <span className="mc-ltag" style={lm.live ? { background: "var(--danger-bg)", color: "var(--danger-fg)" } : undefined}>{lm.label}</span>
                              {lm.mine && (
                                <button className="mc-lx" title="Supprimer ma leçon" onClick={(e) => { e.stopPropagation(); act(onDelete, l.id); }}><Icon name="x" /></button>
                              )}
                            </div>
                            <DropSlot mid={m.id} pos={i + 1} dragging={dragging} active={drag?.hoverKey === `${m.id}:${i + 1}`} />
                          </div>
                        );
                      })}
                      {m.lessons.length === 0 && <div className="mc-lempty">Aucune leçon. Déposez-en une ici.</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function DropSlot({ mid, pos, dragging, active }) {
  if (!dragging) return null;
  return <div className={`mc-slot${active ? " active" : ""}`} data-mid={mid} data-pos={pos}><span /></div>;
}

function LessonCard({ l, m, reg, busy, onOpen, onDrag, onDelete, moduleLabel, onDetach, onPublish }) {
  return (
    <div
      ref={(el) => { if (el) reg.current.set(l.id, el); else reg.current.delete(l.id); }}
      className={`mc-card${busy ? " busy" : ""}${m.live ? " live" : ""}`}
    >
      <div className="mc-card-main" onClick={() => onOpen(l.id)}>
        <span className="mc-card-dot" style={{ background: m.color }} />
        <span className="mc-card-title">{l.title}</span>
        <button className="mc-card-x" title="Supprimer" onClick={(e) => { e.stopPropagation(); onDelete(); }}><Icon name="x" /></button>
      </div>
      {moduleLabel ? (
        <div className="mc-card-meta">
          <span className="mc-pill" style={m.live ? { background: "var(--danger-bg)", color: "var(--danger-fg)" } : undefined}>{m.label}</span>
          <span className="mc-card-mod"><Icon name="chevR" /> {moduleLabel}</span>
          <span className="mc-card-acts">
            {onPublish && <button className="mc-link" onClick={onPublish} disabled={busy} title="Rendre visible aux élèves"><Icon name="check" /> Diffuser</button>}
            <button className="mc-link danger" onClick={onDetach} disabled={busy} title="Détacher du module"><Icon name="x" /> Détacher</button>
          </span>
        </div>
      ) : (
        // The status still matters when a lesson has no module — the teacher has just
        // pressed Publier in « Rédiger » and needs to see that it landed. This branch
        // dropped m.label entirely, so a published lesson looked exactly like a draft
        // and the publish read as lost. Both facts are true at once: it is published,
        // and it is not yet delivered to anyone.
        <div className="mc-card-meta">
          <span className="mc-pill" style={m.live ? { background: "var(--danger-bg)", color: "var(--danger-fg)" } : undefined}>{m.label}</span>
          <span className="mc-pill draft">Non reliée</span>
        </div>
      )}
      <span className="mc-handle" title="Glisser vers un module" onPointerDown={(e) => onDrag(e, l)} />
    </div>
  );
}
