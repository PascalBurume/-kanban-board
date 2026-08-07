import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildProjects } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await getCurrentUser();
  if (!u || u.role !== "STUDENT") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const data = await buildProjects(u.userId);
  if (!data) return NextResponse.json({ error: "NO_CLASS" }, { status: 404 });
  return NextResponse.json(data);
}
