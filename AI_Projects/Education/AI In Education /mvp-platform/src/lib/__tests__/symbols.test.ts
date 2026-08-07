import { describe, it, expect } from "vitest";
import katex from "katex";
import { MATH_GROUPS, CHEM_GROUPS, STRUCT_GROUPS, PHYS_GROUPS, MATH_FONTS, applyFont, pickSymbols, searchSymbols, type SymbolGroup } from "../symbols";

// The palette is the one place where a typo becomes a broken formula in a real
// lesson: the teacher clicks a button, LaTeX lands in the document, and nothing
// tells them it will not typeset. These tests are the missing feedback loop —
// every entry must render, and every caret offset must land inside its own snippet.

const ALL: [string, SymbolGroup[]][] = [
  ["MATH_GROUPS", MATH_GROUPS],
  ["CHEM_GROUPS", CHEM_GROUPS],
  ["STRUCT_GROUPS", STRUCT_GROUPS],
  ["PHYS_GROUPS", PHYS_GROUPS],
];

const everyItem = ALL.flatMap(([set, groups]) =>
  groups.flatMap((g) => g.items.map((s) => ({ set, group: g.id, s })))
);

describe("every palette entry is valid LaTeX", () => {
  for (const { set, group, s } of everyItem) {
    it(`${set}/${group}/${s.id} — preview renders`, () => {
      expect(() => katex.renderToString(s.tex, { throwOnError: true })).not.toThrow();
    });

    it(`${set}/${group}/${s.id} — insert renders`, () => {
      // What the button PUTS in the document matters more than what it shows.
      expect(() => katex.renderToString(s.insert, { throwOnError: true })).not.toThrow();
    });
  }
});

describe("caret placeholders land inside their snippet", () => {
  for (const { set, group, s } of everyItem) {
    if (!s.select) continue;
    it(`${set}/${group}/${s.id}`, () => {
      const [offset, length] = s.select!;
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset + length).toBeLessThanOrEqual(s.insert.length);

      const picked = s.insert.slice(offset, offset + length);
      expect(picked.trim()).not.toBe("");
      // The caret must land on something the teacher can safely type over. Braces and
      // backslashes mean it landed on structure — "sum" once selected "=1}".
      expect(picked, `selection "${picked}" includes LaTeX structure`).not.toMatch(/[{}\\]/);

      // And it must be standalone, not a slice out of a command name: selecting the
      // "a" inside "\begin{pmatrix}" looks fine in isolation and corrupts the snippet.
      const before = s.insert[offset - 1] ?? " ";
      const after = s.insert[offset + length] ?? " ";
      expect(/[A-Za-z0-9]/.test(before), `"${picked}" runs on from "${before}"`).toBe(false);
      expect(/[A-Za-z0-9]/.test(after), `"${picked}" runs on into "${after}"`).toBe(false);
    });
  }
});

describe("palette integrity", () => {
  it("has no duplicate ids within a set", () => {
    for (const [set, groups] of ALL) {
      const ids = groups.flatMap((g) => g.items.map((s) => s.id));
      expect(new Set(ids).size, `${set} has duplicate ids`).toBe(ids.length);
    }
  });

  it("has no duplicate group ids within a set", () => {
    for (const [set, groups] of ALL) {
      const ids = groups.map((g) => g.id);
      expect(new Set(ids).size, `${set} has duplicate group ids`).toBe(ids.length);
    }
  });

  it("keeps search keywords accent-free", () => {
    // searchSymbols strips accents from the QUERY; keywords carrying accents would
    // never match, which is how "réversible" quietly stops finding anything.
    for (const { set, group, s } of everyItem) {
      expect(s.keywords, `${set}/${group}/${s.id}`).toBe(s.keywords.normalize("NFD").replace(/[̀-ͯ]/g, ""));
    }
  });

  it("gives every entry a label and keywords", () => {
    for (const { s } of everyItem) {
      expect(s.label.trim()).not.toBe("");
      expect(s.keywords.trim()).not.toBe("");
    }
  });
});

