import { describe, it, expect } from "vitest";
import { shouldSnapshot, SNAPSHOT_MIN_MS } from "../studio";

// A version should mean "a writing session", not "a keystroke".
//
// Every autosave used to snapshot a LessonVersion, write an AuditLog row and fire a
// RAG re-index (an Ollama embedding call). Two lessons in the demo database had 140
// and 76 versions from a handful of sittings, and the history list churned out of
// usefulness within a minute of typing.

const base = {
  changed: true,
  force: false,
  lastAt: 1_000_000,
  lastEditorId: "teacher-a",
  userId: "teacher-a",
  now: 1_000_000 + 60_000, // one minute later
};

describe("shouldSnapshot", () => {
  it("skips an autosave that changed nothing", () => {
    expect(shouldSnapshot({ ...base, changed: false })).toBe(false);
    // …even when everything else would say yes
    expect(shouldSnapshot({ ...base, changed: false, force: true })).toBe(false);
    expect(shouldSnapshot({ ...base, changed: false, lastAt: null })).toBe(false);
  });

  it("skips a background autosave inside the window", () => {
    expect(shouldSnapshot(base)).toBe(false);
  });

  it("snapshots once the window has passed", () => {
    expect(shouldSnapshot({ ...base, now: base.lastAt + SNAPSHOT_MIN_MS + 1 })).toBe(true);
    expect(shouldSnapshot({ ...base, now: base.lastAt + SNAPSHOT_MIN_MS })).toBe(false);
  });

  it("always snapshots a save the teacher asked for", () => {
    expect(shouldSnapshot({ ...base, force: true })).toBe(true);
  });

  it("always snapshots the first edit, so the original is never lost", () => {
    expect(shouldSnapshot({ ...base, lastAt: null, lastEditorId: null })).toBe(true);
  });

  // Coalescing is only safe within one person's session. Folding a colleague's last
  // state into your own save would delete the only copy of their work.
  it("never coalesces away another teacher's state", () => {
    expect(shouldSnapshot({ ...base, lastEditorId: "teacher-b" })).toBe(true);
  });

  it("treats an unknown previous editor as someone else", () => {
    expect(shouldSnapshot({ ...base, lastEditorId: null })).toBe(true);
  });
});

describe("what a writing session costs", () => {
  // The shape of the win: an hour of typing at the old 1.5s debounce was ~2400 saves
  // and just as many versions. Under the rule it is one per SNAPSHOT_MIN_MS.
  it("collapses continuous typing to one version per window", () => {
    const HOUR = 60 * 60_000;
    const STEP = 5_000; // SAVE_IDLE_MS — a save attempt every five seconds
    let lastAt: number | null = null;
    let versions = 0;
    let attempts = 0;
    for (let t = 0; t <= HOUR; t += STEP) {
      attempts++;
      if (shouldSnapshot({ changed: true, force: false, lastAt, lastEditorId: "t", userId: "t", now: t })) {
        versions++;
        lastAt = t;
      }
    }
    // One per window, give or take the step the window slips by each time.
    const windows = HOUR / SNAPSHOT_MIN_MS;
    expect(versions).toBeGreaterThanOrEqual(windows - 1);
    expect(versions).toBeLessThanOrEqual(windows + 1);
    // The point of the exercise: every attempt used to become a version.
    expect(attempts).toBeGreaterThan(700);
    expect(versions).toBeLessThan(attempts / 100);
  });
});
