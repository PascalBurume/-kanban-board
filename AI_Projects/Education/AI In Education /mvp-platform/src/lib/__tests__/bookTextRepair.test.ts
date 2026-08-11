import { describe, it, expect } from "vitest";
// Plain .mjs pipeline module.
import { findRunningHeads, stripRunningHeads, anchorFigures, trimTrailingHeadings, dropRedundantFigures } from "../../../scripts/book-text-repair.mjs";

const fig = (inner = "") => `<figure class="ai-figure"><svg>${inner}</svg><figcaption>Un cercle.</figcaption></figure>`;

describe("findRunningHeads", () => {
  const book = ["# TRIGONOMÉTRIE", ...Array(6).fill("TRIGONOMÉTRIE"), "du texte ordinaire"].join("\n");

  it("finds the title the scan repeats across every page", () => {
    expect([...findRunningHeads(book)]).toEqual(["TRIGONOMÉTRIE"]);
  });

  it("leaves a title that is written once", () => {
    expect(findRunningHeads("# EXERCICES\nEXERCICES\ndu texte").size).toBe(0);
  });

  it("ignores a repeated line the book never uses as a heading", () => {
    // Repetition alone is not enough — it has to be a title somewhere.
    expect(findRunningHeads(Array(9).fill("ON A DONC").join("\n")).size).toBe(0);
  });

  it("keeps a bracketed provenance tag, however often it repeats", () => {
    // The EXETAT bank tags each question with its sitting. Those are the provenance of
    // the question; dropping them costs the reader real information.
    const bank = ["# **(EXETAT 2019)**", ...Array(9).fill("(EXETAT 2019)")].join("\n");
    expect(findRunningHeads(bank).size).toBe(0);
  });

  it("keeps a line carrying a year even unbracketed", () => {
    const src = ["# SESSION 2020", ...Array(9).fill("SESSION 2020")].join("\n");
    expect(findRunningHeads(src).size).toBe(0);
  });

  it("ignores ordinary prose, headings and markup", () => {
    const src = ["# Titre", ...Array(9).fill("Une phrase répétée en minuscules."), ...Array(9).fill("> citation")].join("\n");
    expect(findRunningHeads(src).size).toBe(0);
  });

  it("respects the repeat threshold", () => {
    const src = ["# ARCS", "ARCS", "ARCS"].join("\n");
    expect(findRunningHeads(src, 5).size).toBe(0);
    expect(findRunningHeads(src, 2).size).toBe(1);
  });
});

describe("stripRunningHeads", () => {
  it("removes exactly those lines", () => {
    const out = stripRunningHeads("a\nTRIGONOMÉTRIE\nb", new Set(["TRIGONOMÉTRIE"]));
    expect(out).toBe("a\nb");
  });

  it("is a no-op with nothing to strip", () => {
    expect(stripRunningHeads("a\nb", new Set())).toBe("a\nb");
    expect(stripRunningHeads("a\nb", null as never)).toBe("a\nb");
  });
});

describe("anchorFigures", () => {
  it("moves the figure under the caption that names it", () => {
    const src = ["Du texte.", "Fig. 7", "Encore du texte.", fig()].join("\n");
    const out = anchorFigures(src);
    const lines = out.split("\n");
    expect(lines[1]).toContain("<figure");
    expect(out).not.toMatch(/^Fig\. 7$/m);
    expect(out.match(/<figure/g)).toHaveLength(1); // moved, not copied
  });

  it("gives the figure the number the book printed under it", () => {
    expect(anchorFigures(`Fig. 7\n${fig()}`)).toContain("Fig. 7 — Un cercle.");
  });

  it("matches by the number lettered into the drawing when there is one", () => {
    const f57 = `<figure class="ai-figure"><svg><text>Fig. 57</text></svg><figcaption>c</figcaption></figure>`;
    const f_ = fig();
    const out = anchorFigures(["Fig. 57", "x", "Fig. 3", "y", f_, f57].join("\n"));
    const lines = out.split("\n");
    expect(lines[0]).toContain("Fig. 57"); // the numbered one, not the first in the file
    expect(lines[2]).toContain("<figure");
  });

  it("drops a caption naming a figure this transcription does not have", () => {
    const out = anchorFigures("Du texte.\nFig. 12\nEncore.");
    expect(out).not.toContain("Fig. 12");
    expect(out.split("\n")).toEqual(["Du texte.", "Encore."]);
  });

  it("leaves a figure no caption claims exactly where it was", () => {
    const src = `Du texte.\n${fig()}\nFin.`;
    expect(anchorFigures(src)).toBe(src);
  });

  it("does not touch a caption already carrying its number", () => {
    const numbered = `<figure class="ai-figure"><svg></svg><figcaption>Fig. 4 — déjà.</figcaption></figure>`;
    expect(anchorFigures(`Fig. 4\n${numbered}`)).toContain("Fig. 4 — déjà.");
  });

  it("is a no-op on text with no figures at all", () => {
    expect(anchorFigures("Rien du tout.")).toBe("Rien du tout.");
  });

  it("accepts the spellings the scan uses", () => {
    for (const label of ["Fig. 2", "fig 2", "FIG. 2", "Figure 2", "Fig. 2."]) {
      expect(anchorFigures(`${label}\n${fig()}`), label).toContain("<figure");
    }
  });
});

