import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveFeedback } from "@/lib/teacher";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "TEACHER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const ok = await resolveFeedback(u.userId, params.id);
  if (!ok) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
