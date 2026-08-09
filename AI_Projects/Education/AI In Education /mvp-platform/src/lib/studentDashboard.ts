// Pure shaping helpers for the student dashboard.
//
// Two jobs, both the student-side equivalent of what the teacher dashboard
// needed: tell the truth about what has been earned, and keep the module list
// from becoming a wall of cards once a student is deep into a school year.

// ---- badges ----

/** Everything the badge rules need, all of it already computed by buildStudentPath. */
export interface BadgeFacts {
  completedLessons: number;
  /** Best score across every quiz attempt, 0–100. */
  bestQuizScore: number;
  /** Consecutive school-local days of activity. */
  streak: number;
  /** Submitted, returned or graded project submissions the student is credited with. */
  projectSubmissions: number;
}

/**
 * Which badges the student's record earns them, derived from the data rather
 * than from BadgeAward rows.
 *
 * Badges used to exist only as a write-time side effect of finishing a lesson,
 * scoring 100, or having work reviewed. Anything that put a completion in the
 * database by another route — a seed, an import, a restore — awarded nothing,
 * and `first-module` tested `completedCount === 1`, a count that never comes
 * back down. The result was 38 students with completed lessons and not one
 * badge award between them, permanently unreachable.
 *
 * Deriving on read makes the trophy case reflect the work. The award sites
 * still write BadgeAward rows, so `earnedAt` is recorded for anyone who earns
 * one the ordinary way; this is a floor, not a replacement.
 */
export function earnedBadgeSlugs(facts: BadgeFacts): Set<string> {
  const out = new Set<string>();
  if (facts.completedLessons >= 1) out.add("first-module");
  if (facts.bestQuizScore >= 100) out.add("perfect-quiz");
  if (facts.streak >= 7) out.add("streak-7");
  if (facts.projectSubmissions >= 1) out.add("projet-applique");
  return out;
}

// ---- module triage ----

export interface ModuleLike {
  status: string; // done | current | available | locked
  pct: number;
}

export interface ModuleTriage<T> {
  /** What to show as cards: everything started, topped up with what's next. */
  focus: T[];
  /** Finished. Collapsed — a student browsing their year does not need 18 green rings. */
  done: T[];
  /** Not started yet, beyond the focus window, plus anything the teacher locked. */
  rest: T[];
}

/**
 * Split a subject's modules into what to show and what to fold away.
 *
 * Expanding a subject rendered every module it had. One seeded student is 18/22
 * through Mathématiques, so the four modules that actually need them were
 * buried under eighteen completed ones — exactly backwards. A school with six
 * subjects of twenty modules would render 120 cards.
 *
 * Everything in progress always makes the cut, however many: finishing what you
 * started is the point. `target` only governs how many not-yet-started modules
 * come along for company.
 */
export function triageModules<T extends ModuleLike>(chapters: T[], target = 6): ModuleTriage<T> {
  const done: T[] = [];
  const started: T[] = [];
  const fresh: T[] = [];
  const locked: T[] = [];

  for (const c of chapters) {
    if (c.status === "locked") locked.push(c);
    else if (c.status === "done" || c.pct >= 100) done.push(c);
    else if (c.pct > 0 || c.status === "current") started.push(c);
    else fresh.push(c);
  }

  const focus = [...started];
  let i = 0;
  while (focus.length < target && i < fresh.length) focus.push(fresh[i++]);

  return { focus, done, rest: [...fresh.slice(i), ...locked] };
}
