import { renderEpure, type EpureSpec } from "./epure";
// Figures for lessons: function graphs and small data charts, drawn as plain SVG.
//
// Everything here is deliberately dependency-free and synchronous. The school server
// has no internet, so a charting library loaded from a CDN is not an option, and the
// same renderer has to run in the teacher's editor AND in the student's lesson page.
//
// Figures are STORED as a fenced ```figure code block holding JSON, so they survive
// the markdown round trip through the existing code-block support and stay readable
// (and repairable) by hand.
//
// Every visual decision a teacher can make lives on FigureSpec. Nothing that affects
// the picture is a module constant — that was the original defect: the type promised
// axis labels the renderer never drew, and colour/size were unreachable.

export type FigureKind =
  | "function" | "line" | "scatter" | "area" | "bar" | "pie"
  // Added from the Word chart gallery, filtered to what this curriculum actually
  // teaches. Every 3-D variant Word offers is deliberately absent: a 3-D column
  // distorts the very quantity a pupil is being asked to read off the axis, which is a
  // far stronger objection in a textbook than in a business deck. Waterfall, Funnel,
  // Stock, Maps, Treemap and Sunburst are finance and BI shapes with no place here.
  | "histogram" | "hbar" | "stacked" | "doughnut" | "boxplot" | "combo"
  // Geometry, not a chart. It shares the ```figure storage and the figure node, but it
  // has no axes and no data series, so it is deliberately ABSENT from FIGURE_KINDS —
  // that array is the chart-type menu. Its shape lives in lib/epure.ts.
  | "epure";

export type FigurePoint = { x: number; y: number };

export type FigureSpec = {
  type: FigureKind;
  title?: string;

  // ── data ──
  expr?: string; // function
  labels?: string[]; // line / area / bar / pie
  values?: number[];
  points?: FigurePoint[]; // scatter — real measurements, not category positions
  // stacked / combo: several named series over the same labels. `line` names the one
  // series drawn as a curve in a combo, the rest staying bars.
  series?: { label?: string; values: number[] }[];
  line?: number[]; // combo — the curve laid over the bars
  // boxplot — one five-number summary per category, which is exactly what
  // « Caractéristiques d'une série » asks a pupil to compute.
  boxes?: { min: number; q1: number; median: number; q3: number; max: number }[];

  // ── axes ──
  xlabel?: string;
  ylabel?: string;
  xmin?: number;
  xmax?: number;
  ymin?: number; // absent = auto-fit; present (with ymax) = clamp
  ymax?: number;
  ticks?: number; // intervals per axis
  grid?: boolean;

  // ── design ──
  color?: string;
  strokeWidth?: number;
  pointSize?: number;
  height?: number;
};

export const FIGURE_KINDS: { kind: FigureKind; label: string; hint: string; icon: string }[] = [
  { kind: "function", label: "Courbe d'une fonction", hint: "y = f(x), par exemple x^2 - 3" , icon: "chartFunction" },
  { kind: "line", label: "Ligne", hint: "évolution d'une grandeur" , icon: "chartLine" },
  { kind: "scatter", label: "Nuage de points", hint: "mesures (x ; y)" , icon: "chartScatter" },
  { kind: "area", label: "Aires", hint: "cumul sous la courbe" , icon: "chartArea" },
  { kind: "bar", label: "Barres", hint: "comparaison de catégories" , icon: "chartBar" },
  { kind: "pie", label: "Camembert", hint: "répartition en pourcentages" , icon: "chartPie" },
  { kind: "doughnut", label: "Anneau", hint: "camembert évidé, part au centre" , icon: "chartDoughnut" },
  { kind: "hbar", label: "Barres horizontales", hint: "catégories aux noms longs" , icon: "chartHBar" },
  { kind: "stacked", label: "Barres empilées", hint: "plusieurs séries cumulées" , icon: "chartStacked" },
  { kind: "histogram", label: "Histogramme", hint: "effectifs par classe — barres jointives" , icon: "chartHistogram" },
  { kind: "boxplot", label: "Boîte à moustaches", hint: "médiane, quartiles, étendue" , icon: "chartBox" },
  { kind: "combo", label: "Barres + courbe", hint: "deux grandeurs, deux lectures" , icon: "chartCombo" },
];

export const DEFAULTS = { color: "#4f46e5", strokeWidth: 2.2, pointSize: 4, ticks: 4, height: 360, grid: true };
export const COLORS = ["#4f46e5", "#0f766e", "#b45309", "#9d174d", "#3f6212", "#1d4ed8"];

