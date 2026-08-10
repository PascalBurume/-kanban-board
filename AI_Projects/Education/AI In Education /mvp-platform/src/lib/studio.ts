import { prisma } from "./db";
import type { SessionUser } from "./session";
import { BLANK_CONTENT } from "./lessonSkeleton";
import { archiveAndDelete, restoreArchive, purgeArchive } from "./lessonArchive";

// Subjects a user may edit: ADMIN → all; TEACHER → their assigned subjects.
export async function editableSubjectSlugs(user: SessionUser): Promise<string[]> {
  if (user.role === "ADMIN") {
    const all = await prisma.subject.findMany({ select: { slug: true } });
    return all.map((s) => s.slug);
  }
  const tas = await prisma.teacherAssignment.findMany({ where: { teacherId: user.userId }, select: { subjectSlug: true } });
  return [...new Set(tas.map((t) => t.subjectSlug))];
}

export interface ClassScope {
  classId: string;
  level: string;
  subjectSlugs: string[];
}

// The books in scope for one class, plus its level. Returns null when the user
// may not view the class — for a teacher that means a class they don't teach.
//
// The two roles resolve the books differently on purpose. A teacher sees what
// *they* teach in the class (their TeacherAssignment rows, which double as the
// authorization check). An admin sees what the class *studies* per curriculum
// (its Offerings), because an admin holds no assignments and a class can be
// offered a book that has no teacher yet.
export async function classScope(user: SessionUser, classId: string): Promise<ClassScope | null> {
  const cls = await prisma.classGroup.findFirst({
    where: { id: classId, isArchived: false },
    select: { id: true, level: true, field: true },
  });
  if (!cls) return null;

  if (user.role === "ADMIN") {
    const offerings = await prisma.offering.findMany({
      where: { level: cls.level, field: cls.field ?? "" },
      select: { subjectSlug: true },
    });
    return { classId: cls.id, level: cls.level, subjectSlugs: offerings.map((o) => o.subjectSlug) };
  }

  const tas = await prisma.teacherAssignment.findMany({
    where: { teacherId: user.userId, classId },
    select: { subjectSlug: true },
  });
  if (tas.length === 0) return null;
  return { classId: cls.id, level: cls.level, subjectSlugs: [...new Set(tas.map((t) => t.subjectSlug))] };
}

/**
 * One of the teacher's own lessons, summarised for a list.
 *
 * The excerpt and the count are computed HERE rather than shipping contentMd: an
 * admin's library is every authored lesson in the school, and sending each one's full
 * markdown to draw a card is a page that gets slower every term.
 *
 * `untitled` matters more than it looks. Every new lesson is created as « Nouvelle
 * leçon », so a teacher with three of them sees the same name three times and cannot
 * tell which is which — the flag lets the list say so instead of repeating itself.
 */
function libCard(
  l: { id: string; title: string; status: string; moduleId: string | null; contentMd: string },
  editedAt: number | null,
) {
  // Strip the things that are markup rather than prose, so the excerpt reads like the
  // lesson: headings' hashes, formulas, figure blocks, raw SVG.
  const prose = (l.contentMd || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<figure[\s\S]*?<\/figure>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]*\$/g, " ")
    // A whole table reads as noise in one line of preview — "Classe Effectif --- ---
    // [0;5[ 4" is not a sentence. Drop the delimiter row and the rows of cells; the
    // heading above the table is what tells the teacher what this lesson is.
    .replace(/^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/gm, " ")
    .replace(/^\s*\|.*\|\s*$/gm, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = prose ? prose.split(" ").filter(Boolean).length : 0;
  return {
    id: l.id,
    title: l.title,
    status: l.status,
    moduleId: l.moduleId,
    untitled: l.title.trim() === "Nouvelle leçon",
    blank: isBlank(l.contentMd || ""),
    words,
    excerpt: prose.slice(0, 140),
    editedAt,
  };
}

/** A lesson still holding nothing but the starter skeleton. */
function isBlank(md: string): boolean {
  const strip = (s: string) => s.replace(/\s+/g, " ").trim();
  return strip(md) === "" || strip(md) === strip(BLANK_CONTENT);
}

