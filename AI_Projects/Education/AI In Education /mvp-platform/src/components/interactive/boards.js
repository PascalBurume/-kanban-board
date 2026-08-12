// The interactive widgets, built against a JSXGraph instance.
//
// Kept out of the React component on purpose: this file never touches React, and the
// component never touches JSXGraph. What crosses between them is a container id and a
// normalized spec, so the whole graphing library stays behind one dynamic import and off
// the server-rendered page.
//
// Two rules run through all of them:
//
//   * keepAspectRatio, for anything in the PLANE. A trigonometric circle drawn with
//     different x and y scales is an ellipse, and then the abscissa of M is not cos α
//     and the figure is a lie. Same argument as the single scale factor in epure.ts.
//     The analysis widgets turn it off deliberately: on a function plot x and y carry
//     different units, and forcing them equal squashes the window the author chose.
//   * Nothing is a free number. Every readout is a function of the draggable point, so
//     there is no state to keep in sync and no frame where the label disagrees with the
//     drawing.

// The SAME shunting-yard compiler the static ```figure function block uses. Shared on
// purpose: a teacher who has written one graph already knows this syntax, and there is
// exactly one place where an expression can be got wrong. It never uses eval.
import { compile } from "@/lib/figures";
import { findPoles, obliqueAsymptote, findRoots } from "@/lib/curveAnalysis";

const INK = "#1f2937";
const RED = "#dc2626";   // cosinus — the abscissa
const BLUE = "#2563eb";  // sinus — the ordonnée
const GREEN = "#0f766e"; // tangente
const GREY = "#94a3b8";

/** French decimals: the comma is the separator a Congolese pupil writes. */
const fmt = (n, d = 2) => {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(d).replace("-", "−").replace(".", ",");
};

/** Angle of a point on the circle, in [0, 2π). */
const angleOf = (p, cx = 0, cy = 0) => {
  const a = Math.atan2(p.Y() - cy, p.X() - cx);
  return a < 0 ? a + 2 * Math.PI : a;
};

const deg = (rad) => (rad * 180) / Math.PI;

const BOARD = {
  showCopyright: false,
  showNavigation: false,
  keepAspectRatio: true,
  // Panning and zooming would let a pupil lose the figure off the edge of a phone
  // screen with no way back, and neither adds anything: every widget is framed on
  // exactly what it is about.
  pan: { enabled: false },
  zoom: { enabled: false },
  showInfobox: false,
  // The board is a fixed-height box in a fluid column, so its width changes on rotation
  // and on the tablet/phone toggle in the studio.
  resize: { enabled: true, throttle: 200 },
};

const AXIS = {
  strokeColor: GREY,
  highlightStrokeColor: GREY,
  ticks: { visible: false, drawLabels: false },
  lastArrow: { size: 6 },
};

/** A read-only label pinned in board coordinates. */
const readout = (board, x, y, fn, color) =>
  board.create("text", [x, y, fn], {
    fontSize: 13, color, fixed: true, highlight: false, cssStyle: "font-family:Georgia,serif",
  });

/** The draggable point every circle widget is built around. */
const gliderM = (board, circle, angle) => {
  const a = (angle * Math.PI) / 180;
  const m = board.create("glider", [Math.cos(a), Math.sin(a), circle], {
    name: "M", size: 5, strokeColor: INK, fillColor: INK,
    label: { offset: [8, 8], fontSize: 15, cssStyle: "font-style:italic" },
  });
  // The only affordance a pupil gets that this figure is not a picture.
  m.setAttribute({ highlightFillColor: RED, highlightStrokeColor: RED });
  return m;
};

function cercleTrigonometrique(JXG, id, spec) {
  const wantsTan = spec.show.includes("tan");
  const board = JXG.JSXGraph.initBoard(id, {
    ...BOARD,
    boundingbox: wantsTan ? [-1.5, 1.45, 2.65, -1.55] : [-1.5, 1.45, 1.5, -1.55],
  });
  board.create("axis", [[0, 0], [1, 0]], AXIS);
  board.create("axis", [[0, 0], [0, 1]], AXIS);

  const O = board.create("point", [0, 0], { name: "O", size: 2, fixed: true, color: INK, label: { offset: [-14, -12] } });
  const A = board.create("point", [1, 0], { name: "A", size: 2, fixed: true, color: INK, label: { offset: [6, -14] } });
  const circle = board.create("circle", [O, 1], { strokeColor: INK, strokeWidth: 1.6, fillOpacity: 0 });
  const M = gliderM(board, circle, spec.angle);

  board.create("segment", [O, M], { strokeColor: INK, strokeWidth: 1.6 });

  if (spec.show.includes("cos")) {
    const foot = board.create("point", [() => M.X(), 0], { visible: false });
    board.create("segment", [M, foot], { strokeColor: GREY, dash: 2, strokeWidth: 1.2 });
    board.create("segment", [O, foot], { strokeColor: RED, strokeWidth: 3.2 });
  }
  if (spec.show.includes("sin")) {
    const foot = board.create("point", [0, () => M.Y()], { visible: false });
    board.create("segment", [M, foot], { strokeColor: GREY, dash: 2, strokeWidth: 1.2 });
    board.create("segment", [O, foot], { strokeColor: BLUE, strokeWidth: 3.2 });
  }

  if (wantsTan) {
    // The tangent axis is the vertical x = 1; tan α is where OM meets it. Near ±π/2 that
    // is off at infinity, so the segment is drawn only while it is on the board — an
    // honest way to show that tan has no value there, rather than a line shooting away.
    board.create("line", [[1, -1.55], [1, 1.45]], { strokeColor: GREEN, strokeWidth: 1, dash: 3, straightFirst: false, straightLast: false });
    const T = board.create("point", [
      () => 1,
      () => (Math.abs(M.X()) < 1e-6 ? NaN : M.Y() / M.X()),
    ], {
      name: "T", size: 3, color: GREEN, withLabel: false,
      visible: () => Math.abs(M.Y() / M.X()) < 1.45 && M.X() > 0,
    });
    board.create("segment", [A, T], {
      strokeColor: GREEN, strokeWidth: 3.2,
      visible: () => Math.abs(M.Y() / M.X()) < 1.45 && M.X() > 0,
    });
  }

  if (spec.show.includes("angle")) {
    board.create("angle", [A, O, M], {
      radius: 0.28, strokeColor: "#b45309", fillColor: "#f59e0b", fillOpacity: 0.22,
      name: () => `${Math.round(deg(angleOf(M)))}°`,
      label: { fontSize: 12, color: "#92400e" },
    });
  }

  const x = wantsTan ? 1.35 : -1.42;
  const top = 1.3;
  readout(board, x, top, () => `α = ${fmt(deg(angleOf(M)), 0)}°`, INK);
  if (spec.show.includes("cos")) readout(board, x, top - 0.22, () => `cos α = ${fmt(M.X())}`, RED);
  if (spec.show.includes("sin")) readout(board, x, top - 0.44, () => `sin α = ${fmt(M.Y())}`, BLUE);
  if (wantsTan) {
    readout(board, x, top - 0.66, () => {
      const c = M.X();
      return Math.abs(c) < 1e-3 ? "tan α non définie" : `tan α = ${fmt(M.Y() / c)}`;
    }, GREEN);
  }
  if (spec.show.includes("coords")) {
    readout(board, x, top - 0.88, () => `M (${fmt(M.X())} ; ${fmt(M.Y())})`, GREY);
  }
  return board;
}

