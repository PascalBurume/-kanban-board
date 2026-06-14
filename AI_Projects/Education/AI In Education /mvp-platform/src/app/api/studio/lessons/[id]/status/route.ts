import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { setStatus } from "@/lib/studio";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const u = await getCurrentUser();
  if (!u || (u.role !== "TEACHER" && u.role !== "ADMIN")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const status = body.status === "DRAFT" ? "DRAFT" : body.status === "PUBLISHED" ? "PUBLISHED" : null;
  if (!status) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const result = await setStatus(u, params.id, status);
  if (!result) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true, ...result });
}
