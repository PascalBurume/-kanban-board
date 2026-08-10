import { describe, it, expect } from "vitest";
import { stripFigures, chunkLesson } from "../rag";

// 245 lessons now carry inline SVG figures injected from the transcribed books.
// What reaches the embedder decides what the Copilot can recall, and an SVG's
// path data is both meaningless to it and large enough to crowd out the prose.

const FIG = `<figure class="ai-figure"><svg viewBox="0 0 720 480"><path d="M108 94H360 M108 94V220"/><circle cx="108" cy="94" r="2.6"/></svg><figcaption>Circuit alternatif avec une impédance Z₁ en série. <span class="ai-badge">Figure reconstruite d'après le scan.</span></figcaption></figure>`;

describe("stripFigures", () => {
  it("drops the drawing but keeps the caption that describes it", () => {
    const got = stripFigures(`Avant\n${FIG}\nAprès`);
    expect(got).not.toMatch(/<svg|<figure|path d=/);
    expect(got).toContain("Circuit alternatif avec une impédance");
    expect(got).toContain("Avant");
    expect(got).toContain("Après");
  });

  it("removes a bare svg with no figure wrapper", () => {
    expect(stripFigures('a <svg viewBox="0 0 1 1"><path d="M0 0"/></svg> b')).not.toContain("<svg");
  });

  it("handles several figures in one lesson", () => {
    const got = stripFigures(`${FIG}\n\ntexte\n\n${FIG}`);
    expect(got).not.toContain("<svg");
    expect(got).toContain("texte");
  });

  it("leaves ordinary markdown and maths untouched", () => {
    const md = "## Titre\n\nSoit $x^2 + 1 = 0$ et $$\\frac{a}{b}$$\n\n- point";
    expect(stripFigures(md)).toBe(md);
  });

  // The reason this matters: the payload dwarfs the prose it sits beside.
  it("shrinks a figure-heavy lesson substantially", () => {
    const lesson = `Du texte utile.\n\n${FIG.repeat(5)}`;
    expect(stripFigures(lesson).length).toBeLessThan(lesson.length / 2);
  });
});

describe("chunkLesson", () => {
  const prefixed = (c: string) => c.startsWith("«Mathématiques — 6e › Manuel illustré»");

  it("prefixes every chunk with its provenance", () => {
    const chunks = chunkLesson("Mathématiques — 6e", "Manuel illustré", "## A\n" + "x".repeat(400));
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every(prefixed)).toBe(true);
  });

  it("splits on section headings", () => {
    const md = `## Première\n${"a".repeat(200)}\n\n## Deuxième\n${"b".repeat(200)}`;
    const chunks = chunkLesson("S", "L", md);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toContain("Première");
    expect(chunks[1]).toContain("Deuxième");
  });

  it("windows a section too long for one chunk", () => {
    const chunks = chunkLesson("S", "L", "## Longue\n" + "mot ".repeat(3000));
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("embeds the caption, not the drawing", () => {
    const chunks = chunkLesson("S", "L", `## Circuits\n${"Du contexte. ".repeat(10)}${FIG}`);
    const joined = chunks.join("\n");
    expect(joined).not.toMatch(/<svg|path d=/);
    expect(joined).toContain("Circuit alternatif");
  });

  it("returns nothing for an empty or figure-only lesson", () => {
    expect(chunkLesson("S", "L", "")).toEqual([]);
    expect(chunkLesson("S", "L", '<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>')).toEqual([]);
  });
});
