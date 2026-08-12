import { describe, it, expect } from "vitest";
import { findPoles, obliqueAsymptote, findRoots, type Window } from "../curveAnalysis";
import { compile } from "../figures";

const W: Window = { xmin: -6, xmax: 8, ymin: -12, ymax: 16 };
const f = (src: string) => {
  const c = compile(src);
  if (!c) throw new Error(`did not compile: ${src}`);
  return (x: number) => c(x);
};

describe("oblique asymptote", () => {
  it("keeps the constant term", () => {
    // (x²+1)/(x−1) = x + 1 + 2/(x−1). Estimating the slope as g(X)/X instead of from a
    // chord made p collapse to 0 and the widget printed "y = x − 0" for every function.
    const { m, p } = obliqueAsymptote(f("(x^2+1)/(x-1)"), W);
    expect(m).toBeCloseTo(1, 6);
    expect(p).toBeCloseTo(1, 3);
  });

  it("handles a negative slope and a negative offset", () => {
    // (−2x² + 3x + 1)/x = −2x + 3 + 1/x
    const { m, p } = obliqueAsymptote(f("(0-2*x^2+3*x+1)/x"), W);
    expect(m).toBeCloseTo(-2, 6);
    expect(p).toBeCloseTo(3, 3);
  });

  it("reports a horizontal asymptote as slope zero", () => {
    const { m, p } = obliqueAsymptote(f("(3*x+1)/x"), W);
    expect(m).toBeCloseTo(0, 6);
    expect(p).toBeCloseTo(3, 3);
  });
});

describe("poles", () => {
  it("finds a pole the old absolute threshold missed", () => {
    // At 2000 samples over this window the nearest point to x = 1 only reaches ±571,
    // so a fixed 1e3 cutoff never fired and the asymptote was silently not drawn.
    expect(findPoles(f("(x^2+1)/(x-1)"), W)).toHaveLength(1);
    expect(findPoles(f("(x^2+1)/(x-1)"), W)[0]).toBeCloseTo(1, 2);
  });

  it("finds both poles of a function that has two", () => {
    const poles = findPoles(f("1/((x-2)*(x+3))"), W).sort((a, b) => a - b);
    expect(poles).toHaveLength(2);
    expect(poles[0]).toBeCloseTo(-3, 1);
    expect(poles[1]).toBeCloseTo(2, 1);
  });

  it("reports none for a function that has none", () => {
    expect(findPoles(f("x^2-3"), W)).toEqual([]);
    expect(findPoles(f("sin(x)"), W)).toEqual([]);
  });

  it("does not mistake a jump across zero for a pole", () => {
    // 1/(x²+1) never blows up; a naive sign test on a steep curve could still fire.
    expect(findPoles(f("1/(x^2+1)"), W)).toEqual([]);
  });

  it("returns nothing rather than looping on a degenerate window", () => {
    expect(findPoles(f("1/x"), { xmin: 2, xmax: 2, ymin: -1, ymax: 1 })).toEqual([]);
  });
});

describe("roots", () => {
  it("finds both roots of a trinomial", () => {
    const r = findRoots(f("x^2-x-2"), W).sort((a, b) => a - b);
    expect(r).toHaveLength(2);
    expect(r[0]).toBeCloseTo(-1, 5);
    expect(r[1]).toBeCloseTo(2, 5);
  });

  it("does not invent a root where the curve only touches the axis", () => {
    // A double root does not change sign. Missing it is a real limit of the method;
    // inventing one would be worse, so this pins the honest behaviour.
    expect(findRoots(f("x^2"), W)).toEqual([]);
  });

  it("stops at the cap instead of returning every zero of a periodic function", () => {
    expect(findRoots(f("sin(x)"), { ...W, xmin: -50, xmax: 50 }, 4)).toHaveLength(4);
  });
});
