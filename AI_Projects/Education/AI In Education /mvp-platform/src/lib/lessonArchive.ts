import { prisma } from "./db";
import type { SessionUser } from "./session";

// The corbeille. See the DeletedLesson comment in schema.prisma for why this is an
// archive rather than a `deletedAt` tombstone.
//
// The contract: everything the delete would destroy is captured first, in one
// transaction, and a restore puts all of it back — content, history, quiz, and the
// student rows (progress, attempts, feedback, Copilot threads). Nothing is
// summarised; the payload is the rows.

// 2 — added the teacher's « Enseigner » threads. An older payload restores fine:
// the new arrays are read with `?? []`.
export const ARCHIVE_VERSION = 2;

type Row = Record<string, unknown>;

export type ArchivePayload = {
  v: number;
  lessons: Row[];
  versions: Row[];
  quizzes: Row[];
  questions: Row[];
  attempts: Row[];
  progress: Row[];
  feedback: Row[];
  assignments: Row[];
  threads: Row[];
  messages: Row[];
  topics: Row[];
  exerciseLinks: Row[];
  teachThreads: Row[];
  teachMessages: Row[];
  // SessionLog is onDelete: SetNull, so those rows survive the delete with a null
  // lessonId. Which ones were ours is unknowable afterwards, so record the pairing
  // now and re-point them on restore.
  sessionLogs: { id: string; lessonId: string }[];
};

/**
 * The lessons a delete would actually destroy: the target, plus anything that
 * cascades through `companionOfId`, transitively. Parents come before children so a
 * restore can insert them in order without tripping the self-relation.
 */
export async function collectCascade(lessonId: string): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();
  let frontier = [lessonId];
  // Depth-bounded only by the data: companions of companions are not reachable in the
  // UI today, but the schema permits them and a missed one would be a silent loss.
  while (frontier.length) {
    const fresh = frontier.filter((id) => !seen.has(id));
    fresh.forEach((id) => { seen.add(id); out.push(id); });
    if (!fresh.length) break;
    const kids = await prisma.lesson.findMany({ where: { companionOfId: { in: fresh } }, select: { id: true } });
    frontier = kids.map((k) => k.id);
  }
  return out;
}

/** Read every row that hangs off these lessons. */
export async function buildArchive(lessonIds: string[]): Promise<ArchivePayload> {
  const where = { lessonId: { in: lessonIds } };
  const [lessons, versions, quizzes, progress, feedback, assignments, threads, topics, exerciseLinks, sessionLogs] =
    await Promise.all([
      prisma.lesson.findMany({ where: { id: { in: lessonIds } } }),
      prisma.lessonVersion.findMany({ where }),
      prisma.quiz.findMany({ where }),
      prisma.progress.findMany({ where }),
      prisma.lessonFeedback.findMany({ where }),
      prisma.assignment.findMany({ where }),
      prisma.copilotThread.findMany({ where }),
      prisma.copilotTopic.findMany({ where }),
      prisma.exerciseLink.findMany({ where: { lessonId: { in: lessonIds } } }),
      prisma.sessionLog.findMany({ where, select: { id: true, lessonId: true } }),
    ]);

  const teachThreads = await prisma.teachThread.findMany({ where: { lessonId: { in: lessonIds } } });
  const teachMessages = teachThreads.length
    ? await prisma.teachMessage.findMany({ where: { threadId: { in: teachThreads.map((t) => t.id) } } })
    : [];

  const quizIds = quizzes.map((q) => q.id);
  const threadIds = threads.map((t) => t.id);
  const [questions, attempts, messages] = await Promise.all([
    quizIds.length ? prisma.question.findMany({ where: { quizId: { in: quizIds } } }) : [],
    quizIds.length ? prisma.quizAttempt.findMany({ where: { quizId: { in: quizIds } } }) : [],
    threadIds.length ? prisma.copilotMessage.findMany({ where: { threadId: { in: threadIds } } }) : [],
  ]);

  return {
    v: ARCHIVE_VERSION,
    lessons: lessons as Row[],
    versions: versions as Row[],
    quizzes: quizzes as Row[],
    questions: questions as Row[],
    attempts: attempts as Row[],
    progress: progress as Row[],
    feedback: feedback as Row[],
    assignments: assignments as Row[],
    threads: threads as Row[],
    messages: messages as Row[],
    topics: topics as Row[],
    exerciseLinks: exerciseLinks as Row[],
    teachThreads: teachThreads as Row[],
    teachMessages: teachMessages as Row[],
    sessionLogs: sessionLogs.filter((s): s is { id: string; lessonId: string } => !!s.lessonId),
  };
}

/**
 * Archive, then delete. One transaction: if the capture fails the lesson stays,
 * which is the only acceptable direction for this to fail in.
 */
