import { fences } from "./mdCaret";

export type Heading = { level: number; text: string; line: number; index: number };

/**
 * Headings, for the document outline. Fenced blocks are skipped so a "# comment"
 * inside a code sample is not mistaken for a section.
 *
 * `index` counts headings in document order, which is how the outline finds the
 * matching element in the rendered page: the editor's DOM has no line numbers, but the
 * nth h1/h2/h3 in the prose is exactly the nth heading here.
 */
export function outline(md: string): Heading[] {
  const src = md || "";
  const blocks = fences(src);
  const out: Heading[] = [];
  let pos = 0;
  let index = 0;

  src.split("\n").forEach((line, i) => {
    const start = pos;
    pos += line.length + 1;
    if (blocks.some((f) => start >= f.start && start < f.end)) return;
    const m = line.match(/^(#{1,4})\s+(.*)$/);
    if (!m || !m[2].trim()) return;
    out.push({ level: m[1].length, text: m[2].trim(), line: i + 1, index: index++ });
  });

  return out;
}
