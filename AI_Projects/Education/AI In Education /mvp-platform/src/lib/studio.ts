import { prisma } from "./db";
import type { SessionUser } from "./session";

// Subjects a user may edit: ADMIN → all; TEACHER → their assigned subjects.
export async function editableSubjectSlugs(user: SessionUser): Promise<string[]> {
  if (user.role === "ADMIN") {
    const all = await prisma.subject.findMany({ select: { slug: true } });
    return all.map((s) => s.slug);
  }
  const tas = await prisma.teacherAssignment.findMany({ where: { teacherId: user.userId }, select: { subjectSlug: true } });
  return [...new Set(tas.map((t) => t.subjectSlug))];
}

export async function studioTree(user: SessionUser) {
  const slugs = await editableSubjectSlugs(user);
  const subjects = await prisma.subject.findMany({
    where: { slug: { in: slugs } },
    orderBy: { order: "asc" },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: { lessons: { orderBy: { order: "asc" }, select: { id: true, title: true, status: true, order: true } } },
      },
    },
  });
  return {
    subjects: subjects.map((s) => ({
      slug: s.slug,
      name: s.name,
      icon: s.icon,
      color: s.color,
      modules: s.modules.map((m) => ({
        id: m.id,
        title: m.title,
        order: m.order,
        lessons: m.lessons,
      })),
    })),
  };
}

export async function getEditableLesson(user: SessionUser, lessonId: string) {
  const slugs = await editableSubjectSlugs(user);
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, module: { subjectSlug: { in: slugs } } },
    include: { module: { include: { subject: true } } },
  });
  return lesson;
}

export async function lessonForEdit(user: SessionUser, lessonId: string) {
  const lesson = await getEditableLesson(user, lessonId);
  if (!lesson) return null;

  const quiz = await prisma.quiz.findFirst({ where: { lessonId }, include: { questions: { orderBy: { order: "asc" } } } });
  const versionRows = await prisma.lessonVersion.findMany({ where: { lessonId }, orderBy: { version: "desc" }, take: 20 });
  const editorIds = [...new Set(versionRows.map((v) => v.editedById).filter(Boolean) as string[])];
  const editors = await prisma.user.findMany({ where: { id: { in: editorIds } }, select: { id: true, firstName: true, lastName: true } });
  const editorMap = new Map(editors.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));

  const assignments = await prisma.assignment.findMany({ where: { lessonId }, include: { class: true } });

  return {
    lesson: {
      id: lesson.id,
      title: lesson.title,
      contentMd: lesson.contentMd,
      estMinutes: lesson.estMinutes,
      status: lesson.status,
      subjectName: lesson.module.subject.name,
      moduleTitle: lesson.module.title,
      icon: lesson.module.subject.icon,
      color: lesson.module.subject.color,
    },
    quiz: quiz
      ? {
          id: quiz.id,
          title: quiz.title,
          questions: quiz.questions.map((q) => ({
            id: q.id,
            type: q.type,
            promptMd: q.promptMd,
            options: q.optionsJson ? (JSON.parse(q.optionsJson) as string[]) : [],
            answer: JSON.parse(q.answerJson),
            explanationMd: q.explanationMd ?? "",
          })),
        }
      : null,
    versions: versionRows.map((v) => ({
      version: v.version,
      editedBy: v.editedById ? editorMap.get(v.editedById) ?? "—" : "—",
      createdAt: v.createdAt.toISOString(),
      preview: v.contentMd.slice(0, 80),
    })),
    assignments: assignments.map((a) => ({ id: a.id, classId: a.classId, className: a.class.name, dueDate: a.dueDate ? a.dueDate.toISOString() : null })),
  };
}

async function snapshot(lessonId: string, contentMd: string, editedById: string) {
  const max = await prisma.lessonVersion.aggregate({ where: { lessonId }, _max: { version: true } });
  const next = (max._max.version ?? 0) + 1;
  await prisma.lessonVersion.create({ data: { lessonId, version: next, contentMd, editedById } });
  return next;
}

export async function saveLesson(user: SessionUser, lessonId: string, data: { contentMd: string; title?: string; estMinutes?: number }) {
  const lesson = await getEditableLesson(user, lessonId);
  if (!lesson) return null;
  // Snapshot the PREVIOUS content as a restorable version, then overwrite.
  const version = await snapshot(lessonId, lesson.contentMd, user.userId);
  await prisma.lesson.update({
    where: { id: lessonId },
    data: { contentMd: data.contentMd, ...(data.title ? { title: data.title } : {}), ...(data.estMinutes ? { estMinutes: data.estMinutes } : {}) },
  });
  await prisma.auditLog.create({ data: { actorId: user.userId, actorName: `${user.firstName} ${user.lastName}`, action: "LESSON_EDIT", targetType: "lesson", targetId: lessonId, metaJson: JSON.stringify({ version }) } });
  return { version };
}

