import type { EpureSpec } from "./epure";
import { renderEpure } from "./epure";
import { normalizeInteractive, type InteractiveSpec } from "./interactive";
import { compile } from "./figures";
import { findPoles, obliqueAsymptote } from "./curveAnalysis";
import { C } from "./figureSvg";

// The frozen frame of an interactive figure.
//
// Needed in three places that cannot run a graphing library: the teacher's editor, which
// draws every figure node synchronously from JSON; the server render of a lesson, before
// the widget's chunk has arrived; and anything that prints. Without it, opening a
// trigonometry lesson in the studio would show an empty box where the figure is — and,
// worse, a ```figure fence the editor cannot draw is a fence it can silently drop on
// save.
//
// It is built as an EpureSpec and handed to the existing renderer rather than emitting
// SVG directly. That is not just reuse: the still is then made of the same named points
// and CONSTRUCTIONS as any other figure in the platform, so the foot of the perpendicular
// from M really is computed as a foot, and the still cannot drift out of agreement with
// the live widget the way a second hand-drawn copy would.

const RED = "#dc2626";
const BLUE = "#2563eb";
const GREEN = "#0f766e";
const GREY = "#94a3b8";

const dec = (n: number, d = 2) => n.toFixed(d).replace("-", "−").replace(".", ",");

/** Unit circle, axes and the point M at `deg` — the skeleton of three of the widgets. */
function unitCircle(deg: number, reach = 1.32): EpureSpec {
  return {
    type: "epure",
    dots: true,
    points: [
      { id: "O", x: 0, y: 0, labelOff: { dx: -0.12, dy: -0.16 } },
      { id: "xa", x: reach, y: 0, dot: false, label: "" },
      { id: "ya", x: 0, y: reach, dot: false, label: "" },
      { id: "xb", x: -reach, y: 0, dot: false, label: "" },
      { id: "yb", x: 0, y: -reach, dot: false, label: "" },
      { id: "A", x: 1, y: 0, labelOff: { dx: 0.1, dy: -0.16 } },
      { id: "M", x: 0, y: 0, color: RED, from: { op: "polar", from: "O", deg, r: 1 }, labelOff: { dx: 0.12, dy: 0.12 } },
    ],
    segments: [],
    circles: [{ center: "O", through: "A", color: "#1f2937", width: 1.6 }],
    arrows: [
      { from: "xb", to: "xa", color: GREY, width: 1 },
      { from: "yb", to: "ya", color: GREY, width: 1 },
    ],
  };
}

function cercleStill(n: ReturnType<typeof normalizeInteractive>): EpureSpec {
  const s = unitCircle(n.angle, n.show.includes("tan") ? 1.5 : 1.32);
  const a = (n.angle * Math.PI) / 180;
  const pts = s.points;
  const segs = s.segments!;
  segs.push({ from: "O", to: "M", color: "#1f2937", width: 1.6 });

  if (n.show.includes("cos")) {
    pts.push({ id: "Hx", x: 0, y: 0, dot: false, label: "", from: { op: "foot", from: "M", on: ["O", "A"] } });
    segs.push({ from: "M", to: "Hx", color: GREY, dash: "4 3", width: 1.1 });
    segs.push({ from: "O", to: "Hx", color: RED, width: 3.2 });
  }
  if (n.show.includes("sin")) {
    pts.push({ id: "B", x: 0, y: 1, dot: false, label: "" });
    pts.push({ id: "Hy", x: 0, y: 0, dot: false, label: "", from: { op: "foot", from: "M", on: ["O", "B"] } });
    segs.push({ from: "M", to: "Hy", color: GREY, dash: "4 3", width: 1.1 });
    segs.push({ from: "O", to: "Hy", color: BLUE, width: 3.2 });
  }
  if (n.show.includes("tan") && Math.abs(Math.cos(a)) > 1e-3) {
    const t = Math.tan(a);
    if (Math.abs(t) < 1.45 && Math.cos(a) > 0) {
      pts.push({ id: "T", x: 1, y: t, color: GREEN, labelOff: { dx: 0.14, dy: 0 } });
      segs.push({ from: "A", to: "T", color: GREEN, width: 3.2 });
    }
  }
  if (n.show.includes("angle")) {
    s.angles = [{ at: "O", from: "A", to: "M", label: `${Math.round(n.angle)}°`, color: "#b45309" }];
  }
  s.labels = ([
    { at: { x: -1.28, y: 1.24 }, text: `cos α = ${dec(Math.cos(a))}`, color: RED, size: 11, anchor: "start" as const },
    { at: { x: -1.28, y: 1.06 }, text: `sin α = ${dec(Math.sin(a))}`, color: BLUE, size: 11, anchor: "start" as const },
  ]).filter((_, i) => (i === 0 ? n.show.includes("cos") : n.show.includes("sin")));
  s.height = 300;
  return s;
}

