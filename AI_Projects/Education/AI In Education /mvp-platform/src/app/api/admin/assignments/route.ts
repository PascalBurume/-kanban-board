import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { assignmentMatrix, setAssignment, setTeacherDisciplines } from "@/lib/admin";

export const dynamic = "force-dynamic";

async function admin() {
  const u = await getCurrentUser();
  return u && u.role === "ADMIN" ? u : null;
}

export async function GET() {
  if (!(await admin())) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  return NextResponse.json(await assignmentMatrix());
}

export async function PUT(req: Request) {
  const u = await admin();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const { teacherId, classId, state } = body;
  if (!teacherId || !classId || !["none", "assigned", "lead"].includes(state)) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  await setAssignment(teacherId, classId, state, u.userId, `${u.firstName} ${u.lastName}`);
  return NextResponse.json({ ok: true });
}

// Set what a teacher teaches (their discipline family keys). Re-resolves their
// existing class assignments to the matching books.
export async function POST(req: Request) {
  const u = await admin();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const { teacherId, disciplines } = body;
  if (!teacherId || !Array.isArray(disciplines)) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  await setTeacherDisciplines(teacherId, disciplines.map(String), u.userId, `${u.firstName} ${u.lastName}`);
  return NextResponse.json(await assignmentMatrix());
}
