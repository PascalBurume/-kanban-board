import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getTeacherSubmission, reviewSubmission } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "TEACHER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const data = await getTeacherSubmission(u.userId, params.id);
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "TEACHER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const action = body.action === "return" ? "return" : "grade";
  const res = await reviewSubmission(u.userId, params.id, {
    action,
    grade: body.grade,
    feedbackMd: typeof body.feedbackMd === "string" ? body.feedbackMd : "",
  });
  if ("error" in res) {
    const code = res.error === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json(res, { status: code });
  }
  return NextResponse.json(res);
}
