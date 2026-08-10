import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, audit } from "@/lib/auth";
import { editableSubjectSlugs } from "@/lib/studio";
import { findBookExercise } from "@/lib/practice";

export const dynamic = "force-dynamic";

// Teacher-placed links between a BOOK exercise and a lesson: "this exercise
// belongs to that lesson". Book exercises live in files, so they use
// BookExerciseLink (keyed on the plain exercises.json id) rather than
// ExerciseLink, which has a foreign key to the Exercise table.
//
// Like a correction, a link is global — the book is the same book for every
// class — so the same authorisation applies: a teacher assigned to that subject,
// or an admin.
async function authorize(id: string) {
  const u = await getCurrentUser();
  if (!u || (u.role !== "TEACHER" && u.role !== "ADMIN")) return { error: 403 as const };
  const exId = Number(id);
  const ex = Number.isInteger(exId) ? findBookExercise(exId) : null;
  if (!ex) return { error: 404 as const };
  const slugs = await editableSubjectSlugs(u);
  if (!slugs.includes(ex.book)) return { error: 403 as const };
  return { u, exId, ex };
}

// `code` is optional only because `"error" in a` does not narrow the union
// through a call boundary; authorize never returns an undefined code.
const fail = (code?: number) =>
  NextResponse.json({ error: code === 404 ? "NOT_FOUND" : "FORBIDDEN" }, { status: code ?? 403 });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const a = await authorize(params.id);
  if ("error" in a) return fail(a.error);

  let body: { lessonId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  const lessonId = (body.lessonId ?? "").trim();
  if (!lessonId) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  // The lesson must belong to the exercise's own book. Without this a link could
  // file a maths exercise under a chemistry lesson, and the canvas would draw it.
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, module: { select: { subjectSlug: true } } },
  });
  if (!lesson) return fail(404);
  if (lesson.module?.subjectSlug !== a.ex.book) {
    return NextResponse.json({ error: "WRONG_SUBJECT" }, { status: 400 });
  }

  // Linking the same pair twice is the teacher clicking twice, not an error.
  const link = await prisma.bookExerciseLink.upsert({
    where: { exId_lessonId: { exId: a.exId, lessonId } },
    create: { exId: a.exId, lessonId, createdById: a.u.userId },
    update: {},
    select: { id: true, lessonId: true, lesson: { select: { title: true } } },
  });

  await audit("BOOK_EXERCISE_LINK", {
    actorId: a.u.userId,
    actorName: `${a.u.firstName} ${a.u.lastName}`,
    targetType: "book-exercise",
    targetId: String(a.exId),
    meta: { book: a.ex.book, module: a.ex.module, lessonId },
  });
  return NextResponse.json({ ok: true, link: { id: link.id, lessonId: link.lessonId, lessonTitle: link.lesson.title } });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const a = await authorize(params.id);
  if ("error" in a) return fail(a.error);

  const lessonId = new URL(req.url).searchParams.get("lesson") ?? "";
  if (!lessonId) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  await prisma.bookExerciseLink.deleteMany({ where: { exId: a.exId, lessonId } });
  await audit("BOOK_EXERCISE_UNLINK", {
    actorId: a.u.userId,
    actorName: `${a.u.firstName} ${a.u.lastName}`,
    targetType: "book-exercise",
    targetId: String(a.exId),
    meta: { book: a.ex.book, module: a.ex.module, lessonId },
  });
  return NextResponse.json({ ok: true });
}
