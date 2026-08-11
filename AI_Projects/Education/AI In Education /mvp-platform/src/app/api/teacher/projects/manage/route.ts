import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listEditableProjects, projectStudioOptions, createProject } from "@/lib/projects";

export const dynamic = "force-dynamic";

// GET → the teacher's editable projects + editor options (subjects, modules).
export async function GET() {
  const u = await getCurrentUser();
  if (!u || (u.role !== "TEACHER" && u.role !== "ADMIN")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const [projects, options] = await Promise.all([listEditableProjects(u), projectStudioOptions(u)]);
  return NextResponse.json({ projects, ...options });
}

// POST → create a new draft project.
export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || (u.role !== "TEACHER" && u.role !== "ADMIN")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const res = await createProject(u, body);
  if ("error" in res) return NextResponse.json(res, { status: res.error === "FORBIDDEN" ? 403 : 400 });
  return NextResponse.json(res);
}
