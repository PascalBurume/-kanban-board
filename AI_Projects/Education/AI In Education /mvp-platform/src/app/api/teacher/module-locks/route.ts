import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { classModules, setModuleLock } from "@/lib/teacher";

export const dynamic = "force-dynamic";

// GET /api/teacher/module-locks?class=<id> — modules + lock state for a class.
export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "TEACHER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const classId = new URL(req.url).searchParams.get("class");
  if (!classId) return NextResponse.json({ error: "MISSING_CLASS" }, { status: 400 });
  const subjects = await classModules(u.userId, classId);
  if (!subjects) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ classId, subjects });
}

// PUT { classId, moduleId, locked } — lock or unlock a module for a class.
export async function PUT(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "TEACHER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  let body: { classId?: string; moduleId?: string; locked?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  const { classId, moduleId, locked } = body;
  if (!classId || !moduleId || typeof locked !== "boolean") {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }
  const ok = await setModuleLock(u, classId, moduleId, locked);
  if (!ok) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  return NextResponse.json({ ok: true, moduleId, locked });
}
