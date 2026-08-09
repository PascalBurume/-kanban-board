import { describe, it, expect } from "vitest";
import {
  storageBand,
  backupStatus,
  serverState,
  notableAudit,
  SESSION_ACTIONS,
  BACKUP_STALE_DAYS,
} from "../adminDashboard";

const NOW = new Date("2026-08-09T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

describe("storageBand", () => {
  it("is ok well below the line", () => {
    for (const p of [0, 48, 74]) expect(storageBand(p), `${p}%`).toBe("ok");
  });
  it("warns from 75%", () => {
    expect(storageBand(74.9)).toBe("ok");
    expect(storageBand(75)).toBe("warn");
    expect(storageBand(89)).toBe("warn");
  });
  it("is critical from 90%", () => {
    expect(storageBand(90)).toBe("critical");
    expect(storageBand(100)).toBe("critical");
  });
  // A missing statfs must not paint the disk red.
  it("treats unreadable values as ok rather than alarming", () => {
    for (const p of [NaN, undefined as never, null as never, "x" as never]) expect(storageBand(p)).toBe("ok");
  });
});

describe("backupStatus", () => {
  it("reports never when nothing has run", () => {
    for (const v of [null, undefined, "", "not-a-date"]) {
      expect(backupStatus(v as never, NOW)).toEqual({ state: "never", days: null });
    }
  });
  it("counts whole days", () => {
    expect(backupStatus(daysAgo(0), NOW).days).toBe(0);
    expect(backupStatus(daysAgo(3), NOW).days).toBe(3);
  });
  it("goes stale at a school week", () => {
    expect(backupStatus(daysAgo(BACKUP_STALE_DAYS - 1), NOW).state).toBe("recent");
    expect(backupStatus(daysAgo(BACKUP_STALE_DAYS), NOW).state).toBe("stale");
    expect(backupStatus(daysAgo(90), NOW).state).toBe("stale");
  });
  it("accepts a Date as well as an ISO string", () => {
    expect(backupStatus(new Date(daysAgo(2)), NOW).days).toBe(2);
  });
  // A server whose clock has drifted forward should read "today", not "-3 days".
  it("floors a future timestamp at zero", () => {
    const s = backupStatus(new Date(NOW.getTime() + 3 * 86400000), NOW);
    expect(s.days).toBe(0);
    expect(s.state).toBe("recent");
  });
});

describe("serverState", () => {
  const OK = { storagePct: 40, ollamaOnline: true, backup: "recent" as const };

  it("is ok when everything is", () => {
    expect(serverState(OK)).toBe("ok");
  });

  // The old card said "En bon état" unconditionally.
  it("is critical on a nearly full disk", () => {
    expect(serverState({ ...OK, storagePct: 95 })).toBe("critical");
  });

  it("is critical when no backup has ever run", () => {
    expect(serverState({ ...OK, backup: "never" })).toBe("critical");
  });

  it("warns on a filling disk or a stale backup", () => {
    expect(serverState({ ...OK, storagePct: 80 })).toBe("warn");
    expect(serverState({ ...OK, backup: "stale" })).toBe("warn");
  });

  // The platform is designed to work without the tutor, so it is not a fault.
  it("only warns when the AI tutor is offline", () => {
    expect(serverState({ ...OK, ollamaOnline: false })).toBe("warn");
  });

  it("lets the worst signal win", () => {
    expect(serverState({ storagePct: 95, ollamaOnline: false, backup: "never" })).toBe("critical");
    expect(serverState({ storagePct: 80, ollamaOnline: false, backup: "never" })).toBe("critical");
  });
});

describe("notableAudit", () => {
  const A = (action: string, id = action) => ({ action, id });

  it("drops sign-ins and sign-outs", () => {
    const rows = [A("LOGOUT"), A("LOGIN"), A("LESSON_EDIT"), A("QUIZ_EDIT")];
    expect(notableAudit(rows).map((r) => r.action)).toEqual(["LESSON_EDIT", "QUIZ_EDIT"]);
  });

  // The live case: 6 of the 8 newest rows were session churn, so all four
  // visible slots were sign-outs and both lesson edits were invisible.
  it("surfaces the edits buried under session churn", () => {
    const rows = [
      A("LOGOUT", "1"), A("LOGOUT", "2"), A("LOGOUT", "3"), A("LOGOUT", "4"),
      A("LESSON_CREATE", "5"), A("LOGOUT", "6"), A("LESSON_EDIT", "7"), A("LOGIN", "8"),
    ];
    expect(notableAudit(rows, 4).map((r) => r.id)).toEqual(["5", "7"]);
  });

  it("respects the limit", () => {
    const rows = Array.from({ length: 20 }, (_, i) => A("LESSON_EDIT", String(i)));
    expect(notableAudit(rows, 4)).toHaveLength(4);
  });

  it("preserves order", () => {
    const rows = [A("LESSON_EDIT", "a"), A("LOGIN", "x"), A("QUIZ_EDIT", "b")];
    expect(notableAudit(rows).map((r) => r.id)).toEqual(["a", "b"]);
  });

  // Better to show sign-ins than to claim nothing happened.
  it("falls back to the raw rows when everything is session churn", () => {
    const rows = [A("LOGIN", "1"), A("LOGOUT", "2")];
    expect(notableAudit(rows, 4).map((r) => r.id)).toEqual(["1", "2"]);
  });

  it("returns nothing for nothing", () => {
    expect(notableAudit([], 4)).toEqual([]);
  });

  it("does not mutate its input", () => {
    const rows = [A("LOGIN"), A("LESSON_EDIT")];
    const copy = [...rows];
    notableAudit(rows);
    expect(rows).toEqual(copy);
  });

  it("keeps the session set to the two churn actions", () => {
    expect([...SESSION_ACTIONS].sort()).toEqual(["LOGIN", "LOGOUT"]);
  });
});