export function defaultSpec(kind: FigureKind): FigureSpec {
  const base = { title: "", grid: true, ticks: 4, color: DEFAULTS.color };
  if (kind === "function") return { type: "function", expr: "x^2", xmin: -5, xmax: 5, xlabel: "x", ylabel: "y", ...base };
  if (kind === "scatter") {
    return { type: "scatter", points: [{ x: 1, y: 2.1 }, { x: 2, y: 3.9 }, { x: 3, y: 6.2 }, { x: 4, y: 7.8 }], xlabel: "x", ylabel: "y", ...base };
  }
  if (kind === "pie" || kind === "doughnut") return { type: kind, labels: ["Manioc", "Maïs", "Riz"], values: [45, 30, 25], ...base };
  if (kind === "histogram") {
    return { type: "histogram", labels: ["[0;5[", "[5;10[", "[10;15[", "[15;20["], values: [4, 11, 8, 3], xlabel: "Classes", ylabel: "Effectif", ...base };
  }
  if (kind === "boxplot") {
    return {
      type: "boxplot",
      labels: ["5e A", "5e B"],
      boxes: [
        { min: 4, q1: 8, median: 11, q3: 14, max: 18 },
        { min: 6, q1: 9, median: 12, q3: 16, max: 20 },
      ],
      ylabel: "Note",
      ...base,
    };
  }
  if (kind === "stacked") {
    return {
      type: "stacked",
      labels: ["1er", "2e", "3e"],
      series: [
        { label: "Filles", values: [12, 15, 14] },
        { label: "Garçons", values: [10, 13, 16] },
      ],
      ylabel: "Élèves",
      ...base,
    };
  }
  if (kind === "combo") {
    return { type: "combo", labels: ["Jan", "Fév", "Mar", "Avr"], values: [20, 34, 28, 41], line: [5, 9, 7, 12], ylabel: "Quantité", ...base };
  }
  return { type: kind, labels: ["Lun", "Mar", "Mer", "Jeu", "Ven"], values: [12, 19, 15, 22, 18], xlabel: "", ylabel: "", ...base };
}

// ───────────────────────── expression evaluation ─────────────────────────
// A small shunting-yard parser. `eval` is never used: lesson content is authored by
// teachers and rendered for students, so executing arbitrary strings is off limits.

const FUNCS: Record<string, (x: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, sqrt: Math.sqrt, abs: Math.abs,
  exp: Math.exp, ln: Math.log, log: Math.log10, floor: Math.floor, round: Math.round,
};
const PREC: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 3 };

type Tok = { t: "num" | "var" | "op" | "fn" | "(" | ")"; v: string };

function tokenize(src: string): Tok[] | null {
  const out: Tok[] = [];
  const s = src.replace(/\s+/g, "");
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      out.push({ t: "num", v: s.slice(i, j) });
      i = j;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      let j = i;
      while (j < s.length && /[a-zA-Z]/.test(s[j])) j++;
      const w = s.slice(i, j);
      if (FUNCS[w]) out.push({ t: "fn", v: w });
      else if (w === "x" || w === "pi" || w === "e") out.push({ t: "var", v: w });
      else return null; // unknown identifier — refuse rather than guess
      i = j;
      continue;
    }
    if (c === "(" || c === ")") { out.push({ t: c, v: c }); i++; continue; }
    if (PREC[c]) {
      const prev = out[out.length - 1];
      if (c === "-" && (!prev || prev.t === "op" || prev.t === "(")) out.push({ t: "num", v: "0" }); // unary minus
      out.push({ t: "op", v: c });
      i++;
      continue;
    }
    return null;
  }
  return out;
}

