import { describe, it, expect } from "vitest";
// Plain .mjs pipeline module.
import { recap, statements, sections } from "../../../scripts/lesson-recap.mjs";

describe("statements", () => {
  it("lifts a stated result with its kind", () => {
    const md = "THÉORÈME : Un angle de droites admet deux bissectrices perpendiculaires.";
    expect(statements(md)).toEqual([
      { kind: "THÉORÈME", text: "Un angle de droites admet deux bissectrices perpendiculaires." },
    ]);
  });

  it("reads a statement that starts on the line after its marker", () => {
    const md = "DÉFINITION. —\nUn plan est orienté lorsqu'un cercle y est tracé et son sens fixé.";
    expect(statements(md)[0].text).toBe("Un plan est orienté lorsqu'un cercle y est tracé et son sens fixé.");
  });

  it("takes the first sentence, not the whole paragraph", () => {
    const md = "PROPRIÉTÉ : La somme vaut deux droits. On le démontre par récurrence sur n.";
    expect(statements(md)[0].text).toBe("La somme vaut deux droits.");
  });

  it("does not stop at a full stop inside a reference or a number", () => {
    const md = "THÉORÈME : D'après la fig. 7 et le n° 1.2 la somme des angles est égale à π.";
    expect(statements(md)[0].text).toBe("D'après la fig. 7 et le n° 1.2 la somme des angles est égale à π.");
  });

  it("never stops inside brackets or a formula", () => {
    const md = "THÉORÈME : L'angle de deux axes (ou de deux vecteurs) vaut $\\frac{a+b}{2}$ exactement.";
    const t = statements(md)[0].text;
    expect(t.split("(").length).toBe(t.split(")").length);
    expect((t.match(/\$/g) ?? []).length % 2).toBe(0);
  });

  it("marks a statement that runs into a displayed formula as continuing", () => {
    const md = "DÉFINITION : on appelle bissectrice un axe $t't$ tel que";
    expect(statements(md)[0].text.endsWith("…")).toBe(true);
  });

  it("stops at a heading or a figure rather than swallowing the next section", () => {
    const md = "THÉORÈME :\n## Autre section\nDu texte qui suit et qui ne fait pas partie du théorème.";
    expect(statements(md)).toEqual([]);
  });

  it("ignores a marker with nothing after it worth quoting", () => {
    expect(statements("REMARQUE : bref.")).toEqual([]);
  });

  it("finds every marker the schoolbooks use", () => {
    for (const k of ["DÉFINITION", "THÉORÈME", "PROPRIÉTÉ", "COROLLAIRE", "RÈGLE", "CONSÉQUENCE", "PROPOSITION", "LEMME"]) {
      const md = `${k} : Une phrase suffisamment longue pour compter comme un énoncé.`;
      expect(statements(md), k).toHaveLength(1);
    }
  });

  it("reads the unaccented spellings the scan produces", () => {
    expect(statements("THEOREME : Une phrase suffisamment longue pour compter.")).toHaveLength(1);
  });
});

describe("sections", () => {
  it("lists the headings without their numbering", () => {
    expect(sections("## 1.2 Les arcs\n### II. — Angles orientés")).toEqual(["Les arcs", "Angles orientés"]);
  });

  it("does not repeat itself", () => {
    expect(sections("## Limites\n## Limites")).toEqual(["Limites"]);
  });
});

describe("recap", () => {
  it("closes the lesson with its own stated results", () => {
    const md = "THÉORÈME : Un angle de droites admet deux bissectrices perpendiculaires.";
    const out = recap(md);
    expect(out).toContain("## À retenir");
    expect(out).toContain("- **Théorème.** Un angle de droites admet deux bissectrices perpendiculaires.");
  });

  it("says what the lesson works through when it states no result", () => {
    const md = "## Premier cas\ndu texte\n## Deuxième cas\ndu texte";
    expect(recap(md)).toContain("Cette leçon traite : Premier cas · Deuxième cas.");
  });

  it("does not merely repeat the lesson title back", () => {
    const md = "## Les limites\ndu texte";
    expect(recap(md, "Les limites")).toBe("");
  });

  it("gives nothing rather than padding an empty lesson", () => {
    expect(recap("Juste un exercice.")).toBe("");
    expect(recap("")).toBe("");
  });

  it("stays short enough to read", () => {
    const md = Array.from({ length: 12 }, (_, i) => `THÉORÈME ${i} : Un énoncé numéro ${i} assez long pour être retenu.`).join("\n\n");
    expect(recap(md).match(/^- /gm)).toHaveLength(5);
  });

  it("never lists the same statement twice", () => {
    const md = "THÉORÈME : La somme des angles vaut deux droits.\n\nTHÉORÈME : La somme des angles vaut deux droits.";
    expect(recap(md).match(/^- /gm)).toHaveLength(1);
  });

  it("keeps the maths in the statement intact", () => {
    const md = "PROPRIÉTÉ : On a toujours $\\cos^2 x + \\sin^2 x = 1$ pour tout réel.";
    expect(recap(md)).toContain("$\\cos^2 x + \\sin^2 x = 1$");
  });
});
