import { prisma } from "./db";
import { audit } from "./auth";

const DAY = 86400000;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export type StudentStatus = "ok" | "behind" | "inactive";

export interface StudentMetrics {
  id: string;
  firstName: string;
  lastName: string;
  avatarColor: string | null;
  progressPct: number;
  lessonsDone: number;
  avgQuiz: number | null;
  timeMinutes: number;
  copilotCount: number;
  lastActive: string | null; // ISO
  lastActiveDays: number | null;
  status: StudentStatus;
}

// Classes a teacher is assigned to (distinct), with their subject slugs.
export async function teacherClasses(teacherId: string) {
  const tas = await prisma.teacherAssignment.findMany({
    where: { teacherId },
    include: { class: true },
  });
  const byClass = new Map<string, { id: string; name: string; level: string; field: string | null; subjectSlugs: Set<string>; isLead: boolean }>();
  for (const t of tas) {
    const e = byClass.get(t.classId) ?? { id: t.class.id, name: t.class.name, level: t.class.level, field: t.class.field, subjectSlugs: new Set<string>(), isLead: false };
    e.subjectSlugs.add(t.subjectSlug);
    if (t.isLead) e.isLead = true;
    byClass.set(t.classId, e);
  }
  return [...byClass.values()];
}

export async function classSubjectSlugs(classId: string): Promise<string[]> {
  const tas = await prisma.teacherAssignment.findMany({ where: { classId }, select: { subjectSlug: true } });
  return [...new Set(tas.map((t) => t.subjectSlug))];
}

// Total published lessons (one per module) across a class's subjects.
export async function classLessonTotal(classId: string): Promise<number> {
  const slugs = await classSubjectSlugs(classId);
  if (slugs.length === 0) return 0;
  return prisma.lesson.count({ where: { status: "PUBLISHED", module: { subjectSlug: { in: slugs } } } });
}

function statusFor(progressPct: number, avgQuiz: number | null, lastActiveDays: number | null): StudentStatus {
  if (lastActiveDays === null || lastActiveDays > 7) return "inactive";
  if (progressPct < 30 || (avgQuiz !== null && avgQuiz < 55)) return "behind";
  return "ok";
}

export async function studentMetrics(student: { id: string; firstName: string; lastName: string; avatarColor: string | null; lastLoginAt: Date | null }, totalLessons: number): Promise<StudentMetrics> {
  const [completed, progAgg, quizAgg, copilotCount, sessAgg] = await Promise.all([
    prisma.progress.count({ where: { studentId: student.id, status: "COMPLETED" } }),
    // NOTE: don't use Progress.updatedAt for "last active" — it's an @updatedAt
    // field (always "now" on write). Use completedAt + SessionLog instead.
    prisma.progress.aggregate({ where: { studentId: student.id }, _sum: { totalSeconds: true }, _max: { completedAt: true } }),
    prisma.quizAttempt.aggregate({ where: { studentId: student.id }, _avg: { score: true } }),
    prisma.copilotMessage.count({ where: { role: "user", thread: { studentId: student.id } } }),
    prisma.sessionLog.aggregate({ where: { studentId: student.id }, _max: { startedAt: true } }),
  ]);

  const lastCandidates = [progAgg._max.completedAt, sessAgg._max.startedAt, student.lastLoginAt].filter(Boolean) as Date[];
  const lastActive = lastCandidates.length ? new Date(Math.max(...lastCandidates.map((d) => d.getTime()))) : null;
  const lastActiveDays = lastActive ? Math.floor((Date.now() - lastActive.getTime()) / DAY) : null;
  const progressPct = totalLessons ? Math.round((completed / totalLessons) * 100) : 0;
  const avgQuiz = quizAgg._avg.score != null ? Math.round(quizAgg._avg.score) : null;

  return {
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    avatarColor: student.avatarColor,
    progressPct,
    lessonsDone: completed,
    avgQuiz,
    timeMinutes: Math.round((progAgg._sum.totalSeconds ?? 0) / 60),
    copilotCount,
    lastActive: lastActive ? lastActive.toISOString() : null,
    lastActiveDays,
    status: statusFor(progressPct, avgQuiz, lastActiveDays),
  };
}

