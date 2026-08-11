import { prisma } from "./db";
import type { SessionUser } from "./session";

// Admin « Contenu » domain: create/update whole books (Subjects), their Modules
// and Lessons directly in the DB — the runtime source of truth for student
// lessons/quizzes/copilot. (The static /manuels bundle is a separate, read-only
// import artifact; admin-created books surface via the student dashboard.)

async function audit(actor: SessionUser, action: string, targetType: string, targetId: string, meta?: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: {
      actorId: actor.userId,
      actorName: `${actor.firstName} ${actor.lastName}`,
      action,
      targetType,
      targetId,
      metaJson: meta ? JSON.stringify(meta) : null,
    },
  });
}

// Mirror of prisma/seed.ts subjectStyle — auto icon/colour from the name.
export function subjectStyle(label: string): { icon: string; color: string } {
  const s = label.toLowerCase();
  if (/(math|alg|géom|geom)/.test(s)) return { icon: "math", color: "#2563eb" };
  if (/(chim)/.test(s)) return { icon: "chimie", color: "#0d9488" };
  if (/(phys|électr|electr)/.test(s)) return { icon: "physique", color: "#ea580c" };
  if (/(bio|svt|vie|terre|nature)/.test(s)) return { icon: "svt", color: "#16a34a" };
  if (/(info|tech|sptic|numer)/.test(s)) return { icon: "sptic", color: "#7c3aed" };
  if (/(géo|geo|hist)/.test(s)) return { icon: "book", color: "#b45309" };
  return { icon: "book", color: "#4f46e5" };
}

function slugBase(s: string): string {
  return (
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "matiere"
  );
}

