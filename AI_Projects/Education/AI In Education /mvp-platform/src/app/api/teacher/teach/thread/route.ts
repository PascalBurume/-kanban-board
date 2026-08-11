import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getViewableLesson, classForLessonInScope } from "@/lib/studio";
import { canCompose, teacherTurns, classSignals, NO_SIGNALS, COMPOSE_MIN_TURNS } from "@/lib/teachCopilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function staff() {
  const u = await getCurrentUser();
  return u && (u.role === "TEACHER" || u.role === "ADMIN") ? u : null;
}

// GET /api/teacher/teach/thread/?lessonId=…
// Returns the conversation plus the unlock state, so the client never has to
// re-derive the rule — one definition of "ready to compose", on the server.
export async function GET(req: Request) {
  const u = await staff();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const lessonId = new URL(req.url).searchParams.get("lessonId");
  if (!lessonId) return NextResponse.json({ error: "MISSING_LESSON" }, { status: 400 });

  const lesson = await getViewableLesson(u, lessonId).catch(() => null);
  if (!lesson) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const thread = await prisma.teachThread.findUnique({
    where: { teacherId_lessonId: { teacherId: u.userId, lessonId } },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  const messages = (thread?.messages ?? []).map((m) => ({ role: m.role, content: m.content }));

  // The same signals the coach is reading, handed to the panel so the teacher can see
  // WHY the advice is about their room. Never fatal: a missing RAG index or an
  // insights hiccup costs the sidebar, not the conversation.
  const classId = await classForLessonInScope(u, lessonId).catch(() => null);
  const signals = await classSignals(u, lessonId, classId).catch(() => NO_SIGNALS);

  return NextResponse.json(
    {
      messages,
      turns: teacherTurns(messages),
      canCompose: canCompose(messages),
      minTurns: COMPOSE_MIN_TURNS,
      canEdit: lesson.authorId === u.userId || u.role === "ADMIN",
      lessonTitle: lesson.title,
      signals,
    },
    { headers: { "Cache-Control": "no-store, must-revalidate" } },
  );
}

// DELETE /api/teacher/teach/thread/?lessonId=… — start the conversation over.
export async function DELETE(req: Request) {
  const u = await staff();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const lessonId = new URL(req.url).searchParams.get("lessonId");
  if (!lessonId) return NextResponse.json({ error: "MISSING_LESSON" }, { status: 400 });
  await prisma.teachThread.deleteMany({ where: { teacherId: u.userId, lessonId } });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
