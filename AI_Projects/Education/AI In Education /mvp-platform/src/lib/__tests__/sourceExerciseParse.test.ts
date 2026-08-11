import { describe, it, expect } from "vitest";
import {
  denoise, stripFigures, normalizeMath, sections, items, splitSolution, hasAnswer,
} from "../../../scripts/source-exercise-parse.mjs";

// These rules decide what 1700+ published exercises say. The risk runs both
// ways: too loose and prose becomes a phantom exercise, too strict and real
// exercises are silently dropped.

describe("sections", () => {
  it("opens on a heading with or without a # prefix", () => {
    expect(sections("# Exercices\n1. a\n").length).toBe(1);
    expect(sections("Exercices résolus\n1. a\n").length).toBe(1);
    expect(sections("### Exercices\n1. a\n").length).toBe(1);
  });

  it("marks 'résolus' sections as solved and plain ones as not", () => {
    expect(sections("# Exercices résolus\n1. a\n")[0].solved).toBe(true);
    expect(sections("# Exercice résolu\n1. a\n")[0].solved).toBe(true);
    expect(sections("# Exercices\n1. a\n")[0].solved).toBe(false);
  });

  // The worked solution belongs to the exercise above it.
  it("keeps a Résolution heading inside the section", () => {
    const s = sections("# Exercices résolus\n1. Montrer que…\n# Résolution\nOn pose…\n");
    expect(s).toHaveLength(1);
    expect(s[0].body).toContain("On pose…");
  });

  it("closes on any other heading", () => {
    const s = sections("# Exercices\n1. a\n# 1.2. OXYDATION\nLa théorie…\n");
    expect(s[0].body).not.toContain("La théorie…");
  });

  it("closes on the next exercise section", () => {
    const s = sections("# Exercices résolus\n1. a\n# Exercices\n1. b\n");
    expect(s).toHaveLength(2);
    expect(s[0].body).not.toContain("b");
  });

  it("finds nothing in a chapter with no exercises", () => {
    expect(sections("# 1.1 Définitions\nUn groupe est…\n")).toEqual([]);
  });

  // "Exercices" as a table-of-contents line, not a section of its own.
  it("does not open a section on prose merely containing the word", () => {
    expect(sections("Les exercices suivants sont difficiles\n1. a\n")).toEqual([]);
  });
});

describe("items", () => {
  it("splits a consecutive numbered run", () => {
    expect(items("1. premier\n2. deuxième\n3. troisième").map((i) => i.n)).toEqual([1, 2, 3]);
  });

  it("keeps continuation lines with their exercise", () => {
    const [first] = items("1. Montrer que\na) x > 0\nb) y < 0\n2. Autre");
    expect(first.text).toContain("a) x > 0");
    expect(first.text).toContain("b) y < 0");
    expect(first.text).not.toContain("Autre");
  });

  // The guard that stops a stray "1." in prose from swallowing a whole section.
  it("drops a number that breaks the run", () => {
    const got = items("1. un\n2. deux\n7. hors-série\n3. trois");
    expect(got.map((i) => i.n)).toEqual([1, 2]);
  });

  it("accepts a book that numbers continuously across chapters", () => {
    expect(items("513. un\n514. deux").map((i) => i.n)).toEqual([513, 514]);
  });

  it("ignores decimals and sub-labels that are not items", () => {
    expect(items("2.4.3. Pourcentage\na) premier")).toEqual([]);
  });

  it("returns nothing for an unnumbered body", () => {
    expect(items("Du texte sans numéro.")).toEqual([]);
  });
});

describe("splitSolution", () => {
  it("separates the statement from the book's worked solution", () => {
    const r = splitSolution("Montrer que x = 2.\n# Résolution\nOn pose x = 2.");
    expect(r.statement).toBe("Montrer que x = 2.");
    expect(r.solution).toBe("On pose x = 2.");
  });

  it("accepts the marker unprefixed, accented or not, and with a colon", () => {
    for (const m of ["Résolution", "Resolution", "# Résolution", "#### Corrigé", "Résolution :"]) {
      expect(splitSolution(`Énoncé.\n${m}\nLa suite.`).solution).toBe("La suite.");
    }
  });

  it("leaves the solution empty when the book gives none", () => {
    const r = splitSolution("Calculer la masse molaire.");
    expect(r.solution).toBe("");
    expect(r.statement).toBe("Calculer la masse molaire.");
  });

  // "Résolution" mid-sentence is prose, not a heading.
  it("does not split on the word inside a line", () => {
    expect(splitSolution("Donner la résolution du système.").solution).toBe("");
  });
});

describe("normalizeMath", () => {
  it("rewrites \\( \\) and \\[ \\] to the dollar forms remark-math parses", () => {
    expect(normalizeMath("a) \\(500\\mathrm{g}\\) d'eau")).toBe("a) $500\\mathrm{g}$ d'eau");
    expect(normalizeMath("\\[x^2\\]")).toBe("$$x^2$$");
  });

  it("leaves existing dollar math and ordinary backslashes alone", () => {
    expect(normalizeMath("$x^2$ et \\frac{1}{2}")).toBe("$x^2$ et \\frac{1}{2}");
  });

  it("handles several spans on one line and spans over several lines", () => {
    expect(normalizeMath("\\(a\\) puis \\(b\\)")).toBe("$a$ puis $b$");
    expect(normalizeMath("\\[a\n+b\\]")).toBe("$$a\n+b$$");
  });
});

describe("denoise and stripFigures", () => {
  it("removes scan artefacts without touching the exercise", () => {
    const got = denoise("1. Calculer x\n<!-- page 16 -->\nScanned by CamScanner\n---\n5\nb) puis y");
    expect(got).toBe("1. Calculer x\nb) puis y");
  });

  it("keeps a numeric answer that happens to sit on its own line", () => {
    // A bare 1–3 digit line is a page number; a longer one is data.
    expect(denoise("Rép :\n1024")).toContain("1024");
  });

  it("removes AI-recreated figures so they cannot ride along as book text", () => {
    // The blank line the figure occupied stays, so the two paragraphs around it
    // do not weld into one.
    const got = stripFigures('Avant\n<figure class="ai-figure"><svg/></figure>\nAprès');
    expect(got).toBe("Avant\n\nAprès");
    expect(got).not.toContain("svg");
  });
});

describe("hasAnswer", () => {
  it("recognises the printed answer key", () => {
    expect(hasAnswer("Rép : a) 10 %")).toBe(true);
    expect(hasAnswer("Rep. : 42")).toBe(true);
    expect(hasAnswer("Réponse attendue plus bas")).toBe(false);
  });
});
