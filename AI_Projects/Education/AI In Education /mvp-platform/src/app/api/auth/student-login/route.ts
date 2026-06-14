import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, verifySecret, audit } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60 * 1000;

export async function POST(req: Request) {
  let body: { classId?: string; studentId?: string; pin?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  const { classId, studentId, pin } = body;
  if (!classId || !studentId || !pin) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }

  const student = await prisma.user.findFirst({
    where: { id: studentId, role: "STUDENT", isActive: true, enrollment: { classId } },
    include: { enrollment: true },
  });
  if (!student) return NextResponse.json({ error: "INVALID" }, { status: 401 });

  if (student.lockedUntil && student.lockedUntil > new Date()) {
    return NextResponse.json({ error: "LOCKED", until: student.lockedUntil }, { status: 423 });
  }

  if (!verifySecret(String(pin), student.pinHash)) {
    const attempts = student.failedAttempts + 1;
    const lock = attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MS) : null;
    await prisma.user.update({
      where: { id: student.id },
      data: { failedAttempts: lock ? 0 : attempts, lockedUntil: lock },
    });
    await audit("LOGIN_FAIL", { actorId: student.id, actorName: `${student.firstName} ${student.lastName}`, targetType: "student" });
    return NextResponse.json(
      { error: lock ? "LOCKED" : "WRONG_PIN", remaining: Math.max(0, MAX_ATTEMPTS - attempts) },
      { status: lock ? 423 : 401 },
    );
  }

  await prisma.user.update({
    where: { id: student.id },
    data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  const session = await getSession();
  session.user = {
    userId: student.id,
    role: "STUDENT",
    firstName: student.firstName,
    lastName: student.lastName,
    classId: student.enrollment?.classId,
    locale: student.locale,
    lastActivity: Date.now(),
  };
  await session.save();
  await audit("LOGIN", { actorId: student.id, actorName: `${student.firstName} ${student.lastName}`, targetType: "student" });

  return NextResponse.json({ ok: true, role: "STUDENT", redirect: "/student/" });
}
