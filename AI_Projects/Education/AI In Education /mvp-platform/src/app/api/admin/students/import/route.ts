import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { importStudents } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const csv = String(body.csv ?? "");
  if (!csv.trim()) return NextResponse.json({ error: "EMPTY" }, { status: 400 });
  const result = await importStudents(csv, u.userId, `${u.firstName} ${u.lastName}`);
  return NextResponse.json(result);
}
