import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, audit } from "@/lib/auth";
import { isValidLevelField } from "@/lib/admin";

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

  // A partial update can change only one half of the pair — validate the result.
  if ("level" in data || "field" in data) {
    const current = await prisma.classGroup.findUnique({ where: { id: params.id }, select: { level: true, field: true } });
    if (!current) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const level = ("level" in data ? data.level : current.level) as string;
    const field = ("field" in data ? data.field : current.field) as string | null;
    if (!(await isValidLevelField(level, field))) return NextResponse.json({ error: "BAD_OFFERING" }, { status: 400 });
  }

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
