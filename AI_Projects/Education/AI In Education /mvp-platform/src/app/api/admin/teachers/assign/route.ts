import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { setTeacherSubject, setTeacherDisciplines, setClassSupervisor, teacherDirectory } from "@/lib/admin";

export const dynamic = "force-dynamic";

async function admin() {
  const u = await getCurrentUser();
  return u && u.role === "ADMIN" ? u : null;
}

// PUT — one endpoint for the "Enseignants" assignment editor, dispatched by body shape:
//   { teacherId, classId, subjectSlug, on }  → toggle a single class↔subject teaching row
//   { teacherId, disciplines: string[] }     → set what the teacher is qualified to teach
//   { classId, teacherId | null, lead: true } → set/clear the class's titulaire
// Always returns the fresh directory so the client refreshes in one round-trip.
export async function PUT(req: Request) {
  const u = await admin();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const actor = `${u.firstName} ${u.lastName}`;

  let result: { ok?: true; error?: string };
  if (body.lead === true && body.classId) {
    result = await setClassSupervisor(String(body.classId), body.teacherId ? String(body.teacherId) : null, u.userId, actor);
  } else if (Array.isArray(body.disciplines) && body.teacherId) {
    await setTeacherDisciplines(String(body.teacherId), body.disciplines.map(String), u.userId, actor);
    result = { ok: true };
  } else if (body.teacherId && body.classId && body.subjectSlug) {
    result = await setTeacherSubject(String(body.teacherId), String(body.classId), String(body.subjectSlug), Boolean(body.on), u.userId, actor);
  } else {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  if (result && "error" in result && result.error) {
    return NextResponse.json({ error: result.error }, { status: result.error === "NOT_FOUND" ? 404 : 400 });
  }
  return NextResponse.json(await teacherDirectory());
}
