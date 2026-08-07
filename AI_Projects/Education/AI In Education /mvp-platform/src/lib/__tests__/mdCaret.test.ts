import { describe, it, expect } from "vitest";
import { fences, fenceAt, inMathAt, insertAt, insertBlock } from "../mdCaret";

// These helpers exist to stop one specific, silent disaster: writing into a ```figure
// payload. The JSON stops parsing, the figure renders as a red slab of its own source,
// and nothing says why. They were untested while they lived inside the LaTeX atelier.

describe("fences", () => {
  it("finds a closed block", () => {
    const md = "avant\n```figure\n{}\n```\naprès";
    const [f] = fences(md);
    expect(f.lang).toBe("figure");
    expect(md.slice(f.start, f.end)).toContain("```figure");
    expect(md.slice(f.end)).toBe("après");
  });

  it("reads the language", () => {
    expect(fences("```python\nx=1\n```")[0].lang).toBe("python");
    expect(fences("```\nplain\n```")[0].lang).toBe("");
  });

  it("finds several blocks", () => {
    expect(fences("```a\n1\n```\ntexte\n```b\n2\n```")).toHaveLength(2);
  });

  // The teacher is part-way through typing one — exactly when an insert would land
  // inside it.
  it("treats an unterminated fence as owning the rest of the document", () => {
    const md = "texte\n```figure\n{ incomplet";
    const [f] = fences(md);
    expect(f.end).toBe(md.length);
  });

  it("returns nothing for prose", () => {
    expect(fences("Juste du texte.\n\nEt un paragraphe.")).toHaveLength(0);
  });
});

describe("fenceAt", () => {
  const md = "avant\n```figure\n{\"type\":\"line\"}\n```\naprès";

  it("detects a caret inside the payload", () => {
    expect(fenceAt(md, md.indexOf('"type"'))).not.toBeNull();
  });

  it("leaves prose alone", () => {
    expect(fenceAt(md, 2)).toBeNull();
    expect(fenceAt(md, md.length - 2)).toBeNull();
  });
});

describe("inMathAt", () => {
  it("knows when the caret is between $ delimiters", () => {
    const md = "On pose $x^2 + 1$ puis on continue.";
    expect(inMathAt(md, md.indexOf("x^2") + 1)).toBe(true);
    expect(inMathAt(md, md.length - 3)).toBe(false);
  });

  it("ignores escaped dollars", () => {
    expect(inMathAt("Le prix est \\$5 et rien d'autre.", 28)).toBe(false);
  });

  // The bug this guards: a "$" inside a figure payload flipping the parity and making
  // the whole rest of the document look like maths.
  it("ignores dollars inside a fenced payload", () => {
    const md = '```figure\n{"label":"$"}\n```\nTexte ordinaire ici.';
    expect(inMathAt(md, md.length - 4)).toBe(false);
  });
});

describe("insertAt", () => {
  it("splices at the caret", () => {
    const r = insertAt("abcdef", 3, 3, "XY");
    expect(r.md).toBe("abcXYdef");
    expect(r.caret).toBe(5);
    expect(r.movedOutOfFence).toBe(false);
  });

  it("replaces a selection", () => {
    expect(insertAt("abcdef", 1, 4, "Z").md).toBe("aZef");
  });

  // The whole point of the module.
  it("lands after the block rather than inside a figure payload", () => {
    const md = 'texte\n```figure\n{"type":"line"}\n```\nfin';
    const r = insertAt(md, md.indexOf('"type"'), md.indexOf('"type"'), "$$x$$");
    expect(r.movedOutOfFence).toBe(true);
    expect(r.md).toContain('{"type":"line"}'); // payload intact
    expect(r.md.indexOf("$$x$$")).toBeGreaterThan(r.md.lastIndexOf("```"));
  });

  it("clamps out-of-range offsets", () => {
    expect(insertAt("abc", 99, 99, "!").md).toBe("abc!");
    expect(insertAt("abc", -5, -5, "!").md).toBe("!abc");
  });
});

describe("insertBlock", () => {
  it("separates the block with one blank line either side", () => {
    const r = insertBlock("Avant.\n\nAprès.", 7, "## Titre");
    expect(r.md).toBe("Avant.\n\n## Titre\n\nAprès.");
  });

  it("does not open with blank lines at the top of a document", () => {
    expect(insertBlock("", 0, "## Titre").md).toBe("## Titre\n");
  });

  it("puts the caret at the end of the inserted block", () => {
    const r = insertBlock("Avant.", 6, "## Titre");
    expect(r.md.slice(0, r.caret).endsWith("## Titre")).toBe(true);
  });
});
