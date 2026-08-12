import { C, esc } from "./figureSvg";
import { applyConstructions, constructionProblems, type Construction } from "./epureConstruct";

// A geometric figure as DATA, not as a drawing.
//
// This is the difference between the 76 catalogue épures and this. A catalogue figure
// is a list of drawing commands with hard-coded pixels — `T(97, 196, "A")` puts the
// letter A at pixel (97,196), and nothing in the file knows that A is a vertex of a
// triangle. So nothing about it can be edited: there is no number to change.
//
// Here a figure is points with NAMES, and everything else refers to those names. Move
// A and every segment through A follows, the circle centred on it follows, the right
// angle at it follows, its label follows. That is the whole point.
//
// Stored inside the existing ```figure fence as {"type":"epure",…}, so it inherits the
// markdown round trip, the editor's figure node, the student renderer and the
// round-trip gate without any of them learning a new construct.

/**
 * Where something is: the NAME of a point, or a bare position.
 *
 * Both, because the two kinds of figure in this catalogue want different things. A
 * geometry épure wants names — move A and the triangle follows, which is the whole
 * argument for storing figures as data. A physics diagram is a dozen arrows and twenty
 * annotations, and forcing each end of each arrow to be a named point would produce a
 * figure with forty points nobody named and nobody wants to scroll past.
 *
 * So: names where they carry meaning, positions where they do not. Both are editable.
 */
export type Anchor = string | { x: number; y: number };

export type EpurePoint = {
  id: string;        // "A" — also the default label
  x: number;
  y: number;         // MATHS orientation: y grows upward (see fit())
  /**
   * Placed by CONSTRUCTION rather than by coordinates — the midpoint of [AB], the foot
   * of a perpendicular, where two circles meet. Present, x/y are computed from the
   * other points before anything is drawn, so the dot follows when they move; the
   * literal x/y stay as the fallback for a construction that has no answer. See
   * lib/epureConstruct.ts.
   */
  from?: Construction;
  label?: string;    // when the caption differs from the id
  color?: string;
  dot?: boolean;     // false draws the point unmarked but still usable as an anchor
  /**
   * Where the name sits, as an OFFSET from the point in user units.
   *
   * An offset, not a position, so the name travels with the point when it is dragged.
   * Absent, the renderer pushes the name away from the figure's centre — right for a
   * figure being built, wrong for one being converted, because the catalogue placed
   * every letter by hand to dodge the lines it sits among.
   */
  labelOff?: { dx: number; dy: number };
  /** Text size and anchoring, when the converted original was not the default. */
  labelSize?: number;
  labelAnchor?: "start" | "middle" | "end";
};

export type EpureSegment = {
  from: Anchor;
  to: Anchor;
  color?: string;
  dash?: string;     // "6 4" — construction lines
  width?: number;
  label?: string;    // written at the midpoint, offset off the line
};

export type EpureCircle = {
  center: Anchor;
  through?: Anchor;  // radius = |center→through|, so it follows both points
  r?: number;        // or an explicit radius in user units
  color?: string;
  dash?: string;
  width?: number;
  fill?: string;
};

export type EpureAngle = {
  at: Anchor;        // vertex
  from: Anchor;      // a point on one side
  to: Anchor;        // a point on the other
  right?: boolean;   // square mark instead of an arc
  label?: string;
  color?: string;
};

/** Free-standing annotation — « médiane », « cercle circonscrit », a measurement. */
export type EpureLabel = {
  at: Anchor;
  text: string;
  color?: string;
  size?: number;
  anchor?: "start" | "middle" | "end";
  italic?: boolean;
};

/** A vector: a force, a ray, an axis. The arrowhead sits at `to`. */
export type EpureArrow = {
  from: Anchor;
  to: Anchor;
  color?: string;
  width?: number;
  dash?: string;
  label?: string;
};

export type EpureRect = {
  at: Anchor;        // top-left in USER coordinates, so the box grows upward from it
  w: number;
  h: number;
  color?: string;
  fill?: string;
  dash?: string;
  width?: number;
  rx?: number;
};