function arcsAssocies(JXG, id, spec) {
  const board = JXG.JSXGraph.initBoard(id, { ...BOARD, boundingbox: [-1.9, 1.5, 1.9, -1.6] });
  board.create("axis", [[0, 0], [1, 0]], AXIS);
  board.create("axis", [[0, 0], [0, 1]], AXIS);

  const O = board.create("point", [0, 0], { name: "O", size: 2, fixed: true, color: INK, label: { offset: [-14, -12] } });
  const circle = board.create("circle", [O, 1], { strokeColor: INK, strokeWidth: 1.6, fillOpacity: 0 });
  const M = gliderM(board, circle, spec.angle);

  // The three associated arcs of the book: −α, π−α, π+α. Each is a mirror of M, so each
  // one moves the instant M does, which is the entire content of the article.
  const mirrors = [
    { at: () => [M.X(), -M.Y()], name: "M₁", note: "−α", color: RED },
    { at: () => [-M.X(), M.Y()], name: "M₂", note: "π−α", color: BLUE },
    { at: () => [-M.X(), -M.Y()], name: "M₃", note: "π+α", color: GREEN },
  ];

  board.create("segment", [O, M], { strokeColor: INK, strokeWidth: 1.4 });
  for (const m of mirrors) {
    const P = board.create("point", [() => m.at()[0], () => m.at()[1]], {
      name: m.name, size: 4, color: m.color, fillColor: m.color,
      label: { offset: [8, 8], fontSize: 13, cssStyle: "font-style:italic" },
    });
    board.create("segment", [O, P], { strokeColor: m.color, strokeWidth: 1.2, dash: 2 });
    if (spec.show.includes("labels")) {
      board.create("text", [() => P.X() * 1.24, () => P.Y() * 1.24, m.note], {
        fontSize: 12, color: m.color, fixed: true, highlight: false, anchorX: "middle",
        cssStyle: "font-family:Georgia,serif",
      });
    }
  }

  readout(board, -1.82, 1.36, () => `α = ${fmt(deg(angleOf(M)), 0)}°`, INK);
  if (spec.show.includes("cos")) readout(board, -1.82, 1.14, () => `cos α = ${fmt(M.X())}`, RED);
  if (spec.show.includes("sin")) readout(board, -1.82, 0.92, () => `sin α = ${fmt(M.Y())}`, BLUE);
  return board;
}

function sinusoide(JXG, id, spec) {
  const isCos = spec.fn === "cos";
  const CX = -1.25; // the circle sits to the LEFT of the origin, the curve to its right
  const board = JXG.JSXGraph.initBoard(id, {
    ...BOARD,
    boundingbox: [-2.55, 1.5, 7.1, -1.7],
    // The x axis spans 0…2π and the y axis −1…1; forcing equal scales here would leave
    // the curve a flat smear. This is the one widget where the aspect ratio is not
    // carrying a mathematical claim, because the circle and the curve are separate
    // drawings side by side rather than one coordinate plane.
    keepAspectRatio: true,
  });

  const C = board.create("point", [CX, 0], { visible: false, fixed: true });
  const circle = board.create("circle", [C, 1], { strokeColor: INK, strokeWidth: 1.5, fillOpacity: 0 });
  board.create("segment", [[CX - 1.15, 0], [CX + 1.15, 0]], { strokeColor: GREY, strokeWidth: 1 });
  board.create("segment", [[CX, -1.15], [CX, 1.15]], { strokeColor: GREY, strokeWidth: 1 });

  const a = (spec.angle * Math.PI) / 180;
  const M = board.create("glider", [CX + Math.cos(a), Math.sin(a), circle], {
    name: "M", size: 5, strokeColor: INK, fillColor: INK,
    highlightFillColor: RED, highlightStrokeColor: RED,
    label: { offset: [8, 8], fontSize: 15, cssStyle: "font-style:italic" },
  });
  board.create("segment", [C, M], { strokeColor: INK, strokeWidth: 1.4 });

  // The axes of the unrolled curve: x carries the ARC, not a length in the same units as
  // the circle's radius, which is exactly the identification the picture is teaching.
  board.create("axis", [[0, 0], [1, 0]], {
    ...AXIS,
    ticks: { visible: spec.show.includes("grille"), insertTicks: false, ticksDistance: Math.PI / 2, drawLabels: false, minorTicks: 0, strokeColor: "#e2e8f0" },
  });
  board.create("axis", [[0, 0], [0, 1]], AXIS);
  for (const [t, name] of [[Math.PI / 2, "π/2"], [Math.PI, "π"], [(3 * Math.PI) / 2, "3π/2"], [2 * Math.PI, "2π"]]) {
    board.create("text", [t, -0.28, name], {
      fontSize: 11, color: GREY, fixed: true, highlight: false, anchorX: "middle",
      cssStyle: "font-family:Georgia,serif",
    });
  }

  const f = isCos ? Math.cos : Math.sin;
  board.create("functiongraph", [f, 0, 2 * Math.PI], { strokeColor: BLUE, strokeWidth: 2.4 });

  const t = () => angleOf(M, CX, 0);
  const P = board.create("point", [() => t(), () => f(t())], {
    name: "P", size: 4, color: RED, fillColor: RED,
    label: { offset: [8, 8], fontSize: 13, cssStyle: "font-style:italic" },
  });
  // The connector is the argument: the height of P IS the ordinate of M.
  board.create("segment", [M, P], { strokeColor: RED, dash: 2, strokeWidth: 1.3 });
  board.create("segment", [[() => t(), 0], P], { strokeColor: RED, strokeWidth: 2 });

  readout(board, 3.1, 1.34, () => {
    const v = f(t());
    return `${isCos ? "cos" : "sin"} ${fmt(deg(t()), 0)}° = ${fmt(v)}`;
  }, INK);
  return board;
}

