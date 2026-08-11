import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { teacherOverview } from "@/lib/teacher";
import { parseRange } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "TEACHER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const range = parseRange(new URL(req.url).searchParams.get("range"));
  // The name is read from the row rather than the session, which only caches it: after a
  // rename on /profile the dashboard kept greeting the teacher by their old name until
  // they signed out and back in.
  const [data, me] = await Promise.all([
    teacherOverview(u.userId, range),
    prisma.user.findUnique({ where: { id: u.userId }, select: { firstName: true, lastName: true } }),
  ]);
  return NextResponse.json({
    teacher: { firstName: me?.firstName ?? u.firstName, lastName: me?.lastName ?? u.lastName },
    ...data,
  });
}
