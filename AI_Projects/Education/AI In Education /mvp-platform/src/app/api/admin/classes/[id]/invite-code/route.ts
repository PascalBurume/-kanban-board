import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { regenerateInviteCode } from "@/lib/admin";

export const dynamic = "force-dynamic";

// POST → generate (or regenerate) the class's student self-enrollment code.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const result = await regenerateInviteCode(params.id, u.userId, `${u.firstName} ${u.lastName}`);
  if (!result) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true, ...result });
}
