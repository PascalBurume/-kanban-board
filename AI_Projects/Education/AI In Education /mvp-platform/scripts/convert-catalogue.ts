// Convert the 76 hand-drawn catalogue figures into editable épure specs.
//
// It reads the RENDERED SVG, not the TypeScript source. That sounds backwards and is
// not: every primitive in figureSvg.ts resolves to plain SVG elements with absolute
// numbers, so reading the output gives exact coordinates, real colours, and — crucially
// — the sampled path of a plot() curve, whose JavaScript could not be parsed at all.
// What it costs is naming, and naming is recovered below by matching labels to dots.
//
//   npx tsx scripts/convert-catalogue.mjs            # report only
//   npx tsx scripts/convert-catalogue.mjs --write    # emit src/lib/epureCatalogue.ts
//
// Faithfulness is checked, not assumed: every converted figure is re-rendered and
// compared element-by-element against the original. Anything that does not match is
// reported and left out, because 423 figures across the seeded books are drawn from
// this catalogue and a silently wrong one is worse than an uneditable one.

import fs from "node:fs";
import path from "node:path";
import { DRAWINGS } from "../src/lib/figureDrawings";
import { CATALOGUE } from "../src/lib/figureCatalogue";
import { renderEpure } from "../src/lib/epure";

const H = 240; // the catalogue's box; y is flipped about it so specs stay maths-oriented
const flip = (y: number) => Math.round((H - y) * 100) / 100;
const r2 = (n: number) => Math.round(n * 100) / 100;

