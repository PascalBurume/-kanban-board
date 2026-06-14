import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, audit, hashSecret } from "@/lib/auth";
import { genPin, avatarColor } from "@/lib/admin";

export const dynamic = "force-dynamic";

async function admin() {
  const u = await getCurrentUser();
  return u && u.role === "ADMIN" ? u : null;
}

export async function GET(req: Request) {
  if (!(await admin())) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const classId = searchParams.get("class");
  const q = searchParams.get("q")?.trim();
  const where: Record<string, unknown> = { role: "STUDENT" };
  if (classId) where.enrollment = { classId };
  if (q) where.OR = [{ firstName: { contains: q } }, { lastName: { contains: q } }];
  const students = await prisma.user.findMany({
    where,
    include: { enrollment: { include: { class: true } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return NextResponse.json({
    students: students.map((s) => ({
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      avatarColor: s.avatarColor,
      className: s.enrollment?.class.name ?? null,
      classId: s.enrollment?.classId ?? null,
      isActive: s.isActive,
      lastLoginAt: s.lastLoginAt ? s.lastLoginAt.toISOString() : null,
    })),
  });
}

export async function POST(req: Request) {
  const u = await admin();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const { firstName, lastName, classId } = body;
  if (!firstName || !classId) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  const pin = genPin();
  const student = await prisma.user.create({
    data: {
      role: "STUDENT",
      firstName,
      lastName: lastName || "",
      pinHash: hashSecret(pin),
      avatarColor: avatarColor(`${firstName} ${lastName || ""}`),
      locale: "fr",
    },
  });
  await prisma.enrollment.create({ data: { studentId: student.id, classId } });
  await audit("STUDENT_CREATE", { actorId: u.userId, actorName: `${u.firstName} ${u.lastName}`, targetType: "student", targetId: student.id });
  return NextResponse.json({ student: { id: student.id, firstName, lastName }, pin });
}
