import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { setCompanion } from "@/lib/studio";

export const dynamic = "force-dynamic";

async function staff() {
  const u = await getCurrentUser();
  return u && (u.role === "TEACHER" || u.role === "ADMIN") ? u : null;
}

// Attach/detach this (own) lesson as a complément to a book lesson.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const u = await staff();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const bookLessonId = body.bookLessonId == null ? null : String(body.bookLessonId);
  const res = await setCompanion(u, params.id, bookLessonId);
  if (!res) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(res);
}
