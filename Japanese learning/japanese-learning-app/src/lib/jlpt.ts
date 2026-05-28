// JLPT facts + helpers — single source of truth for the prep dashboard,
// practice/mock routes, and any other surface that quotes test structure.
//
// Numbers reflect the current JEES exam structure (post-2010 reform). N1 and
// N2 combine vocab+grammar+reading into one paper; N3-N5 split vocab from
// grammar+reading. Section pass marks are uniform (≥19/60 per scaled section).

export type JLPTLevel = "N5" | "N4" | "N3" | "N2" | "N1";
export const LEVELS: JLPTLevel[] = ["N5", "N4", "N3", "N2", "N1"];

export type SectionKey = "vocab" | "grammar" | "reading" | "listening";

export interface SectionConfig {
  key: SectionKey;
  jp: string;
  en: string;
  qCount: number;
  timeMin: number;
  /** When true, this section is delivered combined with another on test day. */
  combinedWith?: SectionKey;
}

export interface LevelConfig {
  level: JLPTLevel;
  title: string;
  totalMin: number;
  passMark: number;       // total /180
  sectionPassMark: number; // each scaled /60
  sections: SectionConfig[];
}

// Source: JEES — Japan Educational Exchanges and Services (jlpt.jp).
export const JLPT: Record<JLPTLevel, LevelConfig> = {
  N5: {
    level: "N5",
    title: "Survival Japanese",
    totalMin: 90,
    passMark: 80,
    sectionPassMark: 19,
    sections: [
      { key: "vocab", jp: "語彙", en: "Vocabulary", qCount: 25, timeMin: 20 },
      { key: "grammar", jp: "文法", en: "Grammar", qCount: 16, timeMin: 40, combinedWith: "reading" },
      { key: "reading", jp: "読解", en: "Reading", qCount: 8, timeMin: 40, combinedWith: "grammar" },
      { key: "listening", jp: "聴解", en: "Listening", qCount: 22, timeMin: 30 },
    ],
  },
  N4: {
    level: "N4",
    title: "Tourist / basic",
    totalMin: 115,
    passMark: 90,
    sectionPassMark: 19,
    sections: [
      { key: "vocab", jp: "語彙", en: "Vocabulary", qCount: 30, timeMin: 25 },
      { key: "grammar", jp: "文法", en: "Grammar", qCount: 20, timeMin: 55, combinedWith: "reading" },
      { key: "reading", jp: "読解", en: "Reading", qCount: 10, timeMin: 55, combinedWith: "grammar" },
      { key: "listening", jp: "聴解", en: "Listening", qCount: 28, timeMin: 35 },
    ],
  },
  N3: {
    level: "N3",
    title: "Conversational",
    totalMin: 140,
    passMark: 95,
    sectionPassMark: 19,
    sections: [
      { key: "vocab", jp: "語彙", en: "Vocabulary", qCount: 35, timeMin: 30 },
      { key: "grammar", jp: "文法", en: "Grammar", qCount: 23, timeMin: 70, combinedWith: "reading" },
      { key: "reading", jp: "読解", en: "Reading", qCount: 16, timeMin: 70, combinedWith: "grammar" },
      { key: "listening", jp: "聴解", en: "Listening", qCount: 28, timeMin: 40 },
    ],
  },
  N2: {
    level: "N2",
    title: "Fluent reader",
    totalMin: 155,
    passMark: 90,
    sectionPassMark: 19,
    sections: [
      { key: "vocab", jp: "語彙", en: "Vocabulary", qCount: 32, timeMin: 105, combinedWith: "reading" },
      { key: "grammar", jp: "文法", en: "Grammar", qCount: 22, timeMin: 105, combinedWith: "reading" },
      { key: "reading", jp: "読解", en: "Reading", qCount: 21, timeMin: 105, combinedWith: "grammar" },
      { key: "listening", jp: "聴解", en: "Listening", qCount: 36, timeMin: 50 },
    ],
  },
  N1: {
    level: "N1",
    title: "Advanced",
    totalMin: 165,
    passMark: 100,
    sectionPassMark: 19,
    sections: [
      { key: "vocab", jp: "語彙", en: "Vocabulary", qCount: 25, timeMin: 110, combinedWith: "reading" },
      { key: "grammar", jp: "文法", en: "Grammar", qCount: 20, timeMin: 110, combinedWith: "reading" },
      { key: "reading", jp: "読解", en: "Reading", qCount: 26, timeMin: 110, combinedWith: "grammar" },
      { key: "listening", jp: "聴解", en: "Listening", qCount: 37, timeMin: 55 },
    ],
  },
};

export function isValidLevel(v: string | undefined | null): v is JLPTLevel {
  return !!v && (LEVELS as string[]).includes(v);
}

const SECTION_KEYS: readonly SectionKey[] = ["vocab", "grammar", "reading", "listening"];

export function isValidSection(v: string | undefined | null): v is SectionKey {
  return !!v && (SECTION_KEYS as readonly string[]).includes(v);
}

// JLPT is held on the first Sunday of July and the first Sunday of December.
export function nextExamDate(from = new Date()): Date {
  const candidates: Date[] = [];
  for (let yearOffset = 0; yearOffset <= 1; yearOffset++) {
    const year = from.getFullYear() + yearOffset;
    candidates.push(firstSundayOf(year, 6));  // July (month index 6)
    candidates.push(firstSundayOf(year, 11)); // December (month index 11)
  }
  const fromDay = startOfDay(from).getTime();
  let earliestMs = Infinity;
  let next: Date = candidates[0];
  for (const c of candidates) {
    const d = startOfDay(c);
    const ms = d.getTime();
    if (ms >= fromDay && ms < earliestMs) {
      earliestMs = ms;
      next = d;
    }
  }
  return next;
}

export function daysUntil(target: Date, from = new Date()): number {
  const MS = 24 * 60 * 60 * 1000;
  return Math.max(
    0,
    Math.round((startOfDay(target).getTime() - startOfDay(from).getTime()) / MS),
  );
}

export function formatExamDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function firstSundayOf(year: number, monthIndex: number): Date {
  const d = new Date(year, monthIndex, 1);
  const offset = (7 - d.getDay()) % 7; // 0 if Sunday
  d.setDate(1 + offset);
  return d;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Sectional weakness — lowest-scoring last-attempt across sections, or null.
export function weakestSection<T extends { section: string; scorePct: number | null }>(
  attempts: T[],
): { section: string; scorePct: number } | null {
  const bySection = new Map<string, number>();
  for (const a of attempts) {
    if (a.scorePct == null) continue;
    if (a.section === "full") continue;
    if (!bySection.has(a.section) || a.scorePct < (bySection.get(a.section) as number)) {
      bySection.set(a.section, a.scorePct);
    }
  }
  let weakest: { section: string; scorePct: number } | null = null;
  for (const [section, scorePct] of bySection) {
    if (!weakest || scorePct < weakest.scorePct) weakest = { section, scorePct };
  }
  return weakest;
}
