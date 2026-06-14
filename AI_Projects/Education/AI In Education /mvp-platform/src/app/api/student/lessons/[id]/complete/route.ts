import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, audit } from "@/lib/auth";
import { getAccessibleLesson, subjectLessonOrder, currentStreak } from "@/lib/path";
import { awardBadge } from "@/lib/badges";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "STUDENT") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const lesson = await getAccessibleLesson(u.userId, params.id);
  if (!lesson) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const already = await prisma.progress.findUnique({
    where: { studentId_lessonId: { studentId: u.userId, lessonId: lesson.id } },
  });
  const firstTime = already?.status !== "COMPLETED";

  await prisma.progress.upsert({
    where: { studentId_lessonId: { studentId: u.userId, lessonId: lesson.id } },
    update: { status: "COMPLETED", completedAt: new Date() },
    create: { studentId: u.userId, lessonId: lesson.id, status: "COMPLETED", completedAt: new Date() },
  });

  // Award badges on first ever completion of this lesson.
  if (firstTime) {
    const completedCount = await prisma.progress.count({ where: { studentId: u.userId, status: "COMPLETED" } });
    if (completedCount === 1) await awardBadge(u.userId, "first-module");
    // A completion extends today's streak — award the 7-day badge if reached.
    if ((await currentStreak(u.userId)) >= 7) await awardBadge(u.userId, "streak-7");
    await audit("LESSON_COMPLETE", { actorId: u.userId, actorName: `${u.firstName} ${u.lastName}`, targetType: "lesson", targetId: lesson.id });
  }

  const order = await subjectLessonOrder(lesson.module.subjectSlug);
  const idx = order.indexOf(lesson.id);
  const nextId = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;

  return NextResponse.json({ ok: true, xpGained: firstTime ? 50 : 0, nextId });
}
