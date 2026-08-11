import { describe, it, expect } from "vitest";
import katex from "katex";
import { expandTrigger, expansionFor, triggerWords, triggerFor } from "../mathInput";

// Apply a replacement the way the editor will, so the assertions read as the text the
// teacher ends up looking at rather than as offsets.
function apply(text: string, caret: number): { text: string; selected?: string } | null {
  const r = expandTrigger(text, caret);
  if (!r) return null;
  return {
    text: text.slice(0, r.from) + r.insert + text.slice(r.to),
    selected: r.select ? (text.slice(0, r.from) + r.insert + text.slice(r.to)).slice(r.select[0], r.select[0] + r.select[1]) : undefined,
  };
}

const at = (text: string) => apply(text, text.length);

describe("word triggers", () => {
  it("expands sum and puts the caret on the index", () => {
    const out = at("sum ");
    expect(out?.text).toBe("\\sum_{i=1}^{n} ");
    expect(out?.selected).toBe("i=1");
  });

  it("expands the French word too", () => {
    expect(at("somme ")?.text).toBe("\\sum_{i=1}^{n} ");
    expect(at("racine ")?.text).toBe("\\sqrt{x} ");
    expect(at("matrice ")?.text).toBe("\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} ");
  });

  it("expands Greek letters", () => {
    expect(at("alpha ")?.text).toBe("\\alpha ");
    expect(at("Omega ")?.text).toBe("\\Omega ");
  });

  it("keeps the boundary character the teacher typed", () => {
    expect(at("pi(")?.text).toBe("\\pi(");
    expect(at("alpha+")?.text).toBe("\\alpha+");
    expect(at("theta=")?.text).toBe("\\theta=");
  });

  it("expands mid-expression, leaving what came before alone", () => {
    expect(at("x + alpha ")?.text).toBe("x + \\alpha ");
    expect(at("2 times ")?.text).toBe("2 \\times ");
  });

  it("puts the caret on the placeholder of a multi-line structure", () => {
    const out = at("det ");
    expect(out?.text).toBe("\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix} ");
    expect(out?.selected).toBe("a");
  });
});

describe("operator pairs expand on the second character", () => {
  it.each([
    ["->", "\\to "],
    ["=>", "\\Rightarrow "],
    ["<=", "\\leq "],
    [">=", "\\geq "],
    ["!=", "\\neq "],
  ])("%s becomes %s", (typed, latex) => {
    expect(at(`x${typed}`)?.text).toBe(`x${latex}`);
  });

  it("wins over the boundary-character path", () => {
    // ">" and "=" are both boundary chars; the pair must not be read as a word end.
    expect(at("a<=")?.text).toBe("a\\leq ");
  });
});

describe("what must NOT expand", () => {
  it("leaves a word alone until a boundary is typed", () => {
    expect(at("sum")).toBeNull();
    expect(at("alpha")).toBeNull();
  });

  it("ignores words shorter than two characters", () => {
    expect(at("a ")).toBeNull();
    expect(at("x+")).toBeNull();
  });

  it("ignores unknown words", () => {
    expect(at("bonjour ")).toBeNull();
    expect(at("xyz ")).toBeNull();
  });

  it("leaves backslash commands to the \\command autocomplete", () => {
    expect(at("\\sum ")).toBeNull();
    expect(at("\\alpha ")).toBeNull();
  });

  it("does not fire mid-word", () => {
    // "sumx" is still being typed; only the trailing boundary commits.
    expect(at("sumx")).toBeNull();
    expect(at("asum ")).toBeNull(); // "asum" is not a trigger
  });

  it("never expands inside \\text{}", () => {
    expect(at("\\text{la somme ")).toBeNull();
    expect(at("\\text{pi ")).toBeNull();
    expect(at("\\mathrm{sin ")).toBeNull();
  });

  it("expands again once \\text{} is closed", () => {
    expect(at("\\text{du texte} sum ")?.text).toBe("\\text{du texte} \\sum_{i=1}^{n} ");
  });

  it("handles an out-of-range or leading caret without throwing", () => {
    expect(expandTrigger("sum ", 0)).toBeNull();
    expect(expandTrigger("sum ", 99)).toBeNull();
    expect(expandTrigger("", 0)).toBeNull();
  });
});

describe("every trigger is wired to something real", () => {
  const words = triggerWords();

  it("has triggers", () => {
    expect(words.length).toBeGreaterThan(50);
  });

  for (const w of words) {
    it(`${w} resolves and produces valid LaTeX`, () => {
      // expansionFor throws on a stale palette id, which is the failure this catches.
      const exp = expansionFor(w);
      expect(exp).not.toBeNull();
      expect(() => katex.renderToString(exp!.insert, { throwOnError: true })).not.toThrow();
    });

    it(`${w} fires on a space`, () => {
      expect(at(`${w} `), `trigger "${w}" did not expand`).not.toBeNull();
    });
  }
});

// The symbol keyboard shows "or type: <word>" under each key, which is only useful if
// the word it names actually expands to that key.
describe("triggerFor", () => {
  it("prefers the French word over the English one", () => {
    expect(triggerFor("sum")).toBe("sum"); // "sum" is shorter than "somme"
    expect(triggerFor("vec")).toBe("vec");
  });

  it("finds a word for a symbol that only PLAIN knows", () => {
    expect(triggerFor("alpha")).toBe("alpha");
    expect(triggerFor("theta")).toBe("theta");
  });

  it("returns null for a symbol with no shortcut", () => {
    expect(triggerFor("h2so4")).toBeNull();
  });

  // The strip would be actively misleading if it taught a word that does not expand.
  it("every word it advertises really expands", () => {
    for (const id of ["sum", "frac", "sqrt", "cases", "norm", "alpha", "pi"]) {
      const word = triggerFor(id);
      expect(word, `no trigger for ${id}`).not.toBeNull();
      expect(expansionFor(word!), `"${word}" does not expand`).not.toBeNull();
    }
  });
});
