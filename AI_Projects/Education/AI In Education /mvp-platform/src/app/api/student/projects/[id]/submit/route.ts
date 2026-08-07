import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { submitProject } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "STUDENT") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const res = await submitProject(u.userId, params.id);
  if ("error" in res) {
    const code = res.error === "INCOMPLETE" ? 409 : res.error === "NO_SUBMISSION" ? 404 : 400;
    return NextResponse.json(res, { status: code });
  }
  return NextResponse.json(res);
}
