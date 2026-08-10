import { prisma } from "./db";
import type { SessionUser } from "./session";
import { audit } from "./auth";
import { editableSubjectSlugs, classScope } from "./studio";
import { matchExercisesFixed } from "./practice";

// Teacher "Exercices" feature. Two kinds of exercises coexist:
//  • Book exercises — file-based (public/content/exercises.json + -clean.json),
//    read-only, implicitly linked to their chapter (subjectSlug + module order).
//    Never stored in the DB; merged into the tree at read time.
//  • Custom exercises — Prisma Exercise rows authored by a teacher, linkable to
//    any number of modules/lessons of the same subject (ExerciseLink rows).

export interface LinkInput {
  moduleId?: string | null;
  lessonId?: string | null;
}

const exerciseShape = {
  include: { links: { select: { id: true, moduleId: true, lessonId: true } } },
} as const;

function toDto(e: {
  id: string; authorId: string; subjectSlug: string; title: string;
  statementMd: string; solutionMd: string; status: string;
  links: { id: string; moduleId: string | null; lessonId: string | null }[];
}, userId: string) {
  return {
    id: e.id,
    title: e.title,
    statementMd: e.statementMd,
    solutionMd: e.solutionMd,
    status: e.status,
    subjectSlug: e.subjectSlug,
    mine: e.authorId === userId,
    links: e.links,
  };
}

// The full canvas payload for one class: its books, each with modules (level-
// filtered), lessons, the chapter's book exercises, and the teacher's custom
// exercises for that subject. Mirrors studioTree()'s scoping.
// « Révision EXETAT » is the national end-of-secondary exam, not a course with a
// manual. Its book is a collection of past papers spanning nine disciplines, so
// "the exercises of this chapter" means nothing there — and it is assigned to
// every teacher, which put an empty extra tab in front of all of them. It stays
// available everywhere else (studio, programme); it is only the exercises canvas
// that has nothing to say about it.
const EXAM_ONLY_SUBJECTS = ["sciences-1-exetat"];

export async function exercisesTree(user: SessionUser, classId?: string | null) {
  let slugs = (await editableSubjectSlugs(user)).filter((s) => !EXAM_ONLY_SUBJECTS.includes(s));
  let classLevel: string | null = null;

  if (classId) {
    const scope = await classScope(user, classId);
    if (!scope) return null;
    const allowed = new Set(scope.subjectSlugs);
    slugs = slugs.filter((s) => allowed.has(s));
    classLevel = scope.level;
  }

  const subjects = await prisma.subject.findMany({
    where: { slug: { in: slugs } },
    orderBy: { order: "asc" },
    include: {
      modules: {
        where: classLevel ? { OR: [{ classLevel }, { classLevel: null }] } : {},
        orderBy: { order: "asc" },
        include: {
          lessons: {
            where: { status: "PUBLISHED" },
            orderBy: { order: "asc" },
            select: { id: true, title: true, order: true },
          },
        },
      },
    },
  });

  const custom = await prisma.exercise.findMany({
    where: {
      subjectSlug: { in: slugs },
      ...(user.role === "ADMIN" ? {} : { authorId: user.userId }),
    },
    orderBy: { createdAt: "desc" },
    ...exerciseShape,
  });
  const customBySubject = new Map<string, typeof custom>();
  for (const e of custom) {
    if (!customBySubject.has(e.subjectSlug)) customBySubject.set(e.subjectSlug, []);
    customBySubject.get(e.subjectSlug)!.push(e);
  }

  // Teacher-placed "this exercise belongs to that lesson" links for book
  // exercises. Fetched in one query and grouped by exId rather than per exercise:
  // a maths-6 chapter alone carries 871 of them.
  const bookLinkRows = await prisma.bookExerciseLink.findMany({
    select: { id: true, exId: true, lessonId: true, lesson: { select: { title: true } } },
  });
  const bookLinks = new Map<number, { id: string; lessonId: string; lessonTitle: string }[]>();
  for (const r of bookLinkRows) {
    const list = bookLinks.get(r.exId) ?? [];
    list.push({ id: r.id, lessonId: r.lessonId, lessonTitle: r.lesson.title });
    bookLinks.set(r.exId, list);
  }

  return {
    subjects: await Promise.all(subjects.map(async (s) => {
      const modules = await Promise.all(s.modules.map(async (m) => ({
        id: m.id,
        title: m.title,
        order: m.order,
        lessons: m.lessons,
        bookExercises: (await matchExercisesFixed(s.slug, m.order)).map((e) => ({
          id: e.id,
          n: e.n ?? null,
          section: e.section ?? "",
          quality: e.quality,
          reconstructed: e.reconstructed,
          fixed: e.fixed,
          complete: e.complete,
          text: e.text,
          solution: e.solution || "",
          links: bookLinks.get(Number(e.id)) ?? [],
          bookTitle: e.bookTitle ?? "",
        })),
      })));
      // One subject is one manual, so the title of any of its exercises is the
      // title of the book. Taken from the first that carries one — the older OCR
      // payloads predate the field, and a subject with no exercises has none.
      const bookTitle = modules.flatMap((m) => m.bookExercises).find((e) => e.bookTitle)?.bookTitle ?? "";
      return {
        slug: s.slug,
        name: s.name,
        icon: s.icon,
        color: s.color,
        bookTitle,
        modules,
        custom: (customBySubject.get(s.slug) ?? []).map((e) => toDto(e, user.userId)),
      };
    })),
    classLevel,
  };
}

