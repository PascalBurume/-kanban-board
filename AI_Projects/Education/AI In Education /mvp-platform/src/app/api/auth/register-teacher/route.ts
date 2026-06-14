import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashSecret, audit } from "@/lib/auth";
import { avatarColor } from "@/lib/icons";

export const dynamic = "force-dynamic";

// Teacher self-registration. Creates a PENDING, inactive account that an admin
// must approve before the teacher can sign in. (Admins are never self-created.)
export async function POST(req: Request) {
  let body: { firstName?: string; lastName?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const firstName = body.firstName?.trim();
  const lastName = body.lastName?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password || "";

  if (!firstName || !lastName || !email || !password) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "BAD_EMAIL" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "WEAK_PASSWORD" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "EMAIL_TAKEN" }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      role: "TEACHER",
      firstName,
      lastName,
      email,
      passwordHash: hashSecret(password),
      avatarColor: avatarColor(`${firstName} ${lastName}`),
      isActive: false,
      pending: true,
      locale: "fr",
    },
  });

  await audit("REGISTER", {
    actorId: user.id,
    actorName: `${firstName} ${lastName}`,
    targetType: "teacher",
    targetId: user.id,
    meta: { email },
  });

  return NextResponse.json({ ok: true, pending: true });
}
