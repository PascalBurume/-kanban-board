import { describe, it, expect } from "vitest";
import { applyConstructions, solveConstructions, constructionProblems, type EpureCurve } from "../epureConstruct";
import { indexPoints, renderEpure, epureProblems, type EpureSpec } from "../epure";

const spec = (points: EpureSpec["points"], rest: Partial<EpureSpec> = {}): EpureSpec =>
  ({ type: "epure", points, ...rest });

const at = (s: EpureSpec, id: string) => {
  const p = indexPoints(s).get(id);
  return p ? { x: Math.round(p.x * 1e6) / 1e6, y: Math.round(p.y * 1e6) / 1e6 } : null;
};

const ABC = [
  { id: "A", x: 0, y: 0 },
  { id: "B", x: 6, y: 0 },
  { id: "C", x: 2, y: 4 },
];

describe("constructions", () => {
  it("places the midpoint of a segment", () => {
    const s = spec([...ABC, { id: "M", x: 0, y: 0, from: { op: "midpoint", of: ["A", "B"] } }]);
    expect(at(s, "M")).toEqual({ x: 3, y: 0 });
  });

  it("drops a perpendicular foot onto a line", () => {
    const s = spec([...ABC, { id: "H", x: 0, y: 0, from: { op: "foot", from: "C", on: ["A", "B"] } }]);
    expect(at(s, "H")).toEqual({ x: 2, y: 0 });
  });

  it("reflects across a line and across a point", () => {
    const s = spec([
      ...ABC,
      { id: "C1", x: 0, y: 0, from: { op: "reflect", of: "C", over: ["A", "B"] } },
      { id: "C2", x: 0, y: 0, from: { op: "reflect", of: "C", over: "A" } },
    ]);
    expect(at(s, "C1")).toEqual({ x: 2, y: -4 });
    expect(at(s, "C2")).toEqual({ x: -2, y: -4 });
  });

  it("rotates counter-clockwise, matching the figure's y-up axis", () => {
    const s = spec([...ABC, { id: "R", x: 0, y: 0, from: { op: "rotate", of: "B", about: "A", deg: 90 } }]);
    const r = at(s, "R")!;
    expect(r.x).toBeCloseTo(0, 6);
    expect(r.y).toBeCloseTo(6, 6);
  });

  it("finds both intersections of a line and a circle, ordered stably", () => {
    const line: EpureCurve = { line: ["A", "B"] };
    const circle: EpureCurve = { circle: { center: "K", r: 2 } };
    const pts = [...ABC, { id: "K", x: 3, y: 0 }];
    const first = spec([...pts, { id: "P", x: 0, y: 0, from: { op: "intersect", of: [line, circle] } }]);
    const second = spec([...pts, { id: "P", x: 0, y: 0, from: { op: "intersect", of: [line, circle], pick: 1 } }]);
    const a = at(first, "P")!;
    const b = at(second, "P")!;
    expect(new Set([a.x, b.x])).toEqual(new Set([1, 5]));
    expect(a.x).not.toBe(b.x);
  });

  it("computes the classic triangle centres", () => {
    const of = ["A", "B", "C"] as [string, string, string];
    const s = spec([
      ...ABC,
      { id: "O", x: 0, y: 0, from: { op: "circumcenter", of } },
      { id: "G", x: 0, y: 0, from: { op: "centroid", of } },
    ]);
    expect(at(s, "O")).toEqual({ x: 3, y: 1 });
    const g = at(s, "G")!;
    expect(g.x).toBeCloseTo(8 / 3, 6);
    expect(g.y).toBeCloseTo(4 / 3, 6);
  });

  it("chains a construction onto another construction", () => {
    // H is the foot from C onto AB; N is the midpoint of [AH]. N cannot be solved until
    // H is, which is the whole reason the solver is a fixpoint loop and not one pass.
    const s = spec([
      ...ABC,
      { id: "N", x: 0, y: 0, from: { op: "midpoint", of: ["A", "H"] } },
      { id: "H", x: 0, y: 0, from: { op: "foot", from: "C", on: ["A", "B"] } },
    ]);
    expect(at(s, "H")).toEqual({ x: 2, y: 0 });
    expect(at(s, "N")).toEqual({ x: 1, y: 0 });
  });

  it("keeps constructed points following the points they depend on", () => {
    const build = (cx: number) =>
      at(spec([{ id: "A", x: 0, y: 0 }, { id: "B", x: cx, y: 0 },
        { id: "M", x: 999, y: 999, from: { op: "midpoint", of: ["A", "B"] } }]), "M");
    expect(build(6)).toEqual({ x: 3, y: 0 });
    expect(build(10)).toEqual({ x: 5, y: 0 });
  });
});

describe("constructions that cannot be run", () => {
  it("reports parallel lines rather than inventing a crossing", () => {
    const s = spec([
      { id: "A", x: 0, y: 0 }, { id: "B", x: 4, y: 0 },
      { id: "C", x: 0, y: 2 }, { id: "D", x: 4, y: 2 },
      { id: "X", x: 7, y: 7, from: { op: "intersect", of: [{ line: ["A", "B"] }, { line: ["C", "D"] }] } },
    ]);
    expect(solveConstructions(s).failed).toHaveLength(1);
    // Falls back to the literal coordinates instead of collapsing to the origin.
    expect(at(s, "X")).toEqual({ x: 7, y: 7 });
    expect(epureProblems(s).join(" ")).toContain("ne se coupent pas");
  });

  it("detects a cycle instead of looping forever", () => {
    const s = spec([
      { id: "A", x: 0, y: 0 },
      { id: "P", x: 1, y: 1, from: { op: "midpoint", of: ["A", "Q"] } },
      { id: "Q", x: 2, y: 2, from: { op: "midpoint", of: ["A", "P"] } },
    ]);
    const { failed } = solveConstructions(s);
    expect(failed).toHaveLength(2);
    expect(failed.every((f) => f.reason.includes("circulaire"))).toBe(true);
  });

  it("survives a degenerate triangle", () => {
    const s = spec([
      { id: "A", x: 0, y: 0 }, { id: "B", x: 2, y: 0 }, { id: "C", x: 4, y: 0 },
      { id: "O", x: 0, y: 0, from: { op: "circumcenter", of: ["A", "B", "C"] } },
    ]);
    expect(() => renderEpure(s)).not.toThrow();
    expect(constructionProblems(s).length).toBeGreaterThan(0);
  });

  it("ignores an unknown op and keeps the literal coordinates", () => {
    const s = spec([
      { id: "A", x: 0, y: 0 },
      { id: "Z", x: 5, y: 5, from: { op: "teleport" } as never },
    ]);
    expect(at(s, "Z")).toEqual({ x: 5, y: 5 });
    expect(constructionProblems(s)).toEqual([]);
  });
});

describe("cost of the feature for figures that do not use it", () => {
  it("returns the same object when nothing is constructed", () => {
    const s = spec(ABC, { segments: [{ from: "A", to: "B" }] });
    expect(applyConstructions(s)).toBe(s);
    expect(constructionProblems(s)).toEqual([]);
  });

  it("renders a constructed figure through the ordinary renderer", () => {
    const s = spec([
      ...ABC,
      { id: "H", x: 0, y: 0, from: { op: "foot", from: "C", on: ["A", "B"] } },
    ], { segments: [{ from: "C", to: "H", dash: "4 3" }], angles: [{ at: "H", from: "A", to: "C", right: true }] });
    const svg = renderEpure(s);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).not.toContain("NaN");
  });
});
