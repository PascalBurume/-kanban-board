import { describe, it, expect } from "vitest";
// The pipeline module is plain .mjs; its JSDoc carries the types.
import { buildLexicon, isShouted, unshout, restoreDiacritics, cleanHeading, lessonTitle, titleCandidates, titleGroups } from "../../../scripts/book-lesson-title.mjs";

// A stand-in for the book's body text: correctly spelled prose, repeated enough to
// count as evidence. This is exactly the signal the real lexicon runs on.
const BODY = `
  la théorie atomique et la théorie de Bohr. théorie, théorie.
  le principe de la volumétrie, volumétrie, volumétrie et la volumétrie.
  les éléments, éléments, éléments simples. une équation, équation, équation.
  la loi des gaz parfaits, gaz parfaits, gaz parfaits, une loi, loi, loi.
  le pH d'une solution, pH, pH, pH. les développement, développement, développement.
  la formule de Taylor, Taylor, Taylor. étude, étude, étude. évaluation, évaluation, évaluation.
`;
const lexicon = buildLexicon(BODY);

describe("buildLexicon", () => {
  it("lets the book vote on spelling", () => {
    expect(lexicon.get("theorie")).toMatchObject({ form: "théorie" });
    expect(lexicon.get("volumetrie")).toMatchObject({ form: "volumétrie" });
  });

  it("keeps proper nouns capitalised, because the body text does", () => {
    expect(lexicon.get("taylor")).toMatchObject({ form: "Taylor" });
  });

  it("ignores SHOUTED words — they are the damage, not the evidence", () => {
    const lex = buildLexicon("THEORIE THEORIE THEORIE théorie");
    expect(lex.get("theorie")).toMatchObject({ form: "théorie", count: 1 });
  });
});

describe("isShouted", () => {
  it("recognises the book's section headings", () => {
    expect(isShouted("THEORIE ATOMIQUE")).toBe(true);
    expect(isShouted("pH DES SOLUTIONS")).toBe(true); // one stray lower-case letter
  });

  it("leaves ordinary headings alone", () => {
    expect(isShouted("Suites géométriques")).toBe(false);
    expect(isShouted("Définition")).toBe(false);
  });

  it("does not judge a string with almost no letters", () => {
    expect(isShouted("A.")).toBe(false);
    expect(isShouted("1.2")).toBe(false);
  });
});

describe("unshout", () => {
  it("restores accents the scan dropped from capitals", () => {
    expect(unshout("THEORIE ATOMIQUE", lexicon)).toBe("Théorie atomique");
  });

  it("keeps a term the book deliberately lower-cases", () => {
    expect(unshout("pH DES SOLUTIONS", lexicon)).toBe("pH des solutions");
  });

  it("lower-cases the elided article", () => {
    expect(unshout("PRINCIPE D'UNE EQUATION", lexicon)).toContain("d'");
    expect(unshout("PRINCIPE D'UNE EQUATION", lexicon)).not.toContain("D'");
  });

  it("leaves an acronym gloss in brackets untouched", () => {
    // "(EO)" and "(NO)" are the symbols being defined. Their lower-case twins exist as
    // ordinary words, so only the bracket distinguishes them.
    const out = unshout("ETAGE D'OXYDATION (EO) OU NOMBRE D'OXYDATION (NO)", lexicon);
    expect(out).toContain("(EO)");
    expect(out).toContain("(NO)");
  });

  it("does not swap bracketed text into a heading that has numbers of its own", () => {
    const out = unshout("LOI 2 DES GAZ PARFAITS (A)", lexicon);
    expect(out).toContain("2");
    expect(out).toContain("(A)");
  });

  it("lower-cases a long shouted word even with no evidence, but not a short one", () => {
    expect(unshout("LOI DES ELECTROLYTES", lexicon)).toBe("Loi des electrolytes");
    expect(unshout("SPECTRE UV", lexicon)).toBe("Spectre UV");
  });

  it("recovers a plural from its singular", () => {
    expect(unshout("DEVELOPPEMENTS", lexicon)).toBe("Développements");
  });
});

describe("restoreDiacritics", () => {
  it("adds only the marks, keeping the book's own capitalisation", () => {
    expect(restoreDiacritics("Etude et représentation", lexicon)).toBe("Étude et représentation");
  });

  it("changes nothing when the word is already right", () => {
    expect(restoreDiacritics("Suites géométriques", lexicon)).toBe("Suites géométriques");
  });

  it("never rewrites a word into a different word", () => {
    // "loi" and "lai" are not the same letters; no accent connects them.
    expect(restoreDiacritics("Lai", lexicon)).toBe("Lai");
  });
});

describe("cleanHeading", () => {
  it("drops the book's section number", () => {
    expect(cleanHeading("1.1. THEORIE ATOMIQUE")).toBe("THEORIE ATOMIQUE");
    expect(cleanHeading("III.4 Le plan")).toBe("Le plan");
  });

  it("drops a formula that lost its markup", () => {
    expect(cleanHeading("5. Equations du second degré en z (z in mathbfC)")).toBe("Equations du second degré en z");
  });

  it("keeps a parenthetical that is real text", () => {
    expect(cleanHeading("2. Théorie atomique (u.m.a et mole)")).toBe("Théorie atomique (u.m.a et mole)");
  });

  it("closes up the scan's spacing after an elision", () => {
    expect(cleanHeading("6. Exercices d' auto-évaluation")).toBe("Exercices d'auto-évaluation");
  });

  it("strips whole formulas that kept their delimiters", () => {
    expect(cleanHeading("7. Le module $|z|$")).toBe("Le module");
  });

  it("drops the emphasis the scan wraps whole headings in", () => {
    // The caller passes heading text, not the "## " that introduced it.
    expect(cleanHeading("**Items Exétat 2018. (Série 1).**")).toBe("Items Exétat 2018. (Série 1)");
    expect(cleanHeading("*Exétat Session 2016.*")).toBe("Exétat Session 2016");
    expect(cleanHeading("**1.2. THEORIE**")).toBe("THEORIE");
  });

  it("returns empty for a heading that was nothing but a number", () => {
    expect(cleanHeading("1.2.")).toBe("");
    expect(cleanHeading("")).toBe("");
  });
});

