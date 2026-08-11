import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { lessonForEdit, saveLesson, deleteLesson } from "@/lib/studio";

export const dynamic = "force-dynamic";

async function staff() {
  const u = await getCurrentUser();
  return u && (u.role === "TEACHER" || u.role === "ADMIN") ? u : null;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const u = await staff();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const data = await lessonForEdit(u, params.id);
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  // Same reason as the tree route, with a sharper edge: a cached lesson served on a
  // back-navigation opens the editor on stale content, and the first autosave writes
  // that stale content back over the real one.
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store, must-revalidate" } });
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const u = await staff();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.contentMd !== "string") return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  // `force` marks a save the teacher asked for by name — the Enregistrer button, or
  // the flush when they leave the page — as opposed to a background autosave. Only
  // the former earns its own restorable version; see shouldSnapshot in lib/studio.
  const result = await saveLesson(u, params.id, {
    contentMd: body.contentMd,
    title: body.title,
    estMinutes: body.estMinutes,
    force: body.force === true,
  });
  if (!result) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true, ...result });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const u = await staff();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const result = await deleteLesson(u, params.id);
  if (!result) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(result);
}