function arcsStill(n: ReturnType<typeof normalizeInteractive>): EpureSpec {
  const s = unitCircle(n.angle, 1.34);
  const segs = s.segments!;
  segs.push({ from: "O", to: "M", color: "#1f2937", width: 1.5 });
  const mirrors: [string, string, string, EpureSpec["points"][number]["from"]][] = [
    ["M1", "M₁", RED, { op: "reflect", of: "M", over: ["O", "A"] }],
    ["M2", "M₂", BLUE, { op: "reflect", of: "M", over: ["O", "B"] }],
    ["M3", "M₃", GREEN, { op: "reflect", of: "M", over: "O" }],
  ];
  s.points.push({ id: "B", x: 0, y: 1, dot: false, label: "" });
  for (const [id, label, color, from] of mirrors) {
    s.points.push({ id, x: 0, y: 0, label, color, from, labelOff: { dx: 0.13, dy: 0.13 } });
    segs.push({ from: "O", to: id, color, dash: "4 3", width: 1.2 });
  }
  s.labels = [
    { at: { x: -1.3, y: 1.24 }, text: `α = ${Math.round(n.angle)}°`, color: "#1f2937", size: 11, anchor: "start" },
  ];
  s.height = 300;
  return s;
}

/** The sine (or cosine) curve, sampled — the one shape that is not points and lines. */
function sinusoideStill(n: ReturnType<typeof normalizeInteractive>): EpureSpec {
  const f = n.fn === "cos" ? Math.cos : Math.sin;
  const CXc = -1.25;
  const a = (n.angle * Math.PI) / 180;
  const steps = 96;
  const d = Array.from({ length: steps + 1 }, (_, i) => {
    const x = (i / steps) * 2 * Math.PI;
    return `${i ? "L" : "M"}${x.toFixed(3)} ${f(x).toFixed(4)}`;
  }).join(" ");

  return {
    type: "epure",
    height: 300,
    points: [
      { id: "Cc", x: CXc, y: 0, dot: false, label: "" },
      { id: "Ca", x: CXc + 1, y: 0, dot: false, label: "" },
      { id: "M", x: 0, y: 0, color: RED, from: { op: "polar", from: "Cc", deg: n.angle, r: 1 }, labelOff: { dx: 0.12, dy: 0.14 } },
      { id: "P", x: a, y: f(a), color: RED, labelOff: { dx: 0.16, dy: 0.14 } },
      { id: "Pf", x: a, y: 0, dot: false, label: "" },
      { id: "ox", x: 0, y: 0, dot: false, label: "" },
      { id: "xa", x: 2 * Math.PI + 0.42, y: 0, dot: false, label: "" },
      { id: "ya", x: 0, y: 1.32, dot: false, label: "" },
      { id: "yb", x: 0, y: -1.32, dot: false, label: "" },
    ],
    circles: [{ center: "Cc", through: "Ca", color: "#1f2937", width: 1.5 }],
    segments: [
      { from: "Cc", to: "M", color: "#1f2937", width: 1.4 },
      { from: "M", to: "P", color: RED, dash: "4 3", width: 1.2 },
      { from: "Pf", to: "P", color: RED, width: 2 },
      { from: { x: CXc - 1.16, y: 0 }, to: { x: CXc + 1.16, y: 0 }, color: GREY, width: 1 },
      { from: { x: CXc, y: -1.16 }, to: { x: CXc, y: 1.16 }, color: GREY, width: 1 },
    ],
    arrows: [
      { from: "ox", to: "xa", color: GREY, width: 1 },
      { from: "yb", to: "ya", color: GREY, width: 1 },
    ],
    paths: [{ d, color: BLUE, width: 2.4 }],
    labels: [
      { at: { x: Math.PI, y: -1.5 }, text: "π", color: GREY, size: 11 },
      { at: { x: 2 * Math.PI, y: -1.5 }, text: "2π", color: GREY, size: 11 },
      { at: { x: 3.1, y: 1.42 }, text: `${n.fn} ${Math.round(n.angle)}° = ${dec(f(a))}`, color: "#1f2937", size: 11 },
    ],
  };
}