describe("titleCandidates", () => {
  it("prefers the sections the book numbered at the top level", () => {
    const out = titleCandidates({ major: ["1.2 Concentration"], minor: ["3. Autre chose"] });
    expect(out[0]).toBe("1.2 Concentration");
  });

  it("falls back to a numbered sub-heading — normalizeHeadings leaves '2. …' at level 3", () => {
    expect(titleCandidates({ major: [], minor: ["2. Equations", "Résolution"] })).toEqual(["2. Equations"]);
  });

  it("ignores sub-points that are not sections", () => {
    expect(titleCandidates({ major: [], minor: ["a) Définition", "Résolution", "2° Méthode"] })).toEqual([]);
  });
});

describe("lessonTitle", () => {
  it("names a lesson after the first section it contains", () => {
    expect(lessonTitle({ numbered: ["1.1. THEORIE ATOMIQUE"], lexicon })).toBe("Théorie atomique");
  });

  it("continues the previous lesson when it opens mid-section", () => {
    expect(lessonTitle({ numbered: [], lexicon, carry: "Théorie atomique" })).toBe("Théorie atomique (suite)");
  });

  it("counts the continuations from two, not three", () => {
    expect(lessonTitle({ numbered: [], lexicon, carry: "X (suite)" })).toBe("X (suite 2)");
    expect(lessonTitle({ numbered: [], lexicon, carry: "X (suite 2)" })).toBe("X (suite 3)");
  });

  it("has nothing to say about a fragment with no predecessor", () => {
    expect(lessonTitle({ numbered: [], lexicon, carry: null })).toBe(null);
  });

  it("shortens a section name that runs past a title's length", () => {
    const long = "1. Relation entre masse volumique, densité, molarité, normalité et le pourcentage d'une solution";
    const out = lessonTitle({ numbered: [long], lexicon }) as string;
    expect(out.length).toBeLessThanOrEqual(81);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/[ ,;:]…$/);
  });
});

describe("titleGroups", () => {
  it("threads the continuation chain across a chapter", () => {
    const out = titleGroups(
      [["1.1. THEORIE ATOMIQUE"], [], [], ["1.2. PRINCIPE DE LA VOLUMETRIE"], []],
      lexicon
    );
    expect(out).toEqual([
      "Théorie atomique",
      "Théorie atomique (suite)",
      "Théorie atomique (suite 2)",
      "Principe de la volumétrie",
      "Principe de la volumétrie (suite)",
    ]);
  });

  it("falls back when the very first group has no section of its own", () => {
    expect(titleGroups([[]], lexicon, "Extrait du manuel")).toEqual(["Extrait du manuel"]);
    expect(titleGroups([[]], lexicon, { fallback: "Extrait du manuel" })).toEqual(["Extrait du manuel"]);
  });

  it("marks the book's own text when the module already wrote up that section", () => {
    // The curriculum team's summary is called "Théorie atomique" too. The manual's
    // version takes the qualifier — a teacher must be able to tell the rows apart.
    const out = titleGroups([["1.1. THEORIE ATOMIQUE"]], lexicon, { taken: ["Théorie atomique"] });
    expect(out).toEqual(["Théorie atomique — manuel"]);
  });

  it("keeps the qualifier ahead of the continuation marker", () => {
    const out = titleGroups([["1.1. THEORIE ATOMIQUE"], []], lexicon, { taken: ["Théorie atomique"] });
    expect(out).toEqual(["Théorie atomique — manuel", "Théorie atomique — manuel (suite)"]);
  });

  it("gives way again when even the qualified title is taken", () => {
    const out = titleGroups([["1.1. THEORIE ATOMIQUE"]], lexicon, {
      taken: ["Théorie atomique", "Théorie atomique — manuel"],
    });
    expect(out[0]).toBe("Théorie atomique — manuel (suite)");
  });

  it("compares titles case-insensitively", () => {
    const out = titleGroups([["1.1. THEORIE ATOMIQUE"]], lexicon, { taken: ["THÉORIE ATOMIQUE"] });
    expect(out[0]).toBe("Théorie atomique — manuel");
  });

  it("never repeats a title inside one chapter", () => {
    const out = titleGroups([["1.1. THEORIE ATOMIQUE"], ["1.1. THEORIE ATOMIQUE"]], lexicon);
    expect(out[0]).toBe("Théorie atomique");
    expect(out[1]).not.toBe(out[0]);
    expect(new Set(out).size).toBe(2);
  });

  it("leaves no lesson unnamed", () => {
    const out = titleGroups([[], [], ["2. Suites"], []], lexicon);
    expect(out.every((t) => typeof t === "string" && t.length > 0)).toBe(true);
  });
});