// Compile once, evaluate per sample point — a graph needs hundreds of evaluations.
export function compile(expr: string): ((x: number) => number) | null {
  const toks = tokenize(expr);
  if (!toks || toks.length === 0) return null;
  const out: Tok[] = [];
  const ops: Tok[] = [];
  for (const tk of toks) {
    if (tk.t === "num" || tk.t === "var") out.push(tk);
    else if (tk.t === "fn") ops.push(tk);
    else if (tk.t === "op") {
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.t === "fn" || (top.t === "op" && (PREC[top.v] > PREC[tk.v] || (PREC[top.v] === PREC[tk.v] && tk.v !== "^")))) out.push(ops.pop()!);
        else break;
      }
      ops.push(tk);
    } else if (tk.t === "(") ops.push(tk);
    else {
      while (ops.length && ops[ops.length - 1].t !== "(") out.push(ops.pop()!);
      if (!ops.length) return null;
      ops.pop();
      if (ops.length && ops[ops.length - 1].t === "fn") out.push(ops.pop()!);
    }
  }
  while (ops.length) {
    const o = ops.pop()!;
    if (o.t === "(") return null;
    out.push(o);
  }

  // Arity check. Without it "x +" compiles and quietly draws a wrong curve, which is
  // worse than refusing: a teacher would ship a graph that does not match the maths.
  let depth = 0;
  for (const tk of out) {
    if (tk.t === "num" || tk.t === "var") depth++;
    else if (tk.t === "fn") { if (depth < 1) return null; }
    else { if (depth < 2) return null; depth--; }
  }
  if (depth !== 1) return null;

  return (x: number) => {
    const st: number[] = [];
    for (const tk of out) {
      if (tk.t === "num") st.push(parseFloat(tk.v));
      else if (tk.t === "var") st.push(tk.v === "x" ? x : tk.v === "pi" ? Math.PI : Math.E);
      else if (tk.t === "fn") st.push(FUNCS[tk.v](st.pop() ?? 0));
      else {
        const b = st.pop() ?? 0, a = st.pop() ?? 0;
        st.push(tk.v === "+" ? a + b : tk.v === "-" ? a - b : tk.v === "*" ? a * b : tk.v === "/" ? a / b : Math.pow(a, b));
      }
    }
    return st.length === 1 ? st[0] : NaN;
  };
}

// ───────────────────────────── rendering ─────────────────────────────

const W = 640;
const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

// Geometry depends on whether axis labels need room, so it is computed per figure
// rather than fixed. This is what makes xlabel/ylabel real instead of decorative.
function geom(spec: FigureSpec) {
  const H = Math.min(Math.max(num(spec.height, DEFAULTS.height), 220), 560);
  const hasX = !!spec.xlabel?.trim();
  const hasY = !!spec.ylabel?.trim();
  return {
    H,
    top: spec.title?.trim() ? 40 : 20,
    bottom: hasX ? 62 : 40,
    left: hasY ? 62 : 44,
    right: 20,
    color: typeof spec.color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(spec.color) ? spec.color : DEFAULTS.color,
    sw: Math.min(Math.max(num(spec.strokeWidth, DEFAULTS.strokeWidth), 0.5), 8),
    ps: Math.min(Math.max(num(spec.pointSize, DEFAULTS.pointSize), 1), 12),
    ticks: Math.min(Math.max(Math.round(num(spec.ticks, DEFAULTS.ticks)), 2), 10),
    grid: spec.grid !== false,
  };
}

function chrome(spec: FigureSpec, g: ReturnType<typeof geom>, body: string): string {
  const parts: string[] = [];
  if (spec.title?.trim()) parts.push(`<text x="${W / 2}" y="24" text-anchor="middle" font-size="15" font-weight="600" fill="currentColor">${esc(spec.title)}</text>`);
  if (spec.xlabel?.trim()) parts.push(`<text x="${(g.left + W - g.right) / 2}" y="${g.H - 14}" text-anchor="middle" font-size="12.5" fill="currentColor" fill-opacity=".8">${esc(spec.xlabel)}</text>`);
  if (spec.ylabel?.trim()) {
    const cy = (g.top + g.H - g.bottom) / 2;
    parts.push(`<text x="18" y="${cy}" text-anchor="middle" font-size="12.5" fill="currentColor" fill-opacity=".8" transform="rotate(-90 18 ${cy})">${esc(spec.ylabel)}</text>`);
  }
  return `<svg viewBox="0 0 ${W} ${g.H}" xmlns="http://www.w3.org/2000/svg" class="fig-svg" role="img">${parts.join("")}${body}</svg>`;
}

function message(spec: FigureSpec, text: string, danger = false): string {
  const g = geom(spec);
  return chrome(spec, g, `<text x="${W / 2}" y="${g.H / 2}" text-anchor="middle" font-size="13" fill="${danger ? "#b91c1c" : "currentColor"}" ${danger ? "" : 'fill-opacity=".6"'}>${esc(text)}</text>`);
}

