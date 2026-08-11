import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createLesson } from "@/lib/studio";
import { reorderLessons } from "@/lib/adminContent";

export const dynamic = "force-dynamic";

// Create a draft lesson at the end of the module (reuses the studio path).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const lesson = await createLesson(u, params.id);
  if (!lesson) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true, lesson });
}

// Reorder lessons within the module: { order: [lessonIds] }
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body.order)) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const res = await reorderLessons(u, params.id, body.order.map(String));
  return NextResponse.json(res);
}
