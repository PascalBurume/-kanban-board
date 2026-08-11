import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { teacherClasses } from "@/lib/teacher";

export const dynamic = "force-dynamic";

// List of the teacher's classes (for the class-detail picker).
export async function GET() {
  const u = await getCurrentUser();
  if (!u || u.role !== "TEACHER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const cs = await teacherClasses(u.userId);
  const classes = await Promise.all(
    cs.map(async (c) => ({
      id: c.id,
      name: c.name,
      level: c.level,
      field: c.field,
      isLead: c.isLead,
      studentCount: await prisma.enrollment.count({ where: { classId: c.id } }),
    })),
  );
  return NextResponse.json({ classes });
}