// ---- Copilot policy ----
export async function resolveCopilotEnabled(studentId: string, classId: string): Promise<boolean> {
  const sp = await prisma.copilotPolicy.findFirst({ where: { scope: "STUDENT", studentId } });
  if (sp) return sp.enabled;
  const cp = await prisma.copilotPolicy.findFirst({ where: { scope: "CLASS", classId, studentId: null } });
  if (cp) return cp.enabled;
  return true;
}

export async function classCopilotMaster(classId: string): Promise<boolean> {
  const cp = await prisma.copilotPolicy.findFirst({ where: { scope: "CLASS", classId, studentId: null } });
  return cp ? cp.enabled : true;
}

export async function setCopilotPolicy(opts: {
  scope: "CLASS" | "STUDENT";
  classId?: string;
  studentIds?: string[];
  enabled: boolean;
  reason?: string;
  setById: string;
  actorName: string;
}) {
  const { scope, classId, studentIds, enabled, reason, setById, actorName } = opts;
  if (scope === "CLASS") {
    if (!classId) throw new Error("classId required");
    const existing = await prisma.copilotPolicy.findFirst({ where: { scope: "CLASS", classId, studentId: null } });
    if (existing) {
      await prisma.copilotPolicy.update({ where: { id: existing.id }, data: { enabled, reason, setById } });
    } else {
      await prisma.copilotPolicy.create({ data: { scope: "CLASS", classId, enabled, reason, setById } });
    }
    // Master switch is authoritative: clear per-student overrides in this class.
    const enrolled = await prisma.enrollment.findMany({ where: { classId }, select: { studentId: true } });
    await prisma.copilotPolicy.deleteMany({ where: { scope: "STUDENT", studentId: { in: enrolled.map((e) => e.studentId) } } });
    await prisma.auditLog.create({
      data: { actorId: setById, actorName, action: enabled ? "COPILOT_ENABLE_CLASS" : "COPILOT_DISABLE_CLASS", targetType: "class", targetId: classId, metaJson: reason ? JSON.stringify({ reason }) : undefined },
    });
    return;
  }
  // STUDENT scope (per-row or bulk)
  for (const sid of studentIds ?? []) {
    const existing = await prisma.copilotPolicy.findFirst({ where: { scope: "STUDENT", studentId: sid } });
    if (existing) {
      await prisma.copilotPolicy.update({ where: { id: existing.id }, data: { enabled, reason, setById } });
    } else {
      await prisma.copilotPolicy.create({ data: { scope: "STUDENT", studentId: sid, enabled, reason, setById } });
    }
  }
  await prisma.auditLog.create({
    data: { actorId: setById, actorName, action: enabled ? "COPILOT_ENABLE_STUDENTS" : "COPILOT_DISABLE_STUDENTS", targetType: "students", metaJson: JSON.stringify({ studentIds, reason }) },
  });
}

// ---- Class detail ----
export async function classDetail(teacherId: string, classId: string) {
  const assigned = await prisma.teacherAssignment.findFirst({ where: { teacherId, classId } });
  if (!assigned) return null; // not this teacher's class

  const cls = await prisma.classGroup.findUnique({ where: { id: classId } });
  if (!cls) return null;

  const totalLessons = await classLessonTotal(classId);
  const enrollments = await prisma.enrollment.findMany({
    where: { classId },
    include: { student: true },
  });

  const students = await Promise.all(
    enrollments.map(async (e) => {
      const m = await studentMetrics(e.student, totalLessons);
      const copilotEnabled = await resolveCopilotEnabled(e.studentId, classId);
      return { ...m, copilotEnabled };
    }),
  );
  students.sort((a, b) => a.lastName.localeCompare(b.lastName));

  return {
    class: { id: cls.id, name: cls.name, level: cls.level, field: cls.field },
    totalLessons,
    master: { enabled: await classCopilotMaster(classId) },
    students,
  };
}

// ---- Module locks (teacher-controlled access) ----

