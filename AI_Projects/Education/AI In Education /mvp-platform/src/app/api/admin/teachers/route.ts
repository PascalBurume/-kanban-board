import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createTeacher, teacherDirectory } from "@/lib/admin";

export const dynamic = "force-dynamic";

// GET — the teacher directory: teachers + their assignments, classes' offered subjects,
// and discipline options. Drives the admin "Enseignants" tab.
export async function GET() {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  return NextResponse.json(await teacherDirectory());
}

// POST { firstName, lastName, email, password?, disciplines? }
// Only the super admin creates teacher accounts; teachers cannot self-register.
// When no password is given, a temporary one is generated and returned once.
export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const result = await createTeacher(
    {
      firstName: String(body.firstName ?? ""),
      lastName: String(body.lastName ?? ""),
      email: String(body.email ?? ""),
      password: body.password ? String(body.password) : undefined,
      disciplines: Array.isArray(body.disciplines) ? body.disciplines.map(String) : [],
    },
    u.userId,
    `${u.firstName} ${u.lastName}`,
  );

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.error === "EMAIL_TAKEN" ? 409 : 400 });
  }
  return NextResponse.json({ ok: true, ...result });
}
