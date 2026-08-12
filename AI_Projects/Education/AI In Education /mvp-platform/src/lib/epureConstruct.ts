import { Point, Line, Circle, Segment, Triangle, intersections } from "@mathigon/euclid";
import type { Anchor, EpurePoint, EpureSpec } from "./epure";

// Points a teacher does not have to place.
//
// `epure.ts` already stores a figure as named points with everything else referring to
// them, so moving A moves the triangle. What it could not express is a point that is
// not placed at all but CONSTRUCTED — the foot of the perpendicular from C, the second
// intersection of two circles, the circumcentre. Those had to be typed in as literal
// coordinates, computed by hand, and they went stale the moment A moved: the drawing
// still said "milieu de [AB]" while the dot sat somewhere else.
//
// A construction is stored on the point itself (`from`), so nothing downstream learns a
// new construct — `indexPoints` resolves them and every anchor, extent, label and
// renderer keeps working on plain x/y. The arithmetic is @mathigon/euclid's rather than
// ours: intersecting a line with a circle is where hand-rolled geometry goes quietly
// wrong, and being wrong by two pixels in a construction figure is a false statement.

/** A curve to intersect — named by its defining points, so it moves when they do. */
export type EpureCurve =
  | { line: [Anchor, Anchor] }
  | { circle: { center: Anchor; through?: Anchor; r?: number } };

export type Construction =
  /** Midpoint of [AB]. */
  | { op: "midpoint"; of: [Anchor, Anchor] }
  /** Foot of the perpendicular dropped from `from` onto the line through `on`. */
  | { op: "foot"; from: Anchor; on: [Anchor, Anchor] }
  /** Mirror image, across a point (central symmetry) or a line (axial). */
  | { op: "reflect"; of: Anchor; over: Anchor | [Anchor, Anchor] }
  /** Rotation, in degrees, counter-clockwise — the figure's y axis points up. */
  | { op: "rotate"; of: Anchor; about: Anchor; deg: number }
  | { op: "translate"; of: Anchor; by: { dx: number; dy: number } }
  /**
   * Where two curves cross.
   *
   * `pick` chooses between the two solutions of a line/circle or circle/circle meeting.
   * They come back ordered, so "the other one" is a stable choice and not a coin toss.
   */
  | { op: "intersect"; of: [EpureCurve, EpureCurve]; pick?: number }
  /** Notable centres of triangle ABC. */
  | { op: "circumcenter" | "incenter" | "centroid" | "orthocenter"; of: [Anchor, Anchor, Anchor] }
  /** A point along [AB]: t = 0 at A, 1 at B, and outside [0,1] on the extension. */
  | { op: "along"; of: [Anchor, Anchor]; t: number }
  /** Polar placement: distance `r` from `from`, at `deg` from the positive x axis. */
  | { op: "polar"; from: Anchor; deg: number; r: number };

/** The op names, for validation in the editor and the round-trip gate. */
export const CONSTRUCTION_OPS = [
  "midpoint", "foot", "reflect", "rotate", "translate",
  "intersect", "circumcenter", "incenter", "centroid", "orthocenter",
  "along", "polar",
] as const;

/** What each op is called in the panel, and what it needs. */
export const CONSTRUCTION_LABELS: Record<string, string> = {
  midpoint: "Milieu de [AB]",
  foot: "Pied de la perpendiculaire",
  reflect: "Symétrique",
  rotate: "Image par rotation",
  translate: "Image par translation",
  intersect: "Intersection de deux lignes",
  circumcenter: "Centre du cercle circonscrit",
  incenter: "Centre du cercle inscrit",
  centroid: "Centre de gravité",
  orthocenter: "Orthocentre",
  along: "Point d'un segment",
  polar: "Point repéré par un angle",
};

type Pos = { x: number; y: number };

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const ok = (p: Pos | null | undefined): p is Pos => !!p && finite(p.x) && finite(p.y);
const toPos = (p: { x: number; y: number }): Pos => ({ x: p.x, y: p.y });

/**
 * The construction of a point, if it has one and it is shaped like an op we run.
 *
 * Content arrives from JSON that a human may have typed, so this never trusts the
 * declared type — an unknown `op` yields undefined and the point keeps its literal
 * coordinates rather than vanishing.
 */
export function constructionOf(p: EpurePoint): Construction | undefined {
  const c = (p as { from?: unknown }).from;
  if (!c || typeof c !== "object") return undefined;
  const op = (c as { op?: unknown }).op;
  if (typeof op !== "string" || !(CONSTRUCTION_OPS as readonly string[]).includes(op)) return undefined;
  return c as Construction;
}

