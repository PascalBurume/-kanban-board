import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { resolveCopilotEnabled } from "@/lib/teacher";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "STUDENT") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const lessonId = new URL(req.url).searchParams.get("lessonId");
  if (!lessonId) return NextResponse.json({ error: "MISSING_LESSON" }, { status: 400 });

  const classId = u.classId ?? (await prisma.enrollment.findUnique({ where: { studentId: u.userId } }))?.classId;
  const enabled = classId ? await resolveCopilotEnabled(u.userId, classId) : true;

  const thread = await prisma.copilotThread.findFirst({
    where: { studentId: u.userId, lessonId },
    orderBy: { startedAt: "desc" },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  return NextResponse.json({
    enabled,
    messages: thread ? thread.messages.map((m) => ({ role: m.role, content: m.content })) : [],
  });
}

// Reset the conversation: delete the student's thread(s) for this lesson.
// Messages cascade-delete with the thread. Scoped to the current student so a
// student can only clear their own chat.
export async function DELETE(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "STUDENT") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const lessonId = new URL(req.url).searchParams.get("lessonId");
  if (!lessonId) return NextResponse.json({ error: "MISSING_LESSON" }, { status: 400 });

  await prisma.copilotThread.deleteMany({ where: { studentId: u.userId, lessonId } });
  return NextResponse.json({ ok: true });
}
