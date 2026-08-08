import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createLibraryLesson, studioLibrary } from "@/lib/studio";

export const dynamic = "force-dynamic";

// GET — the « Rédiger une leçon » start screen: the user's own lessons and the books they
// may start one in, across ALL their classes. Deliberately NOT /api/studio/tree/, which is
// class-scoped — see studioLibrary().
export async function GET() {
  const u = await getCurrentUser();
  if (!u || (u.role !== "TEACHER" && u.role !== "ADMIN")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const data = await studioLibrary(u);
  // Same reason as the tree route: force-dynamic only stops NEXT caching this. Without
  // an explicit no-store the BROWSER re-serves it on a back-navigation, so a lesson you
  // just renamed comes back with its old title and reads as a lost edit.
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store, must-revalidate" } });
}

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
