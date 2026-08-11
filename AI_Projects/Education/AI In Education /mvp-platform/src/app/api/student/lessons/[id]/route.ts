import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { SessionUser } from "@/lib/session";
import { getAccessibleLesson, subjectLessonOrder, getStudentClass } from "@/lib/path";
import { companionsForStudent, getViewableLesson, classScope } from "@/lib/studio";
import { withoutBlankQuestions } from "@/lib/quizContent";

export const dynamic = "force-dynamic";

type LessonWithModule = Awaited<ReturnType<typeof getAccessibleLesson>>;

// Never send answers to the client.
async function quizFor(lessonId: string) {
  const quiz = await prisma.quiz.findFirst({
    where: { lessonId },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!quiz) return null;
  // A question with nothing in it renders as a blank prompt over blank buttons, and
  // « Valider » stays disabled until the pupil "answers" it. saveQuiz no longer writes
  // one, but drafts written before that still can, so it is filtered here as well as
  // there. A quiz left with no questions is no quiz.
  const questions = withoutBlankQuestions(quiz.questions);
  if (!questions.length) return null;
  return {
    id: quiz.id,
    title: quiz.title,
    questions: questions.map((q) => ({
      id: q.id,
      type: q.type,
      promptMd: q.promptMd,
      options: q.optionsJson ? (JSON.parse(q.optionsJson) as string[]) : null,
    })),
  };
}

function lessonOut(lesson: NonNullable<LessonWithModule>) {
  return {
    id: lesson.id,
    title: lesson.title,
    contentMd: lesson.contentMd,
    estMinutes: lesson.estMinutes,
    moduleId: lesson.moduleId,
    moduleTitle: lesson.module.title,
    subjectName: lesson.module.subject.name,
    icon: lesson.module.subject.icon,
    color: lesson.module.subject.color,
  };
}

// Staff arrive here from the studio's « Vue élève » button, to see a lesson laid out the
// way their class will. The read is scoped by getViewableLesson — the same rule that
// decides what the studio may open — and nothing is recorded: no Progress row, no
// heartbeat, no XP. Every write route under /api/student stays STUDENT-only, so a
// preview cannot leave a trace even if the client tried.
async function staffPreview(u: SessionUser, lessonId: string, req: Request) {
  const lesson = await getViewableLesson(u, lessonId);
  // An unattached library lesson has no module, so no subject to sit in and no
  // neighbours to page through — the studio disables the button for those.
  if (!lesson || !lesson.module) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const withModule = lesson as NonNullable<LessonWithModule>;

  // The studio passes the class it is currently showing, so the preview includes the
  // compléments that class's teachers have published — that is part of what the student
  // sees. classScope rejects a class this user doesn't teach.
  const classId = new URL(req.url).searchParams.get("classId");
  const scope = classId ? await classScope(u, classId) : null;
  const companions = scope ? await companionsForStudent(withModule.id, scope.classId) : [];

  const order = await subjectLessonOrder(withModule.module.subjectSlug);
  const idx = order.indexOf(withModule.id);

  return NextResponse.json({
    lesson: lessonOut(withModule),
    progress: { status: "NOT_STARTED", totalSeconds: 0 },
    quiz: await quizFor(withModule.id),
    companions,
    // Free navigation: a student unlocks the next lesson by finishing this one, but staff
    // are reviewing the book and should be able to page straight through it.
    nav: {
      prevId: idx > 0 ? order[idx - 1] : null,
      nextId: idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null,
      index: idx,
      total: order.length,
      completed: false,
    },
    preview: true,
  });
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (u.role === "TEACHER" || u.role === "ADMIN") return staffPreview(u, params.id, req);
  if (u.role !== "STUDENT") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const lesson = await getAccessibleLesson(u.userId, params.id);
  if (!lesson) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const progress = await prisma.progress.findUnique({
    where: { studentId_lessonId: { studentId: u.userId, lessonId: lesson.id } },
  });

  // Teacher "compléments" attached to this book lesson, scoped to the student's class.
  const cls = await getStudentClass(u.userId);
  const companions = cls ? await companionsForStudent(lesson.id, cls.id) : [];

  const order = await subjectLessonOrder(lesson.module.subjectSlug);
  const idx = order.indexOf(lesson.id);
  const completed = progress?.status === "COMPLETED";
  const nextId = completed && idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
  const prevId = idx > 0 ? order[idx - 1] : null;

  return NextResponse.json({
    lesson: lessonOut(lesson),
    progress: { status: progress?.status ?? "NOT_STARTED", totalSeconds: progress?.totalSeconds ?? 0 },
    quiz: await quizFor(lesson.id),
    companions,
    nav: { prevId, nextId, index: idx, total: order.length, completed: !!completed },
  });
}
