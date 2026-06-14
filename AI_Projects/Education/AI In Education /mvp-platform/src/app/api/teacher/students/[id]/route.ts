import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { studentDrawer } from "@/lib/teacher";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "TEACHER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const data = await studentDrawer(u.userId, params.id);
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(data);
}
