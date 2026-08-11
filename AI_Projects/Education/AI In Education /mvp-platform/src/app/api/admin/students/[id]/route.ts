import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, audit } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function admin() {
  const u = await getCurrentUser();
  return u && u.role === "ADMIN" ? u : null;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const u = await admin();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  for (const k of ["firstName", "lastName", "isActive"]) if (k in body) data[k] = body[k];
  if (Object.keys(data).length) await prisma.user.update({ where: { id: params.id }, data });
  if (body.classId) {
    await prisma.enrollment.upsert({
      where: { studentId: params.id },
      update: { classId: body.classId },
      create: { studentId: params.id, classId: body.classId },
    });
  }
  await audit("STUDENT_UPDATE", { actorId: u.userId, actorName: `${u.firstName} ${u.lastName}`, targetType: "student", targetId: params.id, meta: { ...data, classId: body.classId } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const u = await admin();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  await prisma.user.delete({ where: { id: params.id } });
  await audit("STUDENT_DELETE", { actorId: u.userId, actorName: `${u.firstName} ${u.lastName}`, targetType: "student", targetId: params.id });
  return NextResponse.json({ ok: true });
}
