import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { systemHealth } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  return NextResponse.json(await systemHealth());
}
