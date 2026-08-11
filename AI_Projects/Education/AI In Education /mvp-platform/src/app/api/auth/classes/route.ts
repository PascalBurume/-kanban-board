import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Public — drives the 3-step login picker (class grid → student grid).
// Returns only what the login screen needs; no secrets.
// Only classes that already have a supervisor (lead teacher / titulaire) are
// exposed here; unassigned classes stay admin-only (see /api/admin/classes).
export async function GET() {
  const classes = await prisma.classGroup.findMany({
    where: { isArchived: false, teacherAssignments: { some: { isLead: true } } },
    orderBy: { name: "asc" },
    include: {
      enrollments: {
        include: { student: { select: { id: true, firstName: true, lastName: true, avatarColor: true, isActive: true } } },
      },
      teacherAssignments: {
        where: { isLead: true },
        include: { teacher: { select: { firstName: true, lastName: true } } },
      },
    },
  });

  const data = classes.map((c) => {
    const lead = c.teacherAssignments[0]?.teacher;
    const students = c.enrollments
      .filter((e) => e.student.isActive)
      .map((e) => ({
        id: e.student.id,
        firstName: e.student.firstName,
        lastName: e.student.lastName,
        avatarColor: e.student.avatarColor,
      }))
      .sort((a, b) => a.firstName.localeCompare(b.firstName));
    return {
      id: c.id,
      name: c.name,
      level: c.level,
      field: c.field,
      teacher: lead ? `${lead.firstName} ${lead.lastName}` : null,
      studentCount: students.length,
      students,
    };
  });

  return NextResponse.json({ classes: data });
}
