import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { setExerciseLinks, type LinkInput } from "@/lib/exercises";

export const dynamic = "force-dynamic";

// PUT /api/teacher/exercises/[id]/links/ — replace-all link semantics: the
// canvas posts the full set (connect = set + new edge, detach = set minus one).
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const u = await getCurrentUser();
  if (!u || (u.role !== "TEACHER" && u.role !== "ADMIN")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  let body: { links?: LinkInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  if (!Array.isArray(body.links)) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const res = await setExerciseLinks(u, params.id, body.links);
  if (!res) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(res);
}
