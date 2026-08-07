import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { assignGroup, unassignGroup } from "@/lib/projectGroups";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "TEACHER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const groupId = String(body.groupId ?? "");
  const projectId = String(body.projectId ?? "");
  if (!groupId || !projectId) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const res = await assignGroup(u.userId, { groupId, projectId, dueDate: body.dueDate ?? null });
  if ("error" in res) {
    const code = res.error === "FORBIDDEN" ? 403 : res.error === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json(res, { status: code });
  }
  return NextResponse.json(res);
}

export async function DELETE(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "TEACHER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const groupId = String(body.groupId ?? "");
  const projectId = String(body.projectId ?? "");
  if (!groupId || !projectId) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const res = await unassignGroup(u.userId, { groupId, projectId });
  if ("error" in res) {
    const code = res.error === "NOT_FOUND" ? 404 : res.error === "HAS_SUBMISSIONS" ? 409 : 400;
    return NextResponse.json(res, { status: code });
  }
  return NextResponse.json(res);
}