export async function archiveAndDelete(user: SessionUser, lessonId: string) {
  const ids = await collectCascade(lessonId);
  const payload = await buildArchive(ids);
  const target = payload.lessons.find((l) => l.id === lessonId);
  if (!target) return null;

  const moduleTitle = target.moduleId
    ? (await prisma.module.findUnique({ where: { id: target.moduleId as string }, select: { title: true } }))?.title ?? null
    : null;

  await prisma.$transaction(async (tx) => {
    await tx.deletedLesson.deleteMany({ where: { lessonId } }); // re-delete after a restore
    await tx.deletedLesson.create({
      data: {
        lessonId,
        title: String(target.title ?? ""),
        subjectSlug: (target.subjectSlug as string | null) ?? null,
        moduleId: (target.moduleId as string | null) ?? null,
        moduleTitle,
        authorId: (target.authorId as string | null) ?? null,
        wasPublished: target.status === "PUBLISHED",
        extraCount: ids.length - 1,
        deletedById: user.userId,
        deletedByName: `${user.firstName} ${user.lastName}`,
        payloadJson: JSON.stringify(payload),
      },
    });
    await tx.lesson.delete({ where: { id: lessonId } });
  });

  return { lessonId, title: String(target.title ?? ""), extraCount: ids.length - 1 };
}

/**
 * Where an archived lesson lands, decided before anything is written.
 *
 * Pure on purpose: these four rules are the whole risk in a restore — the module it
 * belonged to may be gone, a replacement may have taken its slug, and a restore from
 * the bin must not silently republish. Keeping them out of the transaction is what
 * makes them testable.
 */
export function planLessonRestore(
  l: Row,
  ctx: { liveModuleIds: Set<string>; takenSlugs: Set<string>; exact: boolean; suffix: string },
): { moduleId: string | null; slug: string; status: string; slugChanged: boolean; reattached: boolean } {
  const wanted = (l.moduleId as string | null) ?? null;
  const moduleId = wanted && ctx.liveModuleIds.has(wanted) ? wanted : null;
  let slug = String(l.slug);
  let slugChanged = false;
  if (ctx.takenSlugs.has(`${moduleId ?? ""}::${slug}`)) {
    slug = `${slug}-${ctx.suffix}`;
    slugChanged = true;
  }
  return {
    moduleId,
    slug,
    slugChanged,
    reattached: !!moduleId,
    status: ctx.exact ? String(l.status) : "DRAFT",
  };
}

export type RestoreReport = {
  lessonId: string;
  title: string;
  status: string;
  reattached: boolean;      // went back into its module
  slugChanged: boolean;
  skipped: { students: number; classes: number; exercises: number };
};

/**
 * Put it all back.
 *
 * `exact` restores the lesson exactly as it was, status included — that is what the
 * undo on the delete toast means. A restore from the bin days later instead lands as
 * a draft: bringing an old lesson back should never silently re-expose it to a class.
 */
