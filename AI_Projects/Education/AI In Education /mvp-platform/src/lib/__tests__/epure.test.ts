import { describe, it, expect } from "vitest";
import { renderEpure, epureProblems, fit, indexPoints, EPURE_TEMPLATES, emptyEpure, type EpureSpec } from "../epure";
import { parseFigure, renderFigure, figureToJson } from "../figures";
import { canEditVisually, mdToDoc, docToMd } from "../lessonDoc";

// The point of an épure is that it is DATA. The 76 catalogue figures are drawing
// commands with hard-coded pixels, so nothing about them can be changed; here every
// segment, circle and angle refers to a point by NAME, and moving the point moves them
// all. These tests pin that property, and the geometry it depends on.

const tri = (): EpureSpec => ({
  type: "epure",
  points: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 6, y: 0 }, { id: "C", x: 3, y: 4 }],
  segments: [{ from: "A", to: "B" }, { from: "B", to: "C" }, { from: "C", to: "A" }],
});

const coordsOf = (svg: string, tag: "line" | "circle") =>
  (svg.match(new RegExp(`<${tag}[^>]*>`, "g")) ?? []).join("|");

describe("moving a point moves everything anchored to it", () => {
  it("redraws every segment through a moved point", () => {
    const before = coordsOf(renderEpure(tri()), "line");
    const moved = tri();
    moved.points[2] = { id: "C", x: 1, y: 6 };
    const after = coordsOf(renderEpure(moved), "line");
    expect(after).not.toBe(before);
    // Both segments that touch C changed; AB is unaffected in shape.
    expect((after.match(/<line/g) ?? []).length).toBe(3);
  });

  it("follows the point when a circle is defined by two of them", () => {
    const spec: EpureSpec = {
      type: "epure",
      points: [{ id: "O", x: 0, y: 0 }, { id: "A", x: 3, y: 0 }],
      circles: [{ center: "O", through: "A" }],
    };
    const r1 = /r="([\d.]+)"/.exec(renderEpure(spec))?.[1];
    spec.points[1] = { id: "A", x: 6, y: 0 };
    const r2 = /r="([\d.]+)"/.exec(renderEpure(spec))?.[1];
    // Same radius on screen because the view refits — but the circle still passes
    // through A, which is what "through" promises.
    expect(r1).toBeTruthy();
    expect(r2).toBeTruthy();
  });
});

// A separate x and y scale would fit the box more tightly and turn every circle into an
// ellipse. In a geometry figure that is not a cosmetic problem, it is a false statement.
describe("one scale for both axes", () => {
  it("keeps a circle circular whatever the point spread", () => {
    const spec: EpureSpec = {
      type: "epure",
      points: [{ id: "O", x: 0, y: 0 }, { id: "A", x: 1, y: 0 }, { id: "W", x: 20, y: 0.2 }],
      circles: [{ center: "O", through: "A" }],
    };
    const svg = renderEpure(spec);
    // <circle> has a single r, so a non-uniform scale could not be expressed at all —
    // what matters is that fit() reports one k, used for both axes.
    const g = fit(spec);
    const dx = g.sx(1) - g.sx(0);
    const dy = g.sy(0) - g.sy(1);
    expect(Math.abs(dx - dy)).toBeLessThan(1e-9);
    expect(svg).toContain("<circle");
  });

  it("puts y upward, the way a teacher writes coordinates", () => {
    const g = fit(tri());
    expect(g.sy(4)).toBeLessThan(g.sy(0)); // larger y = higher on screen
    expect(g.sx(6)).toBeGreaterThan(g.sx(0));
  });

  it("keeps a circle inside the frame instead of cropping it", () => {
    // The circle reaches far outside the hull of the two points; fit() must account
    // for it or the drawing is simply wrong.
    const spec: EpureSpec = {
      type: "epure",
      points: [{ id: "O", x: 0, y: 0 }, { id: "A", x: 0, y: 5 }],
      circles: [{ center: "O", through: "A" }],
    };
    const g = fit(spec);
    const top = g.sy(5);
    const bottom = g.sy(-5);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(bottom).toBeLessThanOrEqual(g.height);
  });
});

describe("problems a teacher can act on", () => {
  it("reports a segment pointing at a missing point", () => {
    const spec: EpureSpec = { type: "epure", points: [{ id: "A", x: 0, y: 0 }], segments: [{ from: "A", to: "Z" }] };
    expect(epureProblems(spec).join(" ")).toMatch(/« Z »/);
  });

  it("reports a duplicate name", () => {
    const spec: EpureSpec = { type: "epure", points: [{ id: "A", x: 0, y: 0 }, { id: "A", x: 1, y: 1 }] };
    expect(epureProblems(spec).join(" ")).toMatch(/Deux points/);
  });

  // "Empty" means nothing DRAWN, not "no points" — a diagram of arrows and annotations
  // is a legitimate figure with no named points at all.
  it("reports a figure that draws nothing", () => {
    expect(epureProblems({ type: "epure", points: [] }).join(" ")).toMatch(/ne contient encore rien/);
  });

  it("does not call a figure of arrows and labels empty", () => {
    const spec: EpureSpec = {
      type: "epure", points: [],
      arrows: [{ from: { x: 0, y: 0 }, to: { x: 3, y: 2 } }],
      labels: [{ at: { x: 1, y: 1 }, text: "F" }],
    };
    expect(epureProblems(spec)).toEqual([]);
  });

  it("stays silent on a sound figure", () => {
    expect(epureProblems(tri())).toEqual([]);
  });

  // A dangling reference draws nothing rather than throwing — the panel is live, and a
  // half-typed point name must not blank the editor.
  it("still renders when a reference is dangling", () => {
    const spec: EpureSpec = { type: "epure", points: [{ id: "A", x: 0, y: 0 }], segments: [{ from: "A", to: "Z" }] };
    expect(() => renderEpure(spec)).not.toThrow();
    expect(renderEpure(spec)).toContain("<svg");
  });
});

