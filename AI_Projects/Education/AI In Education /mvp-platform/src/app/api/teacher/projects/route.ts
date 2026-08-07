import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listTeacherSubmissions } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "TEACHER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const url = new URL(req.url);
  const classId = url.searchParams.get("classId") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const items = await listTeacherSubmissions(u.userId, { classId, status });
  return NextResponse.json({ items });
}
