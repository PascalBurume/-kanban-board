import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { setCopilotPolicy } from "@/lib/teacher";

export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "TEACHER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  let body: { scope?: "CLASS" | "STUDENT"; classId?: string; studentIds?: string[]; enabled?: boolean; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  const { scope, classId, studentIds, enabled, reason } = body;
  if (!scope || !classId || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }

  // Teacher must own the class.
  const assigned = await prisma.teacherAssignment.findFirst({ where: { teacherId: u.userId, classId } });
  if (!assigned) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  if (scope === "STUDENT") {
    const ids = studentIds ?? [];
    if (ids.length === 0) return NextResponse.json({ error: "NO_STUDENTS" }, { status: 400 });
    const enrolled = await prisma.enrollment.count({ where: { classId, studentId: { in: ids } } });
    if (enrolled !== ids.length) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  await setCopilotPolicy({
    scope,
    classId,
    studentIds,
    enabled,
    reason,
    setById: u.userId,
    actorName: `${u.firstName} ${u.lastName}`,
  });

  return NextResponse.json({ ok: true });
}
