import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listTeacherSubmissions } from "@/lib/projects";
import { teacherClasses, teacherFeedbackInbox } from "@/lib/teacher";

export const dynamic = "force-dynamic";

// Lightweight counts powering the teacher sidebar/topbar badges. Kept cheap so
// the shell can fetch it on every teacher page without weighing pages down.
export async function GET() {
  const u = await getCurrentUser();
  if (!u || u.role !== "TEACHER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const [submitted, inbox, classes] = await Promise.all([
    listTeacherSubmissions(u.userId, { status: "SUBMITTED" }),
    teacherFeedbackInbox(u.userId),
    teacherClasses(u.userId),
  ]);

  // Friendly subject label for the sidebar footer (e.g. "Mathématiques").
  const slugs = [...new Set(classes.flatMap((c) => [...c.subjectSlugs]))];
  const subjects = slugs.length
    ? await prisma.subject.findMany({ where: { slug: { in: slugs } }, select: { name: true } })
    : [];
  const subjectLabel = subjects.map((s) => s.name).join(" · ");

  return NextResponse.json({
    teacher: { firstName: u.firstName, lastName: u.lastName, subjectLabel },
    toCorrect: submitted.length,
    openFeedback: inbox.openCount,
  });
}
