import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { updateSubject, deleteSubject } from "@/lib/adminContent";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { slug: string } }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const res = await updateSubject(u, params.slug, body);
  if ("error" in res) return NextResponse.json(res, { status: res.error === "NOT_FOUND" ? 404 : 400 });
  return NextResponse.json(res);
}

export async function DELETE(_req: Request, { params }: { params: { slug: string } }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const res = await deleteSubject(u, params.slug);
  if ("error" in res) {
    const code = res.error === "NOT_FOUND" ? 404 : res.error === "SUBJECT_HAS_PROGRESS" ? 409 : 400;
    return NextResponse.json(res, { status: code });
  }
  return NextResponse.json(res);
}