// A range the teacher pinned, when it is usable. ymin >= ymax is not a range — it
// would divide by zero in the scale — so it falls back to auto rather than drawing NaN.
export function clampRange(lo: number | undefined, hi: number | undefined): [number, number] | null {
  if (typeof lo !== "number" || typeof hi !== "number" || !Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  return hi > lo ? [lo, hi] : null;
}

// Round a range outwards to a 1 / 2 / 2.5 / 5 / 10 × 10ⁿ step.
//
// Two problems, one cause. The categorical renderer used the data's exact extent, so a
// bar of 22 in a range ending at 22 stood flush against the top frame and read as
// clipped. The others padded by a flat 8%, which gives headroom but lands the ticks on
// -2, 5.25, 12.5, 19.75, 27 — a scale nobody reads off a blackboard.
//
// Rounding to a nice step fixes both: the top tick is always above the data, and every
// label is a number a student recognises. `target` is a wish, not a promise — the tick
// count follows from the step, because a clean step at an awkward count beats the
// reverse. A teacher's explicit ymin/ymax still wins; this only shapes the auto range.
export function niceScale(lo: number, hi: number, target: number): { lo: number; hi: number; count: number } {
  const span = hi - lo || Math.abs(hi) || 1;
  const raw = span / Math.max(target, 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  // Nearest candidate, not the next one up: 5.5 belongs with 5 (six ticks of 5), and
  // rounding it to 10 would double the empty space above the tallest bar.
  const step = [1, 2, 2.5, 5, 10].reduce((a, b) => (Math.abs(norm - b) < Math.abs(norm - a) ? b : a)) * mag;
  const nlo = Math.floor(lo / step) * step;
  // A maximum that lands exactly on a tick still needs headroom above it.
  const nhi = Math.ceil(hi / step) * step + (Math.abs(Math.ceil(hi / step) * step - hi) < step * 1e-9 ? step : 0);
  return { lo: nlo, hi: nhi, count: Math.max(2, Math.round((nhi - nlo) / step)) };
}

export function renderFigure(spec: FigureSpec): string {
  try {
    // An épure is geometry, not a plot: no axes, no series, its own renderer. It rides
    // in the same ```figure block so it inherits the markdown round trip, the editor's
    // figure node and the student renderer without any of them learning a new construct.
    if (spec.type === "epure") return renderEpure(spec as unknown as EpureSpec);
    if (spec.type === "function") return renderFunction(spec);
    if (spec.type === "pie" || spec.type === "doughnut") return renderPie(spec);
    if (spec.type === "boxplot") return renderBoxplot(spec);
    if (spec.type === "hbar") return renderHBar(spec);
    if (spec.type === "stacked" || spec.type === "combo") return renderStacked(spec);
    if (spec.type === "scatter" && spec.points?.length) return renderPoints(spec);
    return renderSeries(spec);
  } catch {
    return message(spec, "Figure impossible à tracer", true);
  }
}

// Shared axis furniture for the cartesian plots.
function axisFrame(g: ReturnType<typeof geom>, xs: [number, number], ys: [number, number], fmtX: (i: number) => string) {
  const [x0, x1] = xs, [y0, y1] = ys;
  const sx = (x: number) => g.left + ((x - x0) / (x1 - x0)) * (W - g.left - g.right);
  const sy = (y: number) => g.H - g.bottom - ((y - y0) / (y1 - y0)) * (g.H - g.top - g.bottom);
  const marks: string[] = [];
  for (let i = 0; i <= g.ticks; i++) {
    const yv = y0 + ((y1 - y0) * i) / g.ticks;
    if (g.grid) marks.push(`<line x1="${g.left}" y1="${sy(yv).toFixed(1)}" x2="${W - g.right}" y2="${sy(yv).toFixed(1)}" stroke="currentColor" stroke-opacity=".1"/>`);
    marks.push(`<text x="${g.left - 8}" y="${(sy(yv) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="currentColor" fill-opacity=".7">${+yv.toFixed(2)}</text>`);
    marks.push(`<text x="${sx(x0 + ((x1 - x0) * i) / g.ticks).toFixed(1)}" y="${g.H - g.bottom + 16}" text-anchor="middle" font-size="11" fill="currentColor" fill-opacity=".7">${fmtX(i)}</text>`);
  }
  marks.push(`<path d="M${g.left} ${g.top - 6}V${g.H - g.bottom}H${W - g.right}" stroke="currentColor" stroke-opacity=".28" fill="none"/>`);
  return { sx, sy, marks: marks.join("") };
}

function renderFunction(spec: FigureSpec): string {
  const g = geom(spec);
  const f = compile(spec.expr || "");
  if (!f) return message(spec, `Expression non reconnue : ${spec.expr || ""}`, true);

  const xr = clampRange(spec.xmin, spec.xmax) ?? [-5, 5];
  const [xmin, xmax] = xr;
  const N = 400;
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const x = xmin + ((xmax - xmin) * i) / N;
    const y = f(x);
    pts.push([x, Number.isFinite(y) ? y : NaN]);
  }
  const finite = pts.filter((p) => Number.isFinite(p[1]));
  if (!finite.length) return message(spec, "Aucune valeur définie sur cet intervalle", true);

  let yr = clampRange(spec.ymin, spec.ymax);
  if (!yr) {
    let lo = Math.min(...finite.map((p) => p[1]));
    let hi = Math.max(...finite.map((p) => p[1]));
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.08;
    yr = [lo - pad, hi + pad];
  }
  const { sx, sy, marks } = axisFrame(g, [xmin, xmax], yr, (i) => String(+(xmin + ((xmax - xmin) * i) / g.ticks).toFixed(2)));

  // Break the path at undefined or out-of-range samples so an asymptote does not draw
  // a vertical line across the whole plot.
  let d = "";
  let pen = false;
  for (const [x, y] of pts) {
    const inside = Number.isFinite(y) && y >= yr[0] - (yr[1] - yr[0]) && y <= yr[1] + (yr[1] - yr[0]);
    if (!inside) { pen = false; continue; }
    d += `${pen ? "L" : "M"}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`;
    pen = true;
  }

  const zero: string[] = [];
  if (yr[0] < 0 && yr[1] > 0) zero.push(`<line x1="${g.left}" y1="${sy(0)}" x2="${W - g.right}" y2="${sy(0)}" stroke="currentColor" stroke-opacity=".35"/>`);
  if (xmin < 0 && xmax > 0) zero.push(`<line x1="${sx(0)}" y1="${g.top - 6}" x2="${sx(0)}" y2="${g.H - g.bottom}" stroke="currentColor" stroke-opacity=".35"/>`);

  return chrome(spec, g, marks + zero.join("") + `<clipPath id="fc"><rect x="${g.left}" y="${g.top - 6}" width="${W - g.left - g.right}" height="${g.H - g.top - g.bottom + 6}"/></clipPath><path d="${d}" fill="none" stroke="${g.color}" stroke-width="${g.sw}" clip-path="url(#fc)"/>`);
}

// Scatter of real measurements: x comes from the data, not from the array index.
function renderPoints(spec: FigureSpec): string {
  const g = geom(spec);
  const pts = (spec.points || []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!pts.length) return message(spec, "Aucune donnée");

  const spread = (vals: number[]): [number, number] => {
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.08;
    return [lo - pad, hi + pad];
  };
  const xr = clampRange(spec.xmin, spec.xmax) ?? spread(pts.map((p) => p.x));
  const yr = clampRange(spec.ymin, spec.ymax) ?? spread(pts.map((p) => p.y));
  const { sx, sy, marks } = axisFrame(g, xr, yr, (i) => String(+(xr[0] + ((xr[1] - xr[0]) * i) / g.ticks).toFixed(2)));

  const dots = pts.map((p) => `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="${g.ps}" fill="${g.color}" fill-opacity=".9"/>`).join("");
  return chrome(spec, g, marks + dots);
}

function renderSeries(spec: FigureSpec): string {
  const g = geom(spec);
  const labels = spec.labels || [];
  const values = (spec.values || []).filter((v) => Number.isFinite(v));
  const n = values.length;
  if (!n) return message(spec, "Aucune donnée");

  // The baseline stays at zero whenever the data is all-positive: a bar chart whose
  // axis does not start at zero exaggerates the very differences it exists to show.
  // Only the top is opened up.
  const pinned = clampRange(spec.ymin, spec.ymax);
  const auto = pinned ? null : niceScale(Math.min(...values, 0), Math.max(...values, 0) || 1, g.ticks);
  const yr: [number, number] = pinned ?? [auto!.lo, auto!.hi];
  const steps = pinned ? g.ticks : auto!.count;
  const span = yr[1] - yr[0] || 1;
  const sy = (v: number) => g.H - g.bottom - ((v - yr[0]) / span) * (g.H - g.top - g.bottom);
  const sx = (i: number) => g.left + (n === 1 ? (W - g.left - g.right) / 2 : (i * (W - g.left - g.right)) / (n - 1));

  const marks: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const v = yr[0] + (span * i) / steps;
    if (g.grid) marks.push(`<line x1="${g.left}" y1="${sy(v).toFixed(1)}" x2="${W - g.right}" y2="${sy(v).toFixed(1)}" stroke="currentColor" stroke-opacity=".1"/>`);
    marks.push(`<text x="${g.left - 8}" y="${(sy(v) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="currentColor" fill-opacity=".7">${+v.toFixed(1)}</text>`);
  }
  marks.push(`<path d="M${g.left} ${g.top - 6}V${g.H - g.bottom}H${W - g.right}" stroke="currentColor" stroke-opacity=".28" fill="none"/>`);
  marks.push(
    values.map((_, i) => {
      const cx = spec.type === "bar" ? g.left + ((i + 0.5) * (W - g.left - g.right)) / n : sx(i);
      return `<text x="${cx.toFixed(1)}" y="${g.H - g.bottom + 16}" text-anchor="middle" font-size="11" fill="currentColor" fill-opacity=".75">${esc(labels[i] ?? "")}</text>`;
    }).join(""),
  );

  let body = "";
  if (spec.type === "bar" || spec.type === "histogram") {
    // A histogram's bars touch: the classes it shows are contiguous intervals, and the
    // gaps of a bar chart would suggest they are separate categories.
    const hist = spec.type === "histogram";
    const bw = ((W - g.left - g.right) / n) * (hist ? 1 : 0.62);
    body = values.map((v, i) => {
      const cx = g.left + ((i + 0.5) * (W - g.left - g.right)) / n;
      const base = Math.min(Math.max(0, yr[0]), yr[1]);
      const y = Math.min(sy(v), sy(base)), h = Math.abs(sy(v) - sy(base));
      return `<rect x="${(cx - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h, 1).toFixed(1)}" rx="${hist ? 0 : 3}" fill="${g.color}" fill-opacity="${hist ? ".78" : ".85"}"${hist ? ` stroke="${g.color}" stroke-opacity=".6"` : ""}/>`;
    }).join("");
  } else {
    const d = values.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join("");
    if (spec.type === "area") body += `<path d="${d}L${sx(n - 1).toFixed(1)} ${sy(yr[0]).toFixed(1)}L${sx(0).toFixed(1)} ${sy(yr[0]).toFixed(1)}Z" fill="${g.color}" fill-opacity=".18"/>`;
    if (spec.type !== "scatter") body += `<path d="${d}" fill="none" stroke="${g.color}" stroke-width="${g.sw}"/>`;
    body += values.map((v, i) => `<circle cx="${sx(i).toFixed(1)}" cy="${sy(v).toFixed(1)}" r="${g.ps}" fill="${g.color}"/>`).join("");
  }
  return chrome(spec, g, marks.join("") + body);
}

