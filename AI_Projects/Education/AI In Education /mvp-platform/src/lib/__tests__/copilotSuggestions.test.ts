import { describe, it, expect } from "vitest";
import { bookTopicPool, rotateChips } from "../copilotSuggestions";

// A book: `chapters` chapters of `per` lessons each, in book order, named so the
// assertions can read the shape off the title ("C2·L3" = chapter 2, lesson 3).
const book = (chapters: number, per: number) =>
  Array.from({ length: chapters * per }, (_, i) => {
    const c = Math.floor(i / per) + 1;
    return { id: `l${i}`, title: `C${c}·L${(i % per) + 1}`, moduleId: `m${c}`, moduleTitle: `Chapitre ${c}` };
  });

describe("bookTopicPool — no lesson selected", () => {
  it("offers chapters, not lessons", () => {
    const { topics, grain } = bookTopicPool(book(4, 3));
    expect(grain).toBe("chapter");
    expect(topics.every((t) => t.startsWith("Chapitre "))).toBe(true);
  });

  it("keeps the old spread as the first window", () => {
    // The pre-rotation behaviour sampled titles[0], titles[N/3], titles[2N/3].
    const { topics } = bookTopicPool(book(9, 2));
    expect(topics.slice(0, 3)).toEqual(["Chapitre 1", "Chapitre 4", "Chapitre 7"]);
  });

  // The point of interleaving: rotating must not degrade into "the next three
  // sections of chapter 1" once the teacher clicks « Autres ».
  it("keeps every window spread across the book, not just the first", () => {
    const { topics } = bookTopicPool(book(9, 2));
    expect(topics.slice(3, 6)).toEqual(["Chapitre 2", "Chapitre 5", "Chapitre 8"]);
    expect(topics.slice(6, 9)).toEqual(["Chapitre 3", "Chapitre 6", "Chapitre 9"]);
  });

  it("offers every chapter exactly once", () => {
    const { topics } = bookTopicPool(book(22, 4));
    expect(new Set(topics).size).toBe(22);
    expect(topics).toHaveLength(22);
  });

  it("handles books that do not divide by three", () => {
    for (const n of [1, 2, 3, 4, 5, 7, 11, 22]) {
      const { topics } = bookTopicPool(book(n, 2));
      expect(new Set(topics).size).toBe(n);
    }
  });
});

describe("bookTopicPool — a lesson is selected", () => {
  const rows = book(4, 3);

  it("narrows to that chapter's lessons", () => {
    const { topics, grain } = bookTopicPool(rows, "l4"); // C2·L2
    expect(grain).toBe("lesson");
    expect(topics).toEqual(["C2·L2", "C2·L1", "C2·L3"]);
  });

  it("puts the selected lesson first and never repeats it", () => {
    const { topics } = bookTopicPool(rows, "l6"); // C3·L1
    expect(topics[0]).toBe("C3·L1");
    expect(topics.filter((t) => t === "C3·L1")).toHaveLength(1);
  });

  it("groups by moduleId, so two chapters may share a lesson title", () => {
    const rows2 = [
      { id: "a", title: "Introduction", moduleId: "m1", moduleTitle: "Chapitre 1" },
      { id: "b", title: "Les angles", moduleId: "m1", moduleTitle: "Chapitre 1" },
      { id: "c", title: "Introduction", moduleId: "m2", moduleTitle: "Chapitre 2" },
      { id: "d", title: "Les vecteurs", moduleId: "m2", moduleTitle: "Chapitre 2" },
    ];
    expect(bookTopicPool(rows2, "c").topics).toEqual(["Introduction", "Les vecteurs"]);
  });

  it("falls back to the chapter title when the payload has no moduleId", () => {
    const rows2 = book(3, 2).map(({ moduleId, ...r }) => r);
    const { topics, grain } = bookTopicPool(rows2, "l2"); // C2·L1
    expect(grain).toBe("lesson");
    expect(topics).toEqual(["C2·L1", "C2·L2"]);
  });

  // One chip with a dead « Autres » beside it is worse than the book-wide view.
  it("falls back to chapters for a one-lesson chapter", () => {
    const { topics, grain } = bookTopicPool(book(4, 1), "l2");
    expect(grain).toBe("chapter");
    expect(topics).toContain("Chapitre 1");
  });

  it("falls back to chapters when the id is not in the book", () => {
    expect(bookTopicPool(rows, "nope").grain).toBe("chapter");
  });
});

describe("bookTopicPool — empty and malformed input", () => {
  it("returns an empty pool rather than throwing", () => {
    for (const v of [[], null, undefined, "x" as never]) {
      expect(bookTopicPool(v as never)).toEqual({ topics: [], grain: "chapter" });
    }
  });

  it("skips rows with no title", () => {
    const rows = [
      { id: "a", title: "", moduleId: "m1", moduleTitle: "Chapitre 1" },
      { id: "b", title: "Les angles", moduleId: "m1", moduleTitle: "Chapitre 1" },
    ];
    expect(bookTopicPool(rows).topics).toEqual(["Chapitre 1"]);
    expect(bookTopicPool(rows, "a").grain).toBe("chapter");
  });
});

describe("rotateChips over a manual pool", () => {
  const { topics } = bookTopicPool(book(22, 4));

  it("wraps back to the start after the last window", () => {
    expect(rotateChips(topics, 21, 3)).toEqual([topics[21], topics[0], topics[1]]);
  });

  // Duplicate React keys, and a chip that appears twice in one row, both follow
  // from a window wider than the pool.
  it("never repeats a chip within one window", () => {
    for (const n of [1, 2, 3, 4, 22]) {
      const pool = bookTopicPool(book(n, 2)).topics;
      for (let c = 0; c < 2 * n; c++) {
        const w = rotateChips(pool, c, 3);
        expect(new Set(w).size).toBe(w.length);
      }
    }
  });
});
