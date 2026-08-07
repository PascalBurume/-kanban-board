import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getNotebook, updateNotebook, deleteNotebook } from "@/lib/notebook";

export const dynamic = "force-dynamic";

async function student() {
  const u = await getCurrentUser();
  return u && u.role === "STUDENT" ? u : null;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const u = await student();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const notebook = await getNotebook(u.userId, params.id);
  if (!notebook) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ notebook });
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const u = await student();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const result = await updateNotebook(u.userId, params.id, body);
  if (!result) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if ("conflict" in result) return NextResponse.json({ error: "CONFLICT", notebook: result.conflict }, { status: 409 });
  return NextResponse.json({ notebook: result });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const u = await student();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const ok = await deleteNotebook(u.userId, params.id);
  if (!ok) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
