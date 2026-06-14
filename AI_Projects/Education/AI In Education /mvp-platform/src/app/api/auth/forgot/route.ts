import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Offline-friendly "forgot PIN": there is no email, so a student request simply
// logs a reset request that the admin sees in the Approvals queue and resolves
// via the existing reset-pin action. POST { studentId }
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const studentId = String(body.studentId || "");
  if (!studentId) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const student = await prisma.user.findFirst({
    where: { id: studentId, role: "STUDENT" },
    select: { id: true, firstName: true, lastName: true },
  });
  // Always return ok to avoid revealing which accounts exist.
  if (student) {
    await audit("PIN_RESET_REQUEST", {
      actorId: student.id,
      actorName: `${student.firstName} ${student.lastName}`,
      targetType: "student",
      targetId: student.id,
    });
  }
  return NextResponse.json({ ok: true });
}