describe("pickSymbols — the curated quiz toolbar", () => {
  // These ids are referenced by QuizMathInput. Renaming one used to silently do
  // nothing; now it throws, and this test is where it surfaces.
  const QUICK_IDS = ["frac", "pow", "sqrt", "times", "pi", "leq", "vec"];

  it("resolves every id the quiz bar asks for", () => {
    expect(pickSymbols(QUICK_IDS).map((s) => s.id)).toEqual(QUICK_IDS);
  });

  it("gives each of them a compact glyph", () => {
    for (const s of pickSymbols(QUICK_IDS)) {
      expect(s.short, `${s.id} has no short glyph for the compact toolbar`).toBeTruthy();
    }
  });

  it("throws on an unknown id instead of emptying the toolbar", () => {
    expect(() => pickSymbols(["nope"])).toThrow(/unknown id/);
  });

  it("computes a caret range that lands on the placeholder once wrapped in $…$", () => {
    // Mirrors the derivation in QuizMathInput: the leading "$" shifts select by one.
    for (const s of pickSymbols(QUICK_IDS)) {
      const tex = s.insert.trim();
      const snippet = `$${tex}$`;
      const at = s.select ? s.select[0] + 1 : 1;
      const len = s.select ? s.select[1] : tex.length;
      const picked = snippet.slice(at, at + len);
      expect(picked, `${s.id} selects "${picked}" in "${snippet}"`).not.toContain("$");
      expect(picked.trim()).not.toBe("");
      expect(tex).toContain(picked);
    }
  });
});

describe("math fonts", () => {
  for (const f of MATH_FONTS) {
    // A teacher can apply a font to any selection, so all three cases have to hold —
    // an alphabet that only typesets uppercase would break the moment someone
    // highlighted a lowercase variable.
    it.each(["ABC", "abc", "123"])(`${f.cmd} typesets %s`, (body) => {
      expect(() => katex.renderToString(applyFont(f.cmd, body).latex, { throwOnError: true })).not.toThrow();
    });

    it(`${f.cmd} preview sample typesets`, () => {
      expect(() => katex.renderToString(`${f.cmd}{${f.sample}}`, { throwOnError: true })).not.toThrow();
    });
  }

  it("wraps the given text and selects the body", () => {
    const { latex, select } = applyFont("\\mathbb", "R");
    expect(latex).toBe("\\mathbb{R}");
    expect(latex.slice(select[0], select[0] + select[1])).toBe("R");
  });

  it("wraps a whole expression", () => {
    expect(applyFont("\\mathbf", "x + y").latex).toBe("\\mathbf{x + y}");
  });

  it("substitutes a placeholder rather than emitting an empty group", () => {
    // "\mathbb{}" typesets as nothing — the teacher would think the button broke
    // their formula.
    const { latex, select } = applyFont("\\mathbb", "   ");
    expect(latex).toBe("\\mathbb{x}");
    expect(latex.slice(select[0], select[0] + select[1])).toBe("x");
  });

  it("has unique commands and non-empty labels", () => {
    const cmds = MATH_FONTS.map((f) => f.cmd);
    expect(new Set(cmds).size).toBe(cmds.length);
    for (const f of MATH_FONTS) expect(f.label.trim()).not.toBe("");
  });
});

describe("searchSymbols", () => {
  it("finds by French label, accented or not", () => {
    expect(searchSymbols(MATH_GROUPS, "racine").flatMap((g) => g.items).map((s) => s.id)).toContain("sqrt");
    expect(searchSymbols(CHEM_GROUPS, "réversible").flatMap((g) => g.items).map((s) => s.id)).toContain("equilib");
    expect(searchSymbols(CHEM_GROUPS, "reversible").flatMap((g) => g.items).map((s) => s.id)).toContain("equilib");
  });

  it("finds the new structures", () => {
    const ids = (q: string) => searchSymbols(STRUCT_GROUPS, q).flatMap((g) => g.items).map((s) => s.id);
    expect(ids("determinant")).toContain("vmatrix");
    expect(ids("norme")).toContain("norm");
    expect(ids("cas")).toContain("cases");
    expect(ids("matrice")).toContain("pmatrix");
  });

  it("returns every group for an empty query", () => {
    expect(searchSymbols(MATH_GROUPS, "  ")).toHaveLength(MATH_GROUPS.length);
  });

  it("drops groups with no match instead of returning empties", () => {
    const out = searchSymbols(MATH_GROUPS, "zzzznotasymbol");
    expect(out).toHaveLength(0);
  });
});

// Ids are the lookup key for the curated toolbars, so a duplicate does not error —
// it silently changes what an existing button inserts. Adding PHYS_GROUPS shadowed
// "vec" exactly this way and the quiz toolbar lost its vector glyph.
describe("symbol ids are unique across every palette", () => {
  it("has no id defined twice", () => {
    const seen = new Map<string, string>();
    for (const [set, groups] of ALL) {
      for (const g of groups) {
        for (const s of g.items) {
          expect(seen.has(s.id), `"${s.id}" is defined in both ${seen.get(s.id)} and ${set}/${g.id}`).toBe(false);
          seen.set(s.id, `${set}/${g.id}`);
        }
      }
    }
  });
});
