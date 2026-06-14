import fs from "node:fs";
import path from "node:path";
import { prisma } from "./db";
import { getStudentClass, accessibleSubjectSlugs, lockedModuleIds } from "./path";
import { matchSimKeys } from "./simMatch";
import { extractHighlights } from "./highlights";

// Practice ("Atelier") data: chapter-level (= Prisma Module) view for a student,
// gathering the chapter's lessons, all related textbook exercises, and the
// interactive sims that match the chapter's topic.

export interface ExerciseItem {
  id: number;
  book: string;
  subject: string;
  moduleTitle: string;
  module: number;
  lessonPath: string;
  section?: string;
  n?: number | null;
  quality: string;
  text: string;
}

let _exercises: ExerciseItem[] | null = null;
function allExercises(): ExerciseItem[] {
  if (_exercises) return _exercises;
  try {
    const file = path.join(process.cwd(), "public", "content", "exercises.json");
    _exercises = JSON.parse(fs.readFileSync(file, "utf8")) as ExerciseItem[];
  } catch {
    _exercises = [];
  }
  return _exercises;
}

// Ollama-cleaned versions, keyed by exercise id (produced by
// scripts/refine-exercises.mjs). Optional — falls back to the raw OCR text.
let _clean: Record<string, { statement: string; solution: string }> | null = null;
function cleanMap(): Record<string, { statement: string; solution: string }> {
  if (_clean) return _clean;
  try {
    const file = path.join(process.cwd(), "public", "content", "exercises-clean.json");
    _clean = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    _clean = {};
  }
  return _clean!;
}

// All exercises for a chapter (book + module). A cleaned version, when present,
// replaces the garbled OCR text and is marked quality:"clean".
export function matchExercises(subjectSlug: string, moduleOrder: number) {
  const clean = cleanMap();
  return allExercises()
    .filter((e) => e.book === subjectSlug && Number(e.module) === Number(moduleOrder))
    .map((e) => {
      const c = clean[String(e.id)];
      if (c && c.statement) {
        return { ...e, text: c.statement, solution: c.solution || "", quality: "clean" as const };
      }
      return { ...e, solution: "" };
    });
}


// All chapters (modules) the student studies, grouped by subject.
export async function buildChapters(userId: string) {
  const cls = await getStudentClass(userId);
  if (!cls) return null;
  const slugs = await accessibleSubjectSlugs(cls.id);

  const subjects = await prisma.subject.findMany({
    where: { slug: { in: slugs } },
    orderBy: { order: "asc" },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: {
          lessons: { where: { status: "PUBLISHED" }, orderBy: { order: "asc" }, select: { id: true } },
        },
      },
    },
  });

  const progressRows = await prisma.progress.findMany({ where: { studentId: userId } });
  const doneSet = new Set(progressRows.filter((p) => p.status === "COMPLETED").map((p) => p.lessonId));
  const locked = await lockedModuleIds(cls.id);

  // Every module is accessible by default; the only locked ones are those a
  // teacher has explicitly locked. "current" highlights the first not-yet-done
  // unlocked module — it is still fully accessible.
  let seenCurrent = false;
  return {
    className: cls.name,
    subjects: subjects
      .map((s) => {
        const chapters = s.modules
          .filter((m) => m.lessons.length > 0)
          .map((m) => {
            const lessonCount = m.lessons.length;
            const doneCount = m.lessons.filter((l) => doneSet.has(l.id)).length;
            const pct = lessonCount ? Math.round((doneCount / lessonCount) * 100) : 0;
            const isLocked = locked.has(m.id);
            let status: "done" | "current" | "available" | "locked";
            if (isLocked) status = "locked";
            else if (doneCount === lessonCount) status = "done";
            else if (!seenCurrent) { status = "current"; seenCurrent = true; }
            else status = "available";
            return {
              moduleId: m.id,
              title: m.title,
              order: m.order,
              lessonCount,
              doneCount,
              pct,
              status,
              exerciseCount: matchExercises(s.slug, m.order).length,
              sims: matchSimKeys(s.slug, m.title, s.name),
            };
          });
        return { slug: s.slug, name: s.name, color: s.color, icon: s.icon, chapters };
      })
      .filter((s) => s.chapters.length > 0),
  };
}