export type EpureEllipse = {
  at: Anchor;
  rx: number;
  ry: number;
  color?: string;
  fill?: string;
  dash?: string;
  width?: number;
};

/**
 * A drawn curve given as SVG path data in USER coordinates.
 *
 * The honest escape hatch. A plotted parabola, a sine wave, a hand-shaped organ outline
 * is not a set of named points and pretending otherwise would be worse than saying so.
 * It stays movable, recolourable and deletable as one object; its shape is edited as
 * path text. Everything the catalogue draws that is not a line, circle or ellipse
 * lands here rather than being dropped.
 */
export type EpurePath = {
  d: string;
  color?: string;
  width?: number;
  fill?: string;
  dash?: string;
};

export type EpureSpec = {
  type: "epure";
  title?: string;
  caption?: string;
  points: EpurePoint[];
  segments?: EpureSegment[];
  circles?: EpureCircle[];
  angles?: EpureAngle[];
  labels?: EpureLabel[];
  arrows?: EpureArrow[];
  rects?: EpureRect[];
  ellipses?: EpureEllipse[];
  paths?: EpurePath[];
  height?: number;
  /**
   * An explicit drawing box, in user units. Present = draw at these exact coordinates
   * with no auto-fit; absent = fit the contents to the frame.
   *
   * This is what lets a converted catalogue figure come out pixel-identical to the
   * hand-drawn original: the conversion flips y once (so the teacher still edits maths
   * coordinates) and the renderer flips it back, and nothing is rescaled in between.
   */
  frame?: { w: number; h: number };
  /** Hide the little dot on every point at once — for figures that are all lines. */
  dots?: boolean;
};

const W = 360;
const H = 240;
const PAD = 34; // room for labels outside the figure's own bounding box

const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
/**
 * Points by id, so every anchor that is a name can be resolved.
 *
 * Constructed points are solved here — the single funnel every other function goes
 * through (fit, extent, renderEpure), so nothing else has to know they exist.
 */
export function indexPoints(spec: EpureSpec): Map<string, EpurePoint> {
  const m = new Map<string, EpurePoint>();
  for (const p of applyConstructions(spec).points ?? []) {
    if (p && typeof p.id === "string" && p.id) m.set(p.id, { ...p, x: num(p.x), y: num(p.y) });
  }
  return m;
}

/** An anchor in user coordinates, or null when it names a point that is not there. */
export function resolve(a: Anchor | undefined, byId: Map<string, EpurePoint>): { x: number; y: number } | null {
  if (a == null) return null;
  if (typeof a === "string") {
    const p = byId.get(a);
    return p ? { x: p.x, y: p.y } : null;
  }
  return { x: num(a.x), y: num(a.y) };
}

/** Every position the figure occupies — what fit() has to keep inside the frame. */
function extent(spec: EpureSpec, byId: Map<string, EpurePoint>): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [...byId.values()].map((p) => ({ x: p.x, y: p.y }));
  const add = (a?: Anchor) => { const p = resolve(a, byId); if (p) out.push(p); };
  for (const s of spec.segments ?? []) { add(s.from); add(s.to); }
  for (const a of spec.arrows ?? []) { add(a.from); add(a.to); }
  for (const l of spec.labels ?? []) add(l.at);
  for (const r of spec.rects ?? []) {
    const p = resolve(r.at, byId);
    if (p) { out.push(p, { x: p.x + num(r.w), y: p.y - num(r.h) }); }
  }
  for (const e of spec.ellipses ?? []) {
    const p = resolve(e.at, byId);
    if (p) { out.push({ x: p.x - num(e.rx), y: p.y - num(e.ry) }, { x: p.x + num(e.rx), y: p.y + num(e.ry) }); }
  }
  // A circle reaches outside the hull of its points; cropping it would draw a figure
  // that is simply wrong.
  for (const c of spec.circles ?? []) {
    const o = resolve(c.center, byId);
    if (!o) continue;
    const t = resolve(c.through, byId);
    const r = t ? Math.hypot(t.x - o.x, t.y - o.y) : num(c.r);
    if (r > 0) out.push({ x: o.x - r, y: o.y - r }, { x: o.x + r, y: o.y + r });
  }
  return out;
}