function triangleStill(n: ReturnType<typeof normalizeInteractive>): EpureSpec {
  const A = { x: 0.4, y: 0.4 }, B = { x: 6.6, y: 0.4 }, Cp = { x: 2.6, y: 4.2 };
  const len = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);
  const a = len(B, Cp), b = len(Cp, A), c = len(A, B);
  const ang = (opp: number, s1: number, s2: number) =>
    (Math.acos(Math.min(1, Math.max(-1, (s1 * s1 + s2 * s2 - opp * opp) / (2 * s1 * s2)))) * 180) / Math.PI;

  const spec: EpureSpec = {
    type: "epure",
    height: 320,
    points: [
      { id: "A", ...A, labelOff: { dx: -0.34, dy: -0.2 } },
      { id: "B", ...B, labelOff: { dx: 0.3, dy: -0.2 } },
      { id: "C", ...Cp, labelOff: { dx: 0, dy: 0.36 } },
    ],
    segments: [
      { from: "A", to: "B", color: "#1f2937", width: 2 },
      { from: "B", to: "C", color: "#1f2937", width: 2 },
      { from: "C", to: "A", color: "#1f2937", width: 2 },
    ],
  };

  if (n.show.includes("cotes")) {
    // Free labels rather than segment labels: renderEpure offsets a segment's label by a
    // fixed 13 px along the normal, which a six-character measurement on a slanted side
    // still overlaps. Placed here in user units, pushed away from the opposite vertex,
    // matching what the live board does.
    const side = (P: { x: number; y: number }, Q: { x: number; y: number }, R: { x: number; y: number }, text: string) => {
      const mx = (P.x + Q.x) / 2, my = (P.y + Q.y) / 2;
      const dx = Q.x - P.x, dy = Q.y - P.y;
      const L = Math.hypot(dx, dy) || 1;
      let nx = -dy / L, ny = dx / L;
      if (nx * (R.x - mx) + ny * (R.y - my) > 0) { nx = -nx; ny = -ny; }
      return { at: { x: mx + nx * 0.5, y: my + ny * 0.5 }, text, color: GREY, size: 11 };
    };
    spec.labels = [
      side(B, Cp, A, `a = ${dec(a)}`),
      side(Cp, A, B, `b = ${dec(b)}`),
      side(A, B, Cp, `c = ${dec(c)}`),
    ];
  }
  if (n.show.includes("angles")) {
    spec.angles = [
      { at: "A", from: "B", to: "C", label: `${Math.round(ang(a, b, c))}°`, color: "#b45309" },
      { at: "B", from: "C", to: "A", label: `${Math.round(ang(b, c, a))}°`, color: GREEN },
      { at: "C", from: "A", to: "B", label: `${Math.round(ang(c, a, b))}°`, color: "#7c3aed" },
    ];
  }
  if (n.show.includes("sinus")) {
    const q = a / Math.sin((ang(a, b, c) * Math.PI) / 180);
    spec.labels = [
      ...(spec.labels ?? []),
      { at: { x: 0.2, y: 5.4 }, text: `a / sin A = b / sin B = c / sin C = ${dec(q, 3)}`, color: C.g, size: 11, anchor: "start" },
    ];
  }
  return spec;
}

