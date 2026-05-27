// SM-2 spaced repetition scheduler, the algorithm SuperMemo / Anki / Mnemosyne
// all derive from. Pure functions — no DB access — so they can run on the
// server (for grading) and the client (to label rating buttons with the
// actual upcoming interval).
//
// Quality scale (0..5):  0 blackout · 1 incorrect · 2 incorrect-easy-recall
//                       · 3 correct-difficult · 4 correct-hesitation · 5 perfect
//
// 4-button UI mapping:  again → 1   hard → 3   good → 4   easy → 5

export type Rating = "again" | "hard" | "good" | "easy";

export const RATING_QUALITY: Record<Rating, number> = {
  again: 1,
  hard: 3,
  good: 4,
  easy: 5,
};

export interface ScheduleState {
  ease: number;     // E-Factor; clamped at >= 1.3
  interval: number; // days until next review (0 = same session)
  reps: number;     // consecutive successful reviews (resets on lapse)
}

export interface ScheduleNext extends ScheduleState {
  dueDate: Date;
  lapsed: boolean;
}

const MIN_EASE = 1.3;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Run one SM-2 update given the current card state + rating quality.
 * Returns the next state and the absolute dueDate.
 *
 * The `reps` count is inferred from interval when not supplied: we don't
 * store it separately on SRSCard (the schema only has ease + interval),
 * but the standard SM-2 rules say "if I=1 → n=1, if I=6 → n=2, else n>=3".
 */
export function scheduleNext(
  current: { ease: number; interval: number; reps?: number },
  rating: Rating,
  now: Date = new Date(),
): ScheduleNext {
  const q = RATING_QUALITY[rating];
  const reps = current.reps ?? inferReps(current.interval);

  // EF update (applied for all qualities per the published algorithm)
  const newEase = Math.max(
    MIN_EASE,
    current.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)),
  );

  // Lapse: any quality < 3 resets the schedule
  if (q < 3) {
    return {
      ease: newEase,
      interval: 0, // same-session re-review
      reps: 0,
      lapsed: true,
      dueDate: now,
    };
  }

  // Successful review — pick next interval
  let nextInterval: number;
  if (rating === "hard") {
    // Anki convention: hard shortens, never grows aggressively
    nextInterval = Math.max(1, Math.round(current.interval * 1.2));
    if (current.interval === 0) nextInterval = 1;
  } else if (reps === 0) {
    // Anki-style graduating intervals: 1d on Good, 4d on Easy
    nextInterval = rating === "easy" ? 4 : 1;
  } else if (reps === 1) {
    nextInterval = rating === "easy" ? 6 : 3;
  } else {
    const multiplier = rating === "easy" ? newEase * 1.3 : newEase;
    nextInterval = Math.max(1, Math.round(current.interval * multiplier));
  }

  return {
    ease: newEase,
    interval: nextInterval,
    reps: reps + 1,
    lapsed: false,
    dueDate: new Date(now.getTime() + nextInterval * DAY_MS),
  };
}

function inferReps(interval: number): number {
  if (interval <= 0) return 0;
  if (interval <= 1) return 1;
  if (interval <= 6) return 2;
  return 3;
}

/**
 * Human-readable interval label (e.g. "10m", "3d", "2mo").
 * 0-day intervals render as a short same-session label.
 */
export function formatInterval(days: number): string {
  if (days <= 0) return "<10m";
  if (days < 1) return `${Math.round(days * 24 * 60)}m`;
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}