function triangleQuelconque(JXG, id, spec) {
  const board = JXG.JSXGraph.initBoard(id, { ...BOARD, boundingbox: [-1.2, 5.4, 9.4, -1.9] });

  const opts = (name, off) => ({
    name, size: 5, strokeColor: INK, fillColor: "#fff", strokeWidth: 2,
    highlightFillColor: RED, highlightStrokeColor: RED,
    label: { offset: off, fontSize: 15, cssStyle: "font-style:italic" },
  });
  const A = board.create("point", [0.4, 0.4], opts("A", [-16, -10]));
  const B = board.create("point", [6.6, 0.4], opts("B", [10, -10]));
  const C = board.create("point", [2.6, 4.2], opts("C", [-6, 14]));
  board.create("polygon", [A, B, C], {
    borders: { strokeColor: INK, strokeWidth: 2 }, fillColor: "#6366f1", fillOpacity: 0.07,
    vertices: { visible: false },
  });

  const dist = (P, Q) => Math.hypot(P.X() - Q.X(), P.Y() - Q.Y());
  // Named as the book does: a is the side facing A, b faces B, c faces C.
  const a = () => dist(B, C);
  const b = () => dist(C, A);
  const c = () => dist(A, B);
  // Angles from the law of cosines rather than from atan2 differences, which needs no
  // orientation bookkeeping and cannot come out reflex when a vertex is dragged past
  // the opposite side.
  const angle = (opp, s1, s2) => {
    const v = (s1() ** 2 + s2() ** 2 - opp() ** 2) / (2 * s1() * s2());
    return Math.acos(Math.min(1, Math.max(-1, v)));
  };
  const Ah = () => angle(a, b, c);
  const Bh = () => angle(b, c, a);
  const Ch = () => angle(c, a, b);

  if (spec.show.includes("angles")) {
    const mark = (V, P, Q, fn, color) => board.create("angle", [P, V, Q], {
      radius: 0.62, strokeColor: color, fillColor: color, fillOpacity: 0.15,
      name: () => `${fmt(deg(fn()), 0)}°`, label: { fontSize: 11, color },
      orthoType: "square", orthoSensitivity: 1.2,
    });
    mark(A, B, C, Ah, "#b45309");
    mark(B, C, A, Bh, "#0f766e");
    mark(C, A, B, Ch, "#7c3aed");
  }

  if (spec.show.includes("cotes")) {
    // Pushed off the side along its normal, away from the opposite vertex — the same
    // treatment segLabel() gives an épure's segment labels. Written at the midpoint with
    // no offset, the edge draws a line straight through the digits.
    const side = (P, Q, R, name, fn) => {
      const off = (pick) => () => {
        const mx = (P.X() + Q.X()) / 2, my = (P.Y() + Q.Y()) / 2;
        const dx = Q.X() - P.X(), dy = Q.Y() - P.Y();
        const len = Math.hypot(dx, dy) || 1;
        let nx = -dy / len, ny = dx / len;
        // Flip the normal if it points at the third vertex, so the label lands outside.
        if (nx * (R.X() - mx) + ny * (R.Y() - my) > 0) { nx = -nx; ny = -ny; }
        return pick === "x" ? mx + nx * 0.42 : my + ny * 0.42;
      };
      board.create("text", [off("x"), off("y"), () => `${name} = ${fmt(fn())}`], {
        fontSize: 12, color: GREY, anchorX: "middle", anchorY: "middle",
        fixed: true, highlight: false, cssStyle: "font-family:Georgia,serif",
      });
    };
    side(B, C, A, "a", a);
    side(C, A, B, "b", b);
    side(A, B, C, "c", c);
  }

  if (spec.show.includes("sinus")) {
    // The whole point of the widget: three quotients that stay equal no matter where the
    // vertices go. Printed to three decimals because at two they would agree by rounding
    // and a pupil could suspect the display rather than believe the theorem.
    const ratio = (s, ang) => () => {
      const d = Math.sin(ang());
      return d < 1e-9 ? "—" : fmt(s() / d, 3);
    };
    readout(board, -1.05, 5.2, () => `a / sin A = ${ratio(a, Ah)()}`, "#b45309");
    readout(board, -1.05, 4.78, () => `b / sin B = ${ratio(b, Bh)()}`, "#0f766e");
    readout(board, -1.05, 4.36, () => `c / sin C = ${ratio(c, Ch)()}`, "#7c3aed");
    readout(board, -1.05, -1.5, () => `A + B + C = ${fmt(deg(Ah()) + deg(Bh()) + deg(Ch()), 0)}°`, GREY);
  }
  return board;
}

/* ────────────────────────────── analyse ──────────────────────────────
 *
 * These five share a frame: a cartesian window the author chose, a grid, and a curve
 * compiled from the same expression syntax as a ```figure function block. The curve is
 * `compile`d, never eval'd — lesson content is authored by teachers and rendered for
 * students, and that rule does not get an exception because the figure moves.
 */

/** The plot window, axes and optional grid the analysis widgets are drawn in. */
function plotBoard(JXG, id, spec) {
  const board = JXG.JSXGraph.initBoard(id, {
    ...BOARD,
    boundingbox: [spec.xmin, spec.ymax, spec.xmax, spec.ymin],
    // A function plot is not a figure in the plane: x and y carry different units and
    // forcing them equal would squash every curve the author framed deliberately.
    keepAspectRatio: false,
    grid: spec.show.includes("grille"),
  });
  const tick = (span) => {
    const raw = span / 8;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    return [1, 2, 5, 10].map((m) => m * mag).find((v) => v >= raw) ?? mag * 10;
  };
  board.create("axis", [[0, 0], [1, 0]], {
    ...AXIS,
    ticks: { insertTicks: false, ticksDistance: tick(spec.xmax - spec.xmin), drawLabels: true, minorTicks: 0, label: { fontSize: 10, color: GREY }, strokeColor: "#cbd5e1" },
  });
  board.create("axis", [[0, 0], [0, 1]], {
    ...AXIS,
    ticks: { insertTicks: false, ticksDistance: tick(spec.ymax - spec.ymin), drawLabels: true, minorTicks: 0, label: { fontSize: 10, color: GREY }, strokeColor: "#cbd5e1" },
  });
  return board;
}