/** Every point name a construction depends on — what has to be solved before it. */
function dependsOn(c: Construction): string[] {
  const out: string[] = [];
  const anchor = (a: Anchor | undefined) => { if (typeof a === "string") out.push(a); };
  const curve = (cu: EpureCurve | undefined) => {
    if (!cu || typeof cu !== "object") return;
    if ("line" in cu && Array.isArray(cu.line)) { anchor(cu.line[0]); anchor(cu.line[1]); }
    if ("circle" in cu && cu.circle && typeof cu.circle === "object") {
      anchor(cu.circle.center); anchor(cu.circle.through);
    }
  };
  switch (c.op) {
    case "midpoint": case "along": anchor(c.of?.[0]); anchor(c.of?.[1]); break;
    case "foot": anchor(c.from); anchor(c.on?.[0]); anchor(c.on?.[1]); break;
    case "reflect":
      anchor(c.of);
      if (Array.isArray(c.over)) { anchor(c.over[0]); anchor(c.over[1]); } else anchor(c.over);
      break;
    case "rotate": anchor(c.of); anchor(c.about); break;
    case "translate": anchor(c.of); break;
    case "intersect": curve(c.of?.[0]); curve(c.of?.[1]); break;
    case "circumcenter": case "incenter": case "centroid": case "orthocenter":
      anchor(c.of?.[0]); anchor(c.of?.[1]); anchor(c.of?.[2]); break;
    case "polar": anchor(c.from); break;
  }
  return out;
}