// A link target must belong to the exercise's subject (and, for lessons, sit in
// a module of that subject). Returns a normalized {moduleId|lessonId} or null.
async function validateLink(subjectSlug: string, link: LinkInput): Promise<{ moduleId: string | null; lessonId: string | null } | null> {
  const moduleId = link.moduleId || null;
  const lessonId = link.lessonId || null;
  if ((moduleId ? 1 : 0) + (lessonId ? 1 : 0) !== 1) return null;
  if (moduleId) {
    const mod = await prisma.module.findFirst({ where: { id: moduleId, subjectSlug }, select: { id: true } });
    return mod ? { moduleId, lessonId: null } : null;
  }
  const lesson = await prisma.lesson.findFirst({ where: { id: lessonId!, module: { subjectSlug } }, select: { id: true } });
  return lesson ? { moduleId: null, lessonId } : null;
}

export async function createExercise(
  user: SessionUser,
  data: { subjectSlug: string; title?: string; statementMd: string; solutionMd?: string; moduleId?: string | null; lessonId?: string | null },
) {
  const slugs = await editableSubjectSlugs(user);
  if (!slugs.includes(data.subjectSlug)) return null;
  if (!data.statementMd?.trim()) return null;

  let initialLink: { moduleId: string | null; lessonId: string | null } | null = null;
  if (data.moduleId || data.lessonId) {
    initialLink = await validateLink(data.subjectSlug, data);
    if (!initialLink) return null;
  }

  const exercise = await prisma.exercise.create({
    data: {
      authorId: user.userId,
      subjectSlug: data.subjectSlug,
      title: (data.title ?? "").trim().slice(0, 120),
      statementMd: data.statementMd,
      solutionMd: data.solutionMd ?? "",
      ...(initialLink ? { links: { create: initialLink } } : {}),
    },
    ...exerciseShape,
  });
  await audit("EXERCISE_CREATE", {
    actorId: user.userId,
    actorName: `${user.firstName} ${user.lastName}`,
    targetType: "exercise",
    targetId: exercise.id,
    meta: { subjectSlug: data.subjectSlug, moduleId: initialLink?.moduleId ?? null, lessonId: initialLink?.lessonId ?? null },
  });
  return toDto(exercise, user.userId);
}

// Own exercises only (admin: any). Book exercises never reach here — they have
// no DB row to begin with.
async function getOwnExercise(user: SessionUser, id: string) {
  const e = await prisma.exercise.findUnique({ where: { id } });
  if (!e) return null;
  if (user.role !== "ADMIN" && e.authorId !== user.userId) return null;
  return e;
}

export async function updateExercise(user: SessionUser, id: string, data: { title?: string; statementMd?: string; solutionMd?: string }) {
  const existing = await getOwnExercise(user, id);
  if (!existing) return null;
  if (data.statementMd !== undefined && !data.statementMd.trim()) return null;
  const exercise = await prisma.exercise.update({
    where: { id },
    data: {
      ...(data.title !== undefined ? { title: data.title.trim().slice(0, 120) } : {}),
      ...(data.statementMd !== undefined ? { statementMd: data.statementMd } : {}),
      ...(data.solutionMd !== undefined ? { solutionMd: data.solutionMd } : {}),
    },
    ...exerciseShape,
  });
  await audit("EXERCISE_UPDATE", {
    actorId: user.userId,
    actorName: `${user.firstName} ${user.lastName}`,
    targetType: "exercise",
    targetId: id,
  });
  return toDto(exercise, user.userId);
}

