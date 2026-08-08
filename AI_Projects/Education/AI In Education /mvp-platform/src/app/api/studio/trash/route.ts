import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listArchive } from "@/lib/lessonArchive";
import { undeleteLesson, emptyFromTrash, editableSubjectSlugs } from "@/lib/studio";

export const dynamic = "force-dynamic";

// The corbeille. A teacher sees what they deleted; an admin sees everything.
// Authorisation for restore/purge lives in lessonArchive, keyed on the archived
// authorId — the lesson row is gone, so there is nothing else left to check against.

async function staff() {
  const u = await getCurrentUser();
  return u && (u.role === "TEACHER" || u.role === "ADMIN") ? u : null;
}

const noStore = { headers: { "Cache-Control": "no-store, must-revalidate" } };

// GET /api/studio/trash/?subject=<slug>
export async function GET(req: Request) {
  const u = await staff();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const subject = new URL(req.url).searchParams.get("subject");
  // Without a subject, still fence a teacher to the books they teach — a discipline
  // change should not surface lessons from a subject they no longer hold.
  const slugs = subject ? [subject] : await editableSubjectSlugs(u);
  const items = await listArchive(u, u.role === "ADMIN" && !subject ? undefined : slugs);
  return NextResponse.json({ items }, noStore);
}

// POST /api/studio/trash/  { lessonId, exact? }
export async function POST(req: Request) {
  const u = await staff();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const lessonId = body?.lessonId;
  if (typeof lessonId !== "string" || !lessonId) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const report = await undeleteLesson(u, lessonId, body?.exact === true);
  if (!report) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(report, noStore);
}

// DELETE /api/studio/trash/?id=<lessonId> — empties one entry. The only step in this
// flow that actually destroys anything.
export async function DELETE(req: Request) {
  const u = await staff();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const done = await emptyFromTrash(u, id);
  if (!done) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(done, noStore);
}