/**
 * Sliders for whichever of a, b, c the expression actually mentions.
 *
 * Only those: a slider for a letter the curve does not use is a control that does
 * nothing, which teaches a pupil that the controls are decorative.
 */
function paramSliders(board, spec, names) {
  const used = names.filter((n) => new RegExp(`(^|[^a-z])${n}([^a-z]|$)`).test(spec.expr));
  const x0 = spec.xmin + (spec.xmax - spec.xmin) * 0.06;
  const x1 = spec.xmin + (spec.xmax - spec.xmin) * 0.38;
  const top = spec.ymax - (spec.ymax - spec.ymin) * 0.07;
  const step = (spec.ymax - spec.ymin) * 0.075;
  const out = {};
  used.forEach((n, i) => {
    const lo = n === "a" ? -5 : -8;
    const hi = n === "a" ? 5 : 8;
    out[n] = board.create("slider", [[x0, top - i * step], [x1, top - i * step], [lo, spec[n], hi]], {
      name: n, snapWidth: 0.1, size: 5, strokeColor: "#4f46e5", fillColor: "#4f46e5",
      label: { fontSize: 12, cssStyle: "font-style:italic" },
      baseline: { strokeColor: "#cbd5e1" }, highline: { strokeColor: "#4f46e5" },
    });
  });
  return { sliders: out, scope: () => Object.fromEntries(Object.entries(out).map(([k, s]) => [k, s.Value()])) };
}

function fonction(JXG, id, spec) {
  const board = plotBoard(JXG, id, spec);
  const f = compile(spec.expr, ["a", "b", "c"]);
  if (!f) {
    board.create("text", [spec.xmin + 0.3, 0, `Expression non reconnue : ${spec.expr}`], { fontSize: 13, color: RED, fixed: true });
    return board;
  }
  const { scope } = paramSliders(board, spec, ["a", "b", "c"]);
  board.create("functiongraph", [(x) => f(x, scope()), spec.xmin, spec.xmax], { strokeColor: BLUE, strokeWidth: 2.6 });

  if (spec.show.includes("racines")) {
    const roots = () => findRoots((x) => f(x, scope()), spec, 4);
    for (let i = 0; i < 4; i++) {
      board.create("point", [() => roots()[i] ?? NaN, 0], {
        name: "", size: 3, color: RED, fillColor: RED, fixed: true, highlight: false,
        visible: () => roots()[i] !== undefined,
      });
    }
    readout(board, spec.xmin + (spec.xmax - spec.xmin) * 0.62, spec.ymax - (spec.ymax - spec.ymin) * 0.07, () => {
      const r = roots();
      return r.length ? `racines : ${r.map((v) => fmt(v)).join(" ; ")}` : "aucune racine visible";
    }, RED);
  }
  return board;
}

function tangente(JXG, id, spec) {
  const board = plotBoard(JXG, id, spec);
  const f = compile(spec.expr, ["a", "b", "c"]);
  if (!f) {
    board.create("text", [spec.xmin + 0.3, 0, `Expression non reconnue : ${spec.expr}`], { fontSize: 13, color: RED, fixed: true });
    return board;
  }
  const g = (x) => f(x, {});
  // Hold the curve in a variable rather than hunting for it in board.objects afterwards:
  // the glider needs the actual element, and a lookup by elType is a guess about
  // JSXGraph's internals that silently produces `undefined` and throws.
  const curve = board.create("functiongraph", [g, spec.xmin, spec.xmax], { strokeColor: BLUE, strokeWidth: 2.6 });

  // The point rides the curve, so it cannot be dragged off it and the tangent is always
  // a tangent to something the pupil can see.
  const x0 = (spec.xmin + spec.xmax) / 2 + (spec.xmax - spec.xmin) * 0.18;
  const M = board.create("glider", [x0, g(x0), curve], {
    name: "M", size: 5, strokeColor: INK, fillColor: INK,
    highlightFillColor: RED, highlightStrokeColor: RED,
    label: { offset: [8, 10], fontSize: 14, cssStyle: "font-style:italic" },
  });
  // Central difference: one-sided would visibly lag the curve near a sharp bend.
  const h = (spec.xmax - spec.xmin) * 1e-4;
  const slope = () => (g(M.X() + h) - g(M.X() - h)) / (2 * h);
  board.create("line", [
    () => [M.X() - 1, M.Y() - slope()],
    () => [M.X() + 1, M.Y() + slope()],
  ], { strokeColor: RED, strokeWidth: 2, dash: 0 });

  if (spec.show.includes("accroissement")) {
    // The right triangle whose ratio IS the slope — the picture behind Δy/Δx.
    const d = (spec.xmax - spec.xmin) * 0.12;
    const P = board.create("point", [() => M.X() + d, () => M.Y()], { visible: false });
    const Q = board.create("point", [() => M.X() + d, () => M.Y() + slope() * d], { visible: false });
    board.create("segment", [M, P], { strokeColor: GREEN, strokeWidth: 1.6, dash: 2 });
    board.create("segment", [P, Q], { strokeColor: GREEN, strokeWidth: 1.6, dash: 2 });
  }
  if (spec.show.includes("pente")) {
    readout(board, spec.xmin + (spec.xmax - spec.xmin) * 0.05, spec.ymax - (spec.ymax - spec.ymin) * 0.08,
      () => `f(${fmt(M.X())}) = ${fmt(M.Y())}`, INK);
    readout(board, spec.xmin + (spec.xmax - spec.xmin) * 0.05, spec.ymax - (spec.ymax - spec.ymin) * 0.17,
      () => `f ′(${fmt(M.X())}) = ${fmt(slope())}`, RED);
  }
  return board;
}

