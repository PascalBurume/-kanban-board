// A Subject's `name` carries its level and its stream — « Mathématiques (littéraire) — 5e ».
// That is the right name for a BOOK and the wrong name for a PERSON: joining five of them
// gave the sidebar a 100-character identity line that wrapped to eight rows and pushed the
// navigation off the screen. What a teacher *is* survives once the level and the stream
// come off, and it collapses: five books, one discipline.

const SEPARATORS = /[—–]/; // em dash in the seed data, en dash defensively

export function disciplineOf(subjectName: string): string {
  const head = subjectName.split(SEPARATORS)[0].replace(/\s*\([^)]*\)\s*/g, " ").trim();
  return head || subjectName.trim();
}

/** Distinct disciplines, first-seen order preserved so the caller controls sorting. */
export function disciplinesOf(subjectNames: string[]): string[] {
  return [...new Set(subjectNames.map(disciplineOf).filter(Boolean))];
}

/**
 * The sidebar's one line. Bounded on purpose: a teacher who picks up two more books next
 * term must not be able to grow the footer into the nav again.
 */
export function teachingLabel(subjectNames: string[], max = 2): string {
  const d = disciplinesOf(subjectNames);
  if (d.length === 0) return "";
  const head = d.slice(0, max).join(" · ");
  return d.length > max ? `${head} +${d.length - max}` : head;
}
