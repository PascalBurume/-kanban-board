import { describe, it, expect } from "vitest";
import {
  INTERACTIVE_WIDGETS, isInteractive, normalizeInteractive, interactiveAlt,
  type InteractiveSpec,
} from "../interactive";
import { interactiveStillSpec, renderInteractiveStill } from "../interactiveStill";
import { parseFigure, renderFigure, figureToJson } from "../figures";
import { epureProblems } from "../epure";

const widgets = Object.keys(INTERACTIVE_WIDGETS) as (keyof typeof INTERACTIVE_WIDGETS)[];
const spec = (over: Partial<InteractiveSpec> = {}): InteractiveSpec =>
  ({ type: "interactive", widget: "cercle-trigonometrique", ...over });

describe("recognising an interactive spec", () => {
  it("accepts each known widget", () => {
    for (const w of widgets) expect(isInteractive(spec({ widget: w }))).toBe(true);
  });

  it("rejects an unknown widget, so a typo cannot render a blank figure", () => {
    expect(isInteractive({ type: "interactive", widget: "cercle-trigo" })).toBe(false);
    expect(isInteractive({ type: "interactive" })).toBe(false);
    expect(isInteractive({ type: "epure", points: [] })).toBe(false);
    expect(isInteractive(null)).toBe(false);
  });
});

describe("normalising a hand-edited spec", () => {
  it("wraps the angle instead of clamping it — 400° is 40°", () => {
    expect(normalizeInteractive(spec({ angle: 400 })).angle).toBe(40);
    expect(normalizeInteractive(spec({ angle: -90 })).angle).toBe(270);
  });

  it("survives values no sane teacher would type", () => {
    const n = normalizeInteractive(spec({ angle: 1e308, height: -4, a: 99, b: NaN }));
    expect(Number.isFinite(n.angle)).toBe(true);
    expect(n.height).toBeGreaterThanOrEqual(200);
    expect(n.a).toBeLessThanOrEqual(20);
    expect(Number.isFinite(n.b)).toBe(true);
  });

  it("repairs a window that is empty or the wrong way round", () => {
    // A board with xmin === xmax renders blank and says nothing about why.
    const flat = normalizeInteractive(spec({ widget: "fonction", xmin: 3, xmax: 3 }));
    expect(flat.xmax).toBeGreaterThan(flat.xmin);
    const flipped = normalizeInteractive(spec({ widget: "fonction", xmin: 5, xmax: -5 }));
    expect(flipped.xmin).toBe(-5);
    expect(flipped.xmax).toBe(5);
  });

  it("fills unset fields from the widget's preset", () => {
    const n = normalizeInteractive(spec({ widget: "asymptotes" }));
    expect(n.expr).toBe("(x^2+1)/(x-1)");
    // An explicit value still wins over the preset.
    expect(normalizeInteractive(spec({ widget: "asymptotes", expr: "1/x" })).expr).toBe("1/x");
  });

  it("drops readings the widget does not know how to draw", () => {
    const n = normalizeInteractive(spec({ show: ["cos", "hocus-pocus"] }));
    expect(n.show).toEqual(["cos"]);
  });

  it("honours an empty show list rather than falling back to the default", () => {
    expect(normalizeInteractive(spec({ show: [] })).show).toEqual([]);
  });

  it("defaults per widget when show is absent", () => {
    expect(normalizeInteractive(spec()).show).toEqual(["cos", "sin", "angle"]);
  });
});

describe("the sentence that stands in for the figure", () => {
  it("prefers the caption, falls back to the widget's own description", () => {
    expect(interactiveAlt(spec({ caption: "Fig. 9 — le cercle." }))).toBe("Fig. 9 — le cercle.");
    expect(interactiveAlt(spec({ caption: "   " }))).toBe(INTERACTIVE_WIDGETS["cercle-trigonometrique"].still);
  });

  it("describes the mathematics for every widget, not the interaction", () => {
    for (const w of widgets) {
      const still = INTERACTIVE_WIDGETS[w].still;
      expect(still.length).toBeGreaterThan(40);
      expect(still).not.toMatch(/cliquez|glissez|déplacez/i);
    }
  });
});

describe("the still frame", () => {
  it("renders every widget as valid standalone SVG", () => {
    for (const w of widgets) {
      const svg = renderInteractiveStill(spec({ widget: w }));
      expect(svg.startsWith("<svg"), w).toBe(true);
      expect(svg, w).not.toContain("NaN");
      expect(svg, w).not.toContain("undefined");
    }
  });

  it("builds the still out of solvable constructions", () => {
    // The still's projections and mirrors are Euclid.js constructions, not typed-in
    // coordinates — so a broken one shows up as an épure problem, not as a wrong picture.
    for (const w of widgets) {
      expect(epureProblems(interactiveStillSpec(spec({ widget: w }))), w).toEqual([]);
    }
  });

  it("puts M where the angle says, and moves the projections with it", () => {
    const at = (deg: number) => {
      const pts = interactiveStillSpec(spec({ angle: deg })).points;
      const find = (id: string) => pts.find((p) => p.id === id);
      return { M: find("M"), Hx: find("Hx") };
    };
    // The still is rendered through renderEpure, which resolves `from` at draw time, so
    // read the resolved values the same way the renderer does.
    const svg30 = renderInteractiveStill(spec({ angle: 30 }));
    const svg60 = renderInteractiveStill(spec({ angle: 60 }));
    expect(svg30).not.toBe(svg60);
    expect(at(30).M?.from).toMatchObject({ op: "polar", deg: 30 });
    expect(at(30).Hx?.from).toMatchObject({ op: "foot", from: "M" });
  });

  it("prints French decimals in the readouts", () => {
    expect(renderInteractiveStill(spec({ angle: 60 }))).toContain("0,50");
  });
});

describe("surviving the editor round trip", () => {
  it("parseFigure accepts an interactive fence and rejects a malformed one", () => {
    const json = figureToJson(spec({ caption: "Fig. 9" }) as never);
    expect(parseFigure(json)).toMatchObject({ type: "interactive", widget: "cercle-trigonometrique" });
    // A fence parseFigure returns null for is one the editor's figure node cannot carry,
    // and it would be dropped the next time a teacher saved the lesson.
    expect(parseFigure('{"type":"interactive","widget":"nope"}')).toBeNull();
  });

  it("round-trips through JSON without losing a field", () => {
    const original = spec({ widget: "sinusoide", fn: "cos", angle: 40, caption: "La courbe." });
    const back = parseFigure(figureToJson(original as never));
    expect(back).toEqual(original);
  });

  it("renderFigure draws the still, so the editor never shows an empty box", () => {
    const svg = renderFigure(spec({ widget: "triangle-quelconque" }) as never);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("sin");
  });
});