function asymptotes(JXG, id, spec) {
  const board = plotBoard(JXG, id, spec);
  const f = compile(spec.expr, ["a", "b", "c"]);
  if (!f) {
    board.create("text", [spec.xmin + 0.3, 0, `Expression non reconnue : ${spec.expr}`], { fontSize: 13, color: RED, fixed: true });
    return board;
  }
  const g = (x) => f(x, {});

  // Poles are found by looking for where the curve blows up between two samples, rather
  // than by factorising: the widget only knows how to evaluate the expression. Sampling
  // on an irrational offset avoids landing exactly on a pole and reading Infinity.
  const poles = findPoles(g, spec);

  // Plot each branch separately so no vertical line is drawn across the pole — the
  // classic wrong picture, which says the function takes every value in between.
  const cuts = [spec.xmin, ...poles, spec.xmax];
  for (let i = 0; i < cuts.length - 1; i++) {
    const lo = cuts[i] + (i ? 1e-3 : 0);
    const hi = cuts[i + 1] - (i + 1 < cuts.length - 1 ? 1e-3 : 0);
    if (hi - lo > 1e-3) board.create("functiongraph", [g, lo, hi], { strokeColor: BLUE, strokeWidth: 2.6 });
  }

  if (spec.show.includes("verticale")) {
    for (const p of poles) {
      board.create("line", [[p, spec.ymin], [p, spec.ymax]], {
        strokeColor: RED, strokeWidth: 1.4, dash: 3, straightFirst: false, straightLast: false, highlight: false,
      });
      board.create("text", [p, spec.ymin + (spec.ymax - spec.ymin) * 0.05, `x = ${fmt(p)}`], {
        fontSize: 11, color: RED, anchorX: "middle", fixed: true, highlight: false, cssStyle: "font-family:Georgia,serif",
      });
    }
  }

  if (spec.show.includes("oblique")) {
    const { m, p } = obliqueAsymptote(g, spec);
    if (Number.isFinite(m) && Number.isFinite(p) && Math.abs(m) < 1e4) {
      board.create("line", [[0, p], [1, m + p]], { strokeColor: GREEN, strokeWidth: 1.6, dash: 3, highlight: false });
      readout(board, spec.xmin + (spec.xmax - spec.xmin) * 0.04, spec.ymax - (spec.ymax - spec.ymin) * 0.08,
        () => `asymptote : y = ${fmt(m)} x ${p < 0 ? "−" : "+"} ${fmt(Math.abs(p))}`, GREEN);
    }
  }
  return board;
}

function secondDegre(JXG, id, spec) {
  const board = plotBoard(JXG, id, spec);
  const { sliders } = paramSliders(board, { ...spec, expr: "a*x^2+b*x+c" }, ["a", "b", "c"]);
  const A = () => sliders.a.Value(), B = () => sliders.b.Value(), Cc = () => sliders.c.Value();
  const y = (x) => A() * x * x + B() * x + Cc();
  const disc = () => B() * B() - 4 * A() * Cc();

  board.create("functiongraph", [y, spec.xmin, spec.xmax], { strokeColor: BLUE, strokeWidth: 2.6 });

  // With a = 0 there is no parabola and no axis of symmetry — the widget says so rather
  // than drawing a line at some enormous x that happens to be off-screen.
  const isParabola = () => Math.abs(A()) > 1e-6;
  const xs = () => (isParabola() ? -B() / (2 * A()) : 0);
  if (spec.show.includes("axe")) {
    board.create("line", [() => [xs(), 0], () => [xs(), 1]], {
      strokeColor: GREY, strokeWidth: 1, dash: 3, highlight: false, visible: isParabola,
    });
  }
  if (spec.show.includes("sommet")) {
    board.create("point", [xs, () => y(xs())], {
      name: "S", size: 4, color: "#7c3aed", fillColor: "#7c3aed",
      label: { offset: [8, 10], fontSize: 13, cssStyle: "font-style:italic" },
      visible: isParabola,
    });
  }
  if (spec.show.includes("racines")) {
    const root = (sign) => () => {
      const d = disc();
      if (d < 0 || !isParabola()) return NaN;
      return (-B() + sign * Math.sqrt(d)) / (2 * A());
    };
    for (const s of [-1, 1]) {
      board.create("point", [root(s), 0], {
        name: "", size: 4, color: RED, fillColor: RED, fixed: true, highlight: false,
        visible: () => disc() >= 0 && isParabola(),
      });
    }
  }
  if (spec.show.includes("discriminant")) {
    readout(board, spec.xmin + (spec.xmax - spec.xmin) * 0.55, spec.ymax - (spec.ymax - spec.ymin) * 0.07,
      () => `Δ = b² − 4ac = ${fmt(disc())}`, INK);
    readout(board, spec.xmin + (spec.xmax - spec.xmin) * 0.55, spec.ymax - (spec.ymax - spec.ymin) * 0.16, () => {
      const d = disc();
      if (!isParabola()) return "a = 0 : ce n'est plus un trinôme";
      if (d > 0) return "Δ > 0 : deux racines réelles";
      if (Math.abs(d) < 1e-9) return "Δ = 0 : une racine double";
      return "Δ < 0 : aucune racine réelle";
    }, RED);
  }
  return board;
}

