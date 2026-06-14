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
  for (const k of ["name", "level", "field", "isArchived"]) if (k in body) data[k] = body[k];
  const cls = await prisma.classGroup.update({ where: { id: params.id }, data });
  await audit("CLASS_UPDATE", { actorId: u.userId, actorName: `${u.firstName} ${u.lastName}`, targetType: "class", targetId: params.id, meta: data });
  return NextResponse.json({ class: cls });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const u = await admin();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  await prisma.classGroup.delete({ where: { id: params.id } });
  await audit("CLASS_DELETE", { actorId: u.userId, actorName: `${u.firstName} ${u.lastName}`, targetType: "class", targetId: params.id });
  return NextResponse.json({ ok: true });
}
