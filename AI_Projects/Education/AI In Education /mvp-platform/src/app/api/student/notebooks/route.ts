import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listNotebooks, upsertNotebook, notebookSubjects, NotebookError } from "@/lib/notebook";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await getCurrentUser();
  if (!u || u.role !== "STUDENT") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const [notebooks, subjects] = await Promise.all([listNotebooks(u.userId), notebookSubjects(u.userId)]);
  return NextResponse.json({ notebooks, subjects });
}

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "STUDENT") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  try {
    const result = await upsertNotebook(u.userId, body);
    if ("conflict" in result) return NextResponse.json({ error: "CONFLICT", notebook: result.conflict }, { status: 409 });
    return NextResponse.json({ notebook: result });
  } catch (e) {
    if (e instanceof NotebookError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
