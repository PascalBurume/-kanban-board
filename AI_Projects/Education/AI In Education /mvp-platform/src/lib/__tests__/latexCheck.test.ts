import { describe, it, expect } from "vitest";
import { cleanLatex, checkLatex, hasVisibleContent, liveHints, latexReason } from "../latexCheck";

// This is the gate that replaced the drawing canvas's silent degradation. The canvas
// rendered what it could and stamped "N éléments n'ont pas pu être tracés" into the
// picture; these tests exist so nothing here ever does the equivalent.

describe("cleanLatex strips what a model wraps around a formula", () => {
  it("unwraps a whole LaTeX document", () => {
    const raw = [
      "\\documentclass{article}",
      "\\usepackage{amsmath, amssymb}",
      "\\begin{document}",
      "\\int_0^1 (1+x)^3 \\, dx = \\frac{15}{4}",
      "\\end{document}",
    ].join("\n");
    const { tex, repaired } = cleanLatex(raw);
    expect(tex).toBe("\\int_0^1 (1+x)^3 \\, dx = \\frac{15}{4}");
    expect(repaired).toContain("en-tête");
  });

  it("strips a ```latex code fence", () => {
    const { tex } = cleanLatex("```latex\n\\frac{a}{b}\n```");
    expect(tex).toBe("\\frac{a}{b}");
  });

  it("strips preamble lines with no \\begin{document}", () => {
    const { tex } = cleanLatex("\\usepackage{amsmath}\n\\frac{a}{b}");
    expect(tex).toBe("\\frac{a}{b}");
  });

  it("strips $$ wrapped around the whole formula", () => {
    expect(cleanLatex("$$x^2 + 1$$").tex).toBe("x^2 + 1");
    expect(cleanLatex("\\[ x^2 + 1 \\]").tex).toBe("x^2 + 1");
  });

  // The dangerous case: stripping the first and last $ of a formula that contains
  // several would swallow everything between them.
  it("leaves inner $ delimiters alone", () => {
    const mixed = "$a$ \\text{ et } $b$";
    expect(cleanLatex(mixed).tex).toBe(mixed);
  });

  it("reports nothing repaired when the input was already clean", () => {
    expect(cleanLatex("\\sqrt{2}").repaired).toBeUndefined();
  });

  // /g regexes carry lastIndex between calls. cleanLatex used to test-then-replace,
  // which made the second call on the same input miss the fence.
  it("is idempotent across repeated calls", () => {
    const raw = "```latex\n\\frac{a}{b}\n```";
    expect(cleanLatex(raw).tex).toBe("\\frac{a}{b}");
    expect(cleanLatex(raw).tex).toBe("\\frac{a}{b}");
    expect(cleanLatex(cleanLatex(raw).tex).tex).toBe("\\frac{a}{b}");
  });
});

// Typing assistance. The bar for these is high in the other direction: a hint that
// fires on correct LaTeX is worse than no hint at all, because the teacher learns to
// ignore the strip and then misses the real one.
describe("liveHints stays silent on sound LaTeX", () => {
  it.each([
    "\\frac{a}{b}",
    "\\begin{aligned} a &= b \\\\ &= c \\end{aligned}",
    "\\left( \\frac{1}{2} \\right)",
    "x^{2} + y_{1}",
    "\\sqrt[n]{x}",
    "\\begin{cases} x & \\text{si } x > 0 \\\\ -x & \\text{sinon} \\end{cases}",
    "\\text{coût de 5\\$ par unité}", // an escaped dollar is currency, not a delimiter
    "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}",
  ])("says nothing about %s", (tex) => {
    expect(liveHints(tex).map((h) => h.message)).toEqual([]);
  });
});

describe("liveHints names what is actually missing", () => {
  it("reports an unclosed environment and offers the closer", () => {
    const [h] = liveHints("\\begin{aligned} a &= b");
    expect(h.message).toContain("\\end{aligned}");
    expect(h.fix).toBe("\\end{aligned}");
  });

  it("catches a mismatched environment", () => {
    expect(liveHints("\\begin{aligned} a \\end{cases}")[0].message).toMatch(/aligned.*cases|cases.*aligned/);
  });

  it("counts missing braces", () => {
    expect(liveHints("\\frac{a}{b")[0].message).toContain("accolade fermante");
    expect(liveHints("\\frac{{a}{b")[0].message).toContain("2 accolades");
  });

  it("does not count an escaped brace as an opener", () => {
    expect(liveHints("\\{ a \\}")).toEqual([]);
  });

  it("reports \\left with no \\right", () => {
    expect(liveHints("\\left( x")[0].message).toContain("\\right");
  });

  // The editor is already inside maths; a "$" here silently truncates the formula in
  // the saved markdown, which is invisible until a student opens the lesson.
  it("flags a stray dollar", () => {
    expect(liveHints("$x^2$")[0].message).toContain("$");
  });

  it("reports \\frac used without its arguments", () => {
    expect(liveHints("\\frac a b")[0].message).toContain("deux arguments");
  });

  // Mid-typing, "\fra" or a trailing "\frac" is not yet an error.
  it("does not fire on a command still being typed", () => {
    expect(liveHints("\\frac")).toEqual([]);
    expect(liveHints("x = \\sqrt")).toEqual([]);
  });
});

