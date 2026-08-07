import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { teacherAssignableProjects, assignProject } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await getCurrentUser();
  if (!u || u.role !== "TEACHER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const data = await teacherAssignableProjects(u.userId);
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "TEACHER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const classId = String(body.classId ?? "");
  const projectId = String(body.projectId ?? "");
  if (!classId || !projectId) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const res = await assignProject(u.userId, { classId, projectId, dueDate: body.dueDate ?? null });
  if ("error" in res) {
    const code = res.error === "FORBIDDEN" ? 403 : res.error === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json(res, { status: code });
  }
  return NextResponse.json(res);
}
