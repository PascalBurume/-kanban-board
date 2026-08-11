import { prisma } from "./db";

// Fully-offline keyword/TF-IDF clustering of student Copilot questions into
// misconception themes, plus a per-lesson confusion heatmap and usage-by-hour.

const STOP = new Set([
  "je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles", "me", "te", "se", "moi", "toi",
  "ne", "pas", "plus", "de", "des", "du", "la", "le", "les", "un", "une", "et", "ou", "a", "au", "aux",
  "en", "ce", "cet", "cette", "ces", "mon", "ma", "mes", "ton", "ta", "tes", "son", "sa", "ses",
  "est", "sont", "ai", "as", "que", "qui", "quoi", "quel", "quelle", "quels", "quelles",
  "pour", "dans", "sur", "avec", "sans", "cela", "ca", "mais", "donc", "si", "par", "entre", "deux",
  "sil", "plait", "stp", "merci", "bien", "tres", "lecon", "ceci", "tout", "fait", "elle", "celle",
  "comment", "pourquoi", "est-ce", "y", "s", "l", "d", "c", "t", "n", "j", "m", "qu", "sa",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z\s']/g, " ")
    .replace(/'/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

type Msg = {
  content: string;
  createdAt: Date;
  studentId: string;
  lessonId: string;
  lessonTitle: string;
  moduleId: string;
  moduleTitle: string;
  subject: string;
  icon: string | null;
};

async function teacherStudentIds(teacherId: string, classId?: string): Promise<string[]> {
  const tas = await prisma.teacherAssignment.findMany({ where: { teacherId, ...(classId ? { classId } : {}) }, select: { classId: true } });
  const classIds = [...new Set(tas.map((t) => t.classId))];
  if (classIds.length === 0) return [];
  const enr = await prisma.enrollment.findMany({ where: { classId: { in: classIds } }, select: { studentId: true } });
  return [...new Set(enr.map((e) => e.studentId))];
}

// Insights look back over a rolling window. Older questions rarely reflect a
// class's *current* misconceptions, and bounding the corpus keeps the
// (synchronous) TF-IDF pass cheap as usage accumulates over a semester. The
// teacher can widen it; 0 means "all history" (no lower bound).
export const WINDOW_CHOICES = [7, 30, 90, 0] as const;
const DEFAULT_WINDOW_DAYS = 30;

// Clamp an arbitrary caller value to one of the allowed windows (default 30).
function normalizeWindow(days?: number): number {
  return days != null && (WINDOW_CHOICES as readonly number[]).includes(days) ? days : DEFAULT_WINDOW_DAYS;
}

// Short-TTL memo so revisiting /insights (or flipping a filter back) doesn't
// recompute the whole corpus. 60s of staleness is fine for an analytics view;
// single-server offline deploy, so a module-level Map is enough (same pattern
// as the rate limiter in api/teacher/agent). Alternative not taken: key on a
// cheap copilotMessage.count so it invalidates the instant a new question lands
// — deferred until per-second freshness actually matters.
type Insights = Awaited<ReturnType<typeof computeInsights>>;
const CACHE_TTL_MS = 60000;
const cache = new Map<string, { expires: number; data: Insights }>();

export async function buildInsights(teacherId: string, classId?: string, days?: number): Promise<Insights> {
  const windowDays = normalizeWindow(days);
  const key = `${teacherId}:${classId ?? "all"}:${windowDays}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;
  const data = await computeInsights(teacherId, classId, windowDays);
  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, data });
  return data;
}

async function computeInsights(teacherId: string, classId: string | undefined, windowDays: number) {
  const studentIds = await teacherStudentIds(teacherId, classId);
  if (studentIds.length === 0) {
    return { kpis: { questions: 0, students: 0, themes: 0, peakHour: null, windowDays }, clusters: [], topQuestions: [], heatmap: { cells: [], max: 0 }, modules: [], usageByHour: Array(24).fill(0) };
  }

  // windowDays === 0 → all history (no lower bound on createdAt).
  const createdAt = windowDays > 0 ? { gte: new Date(Date.now() - windowDays * 86400000) } : undefined;
  const rows = await prisma.copilotMessage.findMany({
    where: { role: "user", ...(createdAt ? { createdAt } : {}), thread: { studentId: { in: studentIds } } },
    include: { thread: { include: { lesson: { include: { module: { include: { subject: true } } } } } } },
    orderBy: { createdAt: "desc" },
  });

  const msgs: Msg[] = rows.map((r) => ({
    content: r.content,
    createdAt: r.createdAt,
    studentId: r.thread.studentId,
    lessonId: r.thread.lessonId,
    lessonTitle: r.thread.lesson.title,
    moduleId: r.thread.lesson.module?.id ?? "",
    moduleTitle: r.thread.lesson.module?.title ?? "—",
    subject: r.thread.lesson.module?.subject.name ?? "—",
    icon: r.thread.lesson.module?.subject.icon ?? null,
  }));

  const N = msgs.length;

  // ---- IDF over the corpus ----
  const df = new Map<string, number>();
  const tokensPerMsg = msgs.map((m) => {
    const toks = tokenize(m.content);
    for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
    return toks;
  });
  const idf = (t: string) => Math.log((N + 1) / ((df.get(t) ?? 0) + 1)) + 1;

  // ---- assign each message to its top TF-IDF term (cluster key) ----
  type Cluster = { key: string; msgs: number[]; students: Set<string>; lessons: Map<string, { title: string; subject: string; count: number }>; terms: Map<string, number>; texts: Map<string, number> };
  const clusterMap = new Map<string, Cluster>();
  tokensPerMsg.forEach((toks, i) => {
    if (toks.length === 0) return;
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    let best = "";
    let bestScore = -1;
    for (const [t, f] of tf) {
      const score = f * idf(t);
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    if (!best) return;
    const m = msgs[i];
    const c: Cluster = clusterMap.get(best) ?? { key: best, msgs: [], students: new Set<string>(), lessons: new Map(), terms: new Map(), texts: new Map() };
    c.msgs.push(i);
    c.students.add(m.studentId);
    const lk = c.lessons.get(m.lessonId) ?? { title: m.lessonTitle, subject: m.subject, count: 0 };
    lk.count++;
    c.lessons.set(m.lessonId, lk);
    for (const t of toks) c.terms.set(t, (c.terms.get(t) ?? 0) + 1);
    c.texts.set(m.content, (c.texts.get(m.content) ?? 0) + 1);
    clusterMap.set(best, c);
  });

  const clusters = [...clusterMap.values()]
    .map((c) => {
      const label = [...c.texts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? c.key;
      const keywords = [...c.terms.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t);
      const lessons = [...c.lessons.values()].sort((a, b) => b.count - a.count).slice(0, 3);
      return { key: c.key, label, keywords, count: c.msgs.length, students: c.students.size, lessons };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 18); // grouped by severity in the UI, so a longer list stays scannable

  // ---- top questions (verbatim) ----
  const textMap = new Map<string, { count: number; students: Set<string> }>();
  msgs.forEach((m) => {
    const e = textMap.get(m.content) ?? { count: 0, students: new Set<string>() };
    e.count++;
    e.students.add(m.studentId);
    textMap.set(m.content, e);
  });
  const topQuestions = [...textMap.entries()]
    .map(([text, e]) => ({ text, count: e.count, students: e.students.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // ---- confusion heatmap (per lesson) ----
  const lessonMap = new Map<string, { title: string; subject: string; icon: string | null; count: number }>();
  msgs.forEach((m) => {
    const e = lessonMap.get(m.lessonId) ?? { title: m.lessonTitle, subject: m.subject, icon: m.icon, count: 0 };
    e.count++;
    lessonMap.set(m.lessonId, e);
  });
  const cells = [...lessonMap.values()].sort((a, b) => b.count - a.count).slice(0, 18);
  const maxCell = cells.reduce((m, c) => Math.max(m, c.count), 0);

  // ---- module → lesson → questions hierarchy (drill-down) ----
  // Group the same messages by module, then by lesson, then by verbatim question,
  // so a teacher can open a module and read exactly what students asked, lesson by
  // lesson. Only lessons that received questions appear.
  type LAgg = { lessonId: string; lessonTitle: string; students: Set<string>; q: Map<string, { count: number; students: Set<string> }>; count: number };
  type MAgg = { moduleId: string; moduleTitle: string; subjectName: string; subjectIcon: string | null; total: number; lessons: Map<string, LAgg> };
  const modMap = new Map<string, MAgg>();
  msgs.forEach((m) => {
    const mod = modMap.get(m.moduleId) ?? { moduleId: m.moduleId, moduleTitle: m.moduleTitle, subjectName: m.subject, subjectIcon: m.icon, total: 0, lessons: new Map<string, LAgg>() };
    mod.total++;
    const les = mod.lessons.get(m.lessonId) ?? { lessonId: m.lessonId, lessonTitle: m.lessonTitle, students: new Set<string>(), q: new Map(), count: 0 };
    les.count++;
    les.students.add(m.studentId);
    const qe = les.q.get(m.content) ?? { count: 0, students: new Set<string>() };
    qe.count++;
    qe.students.add(m.studentId);
    les.q.set(m.content, qe);
    mod.lessons.set(m.lessonId, les);
    modMap.set(m.moduleId, mod);
  });
  const modules = [...modMap.values()]
    .map((mod) => ({
      moduleId: mod.moduleId,
      moduleTitle: mod.moduleTitle,
      subjectName: mod.subjectName,
      subjectIcon: mod.subjectIcon,
      total: mod.total,
      lessons: [...mod.lessons.values()]
        .map((l) => {
          const allQ = [...l.q.entries()].map(([text, e]) => ({ text, count: e.count, students: e.students.size })).sort((a, b) => b.count - a.count);
          return {
            lessonId: l.lessonId,
            lessonTitle: l.lessonTitle,
            count: l.count,
            students: l.students.size,
            questions: allQ.slice(0, 8),
            moreQuestions: Math.max(0, allQ.length - 8),
          };
        })
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.total - a.total);

  // ---- usage by hour ----
  const usageByHour = Array(24).fill(0);
  msgs.forEach((m) => {
    usageByHour[m.createdAt.getHours()]++;
  });
  let peakHour: number | null = null;
  let peakVal = -1;
  usageByHour.forEach((v, h) => {
    if (v > peakVal) {
      peakVal = v;
      peakHour = h;
    }
  });

  return {
    kpis: { questions: N, students: new Set(msgs.map((m) => m.studentId)).size, themes: clusters.length, peakHour, windowDays },
    clusters,
    topQuestions,
    heatmap: { cells, max: maxCell },
    modules,
    usageByHour,
  };
}