export async function restoreArchive(
  user: SessionUser,
  lessonId: string,
  opts: { exact?: boolean } = {},
): Promise<RestoreReport | null> {
  const row = await prisma.deletedLesson.findUnique({ where: { lessonId } });
  if (!row) return null;
  if (user.role !== "ADMIN" && row.authorId !== user.userId) return null;
  if (await prisma.lesson.findUnique({ where: { id: lessonId }, select: { id: true } })) return null;

  const p = JSON.parse(row.payloadJson) as ArchivePayload;
  const report: RestoreReport = {
    lessonId, title: row.title, status: "DRAFT",
    reattached: false, slugChanged: false,
    skipped: { students: 0, classes: 0, exercises: 0 },
  };

  // Everything the archive points at may have gone in the meantime. Resolve what
  // still exists once, then drop the rows that no longer have a home.
  const lessonIds = p.lessons.map((l) => String(l.id));
  const moduleIds = [...new Set(p.lessons.map((l) => l.moduleId).filter(Boolean) as string[])];
  // Teachers resolve through the same user lookup as students — same table, and a
  // teacher who has since left is exactly as absent as a student who has.
  const studentIds = [...new Set([
    ...[...p.progress, ...p.feedback, ...p.attempts, ...p.threads].map((r) => String(r.studentId)),
    ...(p.teachThreads ?? []).map((t) => String(t.teacherId)),
  ])];
  const classIds = [...new Set(p.assignments.map((a) => String(a.classId)))];
  const exerciseIds = [...new Set(p.exerciseLinks.map((l) => String(l.exerciseId)))];

  const [liveModules, liveStudents, liveClasses, liveExercises] = await Promise.all([
    moduleIds.length ? prisma.module.findMany({ where: { id: { in: moduleIds } }, select: { id: true } }) : [],
    studentIds.length ? prisma.user.findMany({ where: { id: { in: studentIds } }, select: { id: true } }) : [],
    classIds.length ? prisma.classGroup.findMany({ where: { id: { in: classIds } }, select: { id: true } }) : [],
    exerciseIds.length ? prisma.exercise.findMany({ where: { id: { in: exerciseIds } }, select: { id: true } }) : [],
  ]);
  const mods = new Set(liveModules.map((m) => m.id));
  const studs = new Set(liveStudents.map((u) => u.id));
  const klass = new Set(liveClasses.map((c) => c.id));
  const exos = new Set(liveExercises.map((e) => e.id));
  const restored = new Set(lessonIds);

  // A replacement lesson may have taken the slug in the meantime; the unique is
  // [moduleId, slug], so only a collision inside the same module matters.
  const taken = await prisma.lesson.findMany({
    where: { OR: p.lessons.map((l) => ({ moduleId: (l.moduleId as string | null) ?? null, slug: String(l.slug) })) },
    select: { moduleId: true, slug: true },
  });
  const clash = new Set(taken.map((t) => `${t.moduleId ?? ""}::${t.slug}`));

  await prisma.$transaction(async (tx) => {
    const suffix = Date.now().toString(36).slice(-4);
    for (const l of p.lessons) {
      const isTarget = l.id === lessonId;
      const { moduleId, slug, status, slugChanged } = planLessonRestore(l, {
        liveModuleIds: mods, takenSlugs: clash, exact: !!opts.exact, suffix,
      });
      if (isTarget) report.slugChanged = slugChanged;
      // The companion target may itself have gone — unless it is one of the lessons
      // we are restoring right now, in which case the parent was inserted first.
      const companionOfId = l.companionOfId && restored.has(String(l.companionOfId))
        ? String(l.companionOfId)
        : await tx.lesson.findUnique({ where: { id: String(l.companionOfId ?? "") }, select: { id: true } }).then((r) => r?.id ?? null).catch(() => null);

      await tx.lesson.create({
        data: {
          id: String(l.id), moduleId, slug, title: String(l.title), order: Number(l.order ?? 0),
          status, contentMd: String(l.contentMd ?? ""), estMinutes: Number(l.estMinutes ?? 15),
          sourceRef: (l.sourceRef as string | null) ?? null, authorId: (l.authorId as string | null) ?? null,
          subjectSlug: (l.subjectSlug as string | null) ?? null, companionOfId,
        },
      });
      if (isTarget) { report.status = status; report.reattached = !!moduleId; }
    }

    for (const v of p.versions) {
      await tx.lessonVersion.create({
        data: { id: String(v.id), lessonId: String(v.lessonId), version: Number(v.version), contentMd: String(v.contentMd ?? ""), editedById: (v.editedById as string | null) ?? null, createdAt: new Date(v.createdAt as string) },
      });
    }
    for (const q of p.quizzes) {
      await tx.quiz.create({ data: { id: String(q.id), lessonId: String(q.lessonId), title: String(q.title) } });
    }
    for (const q of p.questions) {
      await tx.question.create({
        data: { id: String(q.id), quizId: String(q.quizId), type: String(q.type), promptMd: String(q.promptMd), optionsJson: (q.optionsJson as string | null) ?? null, answerJson: String(q.answerJson), explanationMd: (q.explanationMd as string | null) ?? null, order: Number(q.order ?? 0) },
      });
    }
    for (const a of p.attempts) {
      if (!studs.has(String(a.studentId))) { report.skipped.students++; continue; }
      await tx.quizAttempt.create({
        data: { id: String(a.id), studentId: String(a.studentId), quizId: String(a.quizId), score: Number(a.score), answersJson: String(a.answersJson), durationS: Number(a.durationS ?? 0), createdAt: new Date(a.createdAt as string) },
      });
    }
    for (const g of p.progress) {
      if (!studs.has(String(g.studentId))) { report.skipped.students++; continue; }
      await tx.progress.create({
        data: { id: String(g.id), studentId: String(g.studentId), lessonId: String(g.lessonId), status: String(g.status), completedAt: g.completedAt ? new Date(g.completedAt as string) : null, totalSeconds: Number(g.totalSeconds ?? 0) },
      });
    }
    for (const f of p.feedback) {
      if (!studs.has(String(f.studentId))) { report.skipped.students++; continue; }
      await tx.lessonFeedback.create({
        data: { id: String(f.id), studentId: String(f.studentId), lessonId: String(f.lessonId), understanding: Number(f.understanding), message: (f.message as string | null) ?? null, resolved: !!f.resolved, createdAt: new Date(f.createdAt as string) },
      });
    }
    for (const a of p.assignments) {
      if (!klass.has(String(a.classId))) { report.skipped.classes++; continue; }
      await tx.assignment.create({
        data: { id: String(a.id), classId: String(a.classId), lessonId: String(a.lessonId), dueDate: a.dueDate ? new Date(a.dueDate as string) : null, createdById: (a.createdById as string | null) ?? null, createdAt: new Date(a.createdAt as string) },
      });
    }
    const liveThreads = new Set<string>();
    for (const t of p.threads) {
      if (!studs.has(String(t.studentId))) { report.skipped.students++; continue; }
      await tx.copilotThread.create({
        data: { id: String(t.id), studentId: String(t.studentId), lessonId: String(t.lessonId), startedAt: new Date(t.startedAt as string) },
      });
      liveThreads.add(String(t.id));
    }
    for (const m of p.messages) {
      if (!liveThreads.has(String(m.threadId))) continue;
      await tx.copilotMessage.create({
        data: { id: String(m.id), threadId: String(m.threadId), role: String(m.role), content: String(m.content), tokens: (m.tokens as number | null) ?? null, createdAt: new Date(m.createdAt as string) },
      });
    }
    for (const t of p.topics) {
      await tx.copilotTopic.create({
        data: { id: String(t.id), lessonId: String(t.lessonId), label: String(t.label), count: Number(t.count ?? 0), weekKey: String(t.weekKey) },
      });
    }
    for (const l of p.exerciseLinks) {
      if (!exos.has(String(l.exerciseId))) { report.skipped.exercises++; continue; }
      await tx.exerciseLink.create({
        data: { id: String(l.id), exerciseId: String(l.exerciseId), moduleId: (l.moduleId as string | null) ?? null, lessonId: (l.lessonId as string | null) ?? null },
      });
    }
    // The teacher's teaching conversation about this lesson. Written before the
    // sessionLog re-point so a v1 payload (no such arrays) is simply a no-op.
    const liveTeachThreads = new Set<string>();
    for (const t of p.teachThreads ?? []) {
      if (!studs.has(String(t.teacherId))) { report.skipped.students++; continue; }
      await tx.teachThread.create({
        data: { id: String(t.id), teacherId: String(t.teacherId), lessonId: String(t.lessonId), startedAt: new Date(t.startedAt as string) },
      });
      liveTeachThreads.add(String(t.id));
    }
    for (const m of p.teachMessages ?? []) {
      if (!liveTeachThreads.has(String(m.threadId))) continue;
      await tx.teachMessage.create({
        data: { id: String(m.id), threadId: String(m.threadId), role: String(m.role), content: String(m.content), createdAt: new Date(m.createdAt as string) },
      });
    }

    // Re-point the session logs the delete orphaned. Only rows still sitting at null
    // are ours to claim — a log reassigned since is not.
    for (const s of p.sessionLogs) {
      await tx.sessionLog.updateMany({ where: { id: s.id, lessonId: null }, data: { lessonId: s.lessonId } });
    }

    await tx.deletedLesson.delete({ where: { lessonId } });
  }, { timeout: 20_000 });

  return report;
}

