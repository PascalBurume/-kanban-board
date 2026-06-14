import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { teacherOverview } from "@/lib/teacher";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await getCurrentUser();
  if (!u || u.role !== "TEACHER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const data = await teacherOverview(u.userId);
  return NextResponse.json({ teacher: { firstName: u.firstName, lastName: u.lastName }, ...data });
}