/* ── analyse ──
 *
 * These stills sample the curve into an EpurePath rather than describing it with points,
 * which is exactly the escape hatch EpurePath was written for: a plotted curve is not a
 * set of named points and pretending otherwise would be worse than saying so.
 */

type Norm = ReturnType<typeof normalizeInteractive>;

/** Axes, frame and the sampled curve — the skeleton the five analysis stills share. */
function plotStill(n: Norm, f: (x: number) => number, extra: Partial<EpureSpec> = {}): EpureSpec {
  const steps = 240;
  const segs: string[] = [];
  let pen = false;
  // Clipped to the declared window, with only a hair of overshoot so a curve leaving the
  // top does not stop short of the edge. renderEpure auto-fits to whatever it is given,
  // so letting the curve run far outside would silently rescale the whole figure and the
  // window the author chose would not be the window they got.
  const pad = (n.ymax - n.ymin) * 0.02;
  for (let i = 0; i <= steps; i++) {
    const x = n.xmin + ((n.xmax - n.xmin) * i) / steps;
    const y = f(x);
    // Breaking the path is also what stops a pole drawing a vertical line across the
    // plot, claiming values the function never takes.
    if (!Number.isFinite(y) || y < n.ymin - pad || y > n.ymax + pad) { pen = false; continue; }
    segs.push(`${pen ? "L" : "M"}${x.toFixed(3)} ${y.toFixed(3)}`);
    pen = true;
  }
  return {
    type: "epure",
    height: 320,
    dots: false,
    points: [
      { id: "o", x: n.xmin, y: n.ymin, dot: false, label: "" },
      { id: "p", x: n.xmax, y: n.ymax, dot: false, label: "" },
    ],
    arrows: [
      { from: { x: n.xmin, y: 0 }, to: { x: n.xmax, y: 0 }, color: GREY, width: 1 },
      { from: { x: 0, y: n.ymin }, to: { x: 0, y: n.ymax }, color: GREY, width: 1 },
    ],
    paths: segs.length > 1 ? [{ d: segs.join(" "), color: BLUE, width: 2.4 }] : [],
    ...extra,
  };
}

const safe = (expr: string, params: readonly string[]) => compile(expr, params);

function fonctionStill(n: Norm): EpureSpec {
  const f = safe(n.expr, ["a", "b", "c"]);
  const scope = { a: n.a, b: n.b, c: n.c };
  const g = (x: number) => (f ? f(x, scope) : NaN);
  const s = plotStill(n, g);
  s.labels = [
    { at: { x: n.xmin + (n.xmax - n.xmin) * 0.03, y: n.ymax - (n.ymax - n.ymin) * 0.06 }, text: f ? `y = ${n.expr}` : `Expression non reconnue : ${n.expr}`, color: f ? C.g : "#dc2626", size: 11, anchor: "start" },
    { at: { x: n.xmin + (n.xmax - n.xmin) * 0.03, y: n.ymax - (n.ymax - n.ymin) * 0.14 }, text: `a = ${dec(n.a)}   b = ${dec(n.b)}   c = ${dec(n.c)}`, color: "#4f46e5", size: 11, anchor: "start" },
  ];
  return s;
}

function tangenteStill(n: Norm): EpureSpec {
  const f = safe(n.expr, ["a", "b", "c"]);
  const g = (x: number) => (f ? f(x, { a: n.a, b: n.b, c: n.c }) : NaN);
  const x0 = (n.xmin + n.xmax) / 2 + (n.xmax - n.xmin) * 0.18;
  const h = (n.xmax - n.xmin) * 1e-4;
  const m = (g(x0 + h) - g(x0 - h)) / (2 * h);
  const y0 = g(x0);
  const s = plotStill(n, g);
  if (Number.isFinite(y0) && Number.isFinite(m)) {
    const dx = (n.xmax - n.xmin) * 0.3;
    s.points.push({ id: "M", x: x0, y: y0, color: RED, labelOff: { dx: 0, dy: (n.ymax - n.ymin) * 0.05 } });
    s.segments = [{ from: { x: x0 - dx, y: y0 - m * dx }, to: { x: x0 + dx, y: y0 + m * dx }, color: RED, width: 2 }];
    s.labels = [
      { at: { x: n.xmin + (n.xmax - n.xmin) * 0.03, y: n.ymax - (n.ymax - n.ymin) * 0.06 }, text: `f ′(${dec(x0)}) = ${dec(m)}`, color: RED, size: 11, anchor: "start" },
    ];
  }
  return s;
}

