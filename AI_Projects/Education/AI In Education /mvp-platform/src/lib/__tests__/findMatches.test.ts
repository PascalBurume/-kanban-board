import { describe, it, expect } from "vitest";
import { findMatches, matchAfter, matchBefore } from "../findMatches";

// The rules with the edge cases, tested without building an editor.

describe("findMatches", () => {
  it("finds every occurrence", () => {
    expect(findMatches("le chat et le chien", "le")).toEqual([
      { from: 0, to: 2 },
      { from: 11, to: 13 },
    ]);
  });

  it("matches without regard to case by default", () => {
    expect(findMatches("Équation et équation", "équation")).toHaveLength(2);
  });

  it("respects case when asked", () => {
    expect(findMatches("Équation et équation", "Équation", true)).toHaveLength(1);
  });

  it("matches nothing for an empty term", () => {
    expect(findMatches("du texte", "")).toEqual([]);
  });

  // The term is text, not a pattern: a teacher searching for "x^2" or "\frac{" means
  // those characters. Treating them as a RegExp would throw or match the wrong thing.
  it("treats regex metacharacters literally", () => {
    expect(findMatches("on pose x^2 + 1", "x^2")).toEqual([{ from: 8, to: 11 }]);
    expect(findMatches("\\frac{a}{b}", "\\frac{")).toEqual([{ from: 0, to: 6 }]);
    expect(findMatches("a.b", ".")).toEqual([{ from: 1, to: 2 }]);
    expect(findMatches("(x)", "(")).toEqual([{ from: 0, to: 1 }]);
  });

  // Overlapping hits would let a replace-all consume its own output.
  it("does not return overlapping matches", () => {
    expect(findMatches("aaaa", "aa")).toEqual([
      { from: 0, to: 2 },
      { from: 2, to: 4 },
    ]);
  });

  it("terminates on a term longer than the text", () => {
    expect(findMatches("ab", "abcdef")).toEqual([]);
  });

  it("handles accents in French text", () => {
    expect(findMatches("élève, ÉLÈVE", "élève")).toHaveLength(2);
  });
});

describe("navigation wraps", () => {
  const m = [
    { from: 10, to: 12 },
    { from: 40, to: 42 },
    { from: 80, to: 82 },
  ];

  it("finds the next match after a position", () => {
    expect(matchAfter(m, 0)).toBe(0);
    expect(matchAfter(m, 12)).toBe(1);
  });

  it("wraps to the first when past the end", () => {
    expect(matchAfter(m, 999)).toBe(0);
  });

  it("finds the previous match before a position", () => {
    expect(matchBefore(m, 45)).toBe(1);
  });

  it("wraps to the last when before the start", () => {
    expect(matchBefore(m, 0)).toBe(2);
  });

  it("reports nothing when there are no matches", () => {
    expect(matchAfter([], 0)).toBe(-1);
    expect(matchBefore([], 0)).toBe(-1);
  });
});
