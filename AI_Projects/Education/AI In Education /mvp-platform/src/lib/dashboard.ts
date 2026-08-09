// Pure shaping helpers for the teacher dashboard.
//
// These exist so the two things that decide whether the page survives a real
// school year — how far back the activity chart looks, and how many class
// cards are allowed on screen — are decided by tested functions rather than
// by whatever the database happens to return.

export type RangeKey = "7j" | "4s" | "trim";

export interface RangeDef {
  /** Days of history to read. Always a whole number of buckets. */
  days: number;
  /** Days per bar. 1 = one bar per day, 7 = one bar per week. */
  bucketDays: number;
  label: string;
}

// A bar per day stops being readable somewhere around three weeks, so the
// longer ranges aggregate to whole weeks rather than drawing 90 hairlines.
// Each `days` is a multiple of its `bucketDays`, so no bucket is a partial
// week that would read as a slump.
export const RANGES: Record<RangeKey, RangeDef> = {
  "7j": { days: 7, bucketDays: 1, label: "7 jours" },
  "4s": { days: 28, bucketDays: 7, label: "4 semaines" },
  trim: { days: 91, bucketDays: 7, label: "Trimestre" },
};

export const DEFAULT_RANGE: RangeKey = "7j";

// hasOwn, not `in`: `"__proto__" in RANGES` is true, and the lookup that
// followed would hand the caller Object.prototype with no `days` on it.
export function parseRange(v: string | null | undefined): RangeKey {
  return v && Object.hasOwn(RANGES, v) ? (v as RangeKey) : DEFAULT_RANGE;
}

export interface Bucket {
  /** ISO date (YYYY-MM-DD) of the first day in the bucket. */
  start: string;
  /** ISO date of the last day in the bucket. Equals `start` when bucketDays is 1. */
  end: string;
}

/**
 * Group a run of consecutive day keys into buckets of `bucketDays`, oldest
 * first. The caller guarantees `days` is a whole number of buckets; a ragged
 * tail is kept rather than dropped, so no activity ever disappears.
 */
export function bucketDays(days: string[], size: number): Bucket[] {
  if (size <= 1) return days.map((d) => ({ start: d, end: d }));
  const out: Bucket[] = [];
  for (let i = 0; i < days.length; i += size) {
    const slice = days.slice(i, i + size);
    out.push({ start: slice[0], end: slice[slice.length - 1] });
  }
  return out;
}

/** Sum a per-day series into the same buckets `bucketDays` produced. */
export function bucketSeries(series: number[], size: number): number[] {
  if (size <= 1) return series.map((v) => Number(v) || 0);
  const out: number[] = [];
  for (let i = 0; i < series.length; i += size) {
    out.push(series.slice(i, i + size).reduce((s, v) => s + (Number(v) || 0), 0));
  }
  return out;
}

// ---- duration ----

/**
 * Minutes → a French duration, e.g. "45 min", "1 h", "19 h 03".
 *
 * The minutes are zero-padded because this form drops the unit after the hour:
 * unpadded, 1143 rendered as "19 h 3", which reads as a truncation rather than
 * three minutes. The other duration formatters in the app keep an "m" suffix
 * ("19h 3m") and so don't have the ambiguity.
 */
export function formatMinutes(min: number): string {
  const total = Math.max(0, Math.round(Number(min) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

// ---- class triage ----

export type AlertType = "ok" | "warning" | "danger";
const SEVERITY: Record<string, number> = { danger: 0, warning: 1, ok: 2 };

export interface TriageInput {
  alert?: { type: AlertType | string } | null;
}

/**
 * Decide which classes earn a full card and which collapse to a compact row.
 *
 * A dashboard that renders every class as a card is a list, not a summary: six
 * classes already cost two screens on the 1024×768 tablets this runs on, and a
 * school with a dozen would push the week's activity below four. So the classes
 * asking for attention get the cards, capped, and the rest get one line each.
 *
 * When nothing is wrong there is nothing to triage, so the first `limit`
 * classes still get cards — a healthy school should not be punished with a
 * table.
 */
export function triageClasses<T extends TriageInput>(classes: T[], limit = 4): { cards: T[]; rows: T[] } {
  const sorted = [...classes].sort(
    (a, b) => (SEVERITY[a.alert?.type ?? "ok"] ?? 2) - (SEVERITY[b.alert?.type ?? "ok"] ?? 2),
  );
  const alerting = sorted.filter((c) => (c.alert?.type ?? "ok") !== "ok");
  const cards = (alerting.length ? alerting : sorted).slice(0, limit);
  const inCards = new Set(cards);
  return { cards, rows: sorted.filter((c) => !inCards.has(c)) };
}
