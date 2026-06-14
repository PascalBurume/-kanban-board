import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, audit, hashSecret } from "@/lib/auth";
import { genPin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const pin = genPin();
  const student = await prisma.user.update({
    where: { id: params.id },
    data: { pinHash: hashSecret(pin), failedAttempts: 0, lockedUntil: null },
  });
  await audit("PIN_RESET", { actorId: u.userId, actorName: `${u.firstName} ${u.lastName}`, targetType: "student", targetId: params.id });
  return NextResponse.json({ pin, student: { firstName: student.firstName, lastName: student.lastName } });
}
