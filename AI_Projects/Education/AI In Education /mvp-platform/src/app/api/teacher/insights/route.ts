import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildInsights } from "@/lib/insights";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "TEACHER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const classId = new URL(req.url).searchParams.get("class") || undefined;
  const data = await buildInsights(u.userId, classId);
  return NextResponse.json(data);
}