const attrs = (tag: string): Record<string, string> => {
  const out: Record<string, string> = {};
  // [a-zA-Z-]+ would skip x1/y1/x2/y2 — the class has no digits — so every line
  // coordinate silently read as 0, in the converter AND in the checker that was meant
  // to catch it. Attribute names start with a letter and may contain digits.
  for (const m of tag.matchAll(/([a-zA-Z][\w-]*)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
};
const n = (v?: string, d = 0) => (v == null || v === "" || Number.isNaN(Number(v)) ? d : Number(v));

/** Flip every "x y" pair in path data about the box. */
const flipPath = (d: string) => d.replace(/(-?\d*\.?\d+)\s+(-?\d*\.?\d+)/g, (_m, a, b) => `${r2(Number(a))} ${flip(Number(b))}`);

/** An arrowhead emitted by A(): a filled 3-point triangle whose fill equals its stroke. */
function isArrowHead(a: Record<string, string>) {
  return a.fill && a.fill !== "none" && a.stroke === a.fill && /^M[\d.\s-]+L[\d.\s-]+L[\d.\s-]+Z$/.test((a.d ?? "").trim());
}

/** A polygon path "M.. L.. L.. Z" with no fill is a closed shape drawn as segments. */
function polygonPoints(d?: string) {
  const t = (d ?? "").trim();
  if (!/^M[-\d.\s]+(L[-\d.\s]+)+Z?$/.test(t)) return null;
  const nums = t.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
  if (nums.length < 4 || nums.length % 2) return null;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
  return { pts, closed: /Z$/.test(t) };
}

function convert(code: string): any {
  const svgBody = DRAWINGS[code] ?? "";
  const spec: any = {
    type: "epure",
    frame: { w: 360, h: H },
    points: [],
    segments: [],
    arrows: [],
    circles: [],
    ellipses: [],
    rects: [],
    paths: [],
    labels: [],
  };

  const elements = [...svgBody.matchAll(/<(line|circle|ellipse|rect|path|text)\b([^>]*)>(?:([^<]*)<\/text>)?/g)];
  const heads: { x: number; y: number; color: string }[] = []; // arrowhead tips, matched to their shafts afterwards

  for (const [, tag, raw, text] of elements) {
    const a = attrs(raw);
    const stroke = a.stroke || undefined;
    const dash = a["stroke-dasharray"] || undefined;
    const width = a["stroke-width"] ? Number(a["stroke-width"]) : undefined;

    if (tag === "line") {
      spec.segments.push({
        from: { x: r2(n(a.x1)), y: flip(n(a.y1)) },
        to: { x: r2(n(a.x2)), y: flip(n(a.y2)) },
        color: stroke, dash, width,
      });
    } else if (tag === "circle") {
      // r≈3.2 with a solid fill and no stroke is D() — a marked point, not a circle.
      const rr = n(a.r);
      if (a.fill && a.fill !== "none" && !a.stroke && rr <= 4.2) {
        spec.points.push({ id: "", x: r2(n(a.cx)), y: flip(n(a.cy)), color: a.fill, _dot: true });
      } else {
        // "none", not undefined: an unstroked disc must stay unstroked, and the
        // renderer's default outlines an absent colour in grey.
        spec.circles.push({ center: { x: r2(n(a.cx)), y: flip(n(a.cy)) }, r: r2(rr), color: stroke ?? "none", dash, width, fill: a.fill !== "none" ? a.fill : undefined });
      }
    } else if (tag === "ellipse") {
      spec.ellipses.push({ at: { x: r2(n(a.cx)), y: flip(n(a.cy)) }, rx: r2(n(a.rx)), ry: r2(n(a.ry)), color: stroke, dash, width, fill: a.fill !== "none" ? a.fill : undefined });
    } else if (tag === "rect") {
      if (n(a.width) >= 360 && n(a.height) >= H) continue; // the white background
      spec.rects.push({ at: { x: r2(n(a.x)), y: flip(n(a.y)) }, w: r2(n(a.width)), h: r2(n(a.height)), rx: a.rx ? n(a.rx) : undefined, color: stroke, dash, width, fill: a.fill !== "none" ? a.fill : undefined });
    } else if (tag === "path") {
      if (isArrowHead(a)) { const m = /^M\s*(-?\d*\.?\d+)\s+(-?\d*\.?\d+)/.exec(a.d); if (m) heads.push({ x: Number(m[1]), y: Number(m[2]), color: a.fill }); continue; }
      const poly = (!a.fill || a.fill === "none") && polygonPoints(a.d);
      if (poly) {
        const { pts, closed } = poly;
        for (let i = 0; i + 1 < pts.length; i++) {
          spec.segments.push({ from: { x: r2(pts[i].x), y: flip(pts[i].y) }, to: { x: r2(pts[i + 1].x), y: flip(pts[i + 1].y) }, color: stroke, dash, width });
        }
        if (closed && pts.length > 2) {
          spec.segments.push({ from: { x: r2(pts[pts.length - 1].x), y: flip(pts[pts.length - 1].y) }, to: { x: r2(pts[0].x), y: flip(pts[0].y) }, color: stroke, dash, width });
        }
      } else {
        spec.paths.push({ d: flipPath(a.d ?? ""), color: stroke, width, dash, fill: a.fill !== "none" ? a.fill : undefined });
      }
    } else if (tag === "text") {
      spec.labels.push({
        at: { x: r2(n(a.x)), y: flip(n(a.y)) },
        text: (text ?? "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"),
        color: a.fill, size: n(a["font-size"], 12),
        anchor: a["text-anchor"] !== "middle" ? a["text-anchor"] : undefined,
        italic: /italic/.test(raw) || undefined,
      });
    }
  }

  // An arrowhead turns the segment that ends at its tip into an arrow — restoring the
  // one piece of meaning the rendered SVG had split in two.
  for (const h of heads) {
    const near = (s: any) => Math.abs(s.to.x - h.x) < 0.6 && Math.abs(s.to.y - flip(h.y)) < 0.6;
    // Colour first: A() draws shaft and head in one colour, so two arrowheads meeting
    // at the same point are told apart by it. Position alone claimed the wrong shaft.
    let i = spec.segments.findIndex((s: any) => near(s) && s.color === h.color);
    if (i < 0) i = spec.segments.findIndex(near);
    if (i >= 0) { const [s] = spec.segments.splice(i, 1); spec.arrows.push({ ...s, color: s.color ?? h.color }); }
    else spec.paths.push({ d: `M${r2(h.x)} ${flip(h.y)}`, color: h.color, fill: h.color });
  }

  // Naming: a one- or two-character italic label sitting next to a marked point is that
  // point's name. That is exactly how the drawings were authored — T(97,196,"A") beside
  // D(104,182) — so this recovers the geometry the pixels had lost.
  for (const p of spec.points as any[]) {
    let best: any = null;
    let bestD = 22;
    for (const l of spec.labels as any[]) {
      if (l._used || !l.italic || l.text.length > 2) continue;
      const d = Math.hypot(l.at.x - p.x, l.at.y - p.y);
      if (d < bestD) { bestD = d; best = l; }
    }
    if (best) {
      p.id = best.text;
      best._used = true;
      // Keep the hand-placed position, as an offset so it still follows the point when
      // it is dragged. Without this the renderer re-places every recovered name by its
      // own centre-outward rule and the letters drift off the corners they label.
      p.labelOff = { dx: r2(best.at.x - p.x), dy: r2(best.at.y - p.y) };
      if (best.size && best.size !== 12) p.labelSize = best.size;
      if (best.anchor) p.labelAnchor = best.anchor;
    }
  }
  spec.labels = spec.labels.filter((l: any) => !l._used).map(({ _used, ...l }: any) => l);

  // Points that found no name keep their dot but carry no caption; unnamed ones cannot
  // be referenced, so they stay bare positions.
  const used = new Set();
  for (const p of spec.points as any[]) {
    if (!p.id || used.has(p.id)) { p.id = ""; continue; }
    used.add(p.id);
  }
  spec.points = spec.points.map(({ _dot, ...p }: any, i: number) => (p.id ? p : { ...p, id: `p${i + 1}`, label: "" }));

  // Re-bind the geometry to the names just recovered.
  //
  // Without this the conversion is half a job: the dots know they are called A, B, C,
  // but every segment still refers to a bare position, so dragging A moves the letter
  // and leaves the triangle behind. Any anchor that coincides with a marked point
  // becomes that point's NAME, and the figure starts behaving like geometry.
  //
  // Only points the original author MARKED with D() are bound — those are the vertices
  // that carry meaning. Binding every line end would invent dozens of points nobody
  // named and bury the real ones.
  const named = (spec.points as any[]).filter((p) => p.id);
  const bind = (a: any) => {
    if (!a || typeof a === "string") return a;
    const hit = named.find((p) => Math.abs(p.x - a.x) < 0.6 && Math.abs(p.y - a.y) < 0.6);
    return hit ? hit.id : a;
  };
  for (const seg of spec.segments as any[]) { seg.from = bind(seg.from); seg.to = bind(seg.to); }
  for (const v of spec.arrows as any[]) { v.from = bind(v.from); v.to = bind(v.to); }
  for (const c of spec.circles as any[]) { c.center = bind(c.center); if (c.through) c.through = bind(c.through); }
  for (const e of spec.ellipses as any[]) e.at = bind(e.at);

  for (const k of ["segments", "arrows", "circles", "ellipses", "rects", "paths", "labels"]) {
    if (!spec[k].length) delete spec[k];
  }
  return spec;
}

/**
 * Decompose an SVG into the marks it actually puts on the page.
 *
 * Applied to BOTH sides, so the comparison asks "does this draw the same picture?"
 * rather than "does this use the same elements?". A triangle written as one closed
 * <path> and the same triangle written as three <line>s are the same drawing, and the
 * whole point of the conversion is to prefer the second form because it is editable.
 */
function marks(svg: string): string[] {
  const out: string[] = [];
  const q = (v: number) => Math.round(v * 2) / 2; // half-pixel tolerance
  const seg = (x1: number, y1: number, x2: number, y2: number, stroke: string, dash: string) => {
    // Undirected: a segment drawn A→B and one drawn B→A are the same mark.
    const a = [q(x1), q(y1)], b = [q(x2), q(y2)];
    const [p1, p2] = a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? [a, b] : [b, a];
    out.push(`seg ${p1[0]},${p1[1]} ${p2[0]},${p2[1]} ${stroke} ${dash}`);
  };

  for (const [, tag, raw, text] of svg.matchAll(/<(line|circle|ellipse|rect|path|text)\b([^>]*)>(?:([^<]*)<\/text>)?/g)) {
    const a = attrs(raw);
    // An absent stroke and stroke="none" paint the same nothing; so do fill. Comparing
    // them as distinct strings would report a difference that is not on the page.
    const nil = (v?: string) => (!v || v === "none" ? "none" : v);
    const stroke = nil(a.stroke);
    const dash = a["stroke-dasharray"] ?? "";
    if (tag === "line") {
      seg(n(a.x1), n(a.y1), n(a.x2), n(a.y2), stroke, dash);
    } else if (tag === "text") {
      out.push(`txt ${q(n(a.x))},${q(n(a.y))} ${a.fill ?? ""} ${n(a["font-size"], 12)} ${(text ?? "").trim()}`);
    } else if (tag === "circle") {
      const r = n(a.r);
      if (a.fill && a.fill !== "none" && !a.stroke && r <= 4.2) out.push(`dot ${q(n(a.cx))},${q(n(a.cy))} ${a.fill}`);
      else out.push(`cir ${q(n(a.cx))},${q(n(a.cy))} ${q(r)} ${stroke} ${nil(a.fill)} ${dash}`);
    } else if (tag === "ellipse") {
      out.push(`ell ${q(n(a.cx))},${q(n(a.cy))} ${q(n(a.rx))},${q(n(a.ry))} ${stroke} ${dash}`);
    } else if (tag === "rect") {
      if (n(a.width) >= 360 && n(a.height) >= 240) continue; // background
      out.push(`rct ${q(n(a.x))},${q(n(a.y))} ${q(n(a.width))}x${q(n(a.height))} ${stroke} ${nil(a.fill)} ${dash}`);
    } else if (tag === "path") {
      const d = (a.d ?? "").trim();
      if (isArrowHead(a)) {
        const m = /^M\s*(-?\d*\.?\d+)\s+(-?\d*\.?\d+)/.exec(d);
        if (m) out.push(`hed ${q(Number(m[1]))},${q(Number(m[2]))} ${a.fill}`);
        continue;
      }
      const poly = polygonPoints(d);
      if (poly && (!a.fill || a.fill === "none")) {
        const { pts, closed } = poly;
        for (let i = 0; i + 1 < pts.length; i++) seg(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, stroke, dash);
        if (closed && pts.length > 2) seg(pts[pts.length - 1].x, pts[pts.length - 1].y, pts[0].x, pts[0].y, stroke, dash);
      } else {
        out.push(`pth ${d.replace(/-?\d*\.?\d+/g, (m) => String(q(Number(m))))} ${stroke} ${nil(a.fill)} ${dash}`);
      }
    }
  }
  return out.sort();
}

function diff(a: string, b: string) {
  const A = marks(a);
  const B = marks(b);
  const rest = [...B];
  const missing: string[] = [];
  for (const x of A) {
    const i = rest.indexOf(x);
    if (i >= 0) rest.splice(i, 1);
    else missing.push(x);
  }
  return { ok: !missing.length && !rest.length, missing, extra: rest, total: A.length };
}

/**
 * Inspect ONE figure instead of running the whole catalogue:
 *
 *   DEBUG_CODE=MA-GP-01 npx tsx scripts/convert-catalogue.ts
 *
 * Prints the two mark lists side by side. When a figure stops converting faithfully
 * this is the first thing to run — the report above says how many marks differ, this
 * says which. It is also how the bug that made the checker disagree with reality was
 * found: the ORIGINAL was showing segments at 0,0, which no conversion could cause.
 */
if (process.env.DEBUG_CODE) {
  const spec = convert(process.env.DEBUG_CODE);
  const out = renderEpure(spec);
  console.log("--- rendered (first 700) ---");
  console.log(out.slice(0, 700));
  console.log("--- marks(converted) ---");
  console.log(marks(out).slice(0, 8).join("\n"));
  console.log("--- marks(original) ---");
  console.log(marks(DRAWINGS[process.env.DEBUG_CODE] ?? "").slice(0, 8).join("\n"));
  process.exit(0);
}

const codes = CATALOGUE.map((f) => f.code);
const good: Record<string, any> = {};
const bad: any[] = [];
for (const code of codes) {
  const original = DRAWINGS[code] ?? "";
  let spec: any, out: string, d: any;
  try {
    spec = convert(code);
    out = renderEpure(spec);
    d = diff(original, out);
  } catch (e) {
    bad.push({ code, why: `exception: ${(e as Error).message}` });
    continue;
  }
  if (d.ok) good[code] = spec;
  else bad.push({ code, why: `${d.missing.length} manquant(s), ${d.extra.length} en trop sur ${d.total}`, missing: d.missing.slice(0, 3), extra: d.extra.slice(0, 3) });
}

console.log(`converties fidèlement : ${Object.keys(good).length}/${codes.length}`);
console.log(`non fidèles           : ${bad.length}`);
for (const b of bad.slice(0, 12)) {
  console.log(`  ${b.code}  ${b.why}`);
  for (const m of b.missing ?? []) console.log(`      manque : ${m.slice(0, 110)}`);
  for (const m of b.extra ?? []) console.log(`      en trop: ${m.slice(0, 110)}`);
}
if (bad.length > 12) console.log(`  … et ${bad.length - 12} autres`);

if (process.argv.includes("--write")) {
  const body = Object.entries(good)
    .map(([code, spec]) => `  ${JSON.stringify(code)}: ${JSON.stringify(spec)},`)
    .join("\n");
  const out = `import type { EpureSpec } from "./epure";

// The catalogue figures, as editable data. GENERATED by scripts/convert-catalogue.mjs
// from the hand-drawn SVG in figureDrawings.ts, and verified against it: every entry
// here re-renders to the same drawing, element for element. Figures that did not
// convert faithfully are deliberately absent — figureDrawings stays their source.
//
// Do not hand-edit. Re-run the script.

export const EPURE_CATALOGUE: Record<string, EpureSpec> = {
${body}
};
`;
  fs.writeFileSync(path.join("src", "lib", "epureCatalogue.ts"), out);
  console.log(`\nécrit src/lib/epureCatalogue.ts (${Object.keys(good).length} figures)`);
}
