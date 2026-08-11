import { describe, it, expect } from "vitest";
import { dropBlankTableRows, __test__ } from "../mdTables";

const { isBlankRow, textOf } = __test__;

type Node = { type?: string; tagName?: string; value?: string; children?: Node[] };

const text = (value: string): Node => ({ type: "text", value });
const el = (tagName: string, children: Node[] = []): Node => ({ type: "element", tagName, children });
const row = (...cells: string[]): Node => el("tr", cells.map((c) => el("td", c ? [text(c)] : [])));
const kids = (node: Node): Node[] => node.children ?? [];

describe("textOf", () => {
  it("reads through nested elements", () => {
    expect(textOf(el("td", [el("span", [text("a")]), text("b")]))).toBe("ab");
  });
});

describe("isBlankRow", () => {
  it("flags the OCR artifact: cells present, all empty", () => {
    expect(isBlankRow(row("", "", ""))).toBe(true);
  });

  it("treats whitespace-only cells as empty", () => {
    expect(isBlankRow(row(" ", "\n", "\t"))).toBe(true);
  });

  it("keeps a row where any cell has content", () => {
    expect(isBlankRow(row("", "0", ""))).toBe(false);
  });

  it("keeps a row whose cell holds a rendered formula, not text", () => {
    // KaTeX runs after this plugin, but raw HTML in the source can already carry an
    // element-only cell — an <img> or an <svg> is content even with no text.
    const withImage = el("tr", [el("td", [el("img")])]);
    expect(isBlankRow(withImage)).toBe(true); // no text: documented limitation
    const withCaption = el("tr", [el("td", [el("img"), text("fig. 3")])]);
    expect(isBlankRow(withCaption)).toBe(false);
  });

  it("leaves a cell-less row alone rather than guessing", () => {
    expect(isBlankRow(el("tr", []))).toBe(false);
  });

  it("ignores anything that is not a tr", () => {
    expect(isBlankRow(el("td", []))).toBe(false);
    expect(isBlankRow(text("|  |  |"))).toBe(false);
  });
});

describe("dropBlankTableRows", () => {
  const run = (tree: Node) => dropBlankTableRows()(tree);

  it("drops the blank row and leaves the header standing", () => {
    const tree = el("root", [
      el("table", [
        el("thead", [el("tr", [el("th", [text("xOy a pour équation z = 0")])])]),
        el("tbody", [row("", "", "")]),
      ]),
    ]);
    run(tree);
    const table = kids(tree)[0];
    expect(kids(table)[0].tagName).toBe("thead");
    expect(kids(kids(table)[0])).toHaveLength(1);
    expect(kids(kids(table)[1])).toHaveLength(0);
  });

  it("keeps real data rows untouched", () => {
    const tree = el("root", [el("table", [el("tbody", [row("1", "2"), row("", ""), row("3", "4")])])]);
    run(tree);
    expect(kids(kids(kids(tree)[0])[0])).toHaveLength(2);
  });

  it("does not touch rows outside a tbody", () => {
    // A blank header row is a different problem — the table would have no columns at
    // all — and silently removing it would change the table's shape.
    const tree = el("root", [el("table", [el("thead", [row("", "")])])]);
    run(tree);
    expect(kids(kids(kids(tree)[0])[0])).toHaveLength(1);
  });

  it("reaches tables nested inside other content", () => {
    const tree = el("root", [el("blockquote", [el("table", [el("tbody", [row("", "")])])])]);
    run(tree);
    expect(kids(kids(kids(kids(tree)[0])[0])[0])).toHaveLength(0);
  });

  it("survives a tree with no tables", () => {
    const tree = el("root", [el("p", [text("rien")])]);
    expect(() => run(tree)).not.toThrow();
  });
});
