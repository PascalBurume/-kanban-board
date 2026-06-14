import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, hashSecret, audit } from "@/lib/auth";
import { avatarColor } from "@/lib/icons";

export const dynamic = "force-dynamic";

// Student self-enrollment via a class invite code shared by the teacher. The
// student picks a 4-digit PIN, is enrolled into the class, and is signed in
// immediately (no admin step — the invite code is the gate).
export async function POST(req: Request) {
  let body: { code?: string; firstName?: string; lastName?: string; pin?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const code = body.code?.trim().toUpperCase();
  const firstName = body.firstName?.trim();
  const lastName = body.lastName?.trim();
  const pin = String(body.pin || "");

  if (!code || !firstName || !lastName || !pin) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }
  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "BAD_PIN" }, { status: 400 });
  }

  const cls = await prisma.classGroup.findUnique({ where: { inviteCode: code } });
  if (!cls || cls.isArchived) {
    return NextResponse.json({ error: "BAD_CODE" }, { status: 404 });
  }

  const student = await prisma.user.create({
    data: {
      role: "STUDENT",
      firstName,
      lastName,
      pinHash: hashSecret(pin),
      avatarColor: avatarColor(`${firstName} ${lastName}`),
      locale: "fr",
      enrollment: { create: { classId: cls.id } },
    },
  });

  await audit("REGISTER", {
    actorId: student.id,
    actorName: `${firstName} ${lastName}`,
    targetType: "student",
    targetId: student.id,
    meta: { classId: cls.id, className: cls.name },
  });

  const session = await getSession();
  session.user = {
    userId: student.id,
    role: "STUDENT",
    firstName: student.firstName,
    lastName: student.lastName,
    classId: cls.id,
    locale: student.locale,
    lastActivity: Date.now(),
  };
  await session.save();

  return NextResponse.json({ ok: true, redirect: "/student/" });
}
