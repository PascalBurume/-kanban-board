import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, audit } from "@/lib/auth";
import { offeringOptions, isValidLevelField } from "@/lib/admin";

export const dynamic = "force-dynamic";

async function admin() {
  const u = await getCurrentUser();
  return u && u.role === "ADMIN" ? u : null;
}

export async function GET() {
  if (!(await admin())) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const classes = await prisma.classGroup.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { enrollments: true, teacherAssignments: true } } },
  });
  return NextResponse.json({
    classes: classes.map((c) => ({
      id: c.id,
      name: c.name,
      level: c.level,
      field: c.field,
      year: c.year,
      isArchived: c.isArchived,
      inviteCode: c.inviteCode,
      studentCount: c._count.enrollments,
      teacherCount: c._count.teacherAssignments,
    })),
    offerings: await offeringOptions(), // the (level, field) pairs the class form may offer
  });
}

export async function POST(req: Request) {
  const u = await admin();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const { name, level, field } = body;
  if (!name || !level) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  if (!(await isValidLevelField(level, field))) return NextResponse.json({ error: "BAD_OFFERING" }, { status: 400 });
  const exists = await prisma.classGroup.findUnique({ where: { name } });
  if (exists) return NextResponse.json({ error: "DUPLICATE" }, { status: 409 });
  const cls = await prisma.classGroup.create({ data: { name, level, field: field || null, year: 2025 } });
  await audit("CLASS_CREATE", { actorId: u.userId, actorName: `${u.firstName} ${u.lastName}`, targetType: "class", targetId: cls.id, meta: { name } });
  return NextResponse.json({ class: cls });
}
