import { prisma } from "./db";
import { accessibleSubjectSlugs, lockedModuleIds } from "./path";

// What a student has actually studied, compiled for the carnet Copilot.
//
// The coach used to see only the notebook's own text, so an empty carnet — which
// is every carnet on the day it is created — produced "tes notes sont encore
// vides, écris quelque chose". That is the one moment a revision assistant is
// most useful and it had nothing to say. The platform already knows which
// lessons the student finished and how they scored on each quiz; this hands the
// coach that record so it can start the revision instead of waiting for it.
//
// Everything here is the student's own progress. No other student's data is read.

export type StudiedLesson = { title: string; quizScore: number | null };

export type StudiedModule = {
  name: string;
  subjectName: string;
  lessonCount: number;
  doneCount: number;
  /** Every lesson in the module is complete. */
  finished: boolean;
  done: StudiedLesson[];
  /** Started but not finished — what to pick up next. */
  inProgress: string[];
};

export type StudyRecord = {
  modules: StudiedModule[];
  totalDone: number;
  /** Quizzes scored under the pass mark, worst first — the revision targets. */
  weakest: { lesson: string; score: number }[];
  lastLessons: string[];
};

/** Under this, a quiz counts as not yet understood. */
const WEAK_BELOW = 60;
const MAX_WEAK = 5;
const MAX_RECENT = 6;
/** Enough for the model to see the shape of a module without flooding the prompt. */
const MAX_LESSONS_PER_MODULE = 12;

export async function getStudyRecord(
  studentId: string,
  classId: string,
  subjectSlug?: string | null,
): Promise<StudyRecord> {
  // A notebook bound to a subject only wants that subject's history; a free note
  // gets everything the class can reach.
  const slugs = subjectSlug ? [subjectSlug] : await accessibleSubjectSlugs(classId);
  if (!slugs.length) return { modules: [], totalDone: 0, weakest: [], lastLessons: [] };

  const [subjects, progress, attempts, locked] = await Promise.all([
    prisma.subject.findMany({
      where: { slug: { in: slugs } },
      orderBy: { order: "asc" },
      select: {
        name: true,
        modules: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            title: true,
            lessons: {
              where: { status: "PUBLISHED" },
              orderBy: { order: "asc" },
              select: { id: true, title: true, quizzes: { select: { id: true } } },
            },
          },
        },
      },
    }),
    prisma.progress.findMany({
      where: { studentId },
      select: { lessonId: true, status: true, completedAt: true, updatedAt: true },
    }),
    prisma.quizAttempt.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      select: { quizId: true, score: true, createdAt: true },
    }),
    lockedModuleIds(classId),
  ]);

  const byLesson = new Map(progress.map((p) => [p.lessonId, p]));
  // Most recent attempt wins: a student who retook a quiz has learnt since, and
  // grounding revision in the score they already beat would be wrong.
  const bestByQuiz = new Map<string, number>();
  for (const a of attempts) if (!bestByQuiz.has(a.quizId)) bestByQuiz.set(a.quizId, a.score);

  const modules: StudiedModule[] = [];
  const weak: { lesson: string; score: number }[] = [];
  let totalDone = 0;

  for (const subject of subjects) {
    for (const mod of subject.modules) {
      if (!mod.lessons.length || locked.has(mod.id)) continue;
      const done: StudiedLesson[] = [];
      const inProgress: string[] = [];

      for (const lesson of mod.lessons) {
        const p = byLesson.get(lesson.id);
        if (!p) continue;
        const score = lesson.quizzes.map((q) => bestByQuiz.get(q.id)).find((s) => s != null) ?? null;
        if (p.status === "COMPLETED") {
          done.push({ title: lesson.title, quizScore: score ?? null });
          totalDone++;
          if (score != null && score < WEAK_BELOW) weak.push({ lesson: lesson.title, score });
        } else if (p.status === "IN_PROGRESS") {
          inProgress.push(lesson.title);
        }
      }

      if (!done.length && !inProgress.length) continue;
      modules.push({
        name: mod.title,
        subjectName: subject.name,
        lessonCount: mod.lessons.length,
        doneCount: done.length,
        finished: done.length === mod.lessons.length,
        done: done.slice(0, MAX_LESSONS_PER_MODULE),
        inProgress,
      });
    }
  }

  // Most recently finished lessons, newest first — "what we just covered".
  const lastLessons = progress
    .filter((p) => p.status === "COMPLETED")
    .sort((a, b) => (b.completedAt ?? b.updatedAt).getTime() - (a.completedAt ?? a.updatedAt).getTime())
    .slice(0, MAX_RECENT)
    .map((p) => {
      for (const s of subjects) for (const m of s.modules) for (const l of m.lessons) if (l.id === p.lessonId) return l.title;
      return null;
    })
    .filter((t): t is string => !!t);

  weak.sort((a, b) => a.score - b.score);
  return { modules, totalDone, weakest: weak.slice(0, MAX_WEAK), lastLessons };
}

/** Names only, with an honest tail count rather than a silent truncation. */
function nameList(mods: StudiedModule[], cap: number): string {
  const shown = mods.slice(0, cap).map((m) => m.name);
  const rest = mods.length - shown.length;
  return shown.join(" · ") + (rest > 0 ? ` (+${rest} autres)` : "");
}

/**
 * The record as prompt text. Empty string when nothing has been studied yet.
 *
 * Deliberately terse. A real student here had 23 modules and 167 finished
 * lessons; listing every lesson title came to ~1700 tokens, which on top of the
 * notes, the textbook excerpts and the transcript is enough to push a small
 * local model past its context and make it forget the question. Finished modules
 * are therefore named but not expanded — what the coach needs from them is the
 * name to offer. Lesson-level detail is spent where it changes an answer: the
 * module still in progress, the weak quizzes, and the last few lessons.
 */
export function formatStudyRecord(rec: StudyRecord): string {
  if (!rec.totalDone && !rec.modules.length) return "";

  const lines: string[] = [];
  const finished = rec.modules.filter((m) => m.finished);
  const partial = rec.modules.filter((m) => !m.finished);

  if (finished.length) {
    lines.push(`Modules TERMINÉS (${finished.length}) : ${nameList(finished, 14)}`);
  }
  if (partial.length) {
    lines.push("", "Modules EN COURS :");
    for (const m of partial.slice(0, 4)) {
      const bits = [`${m.doneCount}/${m.lessonCount} leçons faites`];
      if (m.inProgress.length) bits.push(`en cours : ${m.inProgress.slice(0, 3).join(" · ")}`);
      lines.push(`- ${m.name} (${m.subjectName}) — ${bits.join(" ; ")}`);
    }
  }
  if (rec.weakest.length) {
    lines.push(
      "",
      "Quiz les moins réussis (priorités de révision) :",
      ...rec.weakest.map((w) => `- ${w.lesson} : ${w.score}/100`),
    );
  }
  if (rec.lastLessons.length) {
    lines.push("", `Leçons terminées le plus récemment : ${rec.lastLessons.join(" · ")}`);
  }
  lines.push("", `Total : ${rec.totalDone} leçons terminées.`);
  return lines.join("\n");
}
