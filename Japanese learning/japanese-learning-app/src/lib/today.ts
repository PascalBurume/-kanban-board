// Today's plan generator. Real implementation in Phase 4 will pull due SRS
// cards via FSRS. For now we stitch together a deterministic plan from
// available content so the dashboard always has something to render.

import { prisma } from "@/lib/db";

export interface TodayTask {
  id: string;
  kind: "srs" | "lesson" | "kanji" | "nhk" | "shadow";
  title: string;
  subtitle: string;
  minutes: number;
  href: string;
  done?: boolean;
  current?: boolean;
}

export async function buildTodayPlan(userLevel: string): Promise<TodayTask[]> {
  const [dueSrsCount, nextLesson, nextKanji, latestClip] = await Promise.all([
    prisma.sRSCard.count({ where: { dueDate: { lte: new Date() } } }),
    prisma.lesson.findFirst({
      where: { course: { level: { contains: userLevel.charAt(1) } } },
      orderBy: [{ courseId: "asc" }, { number: "asc" }],
      include: { grammarPoints: { take: 1, orderBy: { order: "asc" } } },
    }),
    prisma.kanji.findFirst({
      where: { jlptLevel: userLevel },
      orderBy: { strokes: "asc" },
    }),
    prisma.nHKClip.findFirst({ orderBy: { publishedAt: "desc" } }),
  ]);

  const plan: TodayTask[] = [
    {
      id: "srs",
      kind: "srs",
      title: "Spaced repetition",
      subtitle: `${dueSrsCount || 12} cards due`,
      minutes: 6,
      href: "/srs",
      done: true,
    },
    {
      id: "lesson",
      kind: "lesson",
      title: nextLesson
        ? `Lesson ${nextLesson.number} · ${nextLesson.titleEn}`
        : "Pattern card · ても form",
      subtitle:
        nextLesson?.grammarPoints[0]?.title ?? "even if / even though",
      minutes: 9,
      href: nextLesson ? `/lessons/${nextLesson.id}` : "/lessons",
      current: true,
    },
    {
      id: "kanji",
      kind: "kanji",
      title: "Kanji of the day",
      subtitle: nextKanji
        ? `${nextKanji.character} · ${nextKanji.meaning}`
        : "学 · learn, study",
      minutes: 5,
      href: nextKanji ? `/kanji/${encodeURIComponent(nextKanji.character)}` : "/kanji",
    },
    {
      id: "nhk",
      kind: "nhk",
      title: "NHK listening",
      subtitle: latestClip ? latestClip.titleJp : "1 clip · sentence loop",
      minutes: 4,
      href: latestClip ? `/nhk/${latestClip.id}` : "/nhk",
    },
    {
      id: "shadow",
      kind: "shadow",
      title: "Shadow a sentence",
      subtitle: "毎朝コーヒーを飲みます。",
      minutes: 3,
      href: "/srs",
    },
  ];
  return plan;
}
