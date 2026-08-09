import { describe, it, expect } from "vitest";
import { RANGES, parseRange, bucketDays, bucketSeries, triageClasses, formatMinutes } from "../dashboard";

const seq = (n: number, from = 1) => Array.from({ length: n }, (_, i) => i + from);
const isoDays = (n: number) =>
  Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 5, 1 + i)).toISOString().slice(0, 10));

describe("parseRange", () => {
  it("accepts the three known keys", () => {
    expect(parseRange("7j")).toBe("7j");
    expect(parseRange("4s")).toBe("4s");
    expect(parseRange("trim")).toBe("trim");
  });
  it("falls back to 7j for anything else", () => {
    for (const v of [null, undefined, "", "30j", "année", "__proto__", "constructor"]) {
      expect(parseRange(v)).toBe("7j");
    }
  });
});

describe("RANGES", () => {
  // A partial trailing bucket would render as a slump the school did not have.
  it("gives every range a whole number of buckets", () => {
    for (const [key, r] of Object.entries(RANGES)) {
      expect(r.days % r.bucketDays, key).toBe(0);
    }
  });
  it("keeps every range under 14 bars", () => {
    for (const [key, r] of Object.entries(RANGES)) {
      expect(r.days / r.bucketDays, key).toBeLessThanOrEqual(13);
    }
  });
});

describe("bucketDays", () => {
  it("is the identity for daily buckets", () => {
    const days = isoDays(7);
    expect(bucketDays(days, 1)).toEqual(days.map((d) => ({ start: d, end: d })));
  });
  it("groups 28 days into 4 whole weeks, oldest first", () => {
    const days = isoDays(28);
    const b = bucketDays(days, 7);
    expect(b).toHaveLength(4);
    expect(b[0]).toEqual({ start: days[0], end: days[6] });
    expect(b[3]).toEqual({ start: days[21], end: days[27] });
  });
  it("keeps a ragged tail rather than dropping it", () => {
    const days = isoDays(9);
    const b = bucketDays(days, 7);
    expect(b).toHaveLength(2);
    expect(b[1]).toEqual({ start: days[7], end: days[8] });
  });
  it("returns nothing for no days", () => {
    expect(bucketDays([], 7)).toEqual([]);
  });
});

describe("bucketSeries", () => {
  it("preserves the values for daily buckets", () => {
    expect(bucketSeries([0, 3, 5], 1)).toEqual([0, 3, 5]);
  });
  it("sums each week", () => {
    expect(bucketSeries(seq(14), 7)).toEqual([28, 77]); // 1..7, 8..14
  });
  it("conserves the total whatever the bucket size", () => {
    const s = seq(28);
    const total = s.reduce((a, b) => a + b, 0);
    for (const size of [1, 7, 14, 28]) {
      expect(bucketSeries(s, size).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
  it("coerces holes to zero instead of NaN", () => {
    expect(bucketSeries([1, undefined as never, null as never, 4], 4)).toEqual([5]);
  });
  it("lines up one-for-one with bucketDays", () => {
    const days = isoDays(28);
    expect(bucketSeries(seq(28), 7)).toHaveLength(bucketDays(days, 7).length);
  });
});

describe("formatMinutes", () => {
  it("uses minutes under the hour", () => {
    expect(formatMinutes(0)).toBe("0 min");
    expect(formatMinutes(5)).toBe("5 min");
    expect(formatMinutes(59)).toBe("59 min");
  });
  it("drops the minutes when there are none", () => {
    expect(formatMinutes(60)).toBe("1 h");
    expect(formatMinutes(120)).toBe("2 h");
  });
  // The bug: 1143 rendered "19 h 3", which reads as a truncated number.
  it("zero-pads single-digit minutes", () => {
    expect(formatMinutes(63)).toBe("1 h 03");
    expect(formatMinutes(1143)).toBe("19 h 03");
  });
  it("leaves two-digit minutes alone", () => {
    expect(formatMinutes(272)).toBe("4 h 32");
    expect(formatMinutes(3753)).toBe("62 h 33");
  });
  it("never emits a bare hour with a trailing space", () => {
    for (let m = 0; m <= 600; m++) expect(formatMinutes(m)).toBe(formatMinutes(m).trim());
  });
  it("coerces junk and negatives to zero rather than NaN", () => {
    for (const v of [-5, NaN, undefined as never, null as never, "x" as never]) {
      expect(formatMinutes(v)).toBe("0 min");
    }
  });
});

describe("triageClasses", () => {
  const C = (name: string, type: string) => ({ name, alert: { type } });

  it("cards the alerting classes and rows the calm ones", () => {
    const { cards, rows } = triageClasses([C("a", "ok"), C("b", "danger"), C("c", "ok"), C("d", "warning")]);
    expect(cards.map((c) => c.name)).toEqual(["b", "d"]);
    expect(rows.map((c) => c.name)).toEqual(["a", "c"]);
  });

  it("orders danger before warning", () => {
    const { cards } = triageClasses([C("w", "warning"), C("d", "danger")]);
    expect(cards.map((c) => c.name)).toEqual(["d", "w"]);
  });

  it("caps the cards and rows the overflow — the six-class case", () => {
    const six = ["a", "b", "c", "d", "e", "f"].map((n) => C(n, "danger"));
    const { cards, rows } = triageClasses(six, 4);
    expect(cards).toHaveLength(4);
    expect(rows).toHaveLength(2);
  });

  it("still shows cards when every class is healthy", () => {
    const { cards, rows } = triageClasses([C("a", "ok"), C("b", "ok")], 4);
    expect(cards).toHaveLength(2);
    expect(rows).toHaveLength(0);
  });

  it("never loses or duplicates a class", () => {
    const twelve = Array.from({ length: 12 }, (_, i) => C(`c${i}`, i % 3 === 0 ? "danger" : "ok"));
    const { cards, rows } = triageClasses(twelve, 4);
    expect(cards.length + rows.length).toBe(12);
    expect(new Set([...cards, ...rows].map((c) => c.name)).size).toBe(12);
  });

  it("tolerates a missing alert", () => {
    const { cards } = triageClasses([{ name: "x" } as never], 4);
    expect(cards).toHaveLength(1);
  });

  it("does not mutate its input", () => {
    const input = [C("a", "ok"), C("b", "danger")];
    const before = input.map((c) => c.name);
    triageClasses(input);
    expect(input.map((c) => c.name)).toEqual(before);
  });

  it("returns nothing for no classes", () => {
    expect(triageClasses([])).toEqual({ cards: [], rows: [] });
  });
});
