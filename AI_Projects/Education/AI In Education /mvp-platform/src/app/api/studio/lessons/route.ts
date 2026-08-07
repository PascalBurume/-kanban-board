import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createLesson } from "@/lib/studio";

export const dynamic = "force-dynamic";

// Create a new draft lesson inside a module the teacher/admin can edit.
export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || (u.role !== "TEACHER" && u.role !== "ADMIN")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!body.moduleId) return NextResponse.json({ error: "MISSING_MODULE" }, { status: 400 });
  const lesson = await createLesson(u, body.moduleId);
  if (!lesson) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ lesson });
}