function asymptotesStill(n: Norm): EpureSpec {
  const f = safe(n.expr, ["a", "b", "c"]);
  const g = (x: number) => (f ? f(x, { a: n.a, b: n.b, c: n.c }) : NaN);
  const s = plotStill(n, g);
  // Same two estimators the live board uses, imported rather than re-derived — this
  // still and that board must not be able to disagree about where an asymptote is.
  const poles = findPoles(g, n);
  s.segments = poles.map((p) => ({ from: { x: p, y: n.ymin }, to: { x: p, y: n.ymax }, color: RED, dash: "5 4", width: 1.3 }));
  s.labels = poles.map((p) => ({ at: { x: p, y: n.ymin + (n.ymax - n.ymin) * 0.05 }, text: `x = ${dec(p)}`, color: RED, size: 10, anchor: "middle" as const }));
  const { m, p: q } = obliqueAsymptote(g, n);
  if (Number.isFinite(m) && Number.isFinite(q) && Math.abs(m) < 1e4) {
    s.segments.push({ from: { x: n.xmin, y: m * n.xmin + q }, to: { x: n.xmax, y: m * n.xmax + q }, color: GREEN, dash: "5 4", width: 1.4 });
    s.labels.push({ at: { x: n.xmin + (n.xmax - n.xmin) * 0.03, y: n.ymax - (n.ymax - n.ymin) * 0.06 }, text: `asymptote : y = ${dec(m)} x ${q < 0 ? "−" : "+"} ${dec(Math.abs(q))}`, color: GREEN, size: 11, anchor: "start" as const });
  }
  return s;
}

function secondDegreStill(n: Norm): EpureSpec {
  const y = (x: number) => n.a * x * x + n.b * x + n.c;
  const d = n.b * n.b - 4 * n.a * n.c;
  const s = plotStill(n, y);
  s.labels = [
    { at: { x: n.xmin + (n.xmax - n.xmin) * 0.03, y: n.ymax - (n.ymax - n.ymin) * 0.06 }, text: `y = ${dec(n.a)} x² ${n.b < 0 ? "−" : "+"} ${dec(Math.abs(n.b))} x ${n.c < 0 ? "−" : "+"} ${dec(Math.abs(n.c))}`, color: C.g, size: 11, anchor: "start" },
    { at: { x: n.xmin + (n.xmax - n.xmin) * 0.03, y: n.ymax - (n.ymax - n.ymin) * 0.14 }, text: `Δ = ${dec(d)}${d > 0 ? " — deux racines" : Math.abs(d) < 1e-9 ? " — racine double" : " — aucune racine réelle"}`, color: d >= 0 ? GREEN : RED, size: 11, anchor: "start" },
  ];
  if (Math.abs(n.a) > 1e-9) {
    const xs = -n.b / (2 * n.a);
    s.points.push({ id: "S", x: xs, y: y(xs), color: "#7c3aed", labelOff: { dx: 0, dy: (n.ymax - n.ymin) * 0.05 } });
    if (d >= 0) {
      for (const sign of [-1, 1]) {
        const r = (-n.b + sign * Math.sqrt(d)) / (2 * n.a);
        s.points.push({ id: `r${sign > 0 ? "2" : "1"}`, x: r, y: 0, color: RED, label: "" });
      }
    }
  }
  return s;
}