/**
 * User coordinates → screen coordinates.
 *
 * With `frame`, the mapping is exact: same box, y flipped once. That is what makes a
 * converted catalogue figure come out identical to the hand-drawn original.
 *
 * Without it, the contents are fitted — and with ONE scale for both axes, never two. A
 * separate x and y scale would pack the box tighter and turn every circle into an
 * ellipse and every right angle into a wrong one, which in a geometry figure is not a
 * cosmetic problem but a false statement.
 */
export function fit(spec: EpureSpec) {
  const byId = indexPoints(spec);

  if (spec.frame) {
    const w = Math.max(1, num(spec.frame.w, W));
    const height = Math.max(1, num(spec.frame.h, H));
    return { k: 1, height, width: w, sx: (x: number) => x, sy: (y: number) => height - y };
  }

  const height = Math.max(160, Math.min(520, num(spec.height, H)));
  const pts = extent(spec, byId);
  if (!pts.length) return { sx: (x: number) => x, sy: (y: number) => y, k: 1, height, width: W };

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }

  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const k = Math.min((W - 2 * PAD) / spanX, (height - 2 * PAD) / spanY);
  const offX = (W - spanX * k) / 2;
  const offY = (height - spanY * k) / 2;
  return {
    k,
    height,
    width: W,
    sx: (x: number) => offX + (x - minX) * k,
    // Flipped: the teacher writes maths coordinates, y upward.
    sy: (y: number) => height - offY - (y - minY) * k,
  };
}

const at1 = (n: number) => Math.round(n * 10) / 10;
const attr = (name: string, v: string | number | undefined) => (v == null || v === "" ? "" : ` ${name}="${typeof v === "string" ? esc(v) : v}"`);

/* ────────────────────────────────────────────────────────────────────────────
 * Transforming a path's `d`
 *
 * This used to be one regex that paired up every two numbers and ran them through
 * (sx, sy). A path is not a list of points. `A rx ry rotation large-arc sweep x y` has
 * five parameters that are not coordinates, so the radii were flipped, the ROTATION was
 * read as a y, and `sweep-flag` came out as 240 — which is not 0 or 1, so the browser
 * rejected the whole path and the arc simply vanished. `H`/`V` were mis-paired the same
 * way, an odd-length path never transformed its last number, and `M100,50` (commas are
 * legal) matched nothing at all and stayed in raw coordinates while the figure moved.
 *
 * It survived in the catalogue only because every épure there carries a frame, which
 * makes the flip its own inverse, and because those arcs happen to be horizontal.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Parameter kinds for ONE group of each command, in order. */
const PATH_ARGS: Record<string, readonly string[]> = {
  M: ["x", "y"], L: ["x", "y"], T: ["x", "y"],
  H: ["x"], V: ["y"],
  C: ["x", "y", "x", "y", "x", "y"],
  S: ["x", "y", "x", "y"], Q: ["x", "y", "x", "y"],
  A: ["rx", "ry", "rot", "large", "sweep", "x", "y"],
  Z: [],
};

// A command letter, or a number — including ".5", "-.5" and exponents. SVG allows
// commas and lets numbers run together ("M10-20"), which the old regex could not see.
const PATH_TOKEN = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?)/g;

type Geom = { sx: (n: number) => number; sy: (n: number) => number };

/**
 * Map a path from the teacher's coordinates into SVG's, honouring what each parameter
 * of each command actually MEANS.
 *
 * Returns the input untouched if it cannot be parsed with confidence. A path left in the
 * wrong place is a visible, fixable mistake; a path silently rewritten into invalid
 * numbers is an arc that disappears with no way to tell why.
 */
