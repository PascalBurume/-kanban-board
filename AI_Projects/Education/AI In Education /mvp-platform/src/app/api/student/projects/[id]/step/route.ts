import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { saveStepAnswer } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "STUDENT") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const stepId = String(body.stepId ?? "");
  if (!stepId) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const responseMd = typeof body.responseMd === "string" ? body.responseMd : "";
  const done = typeof body.done === "boolean" ? body.done : undefined;
  const res = await saveStepAnswer(u.userId, params.id, stepId, responseMd, done);
  if ("error" in res) {
    const code = res.error === "LOCKED" ? 409 : res.error === "NO_SUBMISSION" ? 404 : 400;
    return NextResponse.json(res, { status: code });
  }
  return NextResponse.json(res);
}