/**
 * Everything the user may WRITE — their own lessons and the books they could start one
 * in — across every class, with no class scope at all.
 *
 * « Rédiger une leçon » used to build its start screen from `studioTree()`, which is
 * class-scoped on purpose: you edit one class's manual there. With no `?class=` a teacher
 * gets `classes[0]`, so the start screen showed one class's books and silently hid every
 * lesson written for the others — a teacher of 5e and 6e could see neither her 6e drafts
 * nor a way to begin a new one. A personal library is not owned by a class.
 *
 * Subjects still gate the list: a lesson in a book you no longer teach is one the editor
 * would refuse to open, so listing it would only offer a dead link.
 */
export async function studioLibrary(user: SessionUser) {
  const slugs = await editableSubjectSlugs(user);
  const [subjects, authored] = await Promise.all([
    prisma.subject.findMany({ where: { slug: { in: slugs } }, orderBy: { order: "asc" }, select: { slug: true, name: true } }),
    prisma.lesson.findMany({
      where: { authorId: user.role === "ADMIN" ? { not: null } : user.userId, subjectSlug: { in: slugs } },
      select: { id: true, title: true, status: true, moduleId: true, subjectSlug: true, contentMd: true },
    }),
  ]);

  // Same "last written" derivation as studioTree — Lesson has no updatedAt, so the newest
  // snapshot stands in for it.
  const lastEdits = authored.length
    ? await prisma.lessonVersion.groupBy({
        by: ["lessonId"],
        where: { lessonId: { in: authored.map((l) => l.id) } },
        _max: { createdAt: true },
      })
    : [];
  const editedAt = new Map(lastEdits.map((e) => [e.lessonId, e._max.createdAt?.getTime() ?? null]));
  const nameOf = new Map(subjects.map((s) => [s.slug, s.name]));

  return {
    subjects: subjects.map((s) => ({ slug: s.slug, name: s.name })),
    // Newest first: the lesson you were just in is the one you are coming back for.
    drafts: authored
      .map((l) => ({ ...libCard(l, editedAt.get(l.id) ?? null), subjectName: nameOf.get(l.subjectSlug ?? "") ?? "" }))
      .sort((a, b) => (b.editedAt ?? 0) - (a.editedAt ?? 0)),
  };
}

// classId scopes the tree to that class's books, with modules narrowed to its
// level. Omitted (admin "tous les manuels") → every editable subject, unfiltered.
// Returns null when classId is set but not viewable by this user.
export async function studioTree(user: SessionUser, classId?: string | null) {
  let slugs = await editableSubjectSlugs(user);
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
        // null classLevel = book shared across levels → matches any class
        where: classLevel ? { OR: [{ classLevel }, { classLevel: null }] } : {},
        orderBy: { order: "asc" },
        include: { lessons: { orderBy: { order: "asc" }, select: { id: true, title: true, status: true, order: true, authorId: true } } },
      },
    },
  });
  // The teacher's own authored lessons (attached + unattached) per subject — powers the
  // "Ma bibliothèque" panel and the connector canvas (cards + their current module link).
  const authored = await prisma.lesson.findMany({
    where: { authorId: user.role === "ADMIN" ? { not: null } : user.userId, subjectSlug: { in: slugs } },
    select: { id: true, title: true, status: true, moduleId: true, subjectSlug: true, contentMd: true },
    orderBy: { title: "asc" },
  });

  // When a lesson was last written to. Lesson has no updatedAt — rather than migrate
  // for it, take the newest snapshot, which is exactly "the last writing session".
  // Since the churn fix those are ~10 minutes apart at worst, which is well inside the
  // precision of "modifiée il y a 2 h".
  const lastEdits = authored.length
    ? await prisma.lessonVersion.groupBy({
        by: ["lessonId"],
        where: { lessonId: { in: authored.map((l) => l.id) } },
        _max: { createdAt: true },
      })
    : [];
  const editedAt = new Map(lastEdits.map((e) => [e.lessonId, e._max.createdAt?.getTime() ?? null]));

  const libBySubject = new Map<string, ReturnType<typeof libCard>[]>();
  for (const l of authored) {
    const key = l.subjectSlug ?? "";
    if (!libBySubject.has(key)) libBySubject.set(key, []);
    libBySubject.get(key)!.push(libCard(l, editedAt.get(l.id) ?? null));
  }
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
      library: libBySubject.get(s.slug) ?? [],
    })),
    classLevel,
  };
}

