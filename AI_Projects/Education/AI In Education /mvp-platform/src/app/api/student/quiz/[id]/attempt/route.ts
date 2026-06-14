import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getAccessibleLesson, currentStreak } from "@/lib/path";
import { awardBadge } from "@/lib/badges";

export const dynamic = "force-dynamic";

function gradeShort(given: unknown, accepted: unknown): boolean {
  const norm = String(given ?? "").trim().toLowerCase();
  if (!norm) return false;
  const list = (Array.isArray(accepted) ? accepted : [accepted]).map((a) => String(a).toLowerCase());
  return list.some((a) => norm === a || (a.length > 2 && norm.includes(a)));
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "STUDENT") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  let body: { answers?: Record<string, unknown>; durationS?: number };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const answers = body.answers ?? {};

  const quiz = await prisma.quiz.findUnique({
    where: { id: params.id },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!quiz) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Authorize via the lesson the quiz belongs to.
  const lesson = await getAccessibleLesson(u.userId, quiz.lessonId);
  if (!lesson) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  let correct = 0;
  const results = quiz.questions.map((q) => {
    const given = (answers as Record<string, unknown>)[q.id];
    const answer = JSON.parse(q.answerJson);
    let ok = false;
    if (q.type === "MCQ") ok = Number(given) === Number(answer);
    else if (q.type === "TF") ok = Boolean(given) === Boolean(answer);
    else if (q.type === "SHORT") ok = gradeShort(given, answer);
    if (ok) correct++;
    return { questionId: q.id, correct: ok, correctAnswer: answer, explanationMd: q.explanationMd };
  });

  const total = quiz.questions.length;
  const score = total ? Math.round((correct / total) * 100) : 0;

  await prisma.quizAttempt.create({
    data: {
      studentId: u.userId,
      quizId: quiz.id,
      score,
      answersJson: JSON.stringify(answers),
      durationS: Math.max(0, Math.floor(Number(body.durationS) || 0)),
    },
  });

  if (score === 100) await awardBadge(u.userId, "perfect-quiz");
  // The attempt counts as activity today — award the 7-day streak if reached.
  if ((await currentStreak(u.userId)) >= 7) await awardBadge(u.userId, "streak-7");

  return NextResponse.json({ score, correct, total, results });
}
