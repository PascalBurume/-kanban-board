import { describe, it, expect } from "vitest";
import { repairLatex, repairTex } from "../latexRepair";
import { mdToDoc, docToMd } from "../lessonDoc";
import { check } from "../formulas";

// The corruption this undoes, end to end:
//   model writes "\text{D}" into a JSON string  →  emits a bare \t
//   JSON.parse in streamChat                    →  a real TAB
//   "$$<TAB>ext{D}$$" reaches the lesson        →  KaTeX typesets e·x·t as variables
// It renders, so nothing errors; it is simply wrong on the page.

const collapsed = (s: string) => JSON.parse(`"${s}"`) as string;

describe("repairLatex — whole documents", () => {
  it("restores \\text from a collapsed tab", () => {
    expect(repairLatex(collapsed("$$\\text{D} = b^2$$"))).toBe("$$\\text{D} = b^2$$");
  });

  it("restores \\times, \\tau, \\theta, \\tilde", () => {
    for (const cmd of ["times", "tau", "theta", "tilde", "top", "textbf", "textit"]) {
      expect(repairLatex(collapsed(`$a \\${cmd}{b}$`))).toBe(`$a \\${cmd}{b}$`);
    }
  });

  it("restores \\rightarrow and \\rho from a collapsed carriage return", () => {
    expect(repairLatex(collapsed("$a \\rightarrow b$"))).toBe("$a \\rightarrow b$");
    expect(repairLatex(collapsed("$\\rho$"))).toBe("$\\rho$");
  });

  // A newline is usually a real paragraph break, so it is only repaired inside maths.
  it("restores \\neq inside maths but leaves prose newlines alone", () => {
    expect(repairLatex(collapsed("$a \\neq b$"))).toBe("$a \\neq b$");
    const prose = "Un paragraphe.\neq une ligne qui commence par eq.";
    expect(repairLatex(prose)).toBe(prose);
  });

  // The (?![a-zA-Z]) guard: a tab-indented code line must not become a command.
  it("leaves a tab-indented word that merely starts with a tail alone", () => {
    const code = "```python\n\textract = 1\n```";
    expect(repairLatex(code)).toBe(code);
  });

  it("is a no-op on clean input", () => {
    const clean = "## Titre\n\nUn texte avec $\\text{D} = b^2$ dedans.";
    expect(repairLatex(clean)).toBe(clean);
  });
});

describe("repairTex — bare formulas", () => {
  // No $ delimiters left to build a mask from, so everything counts as maths.
  it("repairs a collapsed \\newline that repairLatex would leave alone", () => {
    expect(repairTex(collapsed("a \\newline b"))).toBe("a \\newline b");
  });

  it("repairs a collapsed \\text", () => {
    expect(repairTex(collapsed("\\text{D} = b^2"))).toBe("\\text{D} = b^2");
  });
});

// The regression that mattered: trimming before repairing DELETED the tab, which was
// the only evidence a repair was still possible.
describe("the editor heals a collapsed formula instead of freezing it", () => {
  const broken = "$$" + collapsed("\\text{D}") + " = b^2 - 4ac$$";

  it("arrives corrupted", () => {
    expect(broken).toContain("\t");
  });

  it("parses back to real \\text rather than a trimmed 'ext'", () => {
    const tex = String(mdToDoc(broken).doc.content?.[0].attrs?.tex);
    expect(tex).toBe("\\text{D} = b^2 - 4ac");
    expect(tex.startsWith("ext")).toBe(false);
  });

  it("serialises back to healthy markdown", () => {
    expect(docToMd(mdToDoc(broken).doc)).toBe("$$\\text{D} = b^2 - 4ac$$");
  });

  it("no longer trips the suspect check", () => {
    const healed = String(mdToDoc(broken).doc.content?.[0].attrs?.tex);
    expect(check(healed, true).suspect).toBeUndefined();
    // …whereas the trimmed form did, which is the "7 à vérifier" a teacher was seeing
    expect(check("ext{D} = b^2 - 4ac", true).suspect).toBeTruthy();
  });
});