describe("trimTrailingHeadings", () => {
  it("drops a part title left hanging at the end of the chapter before it", () => {
    const src = "Du contenu réel.\n\n# DEUXIÈME PARTIE\n\n# FONCTIONS CIRCULAIRES\n";
    expect(trimTrailingHeadings(src)).toBe("Du contenu réel.");
  });

  it("drops the same thing when the scan lost the '#'", () => {
    expect(trimTrailingHeadings("Du contenu réel.\nDEUXIÈME PARTIE")).toBe("Du contenu réel.");
  });

  it("keeps a heading that has its section under it", () => {
    const src = "# EXERCICES\n\nA-1. — Résoudre l'équation.";
    expect(trimTrailingHeadings(src)).toBe(src);
  });

  it("leaves ordinary prose at the end alone", () => {
    expect(trimTrailingHeadings("Une phrase de conclusion.")).toBe("Une phrase de conclusion.");
  });

  it("survives a chapter that is nothing but headings", () => {
    expect(trimTrailingHeadings("# A\n# B")).toBe("");
  });
});

describe("trimTrailingHeadings — page furniture between", () => {
  it("looks past the page markers the scan leaves between the title and the chapter", () => {
    const src = "Du contenu réel.\n\nDEUXIÈME PARTIE\n\n# FONCTIONS CIRCULAIRES\n\n<!-- page 12 -->\n\n---\n";
    expect(trimTrailingHeadings(src)).toBe("Du contenu réel.");
  });

  it("still stops at real content that follows them", () => {
    const src = "# EXERCICES\n\n<!-- page 12 -->\n\nA-1. — Résoudre.";
    expect(trimTrailingHeadings(src)).toBe(src);
  });
});

describe("trimTrailingHeadings — page numbers", () => {
  it("looks past a bare page number", () => {
    expect(trimTrailingHeadings("Du contenu.\n\nDEUXIÈME PARTIE\n\n# FONCTIONS\n\n17\n")).toBe("Du contenu.");
  });

  it("does not mistake a numeric answer for furniture", () => {
    const src = "La réponse est :\n\n$$x = 1234567890$$";
    expect(trimTrailingHeadings(src)).toBe(src);
  });
});

describe("dropRedundantFigures", () => {
  const crop = (inner: string) => `<figure class="ai-figure"><svg>${inner}</svg><figcaption>c</figcaption></figure>`;

  it("drops a crop that caught only the page number and the watermark", () => {
    const src = `Du texte.\n${crop('<text>277</text><text>Scanned by CamScanner</text>')}\nFin.`;
    expect(dropRedundantFigures(src)).not.toContain("<figure");
  });

  it("keeps an unlabelled diagram, which has no text at all", () => {
    const src = crop('<circle cx="1" cy="1" r="1"/>');
    expect(dropRedundantFigures(src)).toBe(src);
  });

  it("keeps a labelled diagram whose labels include a page number", () => {
    const src = crop('<circle cx="1" cy="1" r="1"/><text>277</text><text>Fig. 3</text>');
    expect(dropRedundantFigures(src)).toBe(src);
  });

  it("drops the second of two byte-identical figures", () => {
    const f = crop('<text>c) f(x)</text><path d="M1 1"/>');
    expect(dropRedundantFigures(`${f}\n${f}`).match(/<figure/g)).toHaveLength(1);
  });

  it("keeps two figures that merely look alike", () => {
    // Different crystal systems; different points. Resemblance is not identity.
    const a = crop('<text>a≠b≠c</text><circle/>');
    const b = crop('<text>a=b≠c</text><circle/>');
    expect(dropRedundantFigures(`${a}\n${b}`).match(/<figure/g)).toHaveLength(2);
  });

  it("is a no-op on text with no figures", () => {
    expect(dropRedundantFigures("Rien.")).toBe("Rien.");
  });
});

describe("dropRedundantFigures — the scanner's watermark", () => {
  const crop = (inner: string) => `<figure class="ai-figure"><svg>${inner}</svg><figcaption>c</figcaption></figure>`;

  it("drops a watermark crop even when it draws a rule under itself", () => {
    const src = crop('<text>277</text><text>Scanned by CamScanner</text><line x1="1" y1="1" x2="2" y2="2"/>');
    expect(dropRedundantFigures(src)).toBe("");
  });

  it("keeps a real diagram that happens to carry the watermark too", () => {
    const src = crop('<circle/><text>Le cercle trigonométrique</text><text>Scanned by CamScanner</text>');
    expect(dropRedundantFigures(src)).toBe(src);
  });
});
