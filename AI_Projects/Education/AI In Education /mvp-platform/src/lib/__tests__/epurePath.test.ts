import { describe, it, expect } from "vitest";
import { transformPathD, renderEpure } from "../epure";
import { EPURE_CATALOGUE } from "../epureCatalogue";

// The transform a framed figure uses: y flipped about the 240-high box, no scaling.
const framed = { sx: (x: number) => x, sy: (y: number) => 240 - y };
// A fitted figure: scaled ×2 and flipped.
const fitted = { sx: (x: number) => 10 + x * 2, sy: (y: number) => 200 - y * 2 };
const nums = (d: string) => (d.match(/-?[\d.]+/g) ?? []).map(Number);

describe("transformPathD — the parameters that are not coordinates", () => {
  // The bug: `A rx ry rotation large-arc sweep x y` was read as four (x, y) pairs, so a
  // radius came out as 214 and sweep-flag as 240. A flag that is not 0 or 1 makes the
  // whole path invalid and the browser drops it — the arc simply disappeared.
  it("keeps an arc's radii as radii", () => {
    const out = transformPathD("M189.7 169.9 A26 26 0 0 0 170.3 169.9", framed);
    const [, , rx, ry] = nums(out);
    expect([rx, ry]).toEqual([26, 26]);
  });

  it("emits flags that are still flags", () => {
    const out = transformPathD("M189.7 169.9 A26 26 0 0 0 170.3 169.9", framed);
    const [, , , , rot, large, sweep] = nums(out);
    expect(rot).toBe(0);
    expect([0, 1]).toContain(large);
    expect([0, 1]).toContain(sweep);
  });

  // A reflection reverses the direction an arc bulges. Without this the arc would flip
  // to the wrong side of its chord.
  it("reverses the sweep flag under a mirror, and leaves it alone without one", () => {
    expect(nums(transformPathD("M0 0 A5 5 0 0 0 10 0", framed))[6]).toBe(1);
    expect(nums(transformPathD("M0 0 A5 5 0 0 1 10 0", framed))[6]).toBe(0);
    const upright = { sx: (x: number) => x, sy: (y: number) => y };
    expect(nums(transformPathD("M0 0 A5 5 0 0 1 10 0", upright))[6]).toBe(1);
  });

  it("scales radii when the figure is scaled", () => {
    const [, , rx, ry] = nums(transformPathD("M100 190 A30 30 0 0 0 160 150", fitted));
    expect([rx, ry]).toEqual([60, 60]);
  });
});

describe("transformPathD — commands the pair-regex could not see", () => {
  // H takes one x, V takes one y. Paired up, an H's x was flipped as if it were a y.
  it("handles H and V, which carry a single coordinate", () => {
    expect(transformPathD("M10 10 H50 V80", framed)).toBe("M10 230 H50 V160");
  });

  // Commas are legal SVG. The old regex required whitespace, so a comma path was left
  // in raw coordinates while every other element moved.
  it("handles comma separators", () => {
    expect(transformPathD("M100,50 L160,90", framed)).toBe("M100 190 L160 150");
  });

  // Relative deltas scale but must not be translated, and their y negates.
  it("treats relative commands as deltas, not positions", () => {
    expect(transformPathD("m10 10 l20 -20 z", framed)).toBe("m10 230 l20 20 z");
  });

  // The old regex consumed pairs, so an odd-length path never transformed its last
  // number — a whole coordinate silently left behind.
  it("transforms the final coordinate of an odd-length path", () => {
    expect(transformPathD("M100 50 A30 30 0 0 1 160 90", framed)).toBe("M100 190 A30 30 0 0 0 160 150");
  });

  it("expands implicit repetition without losing the phase", () => {
    expect(transformPathD("M10 10 20 20 30 30", framed)).toBe("M10 230 20 220 30 210");
  });
});

describe("transformPathD — refuses rather than guesses", () => {
  // Emitting plausible-but-wrong numbers is how an arc vanishes with no way to tell why.
  it("returns the input untouched when it cannot parse it", () => {
    for (const bad of ["M10 A weird 5", "10 20 30", "M10 10 A26 26 0", "Q"]) {
      expect(transformPathD(bad, framed)).toBe(bad);
    }
  });

  it("passes empty input straight through", () => {
    expect(transformPathD("", framed)).toBe("");
    expect(transformPathD("   ", framed)).toBe("   ");
  });
});

describe("the catalogue renders valid SVG", () => {
  const withPaths = Object.entries(EPURE_CATALOGUE as Record<string, any>).filter(([, s]) => s?.paths?.length);

  it("has figures with paths to check", () => {
    expect(withPaths.length).toBeGreaterThan(20);
  });

  // The regression that shipped: every arc in the catalogue carried an invalid
  // sweep-flag, and only survived because the flip happened to be its own inverse.
  it("emits no arc with an out-of-range flag or a negative radius", () => {
    const bad: string[] = [];
    for (const [key, spec] of withPaths) {
      for (const m of renderEpure(spec).matchAll(/<path d="([^"]*)"/g)) {
        const d = m[1];
        for (const arc of d.matchAll(/[Aa]\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)/g)) {
          const [rx, ry, , large, sweep] = arc.slice(1).map(Number);
          if (rx < 0 || ry < 0) bad.push(`${key}: negative radius in ${d}`);
          if (![0, 1].includes(large) || ![0, 1].includes(sweep)) bad.push(`${key}: flag out of range in ${d}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
