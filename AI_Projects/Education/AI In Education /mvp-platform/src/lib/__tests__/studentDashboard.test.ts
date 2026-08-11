import { describe, it, expect } from "vitest";
import { earnedBadgeSlugs, triageModules } from "../studentDashboard";

const NONE = { completedLessons: 0, bestQuizScore: 0, streak: 0, projectSubmissions: 0 };

describe("earnedBadgeSlugs", () => {
  it("earns nothing for a student who has not started", () => {
    expect([...earnedBadgeSlugs(NONE)]).toEqual([]);
  });

  // The bug: `first-module` was awarded only when the completed count was
  // exactly 1, so 38 seeded students with completions could never earn it.
  it("earns first-module at any completion count, not just the first", () => {
    for (const n of [1, 2, 147]) {
      expect(earnedBadgeSlugs({ ...NONE, completedLessons: n }).has("first-module"), `n=${n}`).toBe(true);
    }
  });

  it("earns perfect-quiz only at a full score", () => {
    expect(earnedBadgeSlugs({ ...NONE, bestQuizScore: 99 }).has("perfect-quiz")).toBe(false);
    expect(earnedBadgeSlugs({ ...NONE, bestQuizScore: 100 }).has("perfect-quiz")).toBe(true);
  });

  it("earns streak-7 at seven days, not six", () => {
    expect(earnedBadgeSlugs({ ...NONE, streak: 6 }).has("streak-7")).toBe(false);
    expect(earnedBadgeSlugs({ ...NONE, streak: 7 }).has("streak-7")).toBe(true);
    expect(earnedBadgeSlugs({ ...NONE, streak: 30 }).has("streak-7")).toBe(true);
  });

  it("earns projet-applique on a first credited submission", () => {
    expect(earnedBadgeSlugs({ ...NONE, projectSubmissions: 1 }).has("projet-applique")).toBe(true);
  });

  it("earns all four together", () => {
    const all = earnedBadgeSlugs({ completedLessons: 147, bestQuizScore: 100, streak: 12, projectSubmissions: 2 });
    expect([...all].sort()).toEqual(["first-module", "perfect-quiz", "projet-applique", "streak-7"]);
  });

  it("is a floor, never awarding on negative or absent data", () => {
    expect([...earnedBadgeSlugs({ completedLessons: -1, bestQuizScore: -5, streak: -2, projectSubmissions: -1 })]).toEqual([]);
  });
});

describe("triageModules", () => {
  const M = (status: string, pct: number) => ({ status, pct });
  const done = (n: number) => Array.from({ length: n }, () => M("done", 100));
  const fresh = (n: number) => Array.from({ length: n }, () => M("available", 0));

  it("returns empty buckets for no modules", () => {
    expect(triageModules([])).toEqual({ focus: [], done: [], rest: [] });
  });

  it("folds away the finished ones — the 18-of-22 case", () => {
    const chapters = [...done(18), M("current", 40), ...fresh(3)];
    const t = triageModules(chapters, 6);
    expect(t.done).toHaveLength(18);
    expect(t.focus).toHaveLength(4); // the started one + 3 topped up
    expect(t.rest).toHaveLength(0);
  });

  it("caps the not-started ones for a student who has just begun", () => {
    const t = triageModules([M("current", 0), ...fresh(21)], 6);
    expect(t.focus).toHaveLength(6);
    expect(t.rest).toHaveLength(16);
    expect(t.done).toHaveLength(0);
  });

  it("keeps every started module however many, past the target", () => {
    const started = Array.from({ length: 9 }, () => M("available", 50));
    const t = triageModules([...started, ...fresh(5)], 6);
    expect(t.focus).toHaveLength(9);
    expect(t.rest).toHaveLength(5);
  });

  it("treats a locked module as rest, never as focus", () => {
    const t = triageModules([M("locked", 0), M("current", 10)], 6);
    expect(t.focus).toEqual([M("current", 10)]);
    expect(t.rest).toEqual([M("locked", 0)]);
  });

  // A locked module at 100% is still locked: the teacher's decision wins.
  it("lets locked win over a complete percentage", () => {
    const t = triageModules([M("locked", 100)], 6);
    expect(t.done).toHaveLength(0);
    expect(t.rest).toHaveLength(1);
  });

  it("counts pct 100 as done even when the status disagrees", () => {
    const t = triageModules([M("available", 100)], 6);
    expect(t.done).toHaveLength(1);
    expect(t.focus).toHaveLength(0);
  });

  it("never loses or duplicates a module", () => {
    const chapters = [...done(7), M("current", 30), ...fresh(12), M("locked", 0)];
    for (const target of [1, 3, 6, 50]) {
      const t = triageModules(chapters, target);
      expect(t.focus.length + t.done.length + t.rest.length, `target=${target}`).toBe(chapters.length);
      expect(new Set([...t.focus, ...t.done, ...t.rest]).size).toBe(chapters.length);
    }
  });

  it("preserves the given order within each bucket", () => {
    const a = M("available", 0), b = M("available", 0), c = M("available", 0);
    expect(triageModules([a, b, c], 2).focus).toEqual([a, b]);
    expect(triageModules([a, b, c], 2).rest).toEqual([c]);
  });

  it("does not mutate its input", () => {
    const chapters = [...done(3), M("current", 10)];
    const copy = [...chapters];
    triageModules(chapters);
    expect(chapters).toEqual(copy);
  });
});