function suite(JXG, id, spec) {
  const board = plotBoard(JXG, id, spec);
  const f = compile(spec.expr, ["a", "b", "c"]);
  if (!f) {
    board.create("text", [spec.xmin + 0.3, 0, `Expression non reconnue : ${spec.expr}`], { fontSize: 13, color: RED, fixed: true });
    return board;
  }
  const { sliders } = paramSliders(board, spec, ["a", "c"]);
  const scope = () => Object.fromEntries(Object.entries(sliders).map(([k, s]) => [k, s.Value()]));
  const g = (x) => f(x, scope());

  board.create("functiongraph", [g, spec.xmin, spec.xmax], { strokeColor: BLUE, strokeWidth: 2.4 });
  // y = x is what turns an output back into the next input; without it the staircase is
  // just a set of unexplained corners.
  board.create("line", [[spec.xmin, spec.xmin], [spec.xmax, spec.xmax]], { strokeColor: GREY, strokeWidth: 1.2, dash: 2, highlight: false });

  // u0 is dragged along the x axis: choosing the starting term is the experiment. It
  // rides an explicit invisible segment rather than board.defaultAxes, which only
  // exists when the board was created with `axis: true` — plotBoard builds its axes by
  // hand, so defaultAxes is undefined here.
  const rail = board.create("segment", [[spec.xmin, 0], [spec.xmax, 0]], { visible: false, fixed: true });
  const u0 = board.create("glider", [spec.xmin + (spec.xmax - spec.xmin) * 0.15, 0, rail], {
    name: "u₀", size: 5, strokeColor: "#b45309", fillColor: "#b45309",
    highlightFillColor: RED, label: { offset: [0, -16], fontSize: 13 },
  });

  const terms = () => {
    const out = [u0.X()];
    for (let i = 0; i < 24; i++) {
      const next = g(out[out.length - 1]);
      if (!Number.isFinite(next)) break;
      out.push(next);
    }
    return out;
  };

  if (spec.show.includes("escalier")) {
    // 24 rungs, each a vertical to the curve then a horizontal to y = x. Drawn as fixed
    // segments whose endpoints are functions, so the whole staircase follows u₀.
    for (let i = 0; i < 24; i++) {
      const up = () => { const t = terms(); return t[i] !== undefined && t[i + 1] !== undefined; };
      board.create("segment", [
        () => { const t = terms(); return [t[i] ?? 0, t[i] ?? 0]; },
        () => { const t = terms(); return [t[i] ?? 0, t[i + 1] ?? 0]; },
      ], { strokeColor: "#b45309", strokeWidth: 1.2, visible: up, highlight: false, lastArrow: false });
      board.create("segment", [
        () => { const t = terms(); return [t[i] ?? 0, t[i + 1] ?? 0]; },
        () => { const t = terms(); return [t[i + 1] ?? 0, t[i + 1] ?? 0]; },
      ], { strokeColor: "#b45309", strokeWidth: 1.2, visible: up, highlight: false });
    }
  }
  if (spec.show.includes("termes")) {
    readout(board, spec.xmin + (spec.xmax - spec.xmin) * 0.5, spec.ymax - (spec.ymax - spec.ymin) * 0.07,
      () => { const t = terms(); return `u₀ = ${fmt(t[0])}  u₁ = ${fmt(t[1])}  u₂ = ${fmt(t[2])}`; }, "#b45309");
    readout(board, spec.xmin + (spec.xmax - spec.xmin) * 0.5, spec.ymax - (spec.ymax - spec.ymin) * 0.16, () => {
      const t = terms();
      const last = t[t.length - 1], prev = t[t.length - 2];
      if (t.length < 6 || !Number.isFinite(last)) return "la suite diverge";
      return Math.abs(last - prev) < 1e-4 ? `converge vers ${fmt(last, 3)}` : "pas de limite visible";
    }, GREEN);
  }
  return board;
}

/* ───────────────────────────── géométrie ───────────────────────────── */

function angleInscrit(JXG, id, spec) {
  const board = JXG.JSXGraph.initBoard(id, { ...BOARD, boundingbox: [-1.7, 1.6, 1.7, -1.7] });
  const O = board.create("point", [0, 0], { name: "O", size: 2, fixed: true, color: INK, label: { offset: [-6, -14] } });
  const circle = board.create("circle", [O, 1], { strokeColor: INK, strokeWidth: 1.6, fillOpacity: 0 });

  const mk = (deg, name, off) => board.create("glider", [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180), circle], {
    name, size: 5, strokeColor: INK, fillColor: INK, highlightFillColor: RED, highlightStrokeColor: RED,
    label: { offset: off, fontSize: 14, cssStyle: "font-style:italic" },
  });
  const A = mk(205, "A", [-14, -10]);
  const B = mk(335, "B", [10, -10]);
  const M = mk(75, "M", [10, 10]);

  board.create("segment", [A, B], { strokeColor: INK, strokeWidth: 1.8 });
  board.create("segment", [O, A], { strokeColor: BLUE, strokeWidth: 1.5 });
  board.create("segment", [O, B], { strokeColor: BLUE, strokeWidth: 1.5 });
  board.create("segment", [M, A], { strokeColor: RED, strokeWidth: 1.8 });
  board.create("segment", [M, B], { strokeColor: RED, strokeWidth: 1.8 });

  const central = () => {
    let d = Math.abs(angleOf(B) - angleOf(A)) * (180 / Math.PI);
    return d > 180 ? 360 - d : d;
  };
  board.create("angle", [A, O, B], { radius: 0.3, strokeColor: BLUE, fillColor: BLUE, fillOpacity: 0.16, name: () => `${fmt(central(), 0)}°`, label: { fontSize: 11, color: BLUE } });
  board.create("angle", [A, M, B], { radius: 0.28, strokeColor: RED, fillColor: RED, fillOpacity: 0.16, name: () => `${fmt(central() / 2, 0)}°`, label: { fontSize: 11, color: RED } });

  if (spec.show.includes("mesures")) {
    readout(board, -1.62, 1.44, () => `angle au centre AOB = ${fmt(central(), 0)}°`, BLUE);
    readout(board, -1.62, 1.26, () => `angle inscrit AMB = ${fmt(central() / 2, 0)}°`, RED);
    readout(board, -1.62, -1.5, "déplacez M sur le cercle : l'angle inscrit ne change pas", GREY);
  }
  return board;
}

