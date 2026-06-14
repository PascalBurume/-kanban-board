import { prisma } from "./db";
import { BADGE_HINTS } from "./badges";

// Subjects a class actually studies (driven by teacher assignments).
export async function accessibleSubjectSlugs(classId: string): Promise<string[]> {
  const tas = await prisma.teacherAssignment.findMany({
    where: { classId },
    select: { subjectSlug: true },
  });
  return [...new Set(tas.map((t) => t.subjectSlug))];
}

export async function getStudentClass(userId: string) {
  const enr = await prisma.enrollment.findUnique({ where: { studentId: userId }, include: { class: true } });
  return enr?.class ?? null;
}

// Modules a teacher has explicitly locked for a class. Modules are accessible by
// default — only the ids returned here are locked. Empty set = everything open.
export async function lockedModuleIds(classId: string): Promise<Set<string>> {
  const rows = await prisma.moduleLock.findMany({ where: { classId }, select: { moduleId: true } });
  return new Set(rows.map((r) => r.moduleId));
}

// "available": unlocked and open to the student (default). "current": the first
// not-yet-done lesson — a highlight, still freely accessible. "locked": the
// teacher has locked this lesson's module. "done": completed.
export type NodeStatus = "done" | "current" | "available" | "locked";

export interface PathLesson {
  id: string;
  title: string;
  status: NodeStatus;
  durationMin: number;
  hasQuiz: boolean;
}
export interface PathSubject {
  slug: string;
  name: string;
  icon: string | null;
  color: string | null;
  total: number;
  done: number;
  pct: number;
  lessons: PathLesson[];
}

// School-local day definition. The server may run in any timezone, so days are
// bucketed against a fixed offset rather than UTC. DRC ≈ UTC+2 (Lubumbashi);
// set 60 for Kinshasa (UTC+1). Used by the streak, the weekly chart, and badges
// so they all agree on what "today" means.
const SCHOOL_UTC_OFFSET_MIN = 120;

// The instant shifted into school-local time so the UTC getters read local fields.
function localShift(d: Date): Date {
  return new Date(d.getTime() + SCHOOL_UTC_OFFSET_MIN * 60 * 1000);
}

// School-local calendar day key, "YYYY-MM-DD".
function dayKey(d: Date): string {
  return localShift(d).toISOString().slice(0, 10);
}

const FR_DAYS_SHORT = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

function computeStreak(dates: Date[]): number {
  const days = new Set(dates.map(dayKey));
  if (days.size === 0) return 0;
  // Anchor on today (school-local); allow yesterday too, so an active streak
  // that hasn't been touched yet today still counts.
  const cur = localShift(new Date());
  const key = () => cur.toISOString().slice(0, 10);
  if (!days.has(key())) {
    cur.setUTCDate(cur.getUTCDate() - 1);
    if (!days.has(key())) return 0;
  }
  let streak = 0;
  while (days.has(key())) {
    streak++;
    cur.setUTCDate(cur.getUTCDate() - 1);
  }
  return streak;
}

// Current learning streak (consecutive school-local days with a session or a
// lesson completion). Shared by the dashboard and the badge-award routes.
export async function currentStreak(studentId: string): Promise<number> {
  const [sessions, completions] = await Promise.all([
    prisma.sessionLog.findMany({ where: { studentId }, select: { startedAt: true } }),
    prisma.progress.findMany({ where: { studentId, completedAt: { not: null } }, select: { completedAt: true } }),
  ]);
  return computeStreak([
    ...sessions.map((s) => s.startedAt),
    ...completions.map((c) => c.completedAt as Date),
  ]);
}