// Create a new DRAFT lesson at the end of a module. Content authoring is
// admin-only (teachers author quizzes, not lessons).
export async function createLesson(user: SessionUser, moduleId: string) {
  if (user.role !== "ADMIN") return null;
  const slugs = await editableSubjectSlugs(user);
  const mod = await prisma.module.findFirst({ where: { id: moduleId, subjectSlug: { in: slugs } } });
  if (!mod) return null;
  const last = await prisma.lesson.aggregate({ where: { moduleId }, _max: { order: true } });
  const order = (last._max.order ?? 0) + 1;
  const slug = `lecon-${moduleId.slice(-6)}-${order}-${Date.now().toString(36)}`;
  const lesson = await prisma.lesson.create({
    data: {
      moduleId,
      slug,
      title: "Nouvelle leçon",
      order,
      status: "DRAFT",
      contentMd: BLANK_CONTENT,
      estMinutes: 15,
      authorId: user.userId,
      subjectSlug: mod.subjectSlug,
    },
  });
  await prisma.auditLog.create({ data: { actorId: user.userId, actorName: `${user.firstName} ${user.lastName}`, action: "LESSON_CREATE", targetType: "lesson", targetId: lesson.id, metaJson: JSON.stringify({ moduleId }) } });
  return { id: lesson.id, title: lesson.title, status: lesson.status, order: lesson.order, moduleId };
}


// Create an UNATTACHED lesson in the author's personal library (no module yet).
// Teachers use these as "compléments" attached to a book lesson (see setCompanion);
// admins may also connect them into a module.
export async function createLibraryLesson(user: SessionUser, subjectSlug: string) {
  const slugs = await editableSubjectSlugs(user);
  if (!slugs.includes(subjectSlug)) return null;
  const slug = `biblio-${user.userId.slice(-6)}-${Date.now().toString(36)}`;
  const lesson = await prisma.lesson.create({
    data: { moduleId: null, subjectSlug, authorId: user.userId, slug, title: "Nouvelle leçon", order: 0, status: "DRAFT", contentMd: BLANK_CONTENT, estMinutes: 15 },
  });
  await prisma.auditLog.create({ data: { actorId: user.userId, actorName: `${user.firstName} ${user.lastName}`, action: "LESSON_CREATE", targetType: "lesson", targetId: lesson.id, metaJson: JSON.stringify({ library: true, subjectSlug }) } });
  return { id: lesson.id, title: lesson.title, status: lesson.status, order: lesson.order, moduleId: null, subjectSlug };
}

// Renumber a module's lessons, inserting `lessonId` at `position` (or appending when
// position is null/out of range). Persists order = index so the sequence is stable.
async function reorderWithInsert(moduleId: string, lessonId: string, position: number | null) {
  const rows = await prisma.lesson.findMany({ where: { moduleId }, orderBy: { order: "asc" }, select: { id: true } });
  const ids = rows.map((r) => r.id).filter((id) => id !== lessonId);
  const pos = position == null ? ids.length : Math.max(0, Math.min(ids.length, position));
  ids.splice(pos, 0, lessonId);
  await prisma.$transaction(ids.map((id, i) => prisma.lesson.update({ where: { id }, data: { order: i } })));
}

// Connect a library lesson to a module (moduleId set, optionally at `position` among the
// module's lessons) or send it back to the library (moduleId null). Only the lesson's
// author (or admin) may move it, so seeded book content can't be detached. Reconnecting
// to the same module with a new position reorders it. Stays within the lesson's subject.
export async function connectLesson(user: SessionUser, lessonId: string, moduleId: string | null, position: number | null = null) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, include: { module: true } });
  if (!lesson) return null;
  // A teacher may connect/detach only the lessons they authored; book content
  // (authorId null) stays admin-only.
  if (user.role !== "ADMIN" && lesson.authorId !== user.userId) return null;

  if (moduleId) {
    const slugs = await editableSubjectSlugs(user);
    const mod = await prisma.module.findFirst({ where: { id: moduleId, subjectSlug: { in: slugs } } });
    if (!mod) return null;
    if (lesson.subjectSlug && lesson.subjectSlug !== mod.subjectSlug) return null;
    await prisma.lesson.update({ where: { id: lessonId }, data: { moduleId, subjectSlug: mod.subjectSlug } });
    await reorderWithInsert(moduleId, lessonId, position);
    await prisma.auditLog.create({ data: { actorId: user.userId, actorName: `${user.firstName} ${user.lastName}`, action: "LESSON_CONNECT", targetType: "lesson", targetId: lessonId, metaJson: JSON.stringify({ moduleId, position }) } });
    return { moduleId };
  }

  const subjectSlug = lesson.subjectSlug ?? lesson.module?.subjectSlug ?? null;
  await prisma.lesson.update({ where: { id: lessonId }, data: { moduleId: null, subjectSlug } });
  await prisma.auditLog.create({ data: { actorId: user.userId, actorName: `${user.firstName} ${user.lastName}`, action: "LESSON_DISCONNECT", targetType: "lesson", targetId: lessonId } });
  return { moduleId: null };
}

