import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getProjectForEdit, updateProject, setProjectStatus, deleteProject } from "@/lib/projects";

export const dynamic = "force-dynamic";

async function requireTeacher() {
  const u = await getCurrentUser();
  if (!u || (u.role !== "TEACHER" && u.role !== "ADMIN")) return null;
  return u;
}

// GET → one project, fully populated for editing.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const u = await requireTeacher();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const data = await getProjectForEdit(u, params.id);
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(data);
}

// PUT → update fields + steps + prerequisites.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const u = await requireTeacher();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const res = await updateProject(u, params.id, body);
  if ("error" in res) return NextResponse.json(res, { status: res.error === "NOT_FOUND" ? 404 : res.error === "FORBIDDEN" ? 403 : 400 });
  return NextResponse.json(res);
}

// PATCH → publish / unpublish.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const u = await requireTeacher();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const status = body.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
  const res = await setProjectStatus(u, params.id, status);
  if ("error" in res) return NextResponse.json(res, { status: 404 });
  return NextResponse.json(res);
}

// DELETE → remove a project (blocked if students have submitted).
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const u = await requireTeacher();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const res = await deleteProject(u, params.id);
  if ("error" in res) return NextResponse.json(res, { status: res.error === "NOT_FOUND" ? 404 : 409 });
  return NextResponse.json(res);
}
