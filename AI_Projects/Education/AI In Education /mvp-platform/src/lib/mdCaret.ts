// Where it is safe to write into a markdown document.
//
// Lifted out of the LaTeX atelier so the one editor can use it. A fenced block is a
// PAYLOAD, not prose: a ```figure holds JSON a parser has to read back. Splicing
// anything into the middle of one destroys it — a "$$…$$" dropped between the "t" and
// the "rue," of `"grid": true,` leaves JSON that no longer parses, and the figure
// renders as a red slab of its own source with no clue what happened.

export type Fence = { start: number; end: number; lang: string };

/** Every ``` fenced block in the document, as offsets into the source. */
export function fences(md: string): Fence[] {
  const src = md || "";
  const out: Fence[] = [];
  let pos = 0;
  let open: { start: number; lang: string } | null = null;
  for (const line of src.split("\n")) {
    const end = pos + line.length;
    if (/^\s*```/.test(line)) {
      if (open) {
        out.push({ ...open, end: Math.min(end + 1, src.length) });
        open = null;
      } else {
        open = { start: pos, lang: line.replace(/^\s*```/, "").trim() };
      }
    }
    pos = end + 1;
  }
  // An unterminated fence still owns everything after it — the teacher is part-way
  // through typing one, and that is exactly when an insert would land inside it.
  if (open) out.push({ ...open, end: src.length });
  return out;
}

/** The fenced block the caret sits inside, or null. */
export function fenceAt(md: string, caret: number): Fence | null {
  return fences(md).find((f) => caret > f.start && caret < f.end) ?? null;
}

/**
 * Whether the caret sits inside $…$ maths. Fenced blocks are cut out first: a stray
 * "$" inside a ```figure payload would otherwise flip the parity and make the whole
 * rest of the document look like maths.
 */
export function inMathAt(md: string, caret: number): boolean {
  let before = (md || "").slice(0, caret);
  for (const f of fences(md).slice().reverse()) {
    if (f.start >= caret) continue;
    before = before.slice(0, f.start) + before.slice(Math.min(f.end, caret));
  }
  return (before.match(/(?<!\\)\$/g) || []).length % 2 === 1;
}

export type Insertion = { md: string; caret: number; movedOutOfFence: boolean };

/**
 * Splice `snippet` in at [from, to). Never writes into a fenced block: landing just
 * after it is the only harmless place — refusing outright would leave the teacher
 * pressing a button that does nothing, and writing where they asked would silently
 * destroy the figure. Callers surface `movedOutOfFence` as a toast.
 */
export function insertAt(md: string, from: number, to: number, snippet: string): Insertion {
  const src = md || "";
  let a = Math.max(0, Math.min(from, src.length));
  let b = Math.max(a, Math.min(to, src.length));
  const fence = fenceAt(src, a);
  const movedOutOfFence = Boolean(fence);
  if (fence) a = b = fence.end;
  return { md: src.slice(0, a) + snippet + src.slice(b), caret: a + snippet.length, movedOutOfFence };
}

/** Drop a whole block in on its own, with exactly one blank line either side. */
export function insertBlock(md: string, at: number, block: string): Insertion {
  const src = md || "";
  const pos = Math.max(0, Math.min(at, src.length));
  const before = src.slice(0, pos).replace(/\s+$/, "");
  const after = src.slice(pos).replace(/^\s+/, "");
  const text = (before ? before + "\n\n" : "") + block + (after ? "\n\n" + after : "\n");
  return { md: text, caret: (before ? before.length + 2 : 0) + block.length, movedOutOfFence: false };
}