/** Empty one entry from the bin. This is the only irreversible step in the flow. */
export async function purgeArchive(user: SessionUser, lessonId: string) {
  const row = await prisma.deletedLesson.findUnique({ where: { lessonId } });
  if (!row) return null;
  if (user.role !== "ADMIN" && row.authorId !== user.userId) return null;
  await prisma.deletedLesson.delete({ where: { lessonId } });
  return { ok: true, title: row.title };
}

/** The bin, newest first. Teachers see their own; an admin sees everything. */
export async function listArchive(user: SessionUser, subjectSlugs?: string[]) {
  const rows = await prisma.deletedLesson.findMany({
    where: {
      ...(user.role === "ADMIN" ? {} : { authorId: user.userId }),
      ...(subjectSlugs?.length ? { subjectSlug: { in: subjectSlugs } } : {}),
    },
    orderBy: { deletedAt: "desc" },
  });
  return rows.map((r) => {
    const p = JSON.parse(r.payloadJson) as ArchivePayload;
    return {
      lessonId: r.lessonId,
      title: r.title,
      subjectSlug: r.subjectSlug,
      moduleTitle: r.moduleTitle,
      wasPublished: r.wasPublished,
      extraCount: r.extraCount,
      deletedByName: r.deletedByName,
      deletedAt: r.deletedAt.getTime(),
      // What a restore would bring back — the reassurance the bin exists to give.
      versions: p.versions.length,
      questions: p.questions.length,
      words: String(p.lessons.find((l) => l.id === r.lessonId)?.contentMd ?? "").split(/\s+/).filter(Boolean).length,
    };
  });
}