// The full learning path + stats for a student. Sequential unlock per subject:
// every module is accessible by default; a teacher may lock individual modules.
export async function buildStudentPath(userId: string) {
  const cls = await getStudentClass(userId);
  if (!cls) return null;

  const slugs = await accessibleSubjectSlugs(cls.id);
  const locked = await lockedModuleIds(cls.id);
  const subjects = await prisma.subject.findMany({
    where: { slug: { in: slugs } },
    orderBy: { order: "asc" },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: {
          lessons: {
            where: { status: "PUBLISHED" },
            orderBy: { order: "asc" },
            include: { quizzes: { select: { id: true } } },
          },
        },
      },
    },
  });

  const progressRows = await prisma.progress.findMany({ where: { studentId: userId } });
  const pmap = new Map(progressRows.map((p) => [p.lessonId, p]));

  let total = 0;
  let done = 0;
  let cont: { lessonId: string; title: string; subjectName: string; icon: string | null; color: string | null; hasQuiz: boolean } | null = null;

  const outSubjects: PathSubject[] = [];
  let sawCurrent = false; // first not-done lesson in an unlocked module
  for (const subj of subjects) {
    const lessons: PathLesson[] = [];
    let subjDone = 0;
    // All lessons across the subject's modules, in module → lesson order.
    for (const m of subj.modules) {
      const modLocked = locked.has(m.id);
      for (const l of m.lessons) {
        total++;
        const completed = pmap.get(l.id)?.status === "COMPLETED";
        let status: NodeStatus;
        if (completed) {
          status = "done";
          subjDone++;
          done++;
        } else if (modLocked) {
          status = "locked";
        } else if (!sawCurrent) {
          status = "current";
          sawCurrent = true;
          cont = { lessonId: l.id, title: l.title, subjectName: subj.name, icon: subj.icon, color: subj.color, hasQuiz: l.quizzes.length > 0 };
        } else {
          status = "available";
        }
        lessons.push({ id: l.id, title: l.title, status, durationMin: l.estMinutes, hasQuiz: l.quizzes.length > 0 });
      }
    }
    if (lessons.length === 0) continue;
    outSubjects.push({
      slug: subj.slug,
      name: subj.name,
      icon: subj.icon,
      color: subj.color,
      total: lessons.length,
      done: subjDone,
      pct: Math.round((subjDone / lessons.length) * 100),
      lessons,
    });
  }

  // XP: 50 per completed lesson + best score per quiz attempted.
  const quizBest = await prisma.quizAttempt.groupBy({
    by: ["quizId"],
    where: { studentId: userId },
    _max: { score: true },
  });
  const quizXp = quizBest.reduce((s, q) => s + (q._max.score ?? 0), 0);
  const xp = done * 50 + quizXp;
  const level = Math.floor(xp / 500) + 1;

  // Streak + weekly activity from session + completion days.
  const sessions = await prisma.sessionLog.findMany({ where: { studentId: userId }, select: { startedAt: true, seconds: true } });
  const completions = progressRows.filter((p) => p.completedAt).map((p) => p.completedAt as Date);
  const streak = computeStreak([...sessions.map((s) => s.startedAt), ...completions]);

  // Per-day study minutes for the last 7 school-local days (oldest → today).
  const secByDay = new Map<string, number>();
  for (const s of sessions) secByDay.set(dayKey(s.startedAt), (secByDay.get(dayKey(s.startedAt)) ?? 0) + s.seconds);
  const todayLocal = localShift(new Date());
  const todayKey = todayLocal.toISOString().slice(0, 10);
  const weekDays: { label: string; minutes: number; isToday: boolean }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayLocal.getTime());
    d.setUTCDate(d.getUTCDate() - i);
    const k = d.toISOString().slice(0, 10);
    weekDays.push({ label: FR_DAYS_SHORT[d.getUTCDay()], minutes: Math.round((secByDay.get(k) ?? 0) / 60), isToday: k === todayKey });
  }
  const weekMinutes = weekDays.reduce((sum, w) => sum + w.minutes, 0);

  const badgeDefs = await prisma.badge.findMany({ orderBy: { name: "asc" } });
  const awards = await prisma.badgeAward.findMany({ where: { studentId: userId }, select: { badgeId: true } });
  const earned = new Set(awards.map((a) => a.badgeId));
  const badges = badgeDefs.map((b) => {
    const isEarned = earned.has(b.id);
    const badge: { slug: string; name: string; icon: string | null; earned: boolean; hint: string; sub?: string } = {
      slug: b.slug,
      name: b.name,
      icon: b.icon,
      earned: isEarned,
      hint: BADGE_HINTS[b.slug] ?? b.rule,
    };
    if (!isEarned && b.slug === "streak-7") badge.sub = `${streak}/7 j`;
    return badge;
  });

  return {
    className: cls.name,
    stats: {
      xp,
      level,
      streak,
      completed: done,
      total,
      overallPct: total ? Math.round((done / total) * 100) : 0,
      weekMinutes,
      weekDays,
      badges,
    },
    continue: cont,
    nextQuiz: cont?.hasQuiz ? { lessonId: cont.lessonId, title: cont.title } : null,
    subjects: outSubjects,
  };
}

// Verify the lesson exists, is published, and belongs to a subject the student's
// class studies. Returns the lesson with relations, or null if inaccessible.
export async function getAccessibleLesson(userId: string, lessonId: string) {
  const cls = await getStudentClass(userId);
  if (!cls) return null;
  const slugs = await accessibleSubjectSlugs(cls.id);
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, status: "PUBLISHED", module: { subjectSlug: { in: slugs } } },
    include: { module: { include: { subject: true } } },
  });
  if (!lesson) return null;
  // Block lessons whose module the teacher has locked for this class.
  const locked = await lockedModuleIds(cls.id);
  if (locked.has(lesson.moduleId)) return null;
  return lesson;
}

// Ordered lessons of a subject (all lessons, module → lesson order) — for
// prev/next navigation across multi-lesson modules.
export async function subjectLessonOrder(subjectSlug: string): Promise<string[]> {
  const modules = await prisma.module.findMany({
    where: { subjectSlug },
    orderBy: { order: "asc" },
    include: { lessons: { where: { status: "PUBLISHED" }, orderBy: { order: "asc" }, select: { id: true } } },
  });
  return modules.flatMap((m) => m.lessons.map((l) => l.id));
}