export function transformPathD(d: string, g: Geom): string {
  const src = String(d ?? "");
  if (!src.trim()) return src;

  // Everything is derived from the actual mapping, so this holds for a framed figure
  // (k = 1, y flipped), a fitted one (scaled and flipped) and the degenerate identity.
  const x0 = g.sx(0);
  const y0 = g.sy(0);
  const kx = g.sx(1) - x0;
  const ky = g.sy(1) - y0;
  if (!Number.isFinite(kx) || !Number.isFinite(ky)) return src;
  // A reflection reverses the direction an arc sweeps, and negates its rotation.
  const mirrored = kx * ky < 0;

  const toks: string[] = [];
  for (const m of src.matchAll(PATH_TOKEN)) toks.push(m[1] ?? m[2]);
  if (!toks.length) return src;

  const out: string[] = [];
  let i = 0;
  let cmd = "";
  let firstMove = true; // a leading `m` takes ABSOLUTE coordinates, per the spec

  while (i < toks.length) {
    const t = toks[i];
    if (/^[A-Za-z]$/.test(t)) { cmd = t; i++; out.push(t); }
    else if (!cmd) return src; // numbers before any command — not a path we understand

    const upper = cmd.toUpperCase();
    const args = PATH_ARGS[upper];
    if (!args) return src;
    if (!args.length) { firstMove = false; continue; } // Z

    // Absolute for uppercase; also for the very first group of a leading `m`.
    const absolute = cmd === upper || (upper === "M" && firstMove);
    firstMove = false;

    for (const kind of args) {
      const raw = toks[i];
      if (raw === undefined || /^[A-Za-z]$/.test(raw)) return src; // ran out mid-group
      const v = Number(raw);
      if (!Number.isFinite(v)) return src;
      i++;
      let o: number;
      switch (kind) {
        case "x": o = absolute ? g.sx(v) : v * kx; break;
        case "y": o = absolute ? g.sy(v) : v * ky; break;
        case "rx": o = Math.abs(kx) * v; break;
        case "ry": o = Math.abs(ky) * v; break;
        case "rot": o = mirrored ? -v : v; break;
        case "large": o = v; break;                       // a flag: never transformed
        case "sweep": o = mirrored ? (v ? 0 : 1) : v; break;
        default: return src;
      }
      out.push(String(at1(o)));
    }
  }
  // "M189.7 70.1 A26 26 …", the shape SVG is normally written in and the shape this
  // emitted before — so the rendered output stays byte-identical and the catalogue's
  // faithfulness test keeps comparing pictures rather than whitespace.
  let s = "";
  let afterLetter = false;
  for (const t of out) {
    const isLetter = /^[A-Za-z]$/.test(t);
    s += !s || afterLetter ? t : ` ${t}`;
    afterLetter = isLetter;
  }
  return s;
}

/** Where to put a point's label: pushed away from the figure's centre, never on it. */
function labelOffset(px: number, py: number, cx: number, cy: number) {
  const dx = px - cx;
  const dy = py - cy;
  const d = Math.hypot(dx, dy) || 1;
  return { lx: px + (dx / d) * 15, ly: py + (dy / d) * 15 + 4 };
}

