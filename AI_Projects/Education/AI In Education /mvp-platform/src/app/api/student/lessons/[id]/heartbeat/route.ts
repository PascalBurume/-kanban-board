import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getAccessibleLesson } from "@/lib/path";

export const dynamic = "force-dynamic";

const MAX_BEAT_SECONDS = 90; // clamp per call (client beats every ~30s)

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "STUDENT") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  let body: { seconds?: number };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const seconds = Math.min(Math.max(Math.floor(Number(body.seconds) || 0), 0), MAX_BEAT_SECONDS);
  if (seconds <= 0) return NextResponse.json({ ok: true, totalSeconds: 0 });

  const lesson = await getAccessibleLesson(u.userId, params.id);
  if (!lesson) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const existing = await prisma.progress.findUnique({
    where: { studentId_lessonId: { studentId: u.userId, lessonId: lesson.id } },
  });
  const status = existing?.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS";

  const pr = await prisma.progress.upsert({
    where: { studentId_lessonId: { studentId: u.userId, lessonId: lesson.id } },
    update: { totalSeconds: { increment: seconds }, status },
    create: { studentId: u.userId, lessonId: lesson.id, status: "IN_PROGRESS", totalSeconds: seconds },
  });
  await prisma.sessionLog.create({
    data: { studentId: u.userId, lessonId: lesson.id, seconds, endedAt: new Date() },
  });

  return NextResponse.json({ ok: true, totalSeconds: pr.totalSeconds });
}
