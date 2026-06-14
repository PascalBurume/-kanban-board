import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { approveTeacher, rejectTeacher } from "@/lib/admin";

export const dynamic = "force-dynamic";

// POST { decision: "approve" | "reject" } — approve activates the pending
// teacher; reject deletes the pending account.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  let decision = "approve";
  try {
    const body = await req.json();
    if (body?.decision === "reject") decision = "reject";
  } catch {
    /* default approve */
  }

  const actorName = `${u.firstName} ${u.lastName}`;
  const result =
    decision === "reject"
      ? await rejectTeacher(params.id, u.userId, actorName)
      : await approveTeacher(params.id, u.userId, actorName);

  if (!result) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true, decision, ...result });
}
