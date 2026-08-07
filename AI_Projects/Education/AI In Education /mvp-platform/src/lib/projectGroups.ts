import { prisma } from "./db";
import { audit } from "./auth";

// Domain logic for the project assignment canvas: named work groups per class,
// student membership, and group → project connections (ProjectGroupAssignment).
// Complements the class-level ProjectAssignment kept as the whole-class path.

// A teacher may manage groups for a class they have any assignment in; a group
// may only be connected to projects in the teacher's subjects for that class.
async function teacherOnClass(teacherId: string, classId: string) {
  return prisma.teacherAssignment.findFirst({ where: { teacherId, classId }, select: { id: true } });
}

async function teacherSubjectsForClass(teacherId: string, classId: string): Promise<string[]> {
  const tas = await prisma.teacherAssignment.findMany({ where: { teacherId, classId }, select: { subjectSlug: true } });
  return [...new Set(tas.map((t) => t.subjectSlug))];
}

async function ownedGroup(teacherId: string, groupId: string) {
  const group = await prisma.projectGroup.findUnique({ where: { id: groupId }, select: { id: true, classId: true, name: true } });
  if (!group) return null;
  if (!(await teacherOnClass(teacherId, group.classId))) return null;
  return group;
}

// ───────────────────────────── Canvas payload ────────────────────────────────

export async function canvasData(teacherId: string, classId: string) {
  if (!(await teacherOnClass(teacherId, classId))) return null;
  const cls = await prisma.classGroup.findUnique({ where: { id: classId }, select: { id: true, name: true, level: true } });
  if (!cls) return null;
  const slugs = await teacherSubjectsForClass(teacherId, classId);

  const [enrollments, groups, projects, classAssignments] = await Promise.all([
    prisma.enrollment.findMany({
      where: { classId },
      select: { student: { select: { id: true, firstName: true, lastName: true, avatarColor: true } } },
    }),
    prisma.projectGroup.findMany({
      where: { classId },
      orderBy: { createdAt: "asc" },
      include: {
        members: { select: { studentId: true } },
        assignments: { select: { projectId: true, dueDate: true } },
        submissions: { select: { projectId: true, status: true, grade: true } },
      },
    }),
    prisma.project.findMany({
      where: { status: "PUBLISHED", classLevel: cls.level, subjectSlug: { in: slugs } },
      orderBy: [{ subjectSlug: "asc" }, { order: "asc" }],
      include: {
        subject: { select: { name: true, icon: true, color: true } },
        steps: { select: { id: true } },
        prereqs: { include: { module: { select: { title: true } } } },
      },
    }),
    prisma.projectAssignment.findMany({ where: { classId }, select: { projectId: true, dueDate: true } }),
  ]);

  const students = enrollments
    .map((e) => e.student)
    .sort((a, b) => a.lastName.localeCompare(b.lastName));

  return {
    class: cls,
    students,
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      members: g.members.map((m) => m.studentId),
      assignments: g.assignments,
      submissions: g.submissions,
    })),
    projects: projects.map((p) => ({
      id: p.id,
      title: p.title,
      subjectSlug: p.subjectSlug,
      subjectName: p.subject.name,
      difficulty: p.difficulty,
      estMinutes: p.estMinutes,
      stepCount: p.steps.length,
      prereqs: p.prereqs.map((pr) => pr.module.title),
      classAssigned: classAssignments.find((a) => a.projectId === p.id)?.dueDate !== undefined,
      classDueDate: classAssignments.find((a) => a.projectId === p.id)?.dueDate ?? null,
    })),
  };
}

// ───────────────────────────── Group CRUD ─────────────────────────────────────

export async function createGroup(teacherId: string, classId: string, name: string) {
  if (!(await teacherOnClass(teacherId, classId))) return { error: "FORBIDDEN" as const };
  const clean = (name ?? "").trim().slice(0, 40);
  if (!clean) return { error: "NAME_REQUIRED" as const };
  const exists = await prisma.projectGroup.findUnique({ where: { classId_name: { classId, name: clean } } });
  if (exists) return { error: "NAME_TAKEN" as const };
  const g = await prisma.projectGroup.create({ data: { classId, name: clean, createdById: teacherId } });
  await audit("PROJECT_GROUP_CREATE", { actorId: teacherId, targetType: "project_group", targetId: g.id, meta: { classId, name: clean } });
  return { ok: true as const, id: g.id, name: g.name };
}

export async function renameGroup(teacherId: string, groupId: string, name: string) {
  const group = await ownedGroup(teacherId, groupId);
  if (!group) return { error: "NOT_FOUND" as const };
  const clean = (name ?? "").trim().slice(0, 40);
  if (!clean) return { error: "NAME_REQUIRED" as const };
  const exists = await prisma.projectGroup.findFirst({ where: { classId: group.classId, name: clean, NOT: { id: groupId } } });
  if (exists) return { error: "NAME_TAKEN" as const };
  await prisma.projectGroup.update({ where: { id: groupId }, data: { name: clean } });
  return { ok: true as const };
}