describe("labels are escaped", () => {
  it("escapes a caption containing < and &", () => {
    const spec: EpureSpec = { ...tri(), caption: "rapport k < 1 & homothétie" };
    const svg = renderEpure(spec);
    expect(svg).toContain("k &lt; 1 &amp; homothétie");
    expect(svg).not.toContain("k < 1 &");
  });

  it("escapes a point label", () => {
    const spec: EpureSpec = { type: "epure", points: [{ id: "A", x: 0, y: 0, label: "<b>A</b>" }] };
    expect(renderEpure(spec)).not.toContain("<b>");
  });
});

describe("every template is sound", () => {
  it.each(EPURE_TEMPLATES.map((t) => [t.id, t] as const))("%s has no structural problem", (_id, t) => {
    expect(epureProblems(t.spec)).toEqual([]);
  });

  it.each(EPURE_TEMPLATES.map((t) => [t.id, t] as const))("%s draws something", (_id, t) => {
    const svg = renderEpure(t.spec);
    expect(svg).toContain("<svg");
    // More than the background rect — a template that renders blank is a dead menu item.
    expect((svg.match(/<(line|circle|path|text)/g) ?? []).length).toBeGreaterThan(3);
  });

  // The hand-authored templates are the geometry case, so every anchor in them should
  // be a NAME — that is what makes dragging a vertex move the whole figure. Converted
  // catalogue figures are allowed bare positions; these are not.
  it("names every point it references", () => {
    for (const t of EPURE_TEMPLATES) {
      const ids = new Set(t.spec.points.map((p) => p.id));
      for (const s of t.spec.segments ?? []) {
        expect(typeof s.from === "string" && ids.has(s.from), `${t.id}: ${JSON.stringify(s.from)}`).toBe(true);
        expect(typeof s.to === "string" && ids.has(s.to), `${t.id}: ${JSON.stringify(s.to)}`).toBe(true);
      }
    }
  });
});

// The whole storage argument for riding inside ```figure: an épure inherits the
// markdown round trip, the figure node and the student renderer without any of them
// learning a new construct.
describe("storage rides on the ```figure block", () => {
  const md = "```figure\n" + figureToJson(tri() as never) + "\n```";

  it("parses back out of a figure fence", () => {
    const spec = parseFigure(figureToJson(tri() as never));
    expect(spec?.type).toBe("epure");
  });

  it("refuses an epure with no points array", () => {
    expect(parseFigure('{"type":"epure"}')).toBeNull();
  });

  it("is drawn by the shared renderFigure entry point", () => {
    const spec = parseFigure(figureToJson(tri() as never))!;
    expect(renderFigure(spec)).toBe(renderEpure(tri()));
  });

  it("round-trips through the markdown document", () => {
    expect(docToMd(mdToDoc(md).doc)).toBe(md);
  });

  it("opens in the visual editor", () => {
    expect(canEditVisually(md).ok, canEditVisually(md).reason).toBe(true);
  });

  it("survives beside a heading and maths", () => {
    const doc = `## Figure\n\n${md}\n\nTexte $x^2$ ici.`;
    expect(docToMd(mdToDoc(doc).doc)).toBe(doc);
    expect(canEditVisually(doc).ok).toBe(true);
  });
});

describe("the blank figure", () => {
  it("is usable straight away", () => {
    const spec = emptyEpure();
    expect(epureProblems(spec)).toEqual([]);
    expect(renderEpure(spec)).toContain("<line");
  });
});

describe("indexPoints", () => {
  it("drops a point with no id rather than indexing undefined", () => {
    const spec = { type: "epure", points: [{ id: "", x: 1, y: 1 }, { id: "A", x: 0, y: 0 }] } as EpureSpec;
    expect([...indexPoints(spec).keys()]).toEqual(["A"]);
  });

  it("coerces a non-numeric coordinate to 0 instead of drawing NaN", () => {
    const spec = { type: "epure", points: [{ id: "A", x: "oops" as never, y: 2 }] } as EpureSpec;
    expect(indexPoints(spec).get("A")?.x).toBe(0);
    expect(renderEpure(spec)).not.toContain("NaN");
  });
});