// One chapter's full practice payload: lessons (with highlights), exercises, sims.
export async function getChapter(userId: string, moduleId: string) {
  const cls = await getStudentClass(userId);
  if (!cls) return null;
  const slugs = await accessibleSubjectSlugs(cls.id);

  const mod = await prisma.module.findFirst({
    where: { id: moduleId, subjectSlug: { in: slugs } },
    include: {
      subject: true,
      lessons: {
        where: { status: "PUBLISHED" },
        orderBy: { order: "asc" },
        include: { quizzes: { select: { id: true } } },
      },
    },
  });
  if (!mod) return null;
  // Teacher-locked modules are not accessible to the student.
  const locked = await lockedModuleIds(cls.id);
  if (locked.has(mod.id)) return null;

  const lessonIds = mod.lessons.map((l) => l.id);
  const [progressRows, feedbackRows, siblings] = await Promise.all([
    prisma.progress.findMany({ where: { studentId: userId, lessonId: { in: lessonIds } } }),
    prisma.lessonFeedback.findMany({ where: { studentId: userId, lessonId: { in: lessonIds } } }),
    // Sibling modules of the same subject for prev/next nav + "module i of N".
    prisma.module.findMany({ where: { subjectSlug: mod.subjectSlug }, orderBy: { order: "asc" }, select: { id: true, title: true } }),
  ]);
  const doneSet = new Set(progressRows.filter((p) => p.status === "COMPLETED").map((p) => p.lessonId));
  const fbMap = new Map(feedbackRows.map((f) => [f.lessonId, { understanding: f.understanding, message: f.message ?? "", resolved: f.resolved }]));

  // All lessons in an accessible module are open. "current" just highlights the
  // first not-yet-done lesson; the rest are "available", none are locked.
  let seenCurrent = false;
  const lessons = mod.lessons.map((l, i) => {
    const done = doneSet.has(l.id);
    let status: "done" | "current" | "available";
    if (done) status = "done";
    else if (!seenCurrent) { status = "current"; seenCurrent = true; }
    else status = "available";
    return {
      id: l.id,
      title: l.title,
      order: i + 1,
      estMinutes: l.estMinutes,
      hasQuiz: l.quizzes.length > 0,
      done,
      status,
      feedback: fbMap.get(l.id) ?? null,
      ...extractHighlights(l.contentMd),
    };
  });

  const doneCount = lessons.filter((l) => l.done).length;
  const idx = siblings.findIndex((m) => m.id === mod.id);
  const continueLesson = lessons.find((l) => !l.done) || lessons[0] || null;

  return {
    moduleId: mod.id,
    title: mod.title,
    subjectSlug: mod.subjectSlug,
    subjectName: mod.subject.name,
    color: mod.subject.color,
    icon: mod.subject.icon,
    sims: matchSimKeys(mod.subjectSlug, mod.title, mod.subject.name),
    pct: lessons.length ? Math.round((doneCount / lessons.length) * 100) : 0,
    doneCount,
    moduleIndex: idx + 1,
    moduleTotal: siblings.length,
    prevModuleId: idx > 0 ? siblings[idx - 1].id : null,
    nextModuleId: idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1].id : null,
    continueLessonId: continueLesson?.id ?? null,
    lessons,
    exercises: matchExercises(mod.subjectSlug, mod.order).map((e) => ({
      id: e.id,
      n: e.n,
      section: e.section,
      quality: e.quality,
      text: e.text,
      solution: e.solution || "",
      subject: e.subject,
      moduleTitle: e.moduleTitle,
      module: e.module,
      lessonPath: e.lessonPath,
    })),
  };
}