// Subjects (with their modules) a teacher can manage for a class, each module
// flagged locked/unlocked. Scoped to the subjects this teacher is assigned to.
export async function classModules(teacherId: string, classId: string) {
  const tas = await prisma.teacherAssignment.findMany({ where: { teacherId, classId }, select: { subjectSlug: true } });
  if (tas.length === 0) return null; // not this teacher's class
  const slugs = [...new Set(tas.map((t) => t.subjectSlug))];

  const [subjects, lockRows] = await Promise.all([
    prisma.subject.findMany({
      where: { slug: { in: slugs } },
      orderBy: { order: "asc" },
      include: {
        modules: {
          orderBy: { order: "asc" },
          include: { lessons: { where: { status: "PUBLISHED" }, select: { id: true } } },
        },
      },
    }),
    prisma.moduleLock.findMany({ where: { classId }, select: { moduleId: true } }),
  ]);
  const locked = new Set(lockRows.map((r) => r.moduleId));

  return subjects
    .map((s) => ({
      slug: s.slug,
      name: s.name,
      color: s.color,
      icon: s.icon,
      modules: s.modules
        .filter((m) => m.lessons.length > 0)
        .map((m) => ({ id: m.id, order: m.order, title: m.title, lessonCount: m.lessons.length, locked: locked.has(m.id) })),
    }))
    .filter((s) => s.modules.length > 0);
}

// Lock or unlock a single module for a class. Default state is unlocked
// (no row); locking creates a row, unlocking deletes it. Returns true on success.
export async function setModuleLock(teacher: { userId: string; firstName: string; lastName: string }, classId: string, moduleId: string, locked: boolean): Promise<boolean> {
  // The module must belong to a subject this teacher is assigned to in this class.
  const tas = await prisma.teacherAssignment.findMany({ where: { teacherId: teacher.userId, classId }, select: { subjectSlug: true } });
  const slugs = new Set(tas.map((t) => t.subjectSlug));
  const mod = await prisma.module.findUnique({ where: { id: moduleId }, select: { subjectSlug: true, title: true } });
  if (!mod || !slugs.has(mod.subjectSlug)) return false;

  if (locked) {
    await prisma.moduleLock.upsert({
      where: { classId_moduleId: { classId, moduleId } },
      create: { classId, moduleId, lockedById: teacher.userId },
      update: { lockedById: teacher.userId },
    });
  } else {
    await prisma.moduleLock.deleteMany({ where: { classId, moduleId } });
  }
  await audit(locked ? "MODULE_LOCK" : "MODULE_UNLOCK", {
    actorId: teacher.userId,
    actorName: `${teacher.firstName} ${teacher.lastName}`,
    targetType: "module",
    targetId: moduleId,
    meta: { classId, title: mod.title },
  });
  return true;
}

