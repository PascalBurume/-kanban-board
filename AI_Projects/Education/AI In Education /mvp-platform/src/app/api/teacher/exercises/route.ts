import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { assignableClasses } from "@/lib/studio";
import { exercisesTree, createExercise } from "@/lib/exercises";

export const dynamic = "force-dynamic";

// GET /api/teacher/exercises/?class=<id>
// Canvas payload for one class: books → modules (+ lessons + book exercises)
// plus the teacher's custom exercises with their links.
export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u || (u.role !== "TEACHER" && u.role !== "ADMIN")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const classes = await assignableClasses(u);

  let selected: string | null = searchParams.get("class");
  if (!selected && u.role === "TEACHER") selected = classes[0]?.id ?? null;

  const tree = await exercisesTree(u, selected);
  if (tree === null) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  return NextResponse.json({ ...tree, classes, selectedClassId: selected ?? null });
}

// POST /api/teacher/exercises/ — create a custom exercise, optionally with an
// initial module/lesson link.
export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || (u.role !== "TEACHER" && u.role !== "ADMIN")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  let body: {
    subjectSlug?: string;
    title?: string;
    statementMd?: string;
    solutionMd?: string;
    moduleId?: string | null;
    lessonId?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  if (!body.subjectSlug || !body.statementMd?.trim()) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const exercise = await createExercise(u, {
    subjectSlug: body.subjectSlug,
    title: body.title,
    statementMd: body.statementMd,
    solutionMd: body.solutionMd,
    moduleId: body.moduleId,
    lessonId: body.lessonId,
  });
  if (!exercise) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  return NextResponse.json({ exercise });
}
