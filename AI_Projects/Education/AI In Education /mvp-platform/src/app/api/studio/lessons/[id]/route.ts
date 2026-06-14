import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { lessonForEdit, saveLesson } from "@/lib/studio";

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
  return NextResponse.json(data);
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const u = await staff();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.contentMd !== "string") return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const result = await saveLesson(u, params.id, { contentMd: body.contentMd, title: body.title, estMinutes: body.estMinutes });
  if (!result) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true, ...result });
}
