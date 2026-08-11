import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getChapter } from "@/lib/practice";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "STUDENT") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const data = await getChapter(u.userId, params.id);
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(data);
}
