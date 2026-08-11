import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listTeacherSubmissions } from "@/lib/projects";
import { teacherClasses, teacherFeedbackInbox } from "@/lib/teacher";
import { teachingLabel } from "@/lib/subjectLabel";
import { roleLabel, withCivility, normalizeGender } from "@/lib/gender";

export const dynamic = "force-dynamic";

// Lightweight counts powering the teacher sidebar/topbar badges. Kept cheap so
// the shell can fetch it on every teacher page without weighing pages down.
export async function GET() {
  const u = await getCurrentUser();
  if (!u || u.role !== "TEACHER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const [submitted, inbox, classes, me] = await Promise.all([
    listTeacherSubmissions(u.userId, { status: "SUBMITTED" }),
    teacherFeedbackInbox(u.userId),
    teacherClasses(u.userId),
    // The name comes from the row, not the session: the session caches it, and a cache
    // goes stale — a profile edit in another tab left the sidebar showing the old name.
    prisma.user.findUnique({ where: { id: u.userId }, select: { gender: true, firstName: true, lastName: true } }),
  ]);

  // The sidebar shows the DISCIPLINE (« Mathématiques »); the full book list is a
  // tooltip there and a proper card on /profile. Both are sent: joining them here into
  // one string is what produced an eight-line identity block.
  const slugs = [...new Set(classes.flatMap((c) => [...c.subjectSlugs]))];
  const rows = slugs.length
    ? await prisma.subject.findMany({ where: { slug: { in: slugs } }, select: { name: true } })
    : [];
  const subjects = rows.map((s) => s.name).sort((a, b) => a.localeCompare(b, "fr"));

  // French agreement is resolved HERE, once. Two shells rendering « Mme » and
  // « Enseignante » from their own hard-coded strings is how they drifted apart from
  // /profile in the first place.
  // Normalised, not read raw: the column is a plain String? and a hand-edited row could
  // hold anything. Unknown values must degrade to « Enseignant(e) », not leak through.
  const gender = normalizeGender(me?.gender);
  const firstName = me?.firstName ?? u.firstName;
  const lastName = me?.lastName ?? u.lastName;

  return NextResponse.json({
    teacher: {
      firstName,
      lastName,
      gender,
      displayName: withCivility(gender, `${firstName} ${lastName}`.trim()),
      roleLabel: roleLabel("TEACHER", gender),
      subjects,
      discipline: teachingLabel(subjects),
      classCount: classes.length,
    },
    toCorrect: submitted.length,
    openFeedback: inbox.openCount,
  });
}