// Horizontal bars. Word calls this "2-D Bar"; it earns its place because category
// names in French ("Analyse combinatoire") do not fit under a vertical column.
function renderHBar(spec: FigureSpec): string {
  const g = geom(spec);
  const values = (spec.values || []).filter((v) => Number.isFinite(v));
  const labels = spec.labels || [];
  const n = values.length;
  if (!n) return message(spec, "Aucune donnée");

  const longest = Math.max(...labels.slice(0, n).map((l) => String(l).length), 4);
  const left = Math.min(g.left + longest * 6.5, W * 0.42);
  const pinned = clampRange(spec.ymin, spec.ymax);
  const auto = pinned ? null : niceScale(Math.min(...values, 0), Math.max(...values, 0) || 1, g.ticks);
  const [v0, v1] = pinned ?? [auto!.lo, auto!.hi];
  const sx = (v: number) => left + ((v - v0) / (v1 - v0)) * (W - left - g.right);
  const band = (g.H - g.top - g.bottom) / n;

  const body = values
    .map((v, i) => {
      const y = g.top + i * band + band * 0.18;
      const h = band * 0.64;
      const x = sx(Math.min(v, 0));
      const w = Math.abs(sx(v) - sx(0));
      return (
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(w, 1).toFixed(1)}" height="${h.toFixed(1)}" fill="${g.color}" rx="2"/>` +
        `<text x="${(left - 8).toFixed(1)}" y="${(y + h / 2 + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="currentColor" fill-opacity=".75">${esc(labels[i] ?? "")}</text>` +
        `<text x="${(sx(v) + (v < 0 ? -6 : 6)).toFixed(1)}" y="${(y + h / 2 + 4).toFixed(1)}" text-anchor="${v < 0 ? "end" : "start"}" font-size="11" fill="currentColor" fill-opacity=".65">${+v.toFixed(2)}</text>`
      );
    })
    .join("");

  const axis = `<path d="M${sx(Math.max(v0, 0)).toFixed(1)} ${g.top}V${g.H - g.bottom}" stroke="currentColor" stroke-opacity=".28"/>`;
  return chrome(spec, g, axis + body);
}

