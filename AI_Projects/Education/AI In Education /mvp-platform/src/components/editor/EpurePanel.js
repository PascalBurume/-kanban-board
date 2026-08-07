"use client";
import { useMemo, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { renderEpure, fit, indexPoints, epureProblems, EPURE_TEMPLATES } from "@/lib/epure";
import { C } from "@/lib/figureSvg";

// Editing panel for a geometric figure.
//
// The whole reason this exists: a catalogue épure is drawing commands with hard-coded
// pixels, so nothing about it can be changed. Here the figure is points with NAMES and
// everything else refers to those names — so dragging A moves every segment through A,
// the circle centred on it, and the right angle at it, all at once.
//
// Dragging on the canvas is the primary interface and the numeric fields are the
// fallback, not the other way round. A teacher placing a vertex is doing a spatial
// task, and asking them to guess coordinates for it would be the same mistake the
// hard-coded drawings made.

const COLORS = [
  { hex: C.k, name: "Noir" },
  { hex: C.r, name: "Rouge — élément clé" },
  { hex: C.b, name: "Bleu — grandeur" },
  { hex: C.v, name: "Vert" },
  { hex: C.o, name: "Ocre" },
  { hex: C.g, name: "Gris — trait de rappel" },
];
const DASHES = [
  { v: "", name: "Plein" },
  { v: "6 4", name: "Tirets" },
  { v: "2 3", name: "Pointillés" },
];

const round2 = (n) => Math.round(n * 100) / 100;

/** The next unused single-letter name, so adding a point never needs naming first. */
function nextId(spec) {
  const used = new Set((spec.points ?? []).map((p) => p.id));
  for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") if (!used.has(ch)) return ch;
  for (let i = 1; i < 99; i++) if (!used.has(`P${i}`)) return `P${i}`;
  return `P${Date.now() % 1000}`;
}

export default function EpurePanel({ spec, anchor, onChange, onClose }) {
  const [tab, setTab] = useState("points");
  const [sel, setSel] = useState(null); // id of the point being dragged or edited
  const svgRef = useRef(null);

  const points = spec.points ?? [];
  const segments = spec.segments ?? [];
  const circles = spec.circles ?? [];
  const angles = spec.angles ?? [];
  const arrows = spec.arrows ?? [];
  const labels = spec.labels ?? [];
  const rects = spec.rects ?? [];
  const ellipses = spec.ellipses ?? [];
  const problems = useMemo(() => epureProblems(spec), [spec]);
  const drawing = useMemo(() => renderEpure(spec), [spec]);
  const geom = useMemo(() => fit(spec), [spec]);
  const byId = useMemo(() => indexPoints(spec), [spec]);

  const set = (patch) => onChange({ ...spec, ...patch });
  const setPoint = (id, patch) => set({ points: points.map((p) => (p.id === id ? { ...p, ...patch } : p)) });

  // Renaming a point has to carry every reference with it, or the figure silently
  // loses the segments that pointed at the old name.
  function renamePoint(oldId, raw) {
    const id = raw.trim();
    if (!id || id === oldId || points.some((p) => p.id === id)) return;
    const swap = (v) => (v === oldId ? id : v);
    set({
      points: points.map((p) => (p.id === oldId ? { ...p, id } : p)),
      segments: segments.map((s) => ({ ...s, from: swap(s.from), to: swap(s.to) })),
      circles: circles.map((c) => ({ ...c, center: swap(c.center), through: c.through ? swap(c.through) : c.through })),
      angles: angles.map((a) => ({ ...a, at: swap(a.at), from: swap(a.from), to: swap(a.to) })),
    });
  }

  function removePoint(id) {
    set({
      points: points.filter((p) => p.id !== id),
      // Anything anchored to a deleted point would draw nothing and report a problem.
      // Dropping those too is what the teacher meant by "remove this point".
      segments: segments.filter((s) => s.from !== id && s.to !== id),
      circles: circles.filter((c) => c.center !== id && c.through !== id),
      angles: angles.filter((a) => a.at !== id && a.from !== id && a.to !== id),
    });
    if (sel === id) setSel(null);
  }

  function addPoint() {
    const id = nextId(spec);
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    // Placed beside the figure rather than at (0,0), which is often already occupied.
    const x = xs.length ? round2(Math.max(...xs) + 1.5) : 0;
    const y = ys.length ? round2((Math.min(...ys) + Math.max(...ys)) / 2) : 0;
    set({ points: [...points, { id, x, y }] });
    setSel(id);
  }

  // ── dragging on the canvas ──
  // Screen → user coordinates is the inverse of fit(): same single scale k, and y
  // flipped back. Rounded to 0.1 so the JSON a teacher may later read stays legible.
  function userAt(evt) {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const px = ((evt.clientX - r.left) / r.width) * (geom.width ?? 360);
    const py = ((evt.clientY - r.top) / r.height) * geom.height;
    // Invert whatever fit() did: with a frame that is exact, otherwise it undoes the
    // single scale and the flip. Anchored on a known mapping rather than on point[0],
    // which does not exist in a figure made only of arrows and annotations.
    return { x: round2((px - geom.sx(0)) / geom.k), y: round2((geom.sy(0) - py) / geom.k) };
  }

  /**
   * Every position on the canvas a teacher can take hold of.
   *
   * Named points AND the bare ends of segments and arrows. The catalogue marked only 74
   * vertices across 76 figures — the rest of every diagram is lines and arrows between
   * unmarked positions — so handles restricted to named points would leave most
   * converted figures looking editable and behaving frozen. Dragging an arrow's tip is
   * exactly "change the direction".
   */
  const handles = useMemo(() => {
    const out = [];
    for (const p of points) out.push({ key: `pt:${p.id}`, kind: "point", id: p.id, x: p.x, y: p.y });
    const ends = (list, kind) =>
      list.forEach((it, i) => {
        for (const end of ["from", "to"]) {
          const a = it[end];
          if (a && typeof a === "object") out.push({ key: `${kind}:${i}:${end}`, kind, i, end, x: a.x, y: a.y });
        }
      });
    ends(segments, "segments");
    ends(arrows, "arrows");
    return out;
  }, [points, segments, arrows]);

  function moveHandle(h, u) {
    if (h.kind === "point") { setPoint(h.id, u); return; }
    const list = h.kind === "segments" ? segments : arrows;
    set({ [h.kind]: list.map((it, j) => (j === h.i ? { ...it, [h.end]: u } : it)) });
  }

  function startDrag(e, h) {
    e.preventDefault();
    e.stopPropagation();
    setSel(h.kind === "point" ? h.id : h.key);
    const target = e.currentTarget;
    // Listeners go on the WINDOW, not the handle. A drag leaves the 18px handle almost
    // immediately, and pointer capture — the usual fix — is not something to depend on:
    // setPointerCapture throws NotFoundError whenever the id is not an active pointer,
    // and thrown from here it would abort this handler before the listeners are even
    // attached, leaving a handle that highlights on press and then does nothing.
    try { target.setPointerCapture?.(e.pointerId); } catch { /* capture is a nicety */ }
    const move = (ev) => {
      const u = userAt(ev);
      if (u) moveHandle(h, u);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  const idOptions = points.map((p) => <option key={p.id} value={p.id}>{p.id}</option>);
  const editList = (key, list) => (patch, i) => set({ [key]: list.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const delFrom = (key, list) => (i) => set({ [key]: list.filter((_, j) => j !== i) });

  return (
    <div className="ep" style={anchor ? { top: anchor.top, left: anchor.left } : undefined} role="dialog" aria-label="Modifier l'épure">
      <div className="fp-head">
        <span className="fp-l"><Icon name="compass" /> Épure</span>
        <input
          className="fp-title"
          value={spec.caption || ""}
          onChange={(e) => set({ caption: e.target.value })}
          placeholder="Légende sous la figure (facultatif)"
          aria-label="Légende de la figure"
        />
        <button className="fe-done" onClick={onClose} title="Terminer">OK</button>
      </div>

      {/* The canvas IS the editor: every point is a handle. */}
      <div className="ep-canvas">
        <div className="ep-draw" ref={svgRef} dangerouslySetInnerHTML={{ __html: drawing }} />
        <svg className="ep-handles" viewBox={`0 0 ${geom.width ?? 360} ${geom.height}`} preserveAspectRatio="none">
          {handles.map((h) => (
            <circle
              key={h.key}
              className={`ep-h${h.kind === "point" ? " named" : ""}${sel === (h.kind === "point" ? h.id : h.key) ? " on" : ""}`}
              cx={geom.sx(h.x)}
              cy={geom.sy(h.y)}
              r="9"
              onPointerDown={(e) => startDrag(e, h)}
              tabIndex={0}
              role="button"
              aria-label={h.kind === "point" ? `Déplacer le point ${h.id}` : `Déplacer une extrémité`}
              onKeyDown={(e) => {
                const step = e.shiftKey ? (spec.frame ? 5 : 1) : (spec.frame ? 1 : 0.1);
                const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
                if (!d) return;
                e.preventDefault();
                setSel(h.kind === "point" ? h.id : h.key);
                moveHandle(h, { x: round2(h.x + d[0]), y: round2(h.y + d[1]) });
              }}
            />
          ))}
        </svg>
      </div>
      <p className="ep-hint">Faites glisser un point pour le déplacer — les traits, cercles et angles suivent. Flèches du clavier pour ajuster.</p>

      {problems.length > 0 && (
        <div className="fp-err"><Icon name="alert" /><span>{problems[0]}</span></div>
      )}

      <div className="ep-tabs" role="tablist">
        {[
          ["points", `Points (${points.length})`],
          ["segments", `Traits (${segments.length})`],
          ["arrows", `Flèches (${arrows.length})`],
          // 291 annotations across the catalogue — the single most common thing a
          // teacher will want to change, and the reason the wording is « Textes ».
          ["labels", `Textes (${labels.length})`],
          ["shapes", `Formes (${circles.length + angles.length + rects.length + ellipses.length})`],
        ].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <div className="ep-body">
        {tab === "points" && (
          <>
            <div className="ep-th"><span>Nom</span><span>x</span><span>y</span><span>Couleur</span><span /></div>
            {points.map((p) => (
              <div className={`ep-tr${sel === p.id ? " on" : ""}`} key={p.id} onFocus={() => setSel(p.id)}>
                <input value={p.id} onChange={(e) => renamePoint(p.id, e.target.value)} aria-label={`Nom du point ${p.id}`} />
                <input type="number" step="0.1" value={p.x} onChange={(e) => setPoint(p.id, { x: Number(e.target.value) || 0 })} aria-label={`x de ${p.id}`} />
                <input type="number" step="0.1" value={p.y} onChange={(e) => setPoint(p.id, { y: Number(e.target.value) || 0 })} aria-label={`y de ${p.id}`} />
                <select value={p.color ?? C.k} onChange={(e) => setPoint(p.id, { color: e.target.value })} aria-label={`Couleur de ${p.id}`}>
                  {COLORS.map((c) => <option key={c.hex} value={c.hex}>{c.name}</option>)}
                </select>
                <button onClick={() => removePoint(p.id)} title={`Supprimer ${p.id}`} aria-label={`Supprimer le point ${p.id}`}><Icon name="x" /></button>
              </div>
            ))}
            <button className="ep-add" onClick={addPoint}><Icon name="plus" /> Ajouter un point</button>
          </>
        )}

        {tab === "segments" && (
          <>
            <div className="ep-th seg"><span>De</span><span>À</span><span>Style</span><span>Étiquette</span><span /></div>
            {segments.map((s, i) => {
              const edit = editList("segments", segments);
              return (
                <div className="ep-tr seg" key={i}>
                  <select value={s.from} onChange={(e) => edit({ from: e.target.value }, i)} aria-label={`Départ du trait ${i + 1}`}>{idOptions}</select>
                  <select value={s.to} onChange={(e) => edit({ to: e.target.value }, i)} aria-label={`Arrivée du trait ${i + 1}`}>{idOptions}</select>
                  <select value={s.dash ?? ""} onChange={(e) => edit({ dash: e.target.value || undefined }, i)} aria-label={`Style du trait ${i + 1}`}>
                    {DASHES.map((d) => <option key={d.v} value={d.v}>{d.name}</option>)}
                  </select>
                  <input value={s.label ?? ""} onChange={(e) => edit({ label: e.target.value || undefined }, i)} placeholder="—" aria-label={`Étiquette du trait ${i + 1}`} />
                  <button onClick={() => delFrom("segments", segments)(i)} title="Supprimer le trait"><Icon name="x" /></button>
                </div>
              );
            })}
            <button
              className="ep-add"
              onClick={() => set({ segments: [...segments, { from: points[0]?.id ?? "A", to: points[1]?.id ?? points[0]?.id ?? "A" }] })}
              disabled={points.length < 2}
            >
              <Icon name="plus" /> Ajouter un trait
            </button>
          </>
        )}

        {tab === "arrows" && (
          <>
            {!arrows.length && <p className="ep-none">Aucune flèche. Faites-en glisser la pointe sur le dessin pour changer sa direction.</p>}
            {arrows.map((v, i) => {
              const edit = editList("arrows", arrows);
              return (
                <div className="ep-tr seg" key={i}>
                  <select value={typeof v.from === "string" ? v.from : ""} onChange={(e) => edit({ from: e.target.value || v.from }, i)} aria-label={`Départ de la flèche ${i + 1}`}>
                    {typeof v.from !== "string" && <option value="">libre</option>}
                    {idOptions}
                  </select>
                  <select value={typeof v.to === "string" ? v.to : ""} onChange={(e) => edit({ to: e.target.value || v.to }, i)} aria-label={`Pointe de la flèche ${i + 1}`}>
                    {typeof v.to !== "string" && <option value="">libre</option>}
                    {idOptions}
                  </select>
                  <select value={v.dash ?? ""} onChange={(e) => edit({ dash: e.target.value || undefined }, i)} aria-label={`Style de la flèche ${i + 1}`}>
                    {DASHES.map((d) => <option key={d.v} value={d.v}>{d.name}</option>)}
                  </select>
                  <input value={v.label ?? ""} onChange={(e) => edit({ label: e.target.value || undefined }, i)} placeholder="—" aria-label={`Étiquette de la flèche ${i + 1}`} />
                  <button onClick={() => delFrom("arrows", arrows)(i)} title="Supprimer la flèche"><Icon name="x" /></button>
                </div>
              );
            })}
            <button className="ep-add" onClick={() => set({ arrows: [...arrows, { from: { x: 0, y: 0 }, to: { x: 40, y: 40 } }] })}>
              <Icon name="plus" /> Ajouter une flèche
            </button>
          </>
        )}

        {tab === "labels" && (
          <>
            {!labels.length && <p className="ep-none">Aucun texte.</p>}
            <div className="ep-th lbl"><span>Texte</span><span>x</span><span>y</span><span>Couleur</span><span /></div>
            {labels.map((l, i) => {
              const edit = editList("labels", labels);
              const at = typeof l.at === "string" ? null : l.at;
              return (
                <div className="ep-tr lbl" key={i}>
                  <input value={l.text ?? ""} onChange={(e) => edit({ text: e.target.value }, i)} aria-label={`Texte ${i + 1}`} />
                  <input type="number" step="1" value={at ? at.x : ""} disabled={!at} onChange={(e) => edit({ at: { ...at, x: Number(e.target.value) || 0 } }, i)} aria-label={`x du texte ${i + 1}`} />
                  <input type="number" step="1" value={at ? at.y : ""} disabled={!at} onChange={(e) => edit({ at: { ...at, y: Number(e.target.value) || 0 } }, i)} aria-label={`y du texte ${i + 1}`} />
                  <select value={l.color ?? C.k} onChange={(e) => edit({ color: e.target.value }, i)} aria-label={`Couleur du texte ${i + 1}`}>
                    {COLORS.map((c) => <option key={c.hex} value={c.hex}>{c.name}</option>)}
                  </select>
                  <button onClick={() => delFrom("labels", labels)(i)} title="Supprimer le texte"><Icon name="x" /></button>
                </div>
              );
            })}
            <button className="ep-add" onClick={() => set({ labels: [...labels, { at: { x: 20, y: 20 }, text: "Texte" }] })}>
              <Icon name="plus" /> Ajouter un texte
            </button>
          </>
        )}

        {tab === "shapes" && (
          <>
            <p className="ep-sec">Cercles</p>
            {circles.map((c, i) => {
              const edit = editList("circles", circles);
              return (
                <div className="ep-tr sh" key={i}>
                  <label>centre</label>
                  {/* A converted circle is centred on a bare position, not a named
                      point, so the picker offers « libre » rather than silently
                      snapping it onto whichever point happens to be first. */}
                  <select value={typeof c.center === "string" ? c.center : ""} onChange={(e) => edit({ center: e.target.value || c.center }, i)} aria-label={`Centre du cercle ${i + 1}`}>
                    {typeof c.center !== "string" && <option value="">libre</option>}
                    {idOptions}
                  </select>
                  {c.through != null || typeof c.center === "string" ? <label>passe par</label> : <label>rayon</label>}
                  {c.through != null || typeof c.center === "string" ? (
                    <select value={typeof c.through === "string" ? c.through : ""} onChange={(e) => edit({ through: e.target.value || undefined }, i)} aria-label={`Point du cercle ${i + 1}`}>
                      <option value="">—</option>
                      {idOptions}
                    </select>
                  ) : (
                    <input type="number" step="1" value={c.r ?? 0} onChange={(e) => edit({ r: Number(e.target.value) || 0 }, i)} aria-label={`Rayon du cercle ${i + 1}`} />
                  )}
                  <button onClick={() => delFrom("circles", circles)(i)} title="Supprimer le cercle"><Icon name="x" /></button>
                </div>
              );
            })}
            <button className="ep-add" onClick={() => set({ circles: [...circles, { center: points[0]?.id ?? "A", through: points[1]?.id, dash: "5 4" }] })} disabled={points.length < 2}>
              <Icon name="plus" /> Ajouter un cercle
            </button>

            <p className="ep-sec">Angles</p>
            {angles.map((a, i) => {
              const edit = editList("angles", angles);
              return (
                <div className="ep-tr sh" key={i}>
                  <label>sommet</label>
                  <select value={a.at} onChange={(e) => edit({ at: e.target.value }, i)} aria-label={`Sommet de l'angle ${i + 1}`}>{idOptions}</select>
                  <label>entre</label>
                  <select value={a.from} onChange={(e) => edit({ from: e.target.value }, i)} aria-label={`Premier côté de l'angle ${i + 1}`}>{idOptions}</select>
                  <select value={a.to} onChange={(e) => edit({ to: e.target.value }, i)} aria-label={`Second côté de l'angle ${i + 1}`}>{idOptions}</select>
                  <label className="ep-check">
                    <input type="checkbox" checked={!!a.right} onChange={(e) => edit({ right: e.target.checked || undefined }, i)} /> droit
                  </label>
                  <button onClick={() => delFrom("angles", angles)(i)} title="Supprimer l'angle"><Icon name="x" /></button>
                </div>
              );
            })}
            <button className="ep-add" onClick={() => set({ angles: [...angles, { at: points[1]?.id ?? "A", from: points[0]?.id ?? "A", to: points[2]?.id ?? points[0]?.id ?? "A" }] })} disabled={points.length < 3}>
              <Icon name="plus" /> Ajouter un angle
            </button>

            {/* Rectangles and ellipses only ever arrive from a converted figure — a
                blank épure has no button for them — so the pane shows them when they
                are there and stays out of the way when they are not. */}
            {rects.length > 0 && <p className="ep-sec">Rectangles</p>}
            {rects.map((r, i) => {
              const edit = editList("rects", rects);
              const at = typeof r.at === "string" ? null : r.at;
              return (
                <div className="ep-tr sh" key={i}>
                  <label>x, y</label>
                  <input type="number" step="1" value={at ? at.x : ""} disabled={!at} onChange={(e) => edit({ at: { ...at, x: Number(e.target.value) || 0 } }, i)} aria-label={`x du rectangle ${i + 1}`} />
                  <label>l × h</label>
                  <input type="number" step="1" value={r.w} onChange={(e) => edit({ w: Number(e.target.value) || 0 }, i)} aria-label={`Largeur du rectangle ${i + 1}`} />
                  <input type="number" step="1" value={r.h} onChange={(e) => edit({ h: Number(e.target.value) || 0 }, i)} aria-label={`Hauteur du rectangle ${i + 1}`} />
                  <button onClick={() => delFrom("rects", rects)(i)} title="Supprimer le rectangle"><Icon name="x" /></button>
                </div>
              );
            })}

            {ellipses.length > 0 && <p className="ep-sec">Ellipses</p>}
            {ellipses.map((e2, i) => {
              const edit = editList("ellipses", ellipses);
              const at = typeof e2.at === "string" ? null : e2.at;
              return (
                <div className="ep-tr sh" key={i}>
                  <label>centre</label>
                  <input type="number" step="1" value={at ? at.x : ""} disabled={!at} onChange={(e) => edit({ at: { ...at, x: Number(e.target.value) || 0 } }, i)} aria-label={`x de l'ellipse ${i + 1}`} />
                  <label>rx, ry</label>
                  <input type="number" step="1" value={e2.rx} onChange={(e) => edit({ rx: Number(e.target.value) || 0 }, i)} aria-label={`Rayon x de l'ellipse ${i + 1}`} />
                  <input type="number" step="1" value={e2.ry} onChange={(e) => edit({ ry: Number(e.target.value) || 0 }, i)} aria-label={`Rayon y de l'ellipse ${i + 1}`} />
                  <button onClick={() => delFrom("ellipses", ellipses)(i)} title="Supprimer l'ellipse"><Icon name="x" /></button>
                </div>
              );
            })}
          </>
        )}
      </div>

      <details className="ep-tpl">
        <summary>Repartir d'un modèle</summary>
        <div className="ep-tplgrid">
          {EPURE_TEMPLATES.map((t) => (
            // Replaces the figure wholesale, so it is behind a disclosure rather than
            // sitting next to the edit fields where it could be hit by accident.
            <button key={t.id} onClick={() => onChange({ ...t.spec })} title={t.hint}>{t.label}</button>
          ))}
        </div>
      </details>
    </div>
  );
}
