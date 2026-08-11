import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, verifySecret, audit } from "@/lib/auth";
import { homeForRole, type Role } from "@/lib/session";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60 * 1000;

export async function POST(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase();
  const { password } = body;
  if (!email || !password) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const user = await prisma.user.findFirst({
    where: { email, role: { in: ["TEACHER", "ADMIN"] } },
  });
  // Constant-ish behaviour: same response whether email exists or password is
  // wrong — including the bcrypt cost, or the fast unknown-email path would
  // leak which staff emails exist through response timing.
  if (!user) {
    verifySecret(password, "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy");
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return NextResponse.json({ error: "LOCKED", until: user.lockedUntil }, { status: 423 });
  }

  if (!user.isActive) {
    if (verifySecret(password, user.passwordHash)) {
      return NextResponse.json({ error: "DEACTIVATED" }, { status: 403 });
    }
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  if (!verifySecret(password, user.passwordHash)) {
    const attempts = user.failedAttempts + 1;
    const lock = attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MS) : null;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: lock ? 0 : attempts, lockedUntil: lock },
    });
    await audit("LOGIN_FAIL", { actorId: user.id, actorName: `${user.firstName} ${user.lastName}`, targetType: "staff" });
    return NextResponse.json({ error: lock ? "LOCKED" : "INVALID_CREDENTIALS" }, { status: lock ? 423 : 401 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  const role = user.role as Role;
  const session = await getSession();
  session.user = {
    userId: user.id,
    role,
    firstName: user.firstName,
    lastName: user.lastName,
    locale: user.locale,
    lastActivity: Date.now(),
  };
  await session.save();
  await audit("LOGIN", { actorId: user.id, actorName: `${user.firstName} ${user.lastName}`, targetType: "staff" });

  return NextResponse.json({
    ok: true,
    role,
    redirect: homeForRole(role),
    mustChangePassword: user.mustChangePassword,
  });
}
