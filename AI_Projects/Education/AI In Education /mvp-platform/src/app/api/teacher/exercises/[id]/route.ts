import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { updateExercise, deleteExercise } from "@/lib/exercises";

export const dynamic = "force-dynamic";

// PATCH /api/teacher/exercises/[id]/ — edit own custom exercise.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const u = await getCurrentUser();
  if (!u || (u.role !== "TEACHER" && u.role !== "ADMIN")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  let body: { title?: string; statementMd?: string; solutionMd?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  const exercise = await updateExercise(u, params.id, body);
  if (!exercise) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ exercise });
}

// DELETE /api/teacher/exercises/[id]/ — delete own custom exercise.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const u = await getCurrentUser();
  if (!u || (u.role !== "TEACHER" && u.role !== "ADMIN")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const res = await deleteExercise(u, params.id);
  if (!res) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(res);
}
