import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, audit } from "@/lib/auth";
import { editableSubjectSlugs } from "@/lib/studio";
import { findBookExercise } from "@/lib/practice";

export const dynamic = "force-dynamic";

// Teacher correction of a BOOK exercise (exercises.json id). PUT upserts the
// fix; DELETE reverts to the automatic AI/OCR reconstruction. Only a teacher
// assigned to the exercise's subject (or an admin) may correct it — the fix is
// global (every class studying the book sees it), like the book content itself.
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

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const a = await authorize(params.id);
  if ("error" in a) return NextResponse.json({ error: a.error === 404 ? "NOT_FOUND" : "FORBIDDEN" }, { status: a.error });

  let body: { statementMd?: string; solutionMd?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  const statementMd = (body.statementMd ?? "").trim();
  const solutionMd = (body.solutionMd ?? "").trim();
  if (!statementMd) return NextResponse.json({ error: "EMPTY_STATEMENT" }, { status: 400 });

  await prisma.bookExerciseFix.upsert({
    where: { exId: a.exId },
    create: { exId: a.exId, statementMd, solutionMd, editedById: a.u.userId },
    update: { statementMd, solutionMd, editedById: a.u.userId },
  });
  await audit("BOOK_EXERCISE_FIX", {
    actorId: a.u.userId,
    actorName: `${a.u.firstName} ${a.u.lastName}`,
    targetType: "book-exercise",
    targetId: String(a.exId),
    meta: { book: a.ex.book, module: a.ex.module },
  });
  return NextResponse.json({ ok: true, fixed: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const a = await authorize(params.id);
  if ("error" in a) return NextResponse.json({ error: a.error === 404 ? "NOT_FOUND" : "FORBIDDEN" }, { status: a.error });

  await prisma.bookExerciseFix.deleteMany({ where: { exId: a.exId } });
  await audit("BOOK_EXERCISE_FIX_REVERT", {
    actorId: a.u.userId,
    actorName: `${a.u.firstName} ${a.u.lastName}`,
    targetType: "book-exercise",
    targetId: String(a.exId),
    meta: { book: a.ex.book, module: a.ex.module },
  });
  return NextResponse.json({ ok: true, fixed: false });
}