export async function deleteGroup(teacherId: string, groupId: string) {
  const group = await ownedGroup(teacherId, groupId);
  if (!group) return { error: "NOT_FOUND" as const };
  // Deleting the group cascades its shared submissions — refuse once real work
  // has been handed in.
  const submitted = await prisma.projectSubmission.count({ where: { groupId, status: { not: "IN_PROGRESS" } } });
  if (submitted > 0) return { error: "HAS_SUBMISSIONS" as const };
  await prisma.projectGroup.delete({ where: { id: groupId } });
  await audit("PROJECT_GROUP_DELETE", { actorId: teacherId, targetType: "project_group", targetId: groupId });
  return { ok: true as const };
}

// ───────────────────────────── Membership ─────────────────────────────────────

// Move a student into a group (or out of all groups in that class with groupId null).
export async function setMembership(teacherId: string, input: { classId: string; studentId: string; groupId: string | null }) {
  const { classId, studentId, groupId } = input;
  if (!(await teacherOnClass(teacherId, classId))) return { error: "FORBIDDEN" as const };
  const enrolled = await prisma.enrollment.findFirst({ where: { classId, studentId }, select: { id: true } });
  if (!enrolled) return { error: "NOT_IN_CLASS" as const };

  if (groupId) {
    const group = await prisma.projectGroup.findFirst({ where: { id: groupId, classId }, select: { id: true } });
    if (!group) return { error: "NOT_FOUND" as const };
  }

  // One group per student per class: clear other memberships in this class first.
  await prisma.projectGroupMember.deleteMany({ where: { studentId, group: { classId } } });
  if (groupId) {
    await prisma.projectGroupMember.create({ data: { groupId, studentId } });
  }
  return { ok: true as const };
}

// ───────────────────────────── Group → project edges ─────────────────────────

export async function assignGroup(teacherId: string, input: { groupId: string; projectId: string; dueDate?: string | null }) {
  const group = await ownedGroup(teacherId, input.groupId);
  if (!group) return { error: "NOT_FOUND" as const };
  const project = await prisma.project.findUnique({ where: { id: input.projectId }, select: { subjectSlug: true, status: true } });
  if (!project || project.status !== "PUBLISHED") return { error: "NOT_FOUND" as const };
  const slugs = await teacherSubjectsForClass(teacherId, group.classId);
  if (!slugs.includes(project.subjectSlug)) return { error: "FORBIDDEN" as const };

  const dueDate = input.dueDate ? new Date(input.dueDate) : null;
  await prisma.projectGroupAssignment.upsert({
    where: { groupId_projectId: { groupId: input.groupId, projectId: input.projectId } },
    update: { dueDate },
    create: { groupId: input.groupId, projectId: input.projectId, dueDate, createdById: teacherId },
  });
  await audit("PROJECT_GROUP_ASSIGN", { actorId: teacherId, targetType: "project", targetId: input.projectId, meta: { groupId: input.groupId } });

  // Members who already submitted solo keep that work, but the group submission
  // now takes precedence for them — warn the teacher.
  const memberIds = (await prisma.projectGroupMember.findMany({ where: { groupId: input.groupId }, select: { studentId: true } })).map((m) => m.studentId);
  const solo = memberIds.length
    ? await prisma.projectSubmission.findMany({
        where: { projectId: input.projectId, studentId: { in: memberIds } },
        select: { student: { select: { firstName: true, lastName: true } } },
      })
    : [];
  if (solo.length) {
    return { ok: true as const, warning: "SOLO_SUBMISSIONS" as const, students: solo.map((s) => `${s.student!.firstName} ${s.student!.lastName}`) };
  }
  return { ok: true as const };
}

export async function unassignGroup(teacherId: string, input: { groupId: string; projectId: string }) {
  const group = await ownedGroup(teacherId, input.groupId);
  if (!group) return { error: "NOT_FOUND" as const };
  const sub = await prisma.projectSubmission.findUnique({
    where: { groupId_projectId: { groupId: input.groupId, projectId: input.projectId } },
    select: { status: true },
  });
  if (sub && (sub.status === "SUBMITTED" || sub.status === "GRADED")) return { error: "HAS_SUBMISSIONS" as const };
  await prisma.projectGroupAssignment.deleteMany({ where: { groupId: input.groupId, projectId: input.projectId } });
  await audit("PROJECT_GROUP_UNASSIGN", { actorId: teacherId, targetType: "project", targetId: input.projectId, meta: { groupId: input.groupId } });
  return { ok: true as const };
}
