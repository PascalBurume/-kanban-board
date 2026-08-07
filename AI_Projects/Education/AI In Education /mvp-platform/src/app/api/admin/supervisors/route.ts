import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { classSupervisors, setClassSupervisor } from "@/lib/admin";

export const dynamic = "force-dynamic";

async function admin() {
  const u = await getCurrentUser();
  return u && u.role === "ADMIN" ? u : null;
}

// Class-centric supervisor (titulaire) management.
export async function GET() {
  if (!(await admin())) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  return NextResponse.json(await classSupervisors());
}

export async function PUT(req: Request) {
  const u = await admin();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const { classId, teacherId } = body;
  if (!classId) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const r = await setClassSupervisor(classId, teacherId ?? null, u.userId, `${u.firstName} ${u.lastName}`);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.error === "NOT_FOUND" ? 404 : 400 });
  return NextResponse.json(await classSupervisors());
}
