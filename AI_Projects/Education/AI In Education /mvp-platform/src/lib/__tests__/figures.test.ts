import { describe, it, expect } from "vitest";
import { niceScale, renderFigure, defaultSpec, FIGURE_KINDS } from "../figures";

const ticksOf = (s: { lo: number; hi: number; count: number }) =>
  Array.from({ length: s.count + 1 }, (_, i) => +(s.lo + ((s.hi - s.lo) * i) / s.count).toFixed(6));

describe("niceScale gives headroom and readable ticks", () => {
  // The bar chart's tallest bar used to stand flush against the top frame, because the
  // categorical renderer used the data's exact extent as its range.
  it("never lets the data touch the top of the scale", () => {
    for (const [lo, hi] of [[0, 22], [0, 25], [0, 1], [0, 7], [0, 1000], [-8, 14], [0, 0.42]] as [number, number][]) {
      expect(niceScale(lo, hi, 4).hi, `${lo}..${hi}`).toBeGreaterThan(hi);
    }
  });

  it("keeps the baseline at zero for all-positive data", () => {
    // A bar chart whose axis does not start at zero exaggerates its own differences.
    for (const hi of [1, 7, 22, 1000, 0.42]) expect(niceScale(0, hi, 4).lo).toBe(0);
  });

  it("produces ticks a student can read", () => {
    expect(ticksOf(niceScale(0, 22, 4))).toEqual([0, 5, 10, 15, 20, 25]);
    expect(ticksOf(niceScale(0, 0.42, 4))).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
    expect(ticksOf(niceScale(-8, 14, 4))).toEqual([-10, -5, 0, 5, 10, 15]);
  });

  // 5.5 belongs with a step of 5 (six ticks), not 10 — rounding up would double the
  // empty space above the tallest bar.
  it("rounds the step to the nearest candidate, not upwards", () => {
    expect(niceScale(0, 22, 4).hi).toBe(25);
  });

  it("survives degenerate ranges without dividing by zero", () => {
    for (const [lo, hi] of [[0, 0], [5, 5], [-3, -3]] as [number, number][]) {
      const s = niceScale(lo, hi, 4);
      expect(Number.isFinite(s.lo) && Number.isFinite(s.hi)).toBe(true);
      expect(s.hi).toBeGreaterThan(s.lo);
      expect(s.count).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("every figure kind renders", () => {
  it("produces an svg for each kind, with no NaN in the geometry", () => {
    for (const { kind } of FIGURE_KINDS) {
      const svg = renderFigure(defaultSpec(kind));
      expect(svg, kind).toContain("<svg");
      expect(svg, kind).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  // A range the teacher pinned is theirs — the nice-scale rounding must not silently
  // widen it, or "montre-moi de 0 à 100" quietly becomes 0 to 125.
  it("respects an explicit ymin/ymax exactly", () => {
    const svg = renderFigure({ ...defaultSpec("bar"), ymin: 0, ymax: 100 } as never);
    expect(svg).toContain(">100<");
    expect(svg).not.toContain(">125<");
  });
});
