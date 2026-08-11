import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canvasData } from "@/lib/projectGroups";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "TEACHER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const classId = new URL(req.url).searchParams.get("classId") ?? "";
  if (!classId) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const data = await canvasData(u.userId, classId);
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(data);
}
