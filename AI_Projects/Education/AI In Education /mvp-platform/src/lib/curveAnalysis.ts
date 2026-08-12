// Reading a curve's features off the function itself.
//
// The interactive figures accept an arbitrary expression, so nothing here may assume it
// can factorise, differentiate or otherwise inspect the formula — the only operation
// available is "evaluate at x". Both the live JSXGraph board and the static still import
// these, so the two cannot disagree about where an asymptote is.

export type Window = { xmin: number; xmax: number; ymin: number; ymax: number };

/**
 * Where the curve blows up, found by sampling.
 *
 * A pole and a root both flip the sign of f between two samples, so the sign flip alone
 * cannot tell them apart. What separates them is the MAGNITUDE on both sides: crossing a
 * root, f is near zero either side of the crossing; crossing a pole, it is large on both.
 * So the test is on min(|ya|, |yb|), not max — with max, a pole is only caught when the
 * sampling happens to land very close to it, and `1/((x-2)*(x+3))` had one of its two
 * poles found and the other missed depending on where the grid fell.
 *
 * The threshold is relative to the window height rather than an absolute constant, so it
 * means the same thing whether the lesson plots values in units or in thousands.
 */
export function findPoles(f: (x: number) => number, w: Window): number[] {
  const out: number[] = [];
  const N = 2000;
  const span = w.xmax - w.xmin;
  if (!(span > 0)) return out;
  const big = Math.max(1e-9, w.ymax - w.ymin);
  for (let i = 1; i < N; i++) {
    const a = w.xmin + (span * (i - 0.5)) / N;
    const b = w.xmin + (span * (i + 0.5)) / N;
    const ya = f(a);
    const yb = f(b);
    const blowsUp = !Number.isFinite(ya) || !Number.isFinite(yb)
      || (ya * yb < 0 && Math.min(Math.abs(ya), Math.abs(yb)) > big);
    if (!blowsUp) continue;
    const p = (a + b) / 2;
    if (!out.some((q) => Math.abs(q - p) < span / 60)) out.push(p);
  }
  return out;
}

/**
 * The oblique asymptote y = mx + p, estimated far from the origin.
 *
 * m is the slope of a CHORD between two distant points, never g(X)/X. The quotient does
 * converge to m, but only as 1/X — so at any finite X it still carries the constant
 * term, and p came out as 0 for every function tried: (x²+1)/(x−1) reported "y = x − 0"
 * where the answer is y = x + 1. A chord cancels the constant exactly.
 *
 * Returns NaN slopes for curves that have no oblique asymptote; the caller checks.
 */
export function obliqueAsymptote(f: (x: number) => number, w: Window): { m: number; p: number } {
  // Far enough out that the remainder is below the two decimals the widget prints, and
  // not so far that the subtraction loses its own significant digits.
  const R = Math.max(Math.abs(w.xmin), Math.abs(w.xmax), 1);
  const x1 = R * 2e3;
  const x2 = R * 4e3;
  const m = (f(x2) - f(x1)) / (x2 - x1);
  return { m, p: f(x2) - m * x2 };
}

/**
 * Real roots inside the window, by scanning for sign changes and bisecting.
 *
 * Only roots the curve CROSSES: a double root touches the axis without changing sign and
 * is not found. That is a real limit, and a widget that invented one would be worse.
 */
export function findRoots(f: (x: number) => number, w: Window, max = 6): number[] {
  const out: number[] = [];
  const N = 600;
  const span = w.xmax - w.xmin;
  if (!(span > 0)) return out;
  let px = w.xmin;
  let py = f(px);
  for (let i = 1; i <= N && out.length < max; i++) {
    const x = w.xmin + (span * i) / N;
    const y = f(x);
    if (Number.isFinite(py) && Number.isFinite(y) && py * y < 0) {
      let lo = px;
      let hi = x;
      for (let k = 0; k < 60; k++) {
        const mid = (lo + hi) / 2;
        if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid;
      }
      out.push((lo + hi) / 2);
    }
    px = x;
    py = y;
  }
  return out;
}