function conique(JXG, id, spec) {
  const kind = spec.conic;
  const A = Math.max(0.6, Math.abs(spec.a) || 4);
  const B = Math.max(0.4, Math.abs(spec.b) || 2.4);
  const R = Math.max(A, B) * 1.9;
  const board = JXG.JSXGraph.initBoard(id, { ...BOARD, boundingbox: [-R, R * 0.62, R, -R * 0.62] });
  board.create("axis", [[0, 0], [1, 0]], AXIS);
  board.create("axis", [[0, 0], [0, 1]], AXIS);

  const sa = board.create("slider", [[-R * 0.92, R * 0.5], [-R * 0.42, R * 0.5], [0.6, A, R * 0.8]], {
    name: "a", snapWidth: 0.1, size: 5, strokeColor: "#4f46e5", fillColor: "#4f46e5", label: { fontSize: 12, cssStyle: "font-style:italic" },
  });
  const sb = board.create("slider", [[-R * 0.92, R * 0.38], [-R * 0.42, R * 0.38], [0.4, B, R * 0.6]], {
    name: "b", snapWidth: 0.1, size: 5, strokeColor: "#4f46e5", fillColor: "#4f46e5", label: { fontSize: 12, cssStyle: "font-style:italic" },
  });
  const a = () => sa.Value();
  const b = () => sb.Value();

  // c² = a² − b² for an ellipse, a² + b² for a hyperbola — the sign is the whole
  // difference between the two curves, so it is written once, here.
  const c = () => (kind === "hyperbole" ? Math.sqrt(a() ** 2 + b() ** 2) : Math.sqrt(Math.max(0, a() ** 2 - b() ** 2)));
  const ecc = () => (kind === "parabole" ? 1 : c() / a());

  if (kind === "ellipse") {
    board.create("curve", [(t) => a() * Math.cos(t), (t) => b() * Math.sin(t), 0, 2 * Math.PI], { strokeColor: BLUE, strokeWidth: 2.6 });
  } else if (kind === "hyperbole") {
    for (const s of [1, -1]) {
      board.create("curve", [(t) => s * a() * Math.cosh(t), (t) => b() * Math.sinh(t), -2.4, 2.4], { strokeColor: BLUE, strokeWidth: 2.6 });
    }
    if (spec.show.includes("axes")) {
      for (const s of [1, -1]) {
        board.create("line", [[0, 0], () => [a(), s * b()]], { strokeColor: GREY, strokeWidth: 1, dash: 3, highlight: false });
      }
    }
  } else {
    // y² = 2px with p = b: the focus sits at p/2, which is what the directrice mirrors.
    board.create("curve", [(t) => (t * t) / (2 * b()), (t) => t, -R * 0.6, R * 0.6], { strokeColor: BLUE, strokeWidth: 2.6 });
  }

  if (spec.show.includes("foyers")) {
    const foci = kind === "parabole" ? [() => b() / 2] : [() => c(), () => -c()];
    foci.forEach((fx, i) => {
      board.create("point", [fx, 0], {
        name: kind === "parabole" ? "F" : `F${i === 0 ? "" : "′"}`, size: 4, color: RED, fillColor: RED, fixed: true, highlight: false,
        label: { offset: [4, -14], fontSize: 12, cssStyle: "font-style:italic" },
      });
    });
  }
  if (spec.show.includes("directrice")) {
    const dx = () => (kind === "parabole" ? -b() / 2 : a() / Math.max(1e-6, ecc()));
    board.create("line", [() => [dx(), -1], () => [dx(), 1]], { strokeColor: GREEN, strokeWidth: 1.3, dash: 3, highlight: false });
  }
  if (spec.show.includes("excentricite")) {
    readout(board, R * 0.1, R * 0.5, () => `e = ${fmt(ecc(), 3)}`, INK);
    readout(board, R * 0.1, R * 0.38, () => {
      const v = ecc();
      if (kind === "parabole") return "e = 1 : parabole";
      return v < 1 ? "e < 1 : ellipse" : "e > 1 : hyperbole";
    }, GREY);
  }
  return board;
}

function vecteurs(JXG, id, spec) {
  const board = JXG.JSXGraph.initBoard(id, { ...BOARD, boundingbox: [-6.4, 4.6, 6.4, -4.6] });
  board.create("axis", [[0, 0], [1, 0]], AXIS);
  board.create("axis", [[0, 0], [0, 1]], AXIS);
  const O = board.create("point", [0, 0], { name: "O", size: 2, fixed: true, color: INK, label: { offset: [-14, -12] } });

  const tip = (x, y, name, color) => board.create("point", [x, y], {
    name, size: 5, strokeColor: color, fillColor: "#fff", strokeWidth: 2,
    highlightFillColor: color, label: { offset: [8, 10], fontSize: 14, color, cssStyle: "font-style:italic" },
  });
  const U = tip(3.4, 1.2, "u", RED);
  const V = tip(1.1, 2.8, "v", BLUE);

  board.create("arrow", [O, U], { strokeColor: RED, strokeWidth: 2.4 });
  board.create("arrow", [O, V], { strokeColor: BLUE, strokeWidth: 2.4 });
  const S = board.create("point", [() => U.X() + V.X(), () => U.Y() + V.Y()], {
    name: "u + v", size: 4, color: "#7c3aed", fillColor: "#7c3aed",
    label: { offset: [8, 10], fontSize: 13, color: "#7c3aed", cssStyle: "font-style:italic" },
  });
  board.create("arrow", [O, S], { strokeColor: "#7c3aed", strokeWidth: 2.6 });

  if (spec.show.includes("parallelogramme")) {
    board.create("segment", [U, S], { strokeColor: BLUE, strokeWidth: 1.2, dash: 2, highlight: false });
    board.create("segment", [V, S], { strokeColor: RED, strokeWidth: 1.2, dash: 2, highlight: false });
  }

  const norm = (P) => Math.hypot(P.X(), P.Y());
  let row = 0;
  const line = (fn, color) => readout(board, -6.25, 4.3 - 0.42 * row++, fn, color);
  if (spec.show.includes("composantes")) {
    line(() => `u (${fmt(U.X())} ; ${fmt(U.Y())})`, RED);
    line(() => `v (${fmt(V.X())} ; ${fmt(V.Y())})`, BLUE);
    line(() => `u + v (${fmt(S.X())} ; ${fmt(S.Y())})`, "#7c3aed");
  }
  if (spec.show.includes("norme")) {
    line(() => `‖u‖ = ${fmt(norm(U))}   ‖v‖ = ${fmt(norm(V))}`, GREY);
  }
  if (spec.show.includes("scalaire")) {
    line(() => {
      const dot = U.X() * V.X() + U.Y() * V.Y();
      const cosA = dot / Math.max(1e-9, norm(U) * norm(V));
      return `u · v = ${fmt(dot)}   angle = ${fmt(deg(Math.acos(Math.min(1, Math.max(-1, cosA)))), 0)}°`;
    }, GREEN);
  }
  return board;
}

