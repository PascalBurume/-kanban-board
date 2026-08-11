import { describe, it, expect } from "vitest";
import { DRAWINGS } from "../figureDrawings";
import { CATALOGUE } from "../figureCatalogue";
import { figureBlock } from "../figureSvg";

// 76 hand-authored SVGs. One bad coordinate or one unescaped "<" ships a figure that
// renders as nothing, or as broken markup, in front of a class — and the drawing
// feature this replaced was removed for exactly that kind of silent damage.

const codes = CATALOGUE.map((f) => f.code);

describe("every catalogue figure is drawn", () => {
  it("covers all 76, with nothing extra", () => {
    expect(Object.keys(DRAWINGS).sort()).toEqual([...codes].sort());
  });
});

describe("every drawing is sound SVG", () => {
  it.each(codes.map((c) => [c] as const))("%s", (code) => {
    const s = DRAWINGS[code];
    expect(s.startsWith("<svg"), "must be an <svg> root").toBe(true);
    expect(s.endsWith("</svg>"), "must close its root").toBe(true);

    // A NaN in a coordinate makes the element silently vanish rather than error.
    expect(s, "contains NaN/undefined/Infinity").not.toMatch(/NaN|undefined|Infinity/);

    // Unbalanced angle brackets mean an unescaped "<" in a label closed a tag early.
    expect((s.match(/</g) || []).length, "unbalanced < >").toBe((s.match(/>/g) || []).length);

    // Every element the sanitiser in Markdown.js keeps must be one it knows; a stray
    // <script> or <foreignObject> would be dropped and leave a hole in the figure.
    const tags = [...s.matchAll(/<([a-zA-Z]+)/g)].map((m) => m[1]);
    const allowed = new Set(["svg", "rect", "line", "path", "circle", "ellipse", "text", "g", "tspan", "polygon", "polyline"]);
    for (const t of tags) expect(allowed.has(t), `unexpected <${t}> in ${code}`).toBe(true);

    // Something actually gets drawn — not just the white background rectangle.
    const drawn = tags.filter((t) => t !== "svg" && t !== "rect").length;
    expect(drawn, "draws nothing").toBeGreaterThan(2);
  });
});

describe("the insertable block matches what lessons already render", () => {
  it("wraps the figure the way the épures are wrapped", () => {
    const html = figureBlock("MA-GP-03", "Théorème de Thalès", DRAWINGS["MA-GP-03"]);
    expect(html.startsWith('<figure class="ai-figure">')).toBe(true);
    expect(html).toContain("<figcaption>");
    expect(html).toContain("MA-GP-03");
    expect(html.endsWith("</figure>")).toBe(true);
  });

  // The badge distinguishes a reference schema from a plate reconstructed from a scan;
  // conflating the two would misrepresent what the teacher is putting in front of a class.
  it("labels it as a reference figure, not a reconstruction", () => {
    expect(figureBlock("PH-OP-02", "Réfraction", DRAWINGS["PH-OP-02"])).toContain("Figure de référence");
  });
});
