import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { studioTree, assignableClasses } from "@/lib/studio";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await getCurrentUser();
  if (!u || (u.role !== "TEACHER" && u.role !== "ADMIN")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const tree = await studioTree(u);
  const classes = await assignableClasses(u);
  return NextResponse.json({ ...tree, classes });
}
