import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createLibraryLesson } from "@/lib/studio";

export const dynamic = "force-dynamic";

// Create an unattached lesson in the teacher's personal library for a subject.
export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || (u.role !== "TEACHER" && u.role !== "ADMIN")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const subjectSlug = String(body.subjectSlug ?? "");
  if (!subjectSlug) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const lesson = await createLibraryLesson(u, subjectSlug);
  if (!lesson) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  return NextResponse.json({ lesson });
}
