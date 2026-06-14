import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { assignLesson } from "@/lib/studio";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || (u.role !== "TEACHER" && u.role !== "ADMIN")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!body.classId || !body.lessonId) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  const result = await assignLesson(u, { classId: body.classId, lessonId: body.lessonId, dueDate: body.dueDate ?? null });
  if (!result) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
