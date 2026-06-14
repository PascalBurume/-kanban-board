import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { backupDatabase } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function POST() {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const info = await backupDatabase(u.userId, `${u.firstName} ${u.lastName}`);
  return NextResponse.json({ ok: true, ...info });
}
