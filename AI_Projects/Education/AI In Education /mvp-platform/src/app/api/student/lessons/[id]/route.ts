import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getAccessibleLesson, subjectLessonOrder } from "@/lib/path";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "STUDENT") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const lesson = await getAccessibleLesson(u.userId, params.id);
  if (!lesson) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const progress = await prisma.progress.findUnique({
    where: { studentId_lessonId: { studentId: u.userId, lessonId: lesson.id } },
  });
  const quiz = await prisma.quiz.findFirst({
    where: { lessonId: lesson.id },
    include: { questions: { orderBy: { order: "asc" } } },
  });

  const order = await subjectLessonOrder(lesson.module.subjectSlug);
  const idx = order.indexOf(lesson.id);
  const completed = progress?.status === "COMPLETED";
  const nextId = completed && idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
  const prevId = idx > 0 ? order[idx - 1] : null;

  // Never send answers to the client.
  const quizOut = quiz
    ? {
        id: quiz.id,
        title: quiz.title,
        questions: quiz.questions.map((q) => ({
          id: q.id,
          type: q.type,
          promptMd: q.promptMd,
          options: q.optionsJson ? (JSON.parse(q.optionsJson) as string[]) : null,
        })),
      }
    : null;

  return NextResponse.json({
    lesson: {
      id: lesson.id,
      title: lesson.title,
      contentMd: lesson.contentMd,
      estMinutes: lesson.estMinutes,
      moduleId: lesson.moduleId,
      moduleTitle: lesson.module.title,
      subjectName: lesson.module.subject.name,
      icon: lesson.module.subject.icon,
      color: lesson.module.subject.color,
    },
    progress: { status: progress?.status ?? "NOT_STARTED", totalSeconds: progress?.totalSeconds ?? 0 },
    quiz: quizOut,
    nav: { prevId, nextId, index: idx, total: order.length, completed: !!completed },
  });
}