describe("checkLatex accepts only what KaTeX will actually render", () => {
  it("accepts a multi-line aligned derivation", () => {
    const v = checkLatex("\\begin{aligned}\nI &= \\int_0^1 x \\, dx \\\\\n  &= \\frac{1}{2}\n\\end{aligned}");
    expect(v.ok).toBe(true);
    expect(v.error).toBeUndefined();
  });

  it("rejects an unclosed group and says why", () => {
    const v = checkLatex("\\frac{a}");
    expect(v.ok).toBe(false);
    expect(v.error).toBeTruthy();
    // The KaTeX prefix and the position tail are stripped — the teacher reads the cause.
    expect(v.error).not.toMatch(/^KaTeX parse error/);
  });

  it("rejects an empty formula rather than reporting success on nothing", () => {
    expect(checkLatex("   ").ok).toBe(false);
    expect(checkLatex("").error).toBe("La formule est vide.");
  });

  // aligned is display-only. Checking a derivation as inline maths would reject it for
  // a reason the teacher cannot act on, which is why `display` defaults to true.
  it("accepts aligned in display mode", () => {
    expect(checkLatex("\\begin{aligned} a &= b \\end{aligned}", true).ok).toBe(true);
  });

  // A formula that PARSES can still be wrong: "\times" eaten down to "imes" renders as
  // the italic product i·m·e·s and KaTeX reports no error at all.
  it("flags a command that lost its backslash", () => {
    const v = checkLatex("3 imes 4");
    expect(v.ok).toBe(true);
    expect(v.suspect).toContain("\\times");
  });

  // Asked for "un tableau de 5 colonnes et 10 lignes", the model answered with
  // \begin{array}{ccccc} and ten rows of "& & & & \\". KaTeX renders it without a
  // single complaint and it puts nothing whatsoever on the page.
  it("flags a table that parses but shows nothing", () => {
    const empty = "\\begin{array}{ccccc}\n" + " & & & & \\\\\n".repeat(10) + "\\end{array}";
    const v = checkLatex(empty);
    expect(v.ok).toBe(true); // KaTeX really is happy with it
    expect(v.blank).toBe(true);
    expect(v.suspect).toMatch(/vide/i);
  });

  it("accepts a ruled table with content", () => {
    const v = checkLatex("\\begin{array}{|c|c|}\n\\hline\n x & x^2 \\\\\n\\hline\n 1 & 1 \\\\\n\\hline\n\\end{array}");
    expect(v.ok).toBe(true);
    expect(v.blank).toBeUndefined();
  });

  // A ruled but content-free grid is a legitimate thing to want — a blank table for
  // students to fill in by hand. \hline draws, so it is not "nothing".
  it("accepts an empty table that at least has rules", () => {
    expect(hasVisibleContent("\\begin{array}{|c|c|}\\hline & \\\\\\hline\\end{array}")).toBe(true);
  });

  it("does not mistake ordinary maths for blank", () => {
    for (const tex of ["\\pi", "x^2", "\\frac{a}{b}", "\\sum_{i=1}^{n} i", "\\begin{aligned} a &= b \\end{aligned}", "\\alpha \\beta"]) {
      expect(hasVisibleContent(tex), tex).toBe(true);
    }
  });

  it("treats spacing-only and structure-only source as blank", () => {
    for (const tex of ["\\begin{aligned} & \\\\ & \\end{aligned}", "\\quad \\; \\,", "\\begin{pmatrix} & \\\\ & \\end{pmatrix}", "\\text{}"]) {
      expect(hasVisibleContent(tex), tex).toBe(false);
    }
  });

  it("returns the cleaned source, not the raw input", () => {
    const v = checkLatex("$$\\sqrt{2}$$");
    expect(v.ok).toBe(true);
    expect(v.tex).toBe("\\sqrt{2}");
  });

  it("checks the formula AFTER cleaning, so a preamble is not a failure", () => {
    const v = checkLatex("\\documentclass{article}\n\\begin{document}\nx^2\n\\end{document}");
    expect(v.ok).toBe(true);
    expect(v.tex).toBe("x^2");
  });
});

// The failure messages. These were one sentence for every outcome — "le modèle n'a
// pas répondu" — and for a truncated reply that was simply untrue.
describe("latexReason tells the teacher what actually went wrong", () => {
  it("distinguishes every failure the studio can report", () => {
    const seen = new Set<string>();
    for (const code of ["LATEX_EMPTY", "LATEX_TRUNCATED", "LATEX_UNPARSABLE", "LATEX_BLANK", "LATEX_INVALID"]) {
      const msg = latexReason(code);
      expect(msg, code).toBeTruthy();
      expect(seen.has(msg!), `${code} repeats another message`).toBe(false);
      seen.add(msg!);
    }
  });

  // The two that a shorter prompt would fix must say so — that is the whole point.
  it("names the remedy for a reply that was cut off or empty", () => {
    expect(latexReason("LATEX_TRUNCATED")).toMatch(/trop longue|découpez|une seule formule/i);
    expect(latexReason("LATEX_EMPTY")).toMatch(/trop longue|courte|sélectionnez/i);
  });

  it("never claims silence when the model did reply", () => {
    for (const code of ["LATEX_TRUNCATED", "LATEX_UNPARSABLE", "LATEX_BLANK", "LATEX_INVALID"]) {
      expect(latexReason(code), code).not.toMatch(/n'a rien renvoyé|n'a pas répondu/i);
    }
  });

  it("returns null for an unknown code so the caller keeps its fallback", () => {
    expect(latexReason("GEN_FAILED")).toBeNull();
    expect(latexReason(undefined)).toBeNull();
  });
});