export async function setStatus(user: SessionUser, lessonId: string, status: "PUBLISHED" | "DRAFT") {
  const lesson = await getEditableLesson(user, lessonId);
  if (!lesson) return null;
  await prisma.lesson.update({ where: { id: lessonId }, data: { status } });
  await prisma.auditLog.create({ data: { actorId: user.userId, actorName: `${user.firstName} ${user.lastName}`, action: status === "PUBLISHED" ? "LESSON_PUBLISH" : "LESSON_UNPUBLISH", targetType: "lesson", targetId: lessonId } });
  return { status };
}

export async function restoreVersion(user: SessionUser, lessonId: string, version: number) {
  const lesson = await getEditableLesson(user, lessonId);
  if (!lesson) return null;
  const v = await prisma.lessonVersion.findUnique({ where: { lessonId_version: { lessonId, version } } });
  if (!v) return null;
  // Snapshot current, then restore.
  await snapshot(lessonId, lesson.contentMd, user.userId);
  await prisma.lesson.update({ where: { id: lessonId }, data: { contentMd: v.contentMd } });
  await prisma.auditLog.create({ data: { actorId: user.userId, actorName: `${user.firstName} ${user.lastName}`, action: "LESSON_RESTORE", targetType: "lesson", targetId: lessonId, metaJson: JSON.stringify({ version }) } });
  return { contentMd: v.contentMd };
}

type QInput = { type: string; promptMd: string; options?: string[]; answer: unknown; explanationMd?: string };

export async function saveQuiz(user: SessionUser, lessonId: string, data: { title?: string; questions: QInput[] }) {
  const lesson = await getEditableLesson(user, lessonId);
  if (!lesson) return null;
  let quiz = await prisma.quiz.findFirst({ where: { lessonId } });
  if (!quiz) {
    quiz = await prisma.quiz.create({ data: { lessonId, title: data.title || `Quiz — ${lesson.title}` } });
  } else if (data.title) {
    await prisma.quiz.update({ where: { id: quiz.id }, data: { title: data.title } });
  }
  await prisma.question.deleteMany({ where: { quizId: quiz.id } });
  let order = 0;
  for (const q of data.questions) {
    await prisma.question.create({
      data: {
        quizId: quiz.id,
        type: q.type,
        promptMd: q.promptMd,
        optionsJson: q.type === "MCQ" ? JSON.stringify(q.options ?? []) : null,
        answerJson: JSON.stringify(q.answer),
        explanationMd: q.explanationMd || null,
        order: order++,
      },
    });
  }
  await prisma.auditLog.create({ data: { actorId: user.userId, actorName: `${user.firstName} ${user.lastName}`, action: "QUIZ_EDIT", targetType: "lesson", targetId: lessonId, metaJson: JSON.stringify({ count: data.questions.length }) } });
  return { quizId: quiz.id };
}

export async function assignLesson(user: SessionUser, data: { classId: string; lessonId: string; dueDate?: string | null }) {
  const lesson = await getEditableLesson(user, data.lessonId);
  if (!lesson) return null;
  const due = data.dueDate ? new Date(data.dueDate) : null;
  await prisma.assignment.upsert({
    where: { classId_lessonId: { classId: data.classId, lessonId: data.lessonId } },
    update: { dueDate: due, createdById: user.userId },
    create: { classId: data.classId, lessonId: data.lessonId, dueDate: due, createdById: user.userId },
  });
  await prisma.auditLog.create({ data: { actorId: user.userId, actorName: `${user.firstName} ${user.lastName}`, action: "LESSON_ASSIGN", targetType: "lesson", targetId: data.lessonId, metaJson: JSON.stringify({ classId: data.classId, dueDate: data.dueDate ?? null }) } });
  return { ok: true };
}

// Classes the user can assign to (teacher's classes / all for admin).
export async function assignableClasses(user: SessionUser) {
  if (user.role === "ADMIN") {
    return prisma.classGroup.findMany({ where: { isArchived: false }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  }
  const tas = await prisma.teacherAssignment.findMany({ where: { teacherId: user.userId }, include: { class: true } });
  const map = new Map(tas.map((t) => [t.classId, { id: t.class.id, name: t.class.name }]));
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