// Stacked bars, and the combo (bars with a curve laid over them). They share every
// scale calculation, so they share a renderer.
function renderStacked(spec: FigureSpec): string {
  const g = geom(spec);
  const labels = spec.labels || [];
  const combo = spec.type === "combo";
  const series = combo
    ? [{ label: "", values: spec.values || [] }]
    : (spec.series || []).filter((s) => Array.isArray(s.values));
  const n = Math.max(...series.map((s) => s.values.length), 0);
  if (!n) return message(spec, "Aucune donnée");

  const totals = Array.from({ length: n }, (_, i) => series.reduce((a, s) => a + num(s.values[i], 0), 0));
  const overlay = combo ? (spec.line || []).map((v) => num(v, 0)) : [];
  const hi = Math.max(...totals, ...overlay, 1);
  const pinned = clampRange(spec.ymin, spec.ymax);
  const auto = pinned ? null : niceScale(0, hi, g.ticks);
  const yr: [number, number] = pinned ?? [auto!.lo, auto!.hi];

  const { sy, marks } = axisFrame(g, [0, Math.max(n - 1, 1)], yr, (i) => labels[Math.round((i * (n - 1)) / g.ticks)] ?? "");
  const bandW = (W - g.left - g.right) / n;
  const cx = (i: number) => g.left + (i + 0.5) * bandW;

  let body = "";
  for (let i = 0; i < n; i++) {
    let acc = 0;
    series.forEach((s, k) => {
      const v = num(s.values[i], 0);
      const y0 = sy(acc);
      const y1 = sy(acc + v);
      acc += v;
      body += `<rect x="${(cx(i) - bandW * 0.3).toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${(bandW * 0.6).toFixed(1)}" height="${Math.abs(y1 - y0).toFixed(1)}" fill="${COLORS[k % COLORS.length]}" fill-opacity=".92"/>`;
    });
  }

  if (combo && overlay.length) {
    const d = overlay.map((v, i) => `${i ? "L" : "M"}${cx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join("");
    body += `<path d="${d}" fill="none" stroke="${COLORS[1]}" stroke-width="${g.sw}" stroke-linejoin="round"/>`;
    body += overlay.map((v, i) => `<circle cx="${cx(i).toFixed(1)}" cy="${sy(v).toFixed(1)}" r="${g.ps}" fill="${COLORS[1]}"/>`).join("");
  }

  // A stack is unreadable without knowing which colour is which.
  const legend = (combo ? [] : series)
    .map((s, k) => {
      const x = g.left + k * 110;
      return s.label
        ? `<rect x="${x}" y="${g.H - 14}" width="10" height="10" rx="2" fill="${COLORS[k % COLORS.length]}"/>` +
            `<text x="${x + 15}" y="${g.H - 5}" font-size="11" fill="currentColor" fill-opacity=".75">${esc(s.label)}</text>`
        : "";
    })
    .join("");

  return chrome(spec, g, marks + body + legend);
}

// Boîte à moustaches — median, quartiles and range, which is precisely the five-number
// summary « Caractéristiques d'une série » asks a pupil to compute by hand.
function renderBoxplot(spec: FigureSpec): string {
  const g = geom(spec);
  const boxes = (spec.boxes || []).filter((b) => b && Number.isFinite(b.median));
  const labels = spec.labels || [];
  const n = boxes.length;
  if (!n) return message(spec, "Aucune donnée");

  const all = boxes.flatMap((b) => [b.min, b.max]);
  const pinned = clampRange(spec.ymin, spec.ymax);
  const auto = pinned ? null : niceScale(Math.min(...all), Math.max(...all), g.ticks);
  const yr: [number, number] = pinned ?? [auto!.lo, auto!.hi];
  const { sy, marks } = axisFrame(g, [0, Math.max(n - 1, 1)], yr, (i) => labels[Math.round((i * (n - 1)) / g.ticks)] ?? "");
  const bandW = (W - g.left - g.right) / n;

  const body = boxes
    .map((b, i) => {
      const cx = g.left + (i + 0.5) * bandW;
      const half = Math.min(bandW * 0.28, 34);
      const top = sy(b.q3), bot = sy(b.q1), mid = sy(b.median);
      return (
        `<line x1="${cx}" y1="${sy(b.max).toFixed(1)}" x2="${cx}" y2="${top.toFixed(1)}" stroke="currentColor" stroke-opacity=".55"/>` +
        `<line x1="${cx}" y1="${bot.toFixed(1)}" x2="${cx}" y2="${sy(b.min).toFixed(1)}" stroke="currentColor" stroke-opacity=".55"/>` +
        `<line x1="${cx - half / 2}" y1="${sy(b.max).toFixed(1)}" x2="${cx + half / 2}" y2="${sy(b.max).toFixed(1)}" stroke="currentColor" stroke-opacity=".55"/>` +
        `<line x1="${cx - half / 2}" y1="${sy(b.min).toFixed(1)}" x2="${cx + half / 2}" y2="${sy(b.min).toFixed(1)}" stroke="currentColor" stroke-opacity=".55"/>` +
        `<rect x="${(cx - half).toFixed(1)}" y="${Math.min(top, bot).toFixed(1)}" width="${(half * 2).toFixed(1)}" height="${Math.abs(bot - top).toFixed(1)}" fill="${g.color}" fill-opacity=".18" stroke="${g.color}"/>` +
        `<line x1="${(cx - half).toFixed(1)}" y1="${mid.toFixed(1)}" x2="${(cx + half).toFixed(1)}" y2="${mid.toFixed(1)}" stroke="${g.color}" stroke-width="${g.sw}"/>`
      );
    })
    .join("");

  return chrome(spec, g, marks + body);
}

function renderPie(spec: FigureSpec): string {
  const g = geom(spec);
  const values = (spec.values || []).filter((v) => Number.isFinite(v) && v > 0);
  const labels = spec.labels || [];
  const total = values.reduce((a, b) => a + b, 0);
  if (!total) return message(spec, "Aucune donnée");

  const cy = (g.top + g.H - g.bottom) / 2;
  const r = Math.min((g.H - g.top - g.bottom) / 2 - 6, 120);
  const cx = g.left + r + 20;
  let a0 = -Math.PI / 2;
  const slices = values.map((v, i) => {
    const a1 = a0 + (v / total) * Math.PI * 2;
    const big = a1 - a0 > Math.PI ? 1 : 0;
    const p = `M${cx} ${cy}L${(cx + r * Math.cos(a0)).toFixed(1)} ${(cy + r * Math.sin(a0)).toFixed(1)}A${r} ${r} 0 ${big} 1 ${(cx + r * Math.cos(a1)).toFixed(1)} ${(cy + r * Math.sin(a1)).toFixed(1)}Z`;
    a0 = a1;
    return `<path d="${p}" fill="${COLORS[i % COLORS.length]}" fill-opacity=".88"/>`;
  }).join("");
  // A doughnut is the same slices with the middle punched out. Drawing the hole in the
  // page colour rather than clipping keeps it one path per slice, so a slice stays a
  // single hit target.
  const hole = spec.type === "doughnut"
    ? `<circle cx="${cx}" cy="${cy.toFixed(1)}" r="${(r * 0.55).toFixed(1)}" fill="var(--surface, #fff)"/>`
    : "";
  const lx = cx + r + 34;
  const legend = values.map((v, i) => {
    const y = cy - (values.length * 22) / 2 + i * 22 + 11;
    return `<g><rect x="${lx}" y="${y - 10}" width="12" height="12" rx="2" fill="${COLORS[i % COLORS.length]}"/><text x="${lx + 20}" y="${y}" font-size="12.5" fill="currentColor">${esc(labels[i] ?? "—")} · ${Math.round((v / total) * 100)}%</text></g>`;
  }).join("");
  return chrome(spec, g, slices + hole + legend);
}

// ───────────────────── markdown interop (```figure blocks) ─────────────────────

export function parseFigure(json: string): FigureSpec | null {
  try {
    const o = JSON.parse(json);
    if (!o || typeof o !== "object") return null;
    // Épures are accepted here but are deliberately NOT in FIGURE_KINDS: that list is
    // the chart-type menu, and an épure is not a chart. It has its own menu entry and
    // its own panel.
    if (o.type === "epure") return Array.isArray(o.points) ? (o as FigureSpec) : null;
    if (!FIGURE_KINDS.some((k) => k.kind === o.type)) return null;
    return o as FigureSpec;
  } catch {
    return null;
  }
}

export const isEpure = (spec: unknown): spec is EpureSpec =>
  !!spec && typeof spec === "object" && (spec as { type?: string }).type === "epure";

export const figureToJson = (spec: FigureSpec) => JSON.stringify(spec, null, 2);