// Delete a lesson — only one the teacher authored (never book content); admin may delete
// any. The row is still hard-deleted, but everything that hangs off it is captured into
// the corbeille first, in the same transaction, so the delete is reversible. See
// lessonArchive.ts.
export async function deleteLesson(user: SessionUser, lessonId: string) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) return null;
  if (user.role !== "ADMIN" && lesson.authorId !== user.userId) return null; // admin, or the author of their own lesson
  const done = await archiveAndDelete(user, lessonId);
  if (!done) return null;
  await prisma.auditLog.create({ data: { actorId: user.userId, actorName: `${user.firstName} ${user.lastName}`, action: "LESSON_DELETE", targetType: "lesson", targetId: lessonId, metaJson: JSON.stringify({ title: lesson.title, extraCount: done.extraCount }) } });
  return { ok: true, title: done.title, extraCount: done.extraCount };
}

// Restore from the corbeille. `exact` is the undo on the delete toast — it puts the
// lesson back exactly as it was, status included. Without it (a restore days later
// from the bin) the lesson comes back as a draft, so an old lesson can never silently
// re-expose itself to a class.
export async function undeleteLesson(user: SessionUser, lessonId: string, exact = false) {
  const report = await restoreArchive(user, lessonId, { exact });
  if (!report) return null;
  await prisma.auditLog.create({ data: { actorId: user.userId, actorName: `${user.firstName} ${user.lastName}`, action: "LESSON_UNDELETE", targetType: "lesson", targetId: lessonId, metaJson: JSON.stringify({ title: report.title, exact }) } });
  // The RAG chunks went with the lesson; they are derived, so rebuild rather than archive.
  import("./rag").then((m) => m.indexLesson(lessonId)).catch(() => {});
  return report;
}

export async function emptyFromTrash(user: SessionUser, lessonId: string) {
  const done = await purgeArchive(user, lessonId);
  if (!done) return null;
  await prisma.auditLog.create({ data: { actorId: user.userId, actorName: `${user.firstName} ${user.lastName}`, action: "LESSON_PURGE", targetType: "lesson", targetId: lessonId, metaJson: JSON.stringify({ title: done.title }) } });
  return done;
}

// What a teacher may OPEN in the studio: their own lessons, or any lesson in a subject
// they teach (book content is viewable, but not editable — see canEditLesson).
export async function getViewableLesson(user: SessionUser, lessonId: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { module: { include: { subject: true } } },
  });
  if (!lesson) return null;
  if (user.role === "ADMIN") return lesson;
  if (lesson.authorId === user.userId) return lesson;
  const slugs = await editableSubjectSlugs(user);
  if (lesson.module && slugs.includes(lesson.module.subjectSlug)) return lesson;
  if (lesson.subjectSlug && slugs.includes(lesson.subjectSlug)) return lesson;
  return null;
}

// Book/seeded content (authorId == null) is managed by the administration — only ADMIN
// may edit it. A teacher may fully edit the lessons they authored (their own "compléments").
export function canEditLesson(user: SessionUser, lesson: { authorId: string | null }): boolean {
  if (user.role === "ADMIN") return true;
  return lesson.authorId === user.userId;
}

// Quizzes stay teacher-authorable: any staff member may build the assessment on
// a lesson they can view (teachers are already scoped to their subjects there).
export function canEditQuiz(user: SessionUser, _lesson: { authorId: string | null }): boolean {
  return user.role === "ADMIN" || user.role === "TEACHER";
}

