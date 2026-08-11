import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { restoreVersion } from "@/lib/studio";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const u = await getCurrentUser();
  if (!u || (u.role !== "TEACHER" && u.role !== "ADMIN")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const version = Number(body.version);
  if (!Number.isFinite(version)) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const result = await restoreVersion(u, params.id, version);
  if (!result) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true, ...result });
}
