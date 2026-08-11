import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, audit } from "@/lib/auth";
import { getAccessibleLesson } from "@/lib/path";

export const dynamic = "force-dynamic";

// GET → the student's current understanding rating for this lesson (or null).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "STUDENT") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const fb = await prisma.lessonFeedback.findUnique({
    where: { studentId_lessonId: { studentId: u.userId, lessonId: params.id } },
  });
  return NextResponse.json({ feedback: fb ? { understanding: fb.understanding, message: fb.message ?? "", resolved: fb.resolved } : null });
}

// POST { understanding: 0|25|50|75|100, message?: string } — upsert the rating.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "STUDENT") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  // Must be a lesson the student can access.
  const lesson = await getAccessibleLesson(u.userId, params.id);
  if (!lesson) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const understanding = Number(body.understanding);
  if (![0, 25, 50, 75, 100].includes(understanding)) {
    return NextResponse.json({ error: "BAD_VALUE" }, { status: 400 });
  }
  const message = understanding < 100 ? String(body.message || "").slice(0, 1000) : "";

  await prisma.lessonFeedback.upsert({
    where: { studentId_lessonId: { studentId: u.userId, lessonId: params.id } },
    update: { understanding, message: message || null, resolved: false },
    create: { studentId: u.userId, lessonId: params.id, understanding, message: message || null },
  });

  // Surface a low-understanding signal to the teacher feed.
  if (understanding < 75) {
    await audit("LESSON_FEEDBACK", {
      actorId: u.userId,
      actorName: `${u.firstName} ${u.lastName}`,
      targetType: "lesson",
      targetId: params.id,
      meta: { understanding },
    });
  }

  return NextResponse.json({ ok: true });
}