// Used by every write path (save/status/quiz/restore/connect). Returns null when the
// lesson isn't editable by this user, so those operations reject (404) cleanly.
export async function getEditableLesson(user: SessionUser, lessonId: string) {
  const lesson = await getViewableLesson(user, lessonId);
  if (!lesson) return null;
  return canEditLesson(user, lesson) ? lesson : null;
}

export async function lessonForEdit(user: SessionUser, lessonId: string) {
  const lesson = await getViewableLesson(user, lessonId);
  if (!lesson) return null;
  const canEdit = canEditLesson(user, lesson);

  const quiz = await prisma.quiz.findFirst({ where: { lessonId }, include: { questions: { orderBy: { order: "asc" } } } });
  // Matches VERSIONS_KEPT: now that a version means "a writing session" rather than
  // "a keystroke", the whole retained history is worth showing.
  const versionRows = await prisma.lessonVersion.findMany({ where: { lessonId }, orderBy: { version: "desc" }, take: 50 });
  const editorIds = [...new Set(versionRows.map((v) => v.editedById).filter(Boolean) as string[])];
  const editors = await prisma.user.findMany({ where: { id: { in: editorIds } }, select: { id: true, firstName: true, lastName: true } });
  const editorMap = new Map(editors.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));

  const assignments = await prisma.assignment.findMany({ where: { lessonId }, include: { class: true } });

  // Unattached library lessons have no module — resolve the subject from subjectSlug so
  // the editor header can still show the subject and a "Bibliothèque" placeholder.
  const subject = lesson.module?.subject ?? (lesson.subjectSlug ? await prisma.subject.findUnique({ where: { slug: lesson.subjectSlug } }) : null);

  // Companion picker: for an author's own library lesson, list the book lessons in the
  // same subject it may complement (authorId null = seeded, PUBLISHED, in a module).
  const isOwn = lesson.authorId != null && lesson.authorId === user.userId;
  const bookLessons = isOwn && subject
    ? (await prisma.lesson.findMany({
        where: { authorId: null, status: "PUBLISHED", moduleId: { not: null }, module: { subjectSlug: subject.slug } },
        // moduleId rides along so the studio can group a lesson with its chapter
        // siblings without matching on the title, which is not guaranteed unique.
        select: { id: true, title: true, moduleId: true, module: { select: { title: true } } },
        orderBy: [{ module: { order: "asc" } }, { order: "asc" }],
      })).map((b) => ({ id: b.id, title: b.title, moduleId: b.moduleId, moduleTitle: b.module?.title ?? "" }))
    : [];

  return {
    lesson: {
      id: lesson.id,
      title: lesson.title,
      contentMd: lesson.contentMd,
      estMinutes: lesson.estMinutes,
      status: lesson.status,
      moduleId: lesson.moduleId,
      companionOfId: lesson.companionOfId ?? null,
      canEdit,
      canQuiz: canEditQuiz(user, lesson),
      isBook: lesson.authorId == null,
      isOwn,
      subjectSlug: subject?.slug ?? lesson.subjectSlug ?? null,
      subjectName: subject?.name ?? "—",
      moduleTitle: lesson.module?.title ?? "Bibliothèque",
      icon: subject?.icon ?? null,
      color: subject?.color ?? null,
    },
    bookLessons,
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

// A writing session is one version, not one per keystroke.
//
// Every autosave used to snapshot a LessonVersion, write an AuditLog row AND fire a
// RAG re-index (which calls Ollama for embeddings). On a 1.5 s debounce that made
// typing the heaviest write path in the app: two lessons in the demo database had
// accumulated 140 and 76 versions, and the history list — which shows only the most
// recent rows — churned out of usefulness within a minute of writing.
export const SNAPSHOT_MIN_MS = 10 * 60_000;
const VERSIONS_KEPT = 50;

/**
 * Whether this save deserves its own restorable version. Pure and exported so the
 * policy is testable without a database.
 */
export function shouldSnapshot(o: {
  changed: boolean;
  force: boolean;
  lastAt: number | null;
  lastEditorId: string | null;
  userId: string;
  now: number;
}): boolean {
  if (!o.changed) return false; // an idle autosave writes nothing
  if (o.force) return true; // explicit save, publish, restore
  if (o.lastAt == null) return true; // first edit ever — never lose the original
  if (o.lastEditorId !== o.userId) return true; // never coalesce away a colleague's state
  return o.now - o.lastAt > SNAPSHOT_MIN_MS;
}

// Keep the newest N, and always keep version 1 — that is the original book text, the
// one a teacher is most likely to want back.
async function prune(lessonId: string) {
  const stale = await prisma.lessonVersion.findMany({
    where: { lessonId },
    orderBy: { version: "desc" },
    select: { version: true },
    skip: VERSIONS_KEPT,
  });
  const doomed = stale.map((v) => v.version).filter((v) => v > 1);
  if (doomed.length) await prisma.lessonVersion.deleteMany({ where: { lessonId, version: { in: doomed } } });
}

async function snapshot(lessonId: string, contentMd: string, editedById: string) {
  const max = await prisma.lessonVersion.aggregate({ where: { lessonId }, _max: { version: true } });
  const next = (max._max.version ?? 0) + 1;
  await prisma.lessonVersion.create({ data: { lessonId, version: next, contentMd, editedById } });
  await prune(lessonId);
  return next;
}

export async function saveLesson(
  user: SessionUser,
  lessonId: string,
  data: { contentMd: string; title?: string; estMinutes?: number; force?: boolean }
) {
  const lesson = await getEditableLesson(user, lessonId);
  if (!lesson) return null;

  const changed = lesson.contentMd !== data.contentMd;
  const latest = await prisma.lessonVersion.findFirst({
    where: { lessonId },
    orderBy: { version: "desc" },
    select: { version: true, createdAt: true, editedById: true },
  });
  const snap = shouldSnapshot({
    changed,
    force: Boolean(data.force),
    lastAt: latest ? latest.createdAt.getTime() : null,
    lastEditorId: latest?.editedById ?? null,
    userId: user.userId,
    now: Date.now(),
  });

  // Snapshot the PREVIOUS content as a restorable version, then overwrite.
  const version = snap ? await snapshot(lessonId, lesson.contentMd, user.userId) : latest?.version ?? 0;
  await prisma.lesson.update({
    where: { id: lessonId },
    data: { contentMd: data.contentMd, ...(data.title ? { title: data.title } : {}), ...(data.estMinutes ? { estMinutes: data.estMinutes } : {}) },
  });

  // The audit log rides the same rule: otherwise it grows at exactly the rate the
  // version table used to, and says no more for it.
  // Re-indexing calls Ollama for embeddings — by far the costliest part of a save and
  // pointless to repeat mid-sentence. Publishing re-indexes unconditionally (see
  // setStatus), so a lesson students can actually reach is never left stale.
  if (snap) {
    await prisma.auditLog.create({ data: { actorId: user.userId, actorName: `${user.firstName} ${user.lastName}`, action: "LESSON_EDIT", targetType: "lesson", targetId: lessonId, metaJson: JSON.stringify({ version }) } });
    import("./rag").then((m) => m.indexLesson(lessonId)).catch(() => {});
  }
  return { version };
}

export async function setStatus(user: SessionUser, lessonId: string, status: "PUBLISHED" | "DRAFT") {
  const lesson = await getEditableLesson(user, lessonId);
  if (!lesson) return null;
  await prisma.lesson.update({ where: { id: lessonId }, data: { status } });
  await prisma.auditLog.create({ data: { actorId: user.userId, actorName: `${user.firstName} ${user.lastName}`, action: status === "PUBLISHED" ? "LESSON_PUBLISH" : "LESSON_UNPUBLISH", targetType: "lesson", targetId: lessonId } });
  // Saves only re-index every SNAPSHOT_MIN_MS now, so publishing has to do it
  // unconditionally — otherwise a lesson could go live with a RAG index built from
  // the text it had ten minutes ago.
  import("./rag").then((m) => m.indexLesson(lessonId)).catch(() => {});
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
  const lesson = await getViewableLesson(user, lessonId);
  if (!lesson || !canEditQuiz(user, lesson)) return null;
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
  // Scheduling a lesson to a class is allowed for any viewable lesson (incl. book content).
  const lesson = await getViewableLesson(user, data.lessonId);
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

// Attach (or detach) a teacher's own library lesson as a "complément" to a book lesson.
// The custom lesson must be the user's own; the target must be a book lesson (authorId
// null) in a subject the user teaches. Passing null detaches it.
export async function setCompanion(user: SessionUser, lessonId: string, bookLessonId: string | null) {
  const lesson = await getViewableLesson(user, lessonId);
  if (!lesson || !canEditLesson(user, lesson) || lesson.authorId == null) return null; // own lessons only

  if (bookLessonId === null) {
    await prisma.lesson.update({ where: { id: lessonId }, data: { companionOfId: null } });
    await prisma.auditLog.create({ data: { actorId: user.userId, actorName: `${user.firstName} ${user.lastName}`, action: "LESSON_COMPANION_CLEAR", targetType: "lesson", targetId: lessonId } });
    return { ok: true, companionOfId: null };
  }

  const slugs = await editableSubjectSlugs(user);
  const book = await prisma.lesson.findFirst({
    where: { id: bookLessonId, authorId: null, module: { subjectSlug: { in: slugs } } },
    select: { id: true },
  });
  if (!book) return null; // not a book lesson in the teacher's subjects
  await prisma.lesson.update({ where: { id: lessonId }, data: { companionOfId: bookLessonId } });
  await prisma.auditLog.create({ data: { actorId: user.userId, actorName: `${user.firstName} ${user.lastName}`, action: "LESSON_COMPANION_SET", targetType: "lesson", targetId: lessonId, metaJson: JSON.stringify({ bookLessonId }) } });
  return { ok: true, companionOfId: bookLessonId };
}

// Companion lessons a STUDENT should see under a book lesson: published compléments whose
// author teaches this student's class in the book lesson's subject.
export async function companionsForStudent(bookLessonId: string, classId: string) {
  const book = await prisma.lesson.findUnique({
    where: { id: bookLessonId },
    select: { subjectSlug: true, module: { select: { subjectSlug: true } } },
  });
  const subjectSlug = book?.module?.subjectSlug ?? book?.subjectSlug;
  if (!subjectSlug) return [];
  const teacherRows = await prisma.teacherAssignment.findMany({ where: { classId, subjectSlug }, select: { teacherId: true } });
  const teacherIds = [...new Set(teacherRows.map((t) => t.teacherId))];
  if (teacherIds.length === 0) return [];

  const companions = await prisma.lesson.findMany({
    where: { companionOfId: bookLessonId, status: "PUBLISHED", authorId: { in: teacherIds } },
    select: { id: true, title: true, contentMd: true, authorId: true },
    orderBy: { title: "asc" },
  });
  if (companions.length === 0) return [];
  const authors = await prisma.user.findMany({ where: { id: { in: companions.map((c) => c.authorId!) } }, select: { id: true, firstName: true, lastName: true } });
  const nameById = new Map(authors.map((a) => [a.id, `${a.firstName} ${a.lastName}`]));
  return companions.map((c) => ({ id: c.id, title: c.title, contentMd: c.contentMd, authorName: nameById.get(c.authorId!) ?? "" }));
}

// Classes the user can assign to (teacher's classes / all for admin).
export async function assignableClasses(user: SessionUser) {
  if (user.role === "ADMIN") {
    return prisma.classGroup.findMany({ where: { isArchived: false }, orderBy: { name: "asc" }, select: { id: true, name: true, level: true } });
  }
  const tas = await prisma.teacherAssignment.findMany({
    where: { teacherId: user.userId, class: { isArchived: false } },
    include: { class: true },
  });
  const map = new Map(tas.map((t) => [t.classId, { id: t.class.id, name: t.class.name, level: t.class.level }]));
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Which of the user's classes a lesson belongs to — keeps `?lesson=<id>` deep
// links (from Insights) working now that the studio tree is class-scoped.
// Returns null when the lesson sits outside every class the user can see.
export async function classForLessonInScope(user: SessionUser, lessonId: string): Promise<string | null> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { subjectSlug: true, module: { select: { subjectSlug: true, classLevel: true } } },
  });
  if (!lesson) return null;
  const subjectSlug = lesson.module?.subjectSlug ?? lesson.subjectSlug;
  if (!subjectSlug) return null;
  const modLevel = lesson.module?.classLevel ?? null; // null = shared book → any level

  const classes = await assignableClasses(user);
  for (const c of classes) {
    const scope = await classScope(user, c.id);
    if (scope && scope.subjectSlugs.includes(subjectSlug) && (modLevel === null || modLevel === scope.level)) return c.id;
  }
  return null;
}