function complexe(JXG, id, spec) {
  const board = JXG.JSXGraph.initBoard(id, { ...BOARD, boundingbox: [-4.2, 3.2, 4.2, -3.2] });
  board.create("axis", [[0, 0], [1, 0]], AXIS);
  board.create("axis", [[0, 0], [0, 1]], AXIS);
  board.create("text", [3.7, 0.22, "Re"], { fontSize: 11, color: GREY, fixed: true, highlight: false });
  board.create("text", [0.18, 2.98, "Im"], { fontSize: 11, color: GREY, fixed: true, highlight: false });
  const O = board.create("point", [0, 0], { name: "", size: 2, fixed: true, color: INK });

  const M = board.create("point", [1.6, 1.2], {
    name: "z", size: 5, strokeColor: INK, fillColor: "#fff", strokeWidth: 2,
    highlightFillColor: RED, label: { offset: [10, 10], fontSize: 15, cssStyle: "font-style:italic" },
  });
  board.create("arrow", [O, M], { strokeColor: INK, strokeWidth: 2 });

  const mod = () => Math.hypot(M.X(), M.Y());
  const arg = () => { const a = Math.atan2(M.Y(), M.X()); return a < 0 ? a + 2 * Math.PI : a; };

  if (spec.show.includes("module")) {
    board.create("circle", [O, mod], { strokeColor: GREY, strokeWidth: 1, dash: 2, fillOpacity: 0, highlight: false });
  }
  if (spec.show.includes("argument")) {
    const A = board.create("point", [() => Math.max(0.9, mod() * 0.45), 0], { visible: false });
    board.create("angle", [A, O, M], { radius: () => Math.min(0.8, mod() * 0.4), strokeColor: "#b45309", fillColor: "#f59e0b", fillOpacity: 0.2, name: () => `${fmt(deg(arg()), 0)}°`, label: { fontSize: 11, color: "#92400e" } });
  }
  if (spec.show.includes("conjugue")) {
    const Z = board.create("point", [() => M.X(), () => -M.Y()], {
      name: "z̄", size: 4, color: BLUE, fillColor: BLUE,
      label: { offset: [10, -12], fontSize: 13, color: BLUE, cssStyle: "font-style:italic" },
    });
    board.create("segment", [M, Z], { strokeColor: BLUE, strokeWidth: 1, dash: 2, highlight: false });
  }
  if (spec.show.includes("carre")) {
    // z² doubles the argument and squares the modulus — the one fact the picture makes
    // obvious and the algebra does not.
    board.create("point", [() => M.X() ** 2 - M.Y() ** 2, () => 2 * M.X() * M.Y()], {
      name: "z²", size: 4, color: GREEN, fillColor: GREEN,
      label: { offset: [10, 10], fontSize: 13, color: GREEN, cssStyle: "font-style:italic" },
    });
  }

  let row = 0;
  const line = (fn, color) => readout(board, -4.05, 3.0 - 0.32 * row++, fn, color);
  line(() => `z = ${fmt(M.X())} ${M.Y() < 0 ? "−" : "+"} ${fmt(Math.abs(M.Y()))} i`, INK);
  if (spec.show.includes("module")) line(() => `|z| = ${fmt(mod())}`, GREY);
  if (spec.show.includes("argument")) line(() => `arg z = ${fmt(deg(arg()), 0)}°`, "#b45309");
  return board;
}

function triangleRectangle(JXG, id, spec) {
  const board = JXG.JSXGraph.initBoard(id, { ...BOARD, boundingbox: [-1.4, 5.6, 9.6, -1.6] });
  const A = board.create("point", [0.5, 0.5], { name: "A", size: 5, strokeColor: INK, fillColor: "#fff", strokeWidth: 2, fixed: true, label: { offset: [-16, -10], fontSize: 15, cssStyle: "font-style:italic" } });
  // C rides a vertical line through B, so the right angle at B stays a right angle no
  // matter where it is dragged — the property the figure is about cannot be broken.
  const B = board.create("point", [6.5, 0.5], { name: "B", size: 5, strokeColor: INK, fillColor: "#fff", strokeWidth: 2, fixed: true, label: { offset: [10, -10], fontSize: 15, cssStyle: "font-style:italic" } });
  const vert = board.create("line", [B, [6.5, 1]], { visible: false });
  const C = board.create("glider", [6.5, 3.6, vert], {
    name: "C", size: 5, strokeColor: INK, fillColor: "#fff", strokeWidth: 2,
    highlightFillColor: RED, highlightStrokeColor: RED, label: { offset: [10, 8], fontSize: 15, cssStyle: "font-style:italic" },
  });

  board.create("polygon", [A, B, C], { borders: { strokeColor: INK, strokeWidth: 2 }, fillColor: "#6366f1", fillOpacity: 0.07, vertices: { visible: false } });
  board.create("angle", [A, B, C], { type: "square", radius: 0.5, strokeColor: GREY, fillColor: GREY, fillOpacity: 0.25, name: "" });

  const opp = () => Math.abs(C.Y() - B.Y());       // côté opposé à l'angle en A
  const adj = () => Math.abs(B.X() - A.X());       // côté adjacent
  const hyp = () => Math.hypot(C.X() - A.X(), C.Y() - A.Y());
  const ang = () => Math.atan2(opp(), adj());

  if (spec.show.includes("angle")) {
    board.create("angle", [B, A, C], { radius: 0.9, strokeColor: "#b45309", fillColor: "#f59e0b", fillOpacity: 0.2, name: () => `${fmt(deg(ang()), 0)}°`, label: { fontSize: 12, color: "#92400e" } });
  }
  if (spec.show.includes("cotes")) {
    board.create("text", [() => (A.X() + B.X()) / 2, () => A.Y() - 0.42, () => `adjacent = ${fmt(adj())}`], { fontSize: 12, color: GREY, anchorX: "middle", fixed: true, highlight: false, cssStyle: "font-family:Georgia,serif" });
    board.create("text", [() => B.X() + 0.5, () => (B.Y() + C.Y()) / 2, () => `opposé = ${fmt(opp())}`], { fontSize: 12, color: GREY, anchorX: "left", fixed: true, highlight: false, cssStyle: "font-family:Georgia,serif" });
    board.create("text", [() => (A.X() + C.X()) / 2 - 0.7, () => (A.Y() + C.Y()) / 2 + 0.35, () => `hypoténuse = ${fmt(hyp())}`], { fontSize: 12, color: GREY, anchorX: "middle", fixed: true, highlight: false, cssStyle: "font-family:Georgia,serif" });
  }
  if (spec.show.includes("rapports")) {
    let row = 0;
    const line = (fn, color) => readout(board, -1.25, 5.35 - 0.42 * row++, fn, color);
    line(() => `sin A = opposé / hypoténuse = ${fmt(opp() / hyp())}`, RED);
    line(() => `cos A = adjacent / hypoténuse = ${fmt(adj() / hyp())}`, BLUE);
    line(() => `tan A = opposé / adjacent = ${fmt(opp() / adj())}`, GREEN);
  }
  return board;
}

const BUILDERS = {
  "cercle-trigonometrique": cercleTrigonometrique,
  "arcs-associes": arcsAssocies,
  sinusoide,
  "triangle-quelconque": triangleQuelconque,
  "triangle-rectangle": triangleRectangle,
  fonction,
  tangente,
  asymptotes,
  "second-degre": secondDegre,
  suite,
  "angle-inscrit": angleInscrit,
  conique,
  vecteurs,
  complexe,
};

/** Build the board for a normalized spec. Returns the board so it can be freed. */
export function buildBoard(JXG, containerId, spec) {
  const make = BUILDERS[spec.widget];
  if (!make) return null;
  return make(JXG, containerId, spec);
}
