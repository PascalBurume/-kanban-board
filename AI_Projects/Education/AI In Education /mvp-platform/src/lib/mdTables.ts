// Table repair for book content.
//
// The textbooks' OCR writes a header-only table as a header row, a separator, and one
// blank row — `|  |   |   |`. GFM reads that blank row as real data, so every one of
// these tables renders with a striped empty row hanging off the bottom. There are ~26 of
// them across the corpus. Nothing is lost by dropping a row that holds no text.

type HastNode = {
  type?: string;
  tagName?: string;
  children?: HastNode[];
};

function textOf(node: HastNode): string {
  if (node.type === "text") return (node as { value?: string }).value ?? "";
  return (node.children ?? []).map(textOf).join("");
}

function isBlankRow(node: HastNode): boolean {
  if (node.type !== "element" || node.tagName !== "tr") return false;
  const cells = (node.children ?? []).filter((c) => c.type === "element");
  // A `tr` with no cells at all is not something GFM produces; leave it alone rather
  // than guess. Only a row that has cells, all of them empty, is the artifact.
  if (cells.length === 0) return false;
  return cells.every((c) => textOf(c).trim() === "");
}

function walk(node: HastNode): void {
  if (!node.children) return;
  if (node.type === "element" && node.tagName === "tbody") {
    node.children = node.children.filter((child) => !isBlankRow(child));
  }
  for (const child of node.children) walk(child);
}

/** rehype plugin. Mutates the tree in place. */
export function dropBlankTableRows() {
  return (tree: HastNode) => walk(tree);
}

export const __test__ = { isBlankRow, textOf };
