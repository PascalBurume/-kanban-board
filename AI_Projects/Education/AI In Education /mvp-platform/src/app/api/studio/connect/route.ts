import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectLesson } from "@/lib/studio";

export const dynamic = "force-dynamic";

// Connect a library lesson to a module (moduleId) or detach it (moduleId: null).
export async function PUT(req: Request) {
  const u = await getCurrentUser();
  if (!u || (u.role !== "TEACHER" && u.role !== "ADMIN")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const lessonId = String(body.lessonId ?? "");
  const moduleId = body.moduleId ? String(body.moduleId) : null;
  const position = typeof body.position === "number" ? body.position : null;
  if (!lessonId) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const res = await connectLesson(u, lessonId, moduleId, position);
  if (!res) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  return NextResponse.json(res);
}