function suiteStill(n: Norm): EpureSpec {
  const f = safe(n.expr, ["a", "b", "c"]);
  const g = (x: number) => (f ? f(x, { a: n.a, b: n.b, c: n.c }) : NaN);
  const s = plotStill(n, g);
  s.segments = [{ from: { x: n.xmin, y: n.xmin }, to: { x: n.xmax, y: n.xmax }, color: GREY, dash: "4 3", width: 1.2 }];
  let u = n.xmin + (n.xmax - n.xmin) * 0.15;
  for (let i = 0; i < 14; i++) {
    const v = g(u);
    if (!Number.isFinite(v)) break;
    s.segments.push({ from: { x: u, y: u }, to: { x: u, y: v }, color: "#b45309", width: 1.1 });
    s.segments.push({ from: { x: u, y: v }, to: { x: v, y: v }, color: "#b45309", width: 1.1 });
    u = v;
  }
  s.points.push({ id: "u0", x: n.xmin + (n.xmax - n.xmin) * 0.15, y: 0, label: "u₀", color: "#b45309", labelOff: { dx: 0, dy: -(n.ymax - n.ymin) * 0.06 } });
  return s;
}

/* ── géométrie ── */

function angleInscritStill(n: Norm): EpureSpec {
  return {
    type: "epure",
    height: 300,
    points: [
      { id: "O", x: 0, y: 0, labelOff: { dx: -0.1, dy: -0.16 } },
      { id: "R", x: 1, y: 0, dot: false, label: "" },
      { id: "A", x: 0, y: 0, from: { op: "polar", from: "O", deg: 205, r: 1 }, labelOff: { dx: -0.16, dy: -0.1 } },
      { id: "B", x: 0, y: 0, from: { op: "polar", from: "O", deg: 335, r: 1 }, labelOff: { dx: 0.16, dy: -0.1 } },
      { id: "M", x: 0, y: 0, color: RED, from: { op: "polar", from: "O", deg: 75, r: 1 }, labelOff: { dx: 0.14, dy: 0.14 } },
    ],
    circles: [{ center: "O", through: "R", color: "#1f2937", width: 1.6 }],
    segments: [
      { from: "A", to: "B", color: "#1f2937", width: 1.8 },
      { from: "O", to: "A", color: BLUE, width: 1.5 },
      { from: "O", to: "B", color: BLUE, width: 1.5 },
      { from: "M", to: "A", color: RED, width: 1.8 },
      { from: "M", to: "B", color: RED, width: 1.8 },
    ],
    angles: [
      { at: "O", from: "A", to: "B", label: "130°", color: BLUE },
      { at: "M", from: "A", to: "B", label: "65°", color: RED },
    ],
    labels: [
      { at: { x: -1.5, y: 1.34 }, text: "angle au centre = 130°", color: BLUE, size: 11, anchor: "start" },
      { at: { x: -1.5, y: 1.16 }, text: "angle inscrit = 65°", color: RED, size: 11, anchor: "start" },
    ],
  };
}

