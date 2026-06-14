import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, getCurrentUser, audit } from "@/lib/auth";

export const dynamic = "force-dynamic";

const COLORS = ["#4f46e5", "#0d9488", "#ea580c", "#16a34a", "#7c3aed", "#2563eb", "#db2777", "#d97706", "#0891b2", "#65a30d"];

export async function GET() {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: u.userId },
    select: { firstName: true, lastName: true, email: true, role: true, locale: true, avatarColor: true },
  });
  if (!user) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ user });
}

// PATCH { firstName?, lastName?, locale?, avatarColor? }
export async function PATCH(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  const data: { firstName?: string; lastName?: string; locale?: string; avatarColor?: string } = {};
  if (typeof body.firstName === "string" && body.firstName.trim()) data.firstName = body.firstName.trim();
  if (typeof body.lastName === "string" && body.lastName.trim()) data.lastName = body.lastName.trim();
  if (body.locale === "fr" || body.locale === "en") data.locale = body.locale;
  if (typeof body.avatarColor === "string" && COLORS.includes(body.avatarColor)) data.avatarColor = body.avatarColor;

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "NO_CHANGES" }, { status: 400 });

  const user = await prisma.user.update({ where: { id: u.userId }, data });

  // Keep the session in sync (name + locale are cached there).
  const session = await getSession();
  if (session.user) {
    if (data.firstName) session.user.firstName = user.firstName;
    if (data.lastName) session.user.lastName = user.lastName;
    if (data.locale) session.user.locale = user.locale;
    await session.save();
  }
  await audit("PROFILE_UPDATE", { actorId: u.userId, actorName: `${user.firstName} ${user.lastName}`, targetType: u.role.toLowerCase(), targetId: u.userId });

  return NextResponse.json({ ok: true, user: { firstName: user.firstName, lastName: user.lastName, locale: user.locale, avatarColor: user.avatarColor } });
}