export function renderEpure(spec: EpureSpec): string {
  const byId = indexPoints(spec);
  const g = fit(spec);
  const { sx, sy, height } = g;
  const width = g.width ?? W;
  const S = (a: Anchor | undefined) => {
    const p = resolve(a, byId);
    return p ? { x: sx(p.x), y: sy(p.y) } : null;
  };

  const parts: string[] = [`<rect width="${width}" height="${height}" fill="#fff"/>`];

  // Background shapes first: they are what the rest is read against.
  for (const r of spec.rects ?? []) {
    const p = S(r.at);
    if (!p) continue;
    const w = num(r.w) * g.k;
    const h = num(r.h) * g.k;
    parts.push(`<rect x="${at1(p.x)}" y="${at1(p.y)}" width="${at1(w)}" height="${at1(h)}"${attr("rx", r.rx)} fill="${esc(r.fill ?? "none")}" stroke="${esc(r.color ?? C.k)}" stroke-width="${num(r.width, 1.6)}"${attr("stroke-dasharray", r.dash)}/>`);
  }

  for (const e of spec.ellipses ?? []) {
    const p = S(e.at);
    if (!p) continue;
    parts.push(`<ellipse cx="${at1(p.x)}" cy="${at1(p.y)}" rx="${at1(num(e.rx) * g.k)}" ry="${at1(num(e.ry) * g.k)}" fill="${esc(e.fill ?? "none")}" stroke="${esc(e.color ?? C.k)}" stroke-width="${num(e.width, 1.6)}"${attr("stroke-dasharray", e.dash)}/>`);
  }

  for (const c of spec.circles ?? []) {
    const o = S(c.center);
    const ou = resolve(c.center, byId);
    if (!o || !ou) continue;
    const t = resolve(c.through, byId);
    const ru = t ? Math.hypot(t.x - ou.x, t.y - ou.y) : num(c.r);
    if (!(ru > 0)) continue;
    parts.push(`<circle cx="${at1(o.x)}" cy="${at1(o.y)}" r="${at1(ru * g.k)}" fill="${esc(c.fill ?? "none")}" stroke="${esc(c.color ?? C.g)}" stroke-width="${num(c.width, 1.4)}"${attr("stroke-dasharray", c.dash)}/>`);
  }

  // Paths carry USER coordinates, so they are transformed like everything else rather
  // than being pasted through — otherwise a fitted figure would tear apart.
  for (const p of spec.paths ?? []) {
    const d = transformPathD(String(p.d ?? ""), g);
    if (!d.trim()) continue;
    parts.push(`<path d="${esc(d)}" fill="${esc(p.fill ?? "none")}" stroke="${esc(p.color ?? C.k)}" stroke-width="${num(p.width, 1.8)}"${attr("stroke-dasharray", p.dash)}/>`);
  }

  const segLabel = (a: { x: number; y: number }, b: { x: number; y: number }, text: string, color: string) => {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    return `<text x="${at1(mx + nx * 13)}" y="${at1(my + ny * 13 + 4)}" fill="${esc(color)}" font-size="11" text-anchor="middle" font-family="Georgia, serif">${esc(text)}</text>`;
  };

  for (const s of spec.segments ?? []) {
    const a = S(s.from);
    const b = S(s.to);
    if (!a || !b) continue;
    parts.push(`<line x1="${at1(a.x)}" y1="${at1(a.y)}" x2="${at1(b.x)}" y2="${at1(b.y)}" stroke="${esc(s.color ?? C.k)}" stroke-width="${num(s.width, 1.8)}"${attr("stroke-dasharray", s.dash)} stroke-linecap="round"/>`);
    if (s.label) parts.push(segLabel(a, b, s.label, s.color ?? C.k));
  }

  for (const v of spec.arrows ?? []) {
    const a = S(v.from);
    const b = S(v.to);
    if (!a || !b) continue;
    const col = esc(v.color ?? C.k);
    parts.push(`<line x1="${at1(a.x)}" y1="${at1(a.y)}" x2="${at1(b.x)}" y2="${at1(b.y)}" stroke="${col}" stroke-width="${num(v.width, 1.8)}"${attr("stroke-dasharray", v.dash)}/>`);
    // Head geometry copied from figureSvg's A(), so a converted arrow is the same arrow.
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const s7 = 7;
    const h1 = [b.x - s7 * Math.cos(ang - 0.42), b.y - s7 * Math.sin(ang - 0.42)];
    const h2 = [b.x - s7 * Math.cos(ang + 0.42), b.y - s7 * Math.sin(ang + 0.42)];
    parts.push(`<path d="M${at1(b.x)} ${at1(b.y)} L${at1(h1[0])} ${at1(h1[1])} L${at1(h2[0])} ${at1(h2[1])} Z" fill="${col}" stroke="${col}" stroke-width="1"/>`);
    if (v.label) parts.push(segLabel(a, b, v.label, v.color ?? C.k));
  }

  for (const ang of spec.angles ?? []) {
    const v = S(ang.at);
    const a = S(ang.from);
    const b = S(ang.to);
    if (!v || !a || !b) continue;
    const u1 = { x: a.x - v.x, y: a.y - v.y };
    const u2 = { x: b.x - v.x, y: b.y - v.y };
    const n1 = Math.hypot(u1.x, u1.y) || 1;
    const n2 = Math.hypot(u2.x, u2.y) || 1;
    const col = esc(ang.color ?? C.b);
    if (ang.right) {
      const m = 11;
      const p1 = { x: v.x + (u1.x / n1) * m, y: v.y + (u1.y / n1) * m };
      const p2 = { x: v.x + (u2.x / n2) * m, y: v.y + (u2.y / n2) * m };
      const p3 = { x: p1.x + p2.x - v.x, y: p1.y + p2.y - v.y };
      parts.push(`<path d="M${at1(p1.x)} ${at1(p1.y)} L${at1(p3.x)} ${at1(p3.y)} L${at1(p2.x)} ${at1(p2.y)}" fill="none" stroke="${col}" stroke-width="1.4"/>`);
    } else {
      const r = 20;
      const p1 = { x: v.x + (u1.x / n1) * r, y: v.y + (u1.y / n1) * r };
      const p2 = { x: v.x + (u2.x / n2) * r, y: v.y + (u2.y / n2) * r };
      const cross = u1.x * u2.y - u1.y * u2.x;
      parts.push(`<path d="M${at1(p1.x)} ${at1(p1.y)} A${r} ${r} 0 0 ${cross > 0 ? 1 : 0} ${at1(p2.x)} ${at1(p2.y)}" fill="none" stroke="${col}" stroke-width="1.4"/>`);
      if (ang.label) {
        const mx = v.x + ((u1.x / n1 + u2.x / n2) / 2) * (r + 14);
        const my = v.y + ((u1.y / n1 + u2.y / n2) / 2) * (r + 14);
        parts.push(`<text x="${at1(mx)}" y="${at1(my + 4)}" fill="${col}" font-size="11" text-anchor="middle" font-family="Georgia, serif">${esc(ang.label)}</text>`);
      }
    }
  }

  // Free annotations sit above the drawing but below the named points.
  for (const l of spec.labels ?? []) {
    const p = S(l.at);
    if (!p || !l.text) continue;
    parts.push(`<text x="${at1(p.x)}" y="${at1(p.y)}" fill="${esc(l.color ?? C.k)}" font-size="${num(l.size, 12)}" text-anchor="${esc(l.anchor ?? "middle")}" font-family="Georgia, serif"${l.italic ? ' font-style="italic"' : ""}>${esc(l.text)}</text>`);
  }

  // Points and their names last, so nothing is drawn over them.
  const pts = [...byId.values()];
  const cx = pts.reduce((a, p) => a + sx(p.x), 0) / (pts.length || 1);
  const cy = pts.reduce((a, p) => a + sy(p.y), 0) / (pts.length || 1);
  for (const p of pts) {
    const x = sx(p.x);
    const y = sy(p.y);
    const col = esc(p.color ?? C.k);
    if (p.dot !== false && spec.dots !== false) {
      parts.push(`<circle cx="${at1(x)}" cy="${at1(y)}" r="3.2" fill="${col}"/>`);
    }
    const text = p.label ?? p.id;
    if (text) {
      // An explicit offset is in user units and travels with the point; without one the
      // name is pushed away from the figure's centre so it never lands on the drawing.
      const placed = p.labelOff
        ? { lx: x + num(p.labelOff.dx) * g.k, ly: y - num(p.labelOff.dy) * g.k }
        : labelOffset(x, y, cx, cy);
      parts.push(`<text x="${at1(placed.lx)}" y="${at1(placed.ly)}" fill="${col}" font-size="${num(p.labelSize, 12)}" text-anchor="${esc(p.labelAnchor ?? "middle")}" font-family="Georgia, serif" font-style="italic">${esc(text)}</text>`);
    }
  }

  if (spec.caption) {
    parts.push(`<text x="${width / 2}" y="${height - 8}" fill="${C.g}" font-size="10" text-anchor="middle" font-family="Georgia, serif">${esc(spec.caption)}</text>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">${parts.join("")}</svg>`;
}

/** Structural problems a teacher can act on — a dangling anchor draws nothing. */
export function epureProblems(spec: EpureSpec): string[] {
  const ids = new Set((spec.points ?? []).map((p) => p.id));
  const out: string[] = [];
  // Only NAMED anchors can dangle; a bare position is always valid.
  const need = (a: Anchor | undefined, what: string) => {
    if (typeof a === "string" && !ids.has(a)) out.push(`${what} renvoie au point « ${a} », qui n'existe pas.`);
  };
  for (const s of spec.segments ?? []) { need(s.from, "Un trait"); need(s.to, "Un trait"); }
  for (const v of spec.arrows ?? []) { need(v.from, "Une flèche"); need(v.to, "Une flèche"); }
  for (const c of spec.circles ?? []) { need(c.center, "Un cercle"); need(c.through, "Un cercle"); }
  for (const a of spec.angles ?? []) { need(a.at, "Un angle"); need(a.from, "Un angle"); need(a.to, "Un angle"); }
  for (const l of spec.labels ?? []) need(l.at, "Une étiquette");
  for (const r of spec.rects ?? []) need(r.at, "Un rectangle");
  for (const e of spec.ellipses ?? []) need(e.at, "Une ellipse");
  const seen = new Set<string>();
  for (const p of spec.points ?? []) {
    if (seen.has(p.id)) out.push(`Deux points portent le nom « ${p.id} ».`);
    seen.add(p.id);
  }
  const drawn = (spec.points ?? []).length + (spec.segments ?? []).length + (spec.arrows ?? []).length
    + (spec.circles ?? []).length + (spec.paths ?? []).length + (spec.rects ?? []).length
    + (spec.ellipses ?? []).length + (spec.labels ?? []).length;
  if (!drawn) out.push("La figure ne contient encore rien.");
  // A construction that cannot be run draws its point at stale coordinates rather than
  // not at all, so it is invisible without being told.
  out.push(...constructionProblems(spec));
  return [...new Set(out)];
}

export const EPURE_TEMPLATES: { id: string; icon: string; label: string; hint: string; spec: EpureSpec }[] = [
  {
    id: "triangle",
    icon: "geoTriangle",
    label: "Triangle ABC",
    hint: "trois sommets nommés",
    spec: {
      type: "epure", caption: "triangle quelconque",
      points: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 6, y: 0 }, { id: "C", x: 2.2, y: 4.4 }],
      segments: [{ from: "A", to: "B" }, { from: "B", to: "C" }, { from: "C", to: "A" }],
    },
  },
  {
    id: "rectangle-tri",
    icon: "geoRightTriangle",
    label: "Triangle rectangle",
    hint: "angle droit marqué en B",
    spec: {
      type: "epure", caption: "triangle rectangle en B",
      points: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 5, y: 0 }, { id: "C", x: 5, y: 3.6 }],
      segments: [{ from: "A", to: "B" }, { from: "B", to: "C" }, { from: "C", to: "A" }],
      angles: [{ at: "B", from: "A", to: "C", right: true }],
    },
  },
  {
    id: "median",
    icon: "geoMedian",
    label: "Triangle et médiane",
    hint: "sommet, milieu, médiane",
    spec: {
      type: "epure", caption: "médiane issue de C",
      points: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 6, y: 0 }, { id: "C", x: 4, y: 4.6 }, { id: "M", x: 3, y: 0, color: C.r }],
      segments: [
        { from: "A", to: "B" }, { from: "B", to: "C" }, { from: "C", to: "A" },
        { from: "C", to: "M", color: C.r, dash: "6 4", label: "médiane" },
      ],
    },
  },
  {
    id: "circumcircle",
    icon: "geoCircumcircle",
    label: "Cercle circonscrit",
    hint: "triangle inscrit dans un cercle",
    spec: {
      type: "epure", caption: "cercle circonscrit",
      points: [{ id: "O", x: 0, y: 0, color: C.g }, { id: "A", x: -2.6, y: -1.5 }, { id: "B", x: 2.6, y: -1.5 }, { id: "C", x: 0.6, y: 2.9 }],
      segments: [{ from: "A", to: "B" }, { from: "B", to: "C" }, { from: "C", to: "A" }],
      circles: [{ center: "O", through: "A", dash: "5 4" }],
    },
  },
  {
    id: "thales",
    icon: "geoThales",
    label: "Configuration de Thalès",
    hint: "deux sécantes, deux parallèles",
    spec: {
      type: "epure", caption: "droites sécantes et parallèles",
      points: [
        { id: "S", x: 0, y: 0 }, { id: "B", x: 6, y: 2.2 }, { id: "C", x: 5.2, y: 4.2 },
        { id: "B′", x: 2.7, y: 1, color: C.r }, { id: "C′", x: 2.34, y: 1.89, color: C.r },
      ],
      segments: [
        { from: "S", to: "B" }, { from: "S", to: "C" },
        { from: "B", to: "C" }, { from: "B′", to: "C′", color: C.r },
      ],
    },
  },
  {
    id: "parallelogram",
    icon: "geoParallelogram",
    label: "Parallélogramme",
    hint: "quatre sommets et les diagonales",
    spec: {
      type: "epure", caption: "les diagonales se coupent en leur milieu",
      points: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 5, y: 0 }, { id: "C", x: 6.6, y: 3.2 }, { id: "D", x: 1.6, y: 3.2 }, { id: "O", x: 3.3, y: 1.6, color: C.r }],
      segments: [
        { from: "A", to: "B" }, { from: "B", to: "C" }, { from: "C", to: "D" }, { from: "D", to: "A" },
        { from: "A", to: "C", color: C.r, dash: "5 4" }, { from: "B", to: "D", color: C.r, dash: "5 4" },
      ],
    },
  },
  {
    id: "inscribed",
    icon: "geoInscribed",
    label: "Angle inscrit et angle au centre",
    hint: "cercle, corde, deux angles",
    spec: {
      type: "epure", caption: "l'angle au centre vaut le double de l'angle inscrit",
      points: [{ id: "O", x: 0, y: 0 }, { id: "A", x: -2.8, y: -1.4 }, { id: "B", x: 2.8, y: -1.4 }, { id: "M", x: 0, y: 3.13 }],
      segments: [{ from: "O", to: "A" }, { from: "O", to: "B" }, { from: "M", to: "A", color: C.r }, { from: "M", to: "B", color: C.r }],
      circles: [{ center: "O", through: "A", color: C.k }],
      angles: [{ at: "O", from: "A", to: "B", color: C.b }, { at: "M", from: "A", to: "B", color: C.r }],
    },
  },
  {
    id: "axes",
    icon: "geoAxes",
    label: "Repère et point",
    hint: "deux axes et un point placé",
    spec: {
      type: "epure", caption: "repère orthonormé",
      points: [
        { id: "O", x: 0, y: 0 }, { id: "x", x: 5, y: 0, dot: false }, { id: "y", x: 0, y: 4, dot: false },
        { id: "M", x: 3.2, y: 2.6, color: C.r },
        // The FEET of the perpendiculars, not the ends of the axes. Projecting M onto
        // the point named "x" would draw a line to (5,0) — the tip of the axis — which
        // is a different figure entirely, and a wrong one.
        { id: "Hx", x: 3.2, y: 0, label: "3,2", color: C.g },
        { id: "Hy", x: 0, y: 2.6, label: "2,6", color: C.g },
      ],
      segments: [
        { from: "O", to: "x" }, { from: "O", to: "y" },
        { from: "M", to: "Hx", dash: "4 3", color: C.g }, { from: "M", to: "Hy", dash: "4 3", color: C.g },
      ],
      angles: [{ at: "O", from: "x", to: "y", right: true }],
    },
  },
];

export const emptyEpure = (): EpureSpec => ({
  type: "epure",
  points: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 5, y: 0 }],
  segments: [{ from: "A", to: "B" }],
});