function coniqueStill(n: Norm): EpureSpec {
  const a = Math.max(0.6, Math.abs(n.a) || 4);
  const b = Math.max(0.4, Math.abs(n.b) || 2.4);
  const pts: string[] = [];
  const push = (x: number, y: number, first: boolean) => pts.push(`${first ? "M" : "L"}${x.toFixed(3)} ${y.toFixed(3)}`);
  const paths: { d: string; color?: string; width?: number; dash?: string }[] = [];
  let c = 0, ecc = 1;

  if (n.conic === "ellipse") {
    for (let i = 0; i <= 160; i++) { const t = (i / 160) * 2 * Math.PI; push(a * Math.cos(t), b * Math.sin(t), i === 0); }
    paths.push({ d: pts.join(" "), color: BLUE, width: 2.4 });
    c = Math.sqrt(Math.max(0, a * a - b * b));
    ecc = c / a;
  } else if (n.conic === "hyperbole") {
    for (const s of [1, -1]) {
      const br: string[] = [];
      for (let i = 0; i <= 80; i++) { const t = -2.2 + (i / 80) * 4.4; br.push(`${i === 0 ? "M" : "L"}${(s * a * Math.cosh(t)).toFixed(3)} ${(b * Math.sinh(t)).toFixed(3)}`); }
      paths.push({ d: br.join(" "), color: BLUE, width: 2.4 });
    }
    c = Math.sqrt(a * a + b * b);
    ecc = c / a;
  } else {
    for (let i = 0; i <= 160; i++) { const t = -a + (i / 160) * 2 * a; push((t * t) / (2 * b), t, i === 0); }
    paths.push({ d: pts.join(" "), color: BLUE, width: 2.4 });
    c = b / 2;
    ecc = 1;
  }

  const R = Math.max(a, b) * 1.6;
  const spec: EpureSpec = {
    type: "epure",
    height: 300,
    dots: false,
    points: [
      { id: "lo", x: -R, y: -R * 0.62, dot: false, label: "" },
      { id: "hi", x: R, y: R * 0.62, dot: false, label: "" },
    ],
    arrows: [
      { from: { x: -R, y: 0 }, to: { x: R, y: 0 }, color: GREY, width: 1 },
      { from: { x: 0, y: -R * 0.6 }, to: { x: 0, y: R * 0.6 }, color: GREY, width: 1 },
    ],
    paths,
    labels: [
      { at: { x: -R * 0.95, y: R * 0.55 }, text: `${n.conic} — e = ${dec(ecc, 3)}`, color: C.g, size: 11, anchor: "start" },
    ],
  };
  const foci = n.conic === "parabole" ? [c] : [c, -c];
  spec.points.push(...foci.map((fx, i) => ({ id: `F${i}`, x: fx, y: 0, label: i === 0 ? "F" : "F′", color: RED, dot: true, labelOff: { dx: 0, dy: -R * 0.09 } })));
  return spec;
}

function vecteursStill(): EpureSpec {
  return {
    type: "epure",
    height: 300,
    points: [
      { id: "O", x: 0, y: 0, labelOff: { dx: -0.35, dy: -0.35 } },
      { id: "U", x: 3.4, y: 1.2, label: "u", color: RED, labelOff: { dx: 0.35, dy: 0.3 } },
      { id: "V", x: 1.1, y: 2.8, label: "v", color: BLUE, labelOff: { dx: -0.35, dy: 0.3 } },
      { id: "S", x: 0, y: 0, label: "u + v", color: "#7c3aed", from: { op: "translate", of: "U", by: { dx: 1.1, dy: 2.8 } }, labelOff: { dx: 0.7, dy: 0.35 } },
    ],
    arrows: [
      { from: "O", to: "U", color: RED, width: 2.2 },
      { from: "O", to: "V", color: BLUE, width: 2.2 },
      { from: "O", to: "S", color: "#7c3aed", width: 2.4 },
    ],
    segments: [
      { from: "U", to: "S", color: BLUE, dash: "4 3", width: 1.1 },
      { from: "V", to: "S", color: RED, dash: "4 3", width: 1.1 },
    ],
    labels: [
      { at: { x: -0.4, y: 4.5 }, text: "u (3,40 ; 1,20)   v (1,10 ; 2,80)   u + v (4,50 ; 4,00)", color: C.g, size: 11, anchor: "start" },
    ],
  };
}