export async function deleteExercise(user: SessionUser, id: string) {
  const existing = await getOwnExercise(user, id);
  if (!existing) return null;
  await prisma.exercise.delete({ where: { id } });
  await audit("EXERCISE_DELETE", {
    actorId: user.userId,
    actorName: `${user.firstName} ${user.lastName}`,
    targetType: "exercise",
    targetId: id,
    meta: { title: existing.title || existing.statementMd.slice(0, 60) },
  });
  return { ok: true };
}

// Replace-all link semantics: the canvas posts the full set (connect = current
// set + new edge, detach = set minus one). Duplicates collapse silently.
export async function setExerciseLinks(user: SessionUser, id: string, links: LinkInput[]) {
  const existing = await getOwnExercise(user, id);
  if (!existing) return null;

  const seen = new Set<string>();
  const valid: { moduleId: string | null; lessonId: string | null }[] = [];
  for (const link of links ?? []) {
    const v = await validateLink(existing.subjectSlug, link);
    if (!v) return null;
    const key = `${v.moduleId ?? ""}:${v.lessonId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push(v);
  }

  await prisma.$transaction([
    prisma.exerciseLink.deleteMany({ where: { exerciseId: id } }),
    ...(valid.length ? [prisma.exerciseLink.createMany({ data: valid.map((v) => ({ exerciseId: id, ...v })) })] : []),
  ]);
  await audit("EXERCISE_LINKS_SET", {
    actorId: user.userId,
    actorName: `${user.firstName} ${user.lastName}`,
    targetType: "exercise",
    targetId: id,
    meta: { count: valid.length },
  });
  const rows = await prisma.exerciseLink.findMany({ where: { exerciseId: id }, select: { id: true, moduleId: true, lessonId: true } });
  return { links: rows };
}

// ---- Student-side visibility ----
// An exercise is visible to class C when it is PUBLISHED, linked to the chapter
// (directly or via one of its lessons), and either targeted at C or untargeted
// (classId null) with its author teaching that subject in C.

async function classSubjectTeachers(classId: string): Promise<Map<string, Set<string>>> {
  const tas = await prisma.teacherAssignment.findMany({ where: { classId }, select: { teacherId: true, subjectSlug: true } });
  const bySubject = new Map<string, Set<string>>();
  for (const t of tas) {
    if (!bySubject.has(t.subjectSlug)) bySubject.set(t.subjectSlug, new Set());
    bySubject.get(t.subjectSlug)!.add(t.teacherId);
  }
  return bySubject;
}

export async function customExercisesForChapter(classId: string, moduleId: string) {
  const candidates = await prisma.exercise.findMany({
    where: {
      status: "PUBLISHED",
      links: { some: { OR: [{ moduleId }, { lesson: { moduleId } }] } },
      OR: [{ classId }, { classId: null }],
    },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (candidates.length === 0) return [];
  // Prisma can't correlate exercise.subjectSlug into the assignment filter —
  // check "author teaches this subject in this class" in JS (volumes are tiny).
  const teachers = await classSubjectTeachers(classId);
  return candidates
    .filter((e) => e.classId === classId || teachers.get(e.subjectSlug)?.has(e.authorId))
    .map((e) => ({
      id: e.id,
      title: e.title,
      statementMd: e.statementMd,
      solutionMd: e.solutionMd,
      authorName: `${e.author.firstName} ${e.author.lastName}`,
    }));
}

// Per-module visible-exercise counts for the Atelier hub chapter cards, in one
// pass over the class's custom exercises (avoids an N+1 per module).
export async function customCountsByModule(classId: string, moduleIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (moduleIds.length === 0) return counts;
  const rows = await prisma.exercise.findMany({
    where: {
      status: "PUBLISHED",
      links: { some: { OR: [{ moduleId: { in: moduleIds } }, { lesson: { moduleId: { in: moduleIds } } }] } },
      OR: [{ classId }, { classId: null }],
    },
    select: {
      authorId: true,
      classId: true,
      subjectSlug: true,
      links: { select: { moduleId: true, lesson: { select: { moduleId: true } } } },
    },
  });
  if (rows.length === 0) return counts;
  const teachers = await classSubjectTeachers(classId);
  const wanted = new Set(moduleIds);
  for (const e of rows) {
    if (e.classId !== classId && !teachers.get(e.subjectSlug)?.has(e.authorId)) continue;
    const mods = new Set<string>();
    for (const l of e.links) {
      const mid = l.moduleId ?? l.lesson?.moduleId;
      if (mid && wanted.has(mid)) mods.add(mid);
    }
    for (const mid of mods) counts.set(mid, (counts.get(mid) ?? 0) + 1);
  }
  return counts;
}