// ---- Student drawer ----
export async function studentDrawer(teacherId: string, studentId: string) {
  const enr = await prisma.enrollment.findUnique({ where: { studentId }, include: { class: true, student: true } });
  if (!enr) return null;
  const assigned = await prisma.teacherAssignment.findFirst({ where: { teacherId, classId: enr.classId } });
  if (!assigned) return null;

  const totalLessons = await classLessonTotal(enr.classId);
  const metrics = await studentMetrics(enr.student, totalLessons);

  // Per-subject breakdown
  const slugs = await classSubjectSlugs(enr.classId);
  const subjects = await prisma.subject.findMany({
    where: { slug: { in: slugs } },
    orderBy: { order: "asc" },
    include: { modules: { include: { lessons: { where: { status: "PUBLISHED" }, select: { id: true } } } } },
  });
  const progress = await prisma.progress.findMany({ where: { studentId } });
  const doneSet = new Set(progress.filter((p) => p.status === "COMPLETED").map((p) => p.lessonId));
  const breakdown = subjects.map((s) => {
    const lessonIds = s.modules.flatMap((m) => m.lessons.map((l) => l.id));
    const done = lessonIds.filter((id) => doneSet.has(id)).length;
    return { name: s.name, icon: s.icon, color: s.color, total: lessonIds.length, done, pct: lessonIds.length ? Math.round((done / lessonIds.length) * 100) : 0 };
  }).filter((b) => b.total > 0);

  // Timeline — recent completions
  const recent = await prisma.progress.findMany({
    where: { studentId, status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    take: 8,
    include: { lesson: { include: { module: { include: { subject: true } } } } },
  });
  const timeline = recent.map((p) => ({
    lessonTitle: p.lesson.title,
    subject: p.lesson.module.subject.name,
    icon: p.lesson.module.subject.icon,
    at: p.completedAt ? p.completedAt.toISOString() : null,
  }));

  // Copilot topics — group this student's questions by lesson
  const threads = await prisma.copilotThread.findMany({
    where: { studentId },
    include: { lesson: { select: { title: true } }, messages: { where: { role: "user" }, select: { id: true } } },
  });
  const topicMap = new Map<string, number>();
  for (const t of threads) topicMap.set(t.lesson.title, (topicMap.get(t.lesson.title) ?? 0) + t.messages.length);
  const copilotTopics = [...topicMap.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 6);

  // Understanding feedback this student left (most recent first).
  const fbs = await prisma.lessonFeedback.findMany({
    where: { studentId },
    orderBy: [{ resolved: "asc" }, { createdAt: "desc" }],
    take: 12,
    include: { lesson: { select: { title: true } } },
  });
  const feedback = fbs.map((f) => ({
    id: f.id,
    understanding: f.understanding,
    message: f.message ?? "",
    resolved: f.resolved,
    lessonTitle: f.lesson.title,
    at: f.createdAt.toISOString(),
  }));

  return {
    student: { id: enr.student.id, firstName: enr.student.firstName, lastName: enr.student.lastName, avatarColor: enr.student.avatarColor },
    className: enr.class.name,
    metrics,
    breakdown,
    timeline,
    copilotTopics,
    feedback,
    copilotEnabled: await resolveCopilotEnabled(studentId, enr.classId),
  };
}

// All understanding feedback from the teacher's students — the "Retours" inbox.
// Unresolved + lower understanding float to the top.
export async function teacherFeedbackInbox(teacherId: string) {
  const classes = await teacherClasses(teacherId);
  const classIds = classes.map((c) => c.id);
  if (classIds.length === 0) return { items: [], openCount: 0 };
  const enrollments = await prisma.enrollment.findMany({ where: { classId: { in: classIds } }, select: { studentId: true } });
  const studentIds = enrollments.map((e) => e.studentId);
  if (studentIds.length === 0) return { items: [], openCount: 0 };

  const fbs = await prisma.lessonFeedback.findMany({
    where: { studentId: { in: studentIds } },
    orderBy: [{ resolved: "asc" }, { understanding: "asc" }, { createdAt: "desc" }],
    take: 80,
    include: {
      student: { select: { firstName: true, lastName: true, avatarColor: true } },
      lesson: { select: { title: true, module: { select: { subject: { select: { name: true } } } } } },
    },
  });

  const items = fbs.map((f) => ({
    id: f.id,
    studentId: f.studentId,
    studentName: `${f.student.firstName} ${f.student.lastName}`,
    avatarColor: f.student.avatarColor,
    lessonTitle: f.lesson.title,
    subject: f.lesson.module.subject.name,
    understanding: f.understanding,
    message: f.message ?? "",
    resolved: f.resolved,
    at: f.createdAt.toISOString(),
  }));
  const openCount = items.filter((i) => !i.resolved && i.understanding < 100).length;
  return { items, openCount };
}

// Mark a feedback item resolved — guarded so a teacher can only touch their own
// students' feedback.
export async function resolveFeedback(teacherId: string, feedbackId: string) {
  const fb = await prisma.lessonFeedback.findUnique({ where: { id: feedbackId }, include: { student: { include: { enrollment: true } } } });
  if (!fb || !fb.student.enrollment) return false;
  const assigned = await prisma.teacherAssignment.findFirst({ where: { teacherId, classId: fb.student.enrollment.classId } });
  if (!assigned) return false;
  await prisma.lessonFeedback.update({ where: { id: feedbackId }, data: { resolved: true } });
  return true;
}

// ---- Overview (dashboard) ----
export async function teacherOverview(teacherId: string) {
  const classes = await teacherClasses(teacherId);
  const weekAgo = new Date(Date.now() - 7 * DAY);

  let allStudents: StudentMetrics[] = [];
  const classCards = [] as { id: string; name: string; level: string; field: string | null; studentCount: number; avgProgress: number; alert: { type: "ok" | "warning" | "danger"; text: string } }[];

  for (const c of classes) {
    const totalLessons = await classLessonTotal(c.id);
    const enr = await prisma.enrollment.findMany({ where: { classId: c.id }, include: { student: true } });
    const metrics = await Promise.all(enr.map((e) => studentMetrics(e.student, totalLessons)));
    allStudents = allStudents.concat(metrics.map((m) => ({ ...m })));
    const avgProgress = metrics.length ? Math.round(metrics.reduce((s, m) => s + m.progressPct, 0) / metrics.length) : 0;
    const inactive = metrics.filter((m) => m.status === "inactive").length;
    const behind = metrics.filter((m) => m.status === "behind").length;
    let alert: { type: "ok" | "warning" | "danger"; text: string };
    if (inactive > 0) alert = { type: "danger", text: `${inactive} élève${inactive > 1 ? "s" : ""} inactif${inactive > 1 ? "s" : ""} 7+ j` };
    else if (behind > 0) alert = { type: "warning", text: `${behind} élève${behind > 1 ? "s" : ""} en difficulté` };
    else alert = { type: "ok", text: "Classe sur la bonne voie" };
    classCards.push({ id: c.id, name: c.name, level: c.level, field: c.field, studentCount: enr.length, avgProgress, alert });
  }

  const studentIds = [...new Set(allStudents.map((s) => s.id))];

  // KPIs
  const avgProgress = allStudents.length ? Math.round(allStudents.reduce((s, m) => s + m.progressPct, 0) / allStudents.length) : 0;
  const inactive7 = allStudents.filter((m) => m.status === "inactive").length;
  const copilotWeek = await prisma.copilotMessage.count({ where: { role: "user", createdAt: { gte: weekAgo }, thread: { studentId: { in: studentIds } } } });

  // Watchlist — most at-risk students
  const watchlist = allStudents
    .filter((m) => m.status !== "ok")
    .map((m) => {
      const reason = m.status === "inactive" ? `Inactif ${m.lastActiveDays ?? "?"} j` : m.avgQuiz !== null && m.avgQuiz < 55 ? `Quiz moyen ${m.avgQuiz}%` : `Progression ${m.progressPct}%`;
      return { id: m.id, firstName: m.firstName, lastName: m.lastName, avatarColor: m.avatarColor, status: m.status, reason };
    })
    .sort((a, b) => (a.status === "inactive" ? -1 : 1) - (b.status === "inactive" ? -1 : 1))
    .slice(0, 6);

  // Top copilot themes — by lesson (real counts; clustering is Phase 5)
  const themeThreads = await prisma.copilotThread.findMany({
    where: { studentId: { in: studentIds } },
    include: { lesson: { include: { module: { include: { subject: true } } } }, messages: { where: { role: "user" }, select: { id: true } } },
  });
  const themeMap = new Map<string, { label: string; subject: string; count: number }>();
  for (const t of themeThreads) {
    const key = t.lessonId;
    const e = themeMap.get(key) ?? { label: t.lesson.title, subject: t.lesson.module.subject.name, count: 0 };
    e.count += t.messages.length;
    themeMap.set(key, e);
  }
  const topThemes = [...themeMap.values()].sort((a, b) => b.count - a.count).slice(0, 4);

  // Weekly activity — last 7 days
  const since = new Date(Date.now() - 7 * DAY);
  const [completions, sessions, attempts] = await Promise.all([
    prisma.progress.findMany({ where: { studentId: { in: studentIds }, status: "COMPLETED", completedAt: { gte: since } }, select: { completedAt: true } }),
    prisma.sessionLog.findMany({ where: { studentId: { in: studentIds }, startedAt: { gte: since } }, select: { startedAt: true, seconds: true } }),
    prisma.quizAttempt.findMany({ where: { studentId: { in: studentIds }, createdAt: { gte: since } }, select: { createdAt: true } }),
  ]);
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) days.push(dayKey(new Date(Date.now() - i * DAY)));
  const lessonsSeries = days.map((d) => completions.filter((c) => c.completedAt && dayKey(c.completedAt) === d).length);
  const minutesSeries = days.map((d) => Math.round(sessions.filter((s) => dayKey(s.startedAt) === d).reduce((sum, s) => sum + s.seconds, 0) / 60));
  const quizSeries = days.map((d) => attempts.filter((a) => dayKey(a.createdAt) === d).length);

  return {
    kpis: {
      classes: classes.length,
      students: studentIds.length,
      avgProgress,
      inactive7,
      copilotWeek,
    },
    classes: classCards,
    watchlist,
    topThemes,
    weekly: {
      days: days.map((d) => d.slice(5)), // MM-DD
      lessons: lessonsSeries,
      minutes: minutesSeries,
      quizzes: quizSeries,
    },
  };
}
