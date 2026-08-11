import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteBookLesson } from "@/lib/adminContent";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const res = await deleteBookLesson(u, params.id);
  if ("error" in res) {
    const code = res.error === "NOT_FOUND" ? 404 : 409;
    return NextResponse.json(res, { status: code });
  }
  return NextResponse.json(res);
}