export async function slugifySubject(name: string): Promise<string> {
  const base = slugBase(name);
  let slug = base;
  for (let i = 2; await prisma.subject.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
  return slug;
}

// ───────────────────────────── Tree ──────────────────────────────────────────

export async function contentTree() {
  const subjects = await prisma.subject.findMany({
    orderBy: { order: "asc" },
    include: {
      modules: {
        orderBy: [{ classLevel: "asc" }, { order: "asc" }],
        include: {
          lessons: {
            orderBy: { order: "asc" },
            select: {
              id: true, title: true, status: true, order: true, authorId: true,
              _count: { select: { progress: true, quizzes: true } },
            },
          },
        },
      },
    },
  });
  return {
    subjects: subjects.map((s) => ({
      slug: s.slug,
      name: s.name,
      color: s.color,
      icon: s.icon,
      order: s.order,
      moduleCount: s.modules.length,
      lessonCount: s.modules.reduce((n, m) => n + m.lessons.length, 0),
      publishedCount: s.modules.reduce((n, m) => n + m.lessons.filter((l) => l.status === "PUBLISHED").length, 0),
      modules: s.modules.map((m) => ({
        id: m.id,
        title: m.title,
        classLevel: m.classLevel,
        order: m.order,
        lessons: m.lessons.map((l) => ({
          id: l.id,
          title: l.title,
          status: l.status,
          order: l.order,
          isBook: l.authorId == null,
          hasQuiz: l._count.quizzes > 0,
          progressCount: l._count.progress,
        })),
      })),
    })),
  };
}

// ───────────────────────────── Subjects ──────────────────────────────────────

export async function createSubject(actor: SessionUser, input: { name: string; color?: string; icon?: string }) {
  const name = (input.name ?? "").trim().slice(0, 60);
  if (!name) return { error: "NAME_REQUIRED" as const };
  const style = subjectStyle(name);
  const slug = await slugifySubject(name);
  const last = await prisma.subject.aggregate({ _max: { order: true } });
  const subject = await prisma.subject.create({
    data: { slug, name, color: input.color || style.color, icon: input.icon || style.icon, order: (last._max.order ?? 0) + 1 },
  });
  await audit(actor, "CONTENT_SUBJECT_CREATE", "subject", slug, { name });
  return { ok: true as const, subject };
}

export async function updateSubject(actor: SessionUser, slug: string, input: { name?: string; color?: string; icon?: string; order?: number }) {
  const existing = await prisma.subject.findUnique({ where: { slug } });
  if (!existing) return { error: "NOT_FOUND" as const };
  const data: Record<string, unknown> = {};
  if (input.name?.trim()) data.name = input.name.trim().slice(0, 60);
  if (input.color) data.color = input.color;
  if (input.icon) data.icon = input.icon;
  if (typeof input.order === "number") data.order = input.order;
  await prisma.subject.update({ where: { slug }, data });
  await audit(actor, "CONTENT_SUBJECT_UPDATE", "subject", slug, data);
  return { ok: true as const };
}

// A subject with real student work (progress/quiz attempts) must not vanish.
export async function deleteSubject(actor: SessionUser, slug: string) {
  const subject = await prisma.subject.findUnique({ where: { slug } });
  if (!subject) return { error: "NOT_FOUND" as const };
  const progress = await prisma.progress.count({ where: { lesson: { module: { subjectSlug: slug } } } });
  const attempts = await prisma.quizAttempt.count({ where: { quiz: { lesson: { module: { subjectSlug: slug } } } } });
  if (progress > 0 || attempts > 0) return { error: "SUBJECT_HAS_PROGRESS" as const };
  await prisma.subject.delete({ where: { slug } }); // cascades modules → lessons
  await audit(actor, "CONTENT_SUBJECT_DELETE", "subject", slug, { name: subject.name });
  return { ok: true as const };
}

// ───────────────────────────── Modules ───────────────────────────────────────

const LEVELS = ["5e", "6e", "examen"];

export async function createModule(actor: SessionUser, input: { subjectSlug: string; classLevel: string; title: string }) {
  const title = (input.title ?? "").trim().slice(0, 90);
  if (!title) return { error: "TITLE_REQUIRED" as const };
  if (!LEVELS.includes(input.classLevel)) return { error: "BAD_LEVEL" as const };
  const subject = await prisma.subject.findUnique({ where: { slug: input.subjectSlug } });
  if (!subject) return { error: "NOT_FOUND" as const };
  const last = await prisma.module.aggregate({ where: { subjectSlug: input.subjectSlug, classLevel: input.classLevel }, _max: { order: true } });
  const module = await prisma.module.create({
    data: { subjectSlug: input.subjectSlug, classLevel: input.classLevel, title, order: (last._max.order ?? 0) + 1 },
  });
  await audit(actor, "CONTENT_MODULE_CREATE", "module", module.id, { title, subjectSlug: input.subjectSlug });
  return { ok: true as const, module };
}

export async function updateModule(actor: SessionUser, id: string, input: { title?: string; classLevel?: string; order?: number }) {
  const existing = await prisma.module.findUnique({ where: { id } });
  if (!existing) return { error: "NOT_FOUND" as const };
  const data: Record<string, unknown> = {};
  if (input.title?.trim()) data.title = input.title.trim().slice(0, 90);
  if (input.classLevel && LEVELS.includes(input.classLevel)) data.classLevel = input.classLevel;
  if (typeof input.order === "number") data.order = input.order;
  await prisma.module.update({ where: { id }, data });
  await audit(actor, "CONTENT_MODULE_UPDATE", "module", id, data);
  return { ok: true as const };
}

export async function reorderModules(actor: SessionUser, subjectSlug: string, ids: string[]) {
  const modules = await prisma.module.findMany({ where: { subjectSlug }, select: { id: true } });
  const known = new Set(modules.map((m) => m.id));
  const ordered = ids.filter((id) => known.has(id));
  await prisma.$transaction(ordered.map((id, i) => prisma.module.update({ where: { id }, data: { order: i + 1 } })));
  await audit(actor, "CONTENT_MODULE_REORDER", "subject", subjectSlug, { count: ordered.length });
  return { ok: true as const };
}

export async function deleteModule(actor: SessionUser, id: string) {
  const module = await prisma.module.findUnique({ where: { id }, include: { lessons: { select: { id: true } } } });
  if (!module) return { error: "NOT_FOUND" as const };
  if (module.lessons.length > 0) {
    const progress = await prisma.progress.count({ where: { lesson: { moduleId: id } } });
    if (progress > 0) return { error: "MODULE_HAS_PROGRESS" as const };
    return { error: "MODULE_HAS_LESSONS" as const };
  }
  await prisma.module.delete({ where: { id } });
  await audit(actor, "CONTENT_MODULE_DELETE", "module", id, { title: module.title });
  return { ok: true as const };
}

// Force-delete a module together with its lessons — only when no student work exists.
export async function deleteModuleWithLessons(actor: SessionUser, id: string) {
  const module = await prisma.module.findUnique({ where: { id } });
  if (!module) return { error: "NOT_FOUND" as const };
  const progress = await prisma.progress.count({ where: { lesson: { moduleId: id } } });
  const attempts = await prisma.quizAttempt.count({ where: { quiz: { lesson: { moduleId: id } } } });
  if (progress > 0 || attempts > 0) return { error: "MODULE_HAS_PROGRESS" as const };
  await prisma.module.delete({ where: { id } }); // cascades lessons
  await audit(actor, "CONTENT_MODULE_DELETE", "module", id, { title: module.title, withLessons: true });
  return { ok: true as const };
}

// ───────────────────────────── Lessons ───────────────────────────────────────

export async function reorderLessons(actor: SessionUser, moduleId: string, ids: string[]) {
  const lessons = await prisma.lesson.findMany({ where: { moduleId }, select: { id: true } });
  const known = new Set(lessons.map((l) => l.id));
  const ordered = ids.filter((id) => known.has(id));
  await prisma.$transaction(ordered.map((id, i) => prisma.lesson.update({ where: { id }, data: { order: i + 1 } })));
  await audit(actor, "CONTENT_LESSON_REORDER", "module", moduleId, { count: ordered.length });
  return { ok: true as const };
}

export async function deleteBookLesson(actor: SessionUser, id: string) {
  const lesson = await prisma.lesson.findUnique({ where: { id } });
  if (!lesson) return { error: "NOT_FOUND" as const };
  const progress = await prisma.progress.count({ where: { lessonId: id } });
  const attempts = await prisma.quizAttempt.count({ where: { quiz: { lessonId: id } } });
  if (progress > 0 || attempts > 0) return { error: "LESSON_HAS_PROGRESS" as const };
  await prisma.lesson.delete({ where: { id } });
  await audit(actor, "CONTENT_LESSON_DELETE", "lesson", id, { title: lesson.title });
  return { ok: true as const };
}
