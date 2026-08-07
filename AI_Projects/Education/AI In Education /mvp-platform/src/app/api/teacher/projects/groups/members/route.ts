import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { setMembership } from "@/lib/projectGroups";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "TEACHER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const classId = String(body.classId ?? "");
  const studentId = String(body.studentId ?? "");
  if (!classId || !studentId) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const groupId = body.groupId == null ? null : String(body.groupId);
  const res = await setMembership(u.userId, { classId, studentId, groupId });
  if ("error" in res) {
    const code = res.error === "FORBIDDEN" ? 403 : res.error === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json(res, { status: code });
  }
  return NextResponse.json(res);
}
