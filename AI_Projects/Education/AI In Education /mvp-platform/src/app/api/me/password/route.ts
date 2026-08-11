import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, verifySecret, hashSecret, audit } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Staff self-service password change. POST { current, next }
export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  if (u.role === "STUDENT") return NextResponse.json({ error: "WRONG_ROLE" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const current = String(body.current || "");
  const next = String(body.next || "");
  if (next.length < 8) return NextResponse.json({ error: "WEAK_PASSWORD" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: u.userId } });
  if (!user || !verifySecret(current, user.passwordHash)) {
    return NextResponse.json({ error: "WRONG_CURRENT" }, { status: 403 });
  }

  await prisma.user.update({
    where: { id: u.userId },
    data: { passwordHash: hashSecret(next), mustChangePassword: false },
  });
  await audit("PASSWORD_CHANGE", { actorId: u.userId, actorName: `${u.firstName} ${u.lastName}`, targetType: "staff", targetId: u.userId });
  return NextResponse.json({ ok: true });
}
