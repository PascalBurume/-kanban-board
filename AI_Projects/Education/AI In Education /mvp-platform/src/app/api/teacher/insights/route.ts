import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildInsights } from "@/lib/insights";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "TEACHER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const params = new URL(req.url).searchParams;
  const classId = params.get("class") || undefined;
  const daysRaw = params.get("days");
  const days = daysRaw != null ? Number(daysRaw) : undefined; // buildInsights clamps to an allowed window
  const data = await buildInsights(u.userId, classId, Number.isNaN(days) ? undefined : days);
  return NextResponse.json(data);
}