/** Run one construction against already-known positions, or null if it cannot be run. */
function evaluate(c: Construction, at: (a: Anchor | undefined) => Pos | null): Pos | null {
  const P = (a: Anchor | undefined) => {
    const p = at(a);
    return ok(p) ? new Point(p.x, p.y) : null;
  };

  const curve = (cu: EpureCurve | undefined): Line | Circle | null => {
    if (!cu || typeof cu !== "object") return null;
    if ("line" in cu) {
      const a = P(cu.line?.[0]);
      const b = P(cu.line?.[1]);
      // A "line" through one point twice has no direction; euclid would hand back NaN.
      if (!a || !b || a.equals(b)) return null;
      return new Line(a, b);
    }
    if ("circle" in cu) {
      const o = P(cu.circle?.center);
      if (!o) return null;
      const t = cu.circle?.through != null ? P(cu.circle.through) : null;
      const r = t ? Point.distance(o, t) : Number(cu.circle?.r);
      if (!finite(r) || r <= 0) return null;
      return new Circle(o, r);
    }
    return null;
  };

  try {
    switch (c.op) {
      case "midpoint": {
        const a = P(c.of?.[0]); const b = P(c.of?.[1]);
        return a && b ? toPos(new Segment(a, b).midpoint) : null;
      }
      case "along": {
        const a = P(c.of?.[0]); const b = P(c.of?.[1]);
        const t = Number(c.t);
        if (!a || !b || !finite(t)) return null;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      case "foot": {
        const p = P(c.from); const a = P(c.on?.[0]); const b = P(c.on?.[1]);
        if (!p || !a || !b || a.equals(b)) return null;
        return toPos(new Line(a, b).project(p));
      }
      case "reflect": {
        const p = P(c.of);
        if (!p) return null;
        if (Array.isArray(c.over)) {
          const a = P(c.over[0]); const b = P(c.over[1]);
          if (!a || !b || a.equals(b)) return null;
          return toPos(p.reflect(new Line(a, b)));
        }
        const o = P(c.over);
        // Central symmetry: euclid reflects across lines, so do the point case directly.
        return o ? { x: 2 * o.x - p.x, y: 2 * o.y - p.y } : null;
      }
      case "rotate": {
        const p = P(c.of); const o = P(c.about);
        const deg = Number(c.deg);
        if (!p || !o || !finite(deg)) return null;
        return toPos(p.rotate((deg * Math.PI) / 180, o));
      }
      case "translate": {
        const p = P(c.of);
        const dx = Number(c.by?.dx); const dy = Number(c.by?.dy);
        if (!p || !finite(dx) || !finite(dy)) return null;
        return { x: p.x + dx, y: p.y + dy };
      }
      case "intersect": {
        const u = curve(c.of?.[0]); const v = curve(c.of?.[1]);
        if (!u || !v) return null;
        const hits = intersections(u, v);
        // Parallel lines and circles that miss each other return nothing. That is a
        // real answer, not an error: the point does not exist, so it is not drawn.
        if (!hits.length) return null;
        const i = finite(c.pick) ? Math.trunc(c.pick as number) : 0;
        const hit = hits[i];
        return hit ? toPos(hit) : null;
      }
      case "circumcenter": case "incenter": case "centroid": case "orthocenter": {
        const a = P(c.of?.[0]); const b = P(c.of?.[1]); const d = P(c.of?.[2]);
        if (!a || !b || !d) return null;
        const t = new Triangle(a, b, d);
        // Three collinear points have no circumcircle and no incircle; euclid returns
        // undefined rather than throwing, so this is a real branch and not defensive
        // noise. The centroid is always defined, the orthocentre comes back as NaN and
        // is caught by ok() upstream.
        if (c.op === "circumcenter") return t.circumcircle ? toPos(t.circumcircle.c) : null;
        if (c.op === "incenter") return t.incircle ? toPos(t.incircle.c) : null;
        if (c.op === "centroid") return toPos(t.centroid);
        const h = toPos(t.orthocenter);
        return ok(h) ? h : null;
      }
      case "polar": {
        const o = P(c.from);
        const deg = Number(c.deg); const r = Number(c.r);
        if (!o || !finite(deg) || !finite(r)) return null;
        const a = (deg * Math.PI) / 180;
        return { x: o.x + r * Math.cos(a), y: o.y + r * Math.sin(a) };
      }
    }
  } catch {
    // Degenerate input (three collinear points have no circumcircle) throws inside
    // euclid. An undrawn point is the right outcome; a crashed lesson page is not.
    return null;
  }
  return null;
}

export type SolveResult = {
  /** id → resolved position, for every construction that ran. */
  solved: Map<string, Pos>;
  /** ids whose construction could not be run, and why, in French for the panel. */
  failed: { id: string; reason: string }[];
};

/**
 * Resolve every constructed point.
 *
 * Constructions may depend on other constructions (the foot of a perpendicular onto a
 * line through a midpoint), so this is a fixpoint loop rather than one pass: keep
 * evaluating whatever has become resolvable until a round changes nothing. What is left
 * over is either a cycle or a construction that genuinely has no answer, and the two are
 * distinguished for the message — a cycle is the teacher's mistake, an empty
 * intersection is often the figure's point.
 */
export function solveConstructions(spec: EpureSpec): SolveResult {
  const points = spec?.points ?? [];
  const solved = new Map<string, Pos>();
  const failed: { id: string; reason: string }[] = [];
  const pending = new Map<string, Construction>();
  const literal = new Map<string, Pos>();

  for (const p of points) {
    if (!p || typeof p.id !== "string" || !p.id) continue;
    const c = constructionOf(p);
    if (c) pending.set(p.id, c);
    else literal.set(p.id, { x: finite(p.x) ? p.x : 0, y: finite(p.y) ? p.y : 0 });
  }
  if (!pending.size) return { solved, failed };

  const at = (a: Anchor | undefined): Pos | null => {
    if (a == null) return null;
    if (typeof a !== "string") return finite(a.x) && finite(a.y) ? { x: a.x, y: a.y } : null;
    return solved.get(a) ?? literal.get(a) ?? null;
  };

  let progress = true;
  while (pending.size && progress) {
    progress = false;
    for (const [id, c] of [...pending]) {
      // Wait for dependencies rather than evaluating against a half-built figure: a
      // construction reading a not-yet-solved point would silently use (0,0).
      if (dependsOn(c).some((d) => d !== id && pending.has(d))) continue;
      pending.delete(id);
      progress = true;
      const p = evaluate(c, at);
      // A failure leaves the id out of `solved`, so the renderer keeps whatever literal
      // x/y the point still carries — a stale dot beats a dot silently at the origin.
      if (p) solved.set(id, p);
      else failed.push({ id, reason: reasonFor(id, c) });
    }
  }

  // Whatever is still pending depends on something still pending: a cycle.
  for (const [id, c] of pending) {
    failed.push({ id, reason: `« ${id} » : construction circulaire (${CONSTRUCTION_LABELS[c.op] ?? c.op}).` });
  }

  return { solved, failed };
}

function reasonFor(id: string, c: Construction): string {
  const what = CONSTRUCTION_LABELS[c.op] ?? c.op;
  if (c.op === "intersect") return `« ${id} » — ${what} : les deux lignes ne se coupent pas (ou sont mal définies).`;
  return `« ${id} » — ${what} : les points de référence manquent ou sont confondus.`;
}

/**
 * The spec with constructed points replaced by their computed coordinates.
 *
 * Returns the SAME object when there is nothing to construct, so the overwhelmingly
 * common figure pays nothing for the feature existing.
 */
export function applyConstructions(spec: EpureSpec): EpureSpec {
  if (!spec?.points?.some((p) => constructionOf(p))) return spec;
  const { solved } = solveConstructions(spec);
  if (!solved.size) return spec;
  return {
    ...spec,
    points: spec.points.map((p) => {
      const at = solved.get(p.id);
      return at ? { ...p, x: at.x, y: at.y } : p;
    }),
  };
}

/** Problems worth showing a teacher, in the same voice as epureProblems(). */
export function constructionProblems(spec: EpureSpec): string[] {
  if (!spec?.points?.some((p) => constructionOf(p))) return [];
  return solveConstructions(spec).failed.map((f) => f.reason);
}