function complexeStill(): EpureSpec {
  const x = 1.6, y = 1.2;
  const mod = Math.hypot(x, y);
  const arg = (Math.atan2(y, x) * 180) / Math.PI;
  return {
    type: "epure",
    height: 300,
    points: [
      { id: "O", x: 0, y: 0, dot: true, label: "", },
      { id: "R", x: mod, y: 0, dot: false, label: "" },
      { id: "z", x, y, label: "z", color: "#1f2937", labelOff: { dx: 0.22, dy: 0.22 } },
      { id: "zb", x: 0, y: 0, label: "z̄", color: BLUE, from: { op: "reflect", of: "z", over: ["O", "R"] }, labelOff: { dx: 0.22, dy: -0.22 } },
    ],
    circles: [{ center: "O", through: "R", color: GREY, dash: "4 3", width: 1 }],
    arrows: [
      { from: { x: -3.4, y: 0 }, to: { x: 3.4, y: 0 }, color: GREY, width: 1 },
      { from: { x: 0, y: -2.6 }, to: { x: 0, y: 2.6 }, color: GREY, width: 1 },
      { from: "O", to: "z", color: "#1f2937", width: 1.8 },
    ],
    segments: [{ from: "z", to: "zb", color: BLUE, dash: "4 3", width: 1 }],
    labels: [
      { at: { x: -3.3, y: 2.4 }, text: `z = ${dec(x)} + ${dec(y)} i`, color: "#1f2937", size: 11, anchor: "start" },
      { at: { x: -3.3, y: 2.1 }, text: `|z| = ${dec(mod)}   arg z = ${dec(arg, 0)}°`, color: GREY, size: 11, anchor: "start" },
      { at: { x: 3.15, y: 0.24 }, text: "Re", color: GREY, size: 10 },
      { at: { x: 0.42, y: 2.45 }, text: "Im", color: GREY, size: 10 },
    ],
  };
}

function triangleRectangleStill(): EpureSpec {
  const A = { x: 0.5, y: 0.5 }, B = { x: 6.5, y: 0.5 }, Cp = { x: 6.5, y: 3.6 };
  const opp = Cp.y - B.y, adj = B.x - A.x, hyp = Math.hypot(Cp.x - A.x, Cp.y - A.y);
  return {
    type: "epure",
    height: 320,
    points: [
      { id: "A", ...A, labelOff: { dx: -0.35, dy: -0.2 } },
      { id: "B", ...B, labelOff: { dx: 0.3, dy: -0.2 } },
      { id: "C", ...Cp, labelOff: { dx: 0.3, dy: 0.2 } },
    ],
    segments: [
      { from: "A", to: "B", color: "#1f2937", width: 2 },
      { from: "B", to: "C", color: "#1f2937", width: 2 },
      { from: "C", to: "A", color: "#1f2937", width: 2 },
    ],
    angles: [
      { at: "B", from: "A", to: "C", right: true, color: GREY },
      { at: "A", from: "B", to: "C", label: `${dec((Math.atan2(opp, adj) * 180) / Math.PI, 0)}°`, color: "#b45309" },
    ],
    labels: [
      { at: { x: (A.x + B.x) / 2, y: A.y - 0.45 }, text: `adjacent = ${dec(adj)}`, color: GREY, size: 11 },
      { at: { x: B.x + 1.25, y: (B.y + Cp.y) / 2 }, text: `opposé = ${dec(opp)}`, color: GREY, size: 11 },
      { at: { x: (A.x + Cp.x) / 2 - 0.4, y: (A.y + Cp.y) / 2 + 0.45 }, text: `hypoténuse = ${dec(hyp)}`, color: GREY, size: 11 },
      { at: { x: 0.2, y: 5.2 }, text: `sin A = ${dec(opp / hyp)}   cos A = ${dec(adj / hyp)}   tan A = ${dec(opp / adj)}`, color: C.g, size: 11, anchor: "start" },
    ],
  };
}

const STILLS = {
  "cercle-trigonometrique": cercleStill,
  "arcs-associes": arcsStill,
  sinusoide: sinusoideStill,
  "triangle-quelconque": triangleStill,
  "triangle-rectangle": triangleRectangleStill,
  fonction: fonctionStill,
  tangente: tangenteStill,
  asymptotes: asymptotesStill,
  "second-degre": secondDegreStill,
  suite: suiteStill,
  "angle-inscrit": angleInscritStill,
  conique: coniqueStill,
  vecteurs: vecteursStill,
  complexe: complexeStill,
} as const;

/** The interactive figure as an ordinary épure — points, constructions and all. */
export function interactiveStillSpec(spec: InteractiveSpec): EpureSpec {
  const n = normalizeInteractive(spec);
  return STILLS[n.widget](n);
}

/** The interactive figure as static SVG, for the editor and the server render. */
export function renderInteractiveStill(spec: InteractiveSpec): string {
  return renderEpure(interactiveStillSpec(spec));
}
