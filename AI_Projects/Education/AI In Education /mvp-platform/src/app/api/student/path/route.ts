import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildStudentPath } from "@/lib/path";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await getCurrentUser();
  if (!u || u.role !== "STUDENT") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const path = await buildStudentPath(u.userId);
  if (!path) return NextResponse.json({ error: "NO_CLASS" }, { status: 404 });
  return NextResponse.json({ student: { firstName: u.firstName, lastName: u.lastName }, ...path });
}
