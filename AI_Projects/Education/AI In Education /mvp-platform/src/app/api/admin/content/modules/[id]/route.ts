import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { updateModule, deleteModule, deleteModuleWithLessons } from "@/lib/adminContent";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const res = await updateModule(u, params.id, body);
  if ("error" in res) return NextResponse.json(res, { status: res.error === "NOT_FOUND" ? 404 : 400 });
  return NextResponse.json(res);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const force = new URL(req.url).searchParams.get("force") === "1";
  const res = force ? await deleteModuleWithLessons(u, params.id) : await deleteModule(u, params.id);
  if ("error" in res) {
    const code = res.error === "NOT_FOUND" ? 404 : 409;
    return NextResponse.json(res, { status: code });
  }
  return NextResponse.json(res);
}
