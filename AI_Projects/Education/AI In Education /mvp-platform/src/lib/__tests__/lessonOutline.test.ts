import { describe, it, expect } from "vitest";
import { outline } from "../lessonOutline";

describe("outline", () => {
  it("reads levels and text", () => {
    const plan = outline("# Un\n\ntexte\n\n## Deux\n\n### Trois");
    expect(plan.map((h) => [h.level, h.text])).toEqual([
      [1, "Un"],
      [2, "Deux"],
      [3, "Trois"],
    ]);
  });

  it("numbers headings in document order so the pane can find the nth one", () => {
    expect(outline("## A\n\n## B\n\n## C").map((h) => h.index)).toEqual([0, 1, 2]);
  });

  it("reports 1-based line numbers", () => {
    expect(outline("texte\n\n## Titre").find((h) => h.text === "Titre")?.line).toBe(3);
  });

  // A "# comment" inside a code sample is not a section.
  it("skips headings inside fenced blocks", () => {
    const md = "## Vrai titre\n\n```python\n# pas un titre\n## non plus\n```\n\n## Autre";
    expect(outline(md).map((h) => h.text)).toEqual(["Vrai titre", "Autre"]);
  });

  it("skips a figure payload that happens to contain a hash", () => {
    const md = '## Titre\n\n```figure\n{"color":"#fff"}\n```';
    expect(outline(md).map((h) => h.text)).toEqual(["Titre"]);
  });

  it("ignores an empty heading", () => {
    expect(outline("##\n\n##   \n\n## Réel").map((h) => h.text)).toEqual(["Réel"]);
  });

  it("ignores a hash that is not a heading", () => {
    expect(outline("Le #hashtag et 1#2")).toHaveLength(0);
  });

  it("handles empty input", () => {
    expect(outline("")).toEqual([]);
  });
});
