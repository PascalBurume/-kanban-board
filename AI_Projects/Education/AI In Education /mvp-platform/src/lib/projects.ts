import { prisma } from "./db";
import { audit } from "./auth";
import { awardBadge } from "./badges";
import { getStudentClass, accessibleSubjectSlugs } from "./path";
import { editableSubjectSlugs } from "./studio";
import type { SessionUser } from "./session";

// Domain logic for "Projets appliqués" — capstone projects that unlock once a
// set of prerequisite modules are completed, are worked through step by step,
// submitted by the student and reviewed/graded by a teacher.
// See docs/PROJECTS_FEATURE.md.

export const PROJECT_XP_BONUS = 150; // flat bonus per submitted/graded project

export type ProjectStatus = "LOCKED" | "AVAILABLE" | "IN_PROGRESS" | "SUBMITTED" | "RETURNED" | "GRADED";

// A module is "completed" by a student when every published lesson in it is done.
function moduleComplete(lessons: { id: string }[], doneSet: Set<string>): boolean {
  return lessons.length > 0 && lessons.every((l) => doneSet.has(l.id));
}

// ───────────────────────────── Student: hub list ─────────────────────────────

// Ids of the groups this student belongs to (scoped to a class when given).
async function studentGroupIds(userId: string, classId?: string): Promise<string[]> {
  const rows = await prisma.projectGroupMember.findMany({
    where: { studentId: userId, ...(classId ? { group: { classId } } : {}) },
    select: { groupId: true },
  });
  return rows.map((r) => r.groupId);
}

export async function buildProjects(userId: string) {
  const cls = await getStudentClass(userId);
  if (!cls) return null;
  const slugs = await accessibleSubjectSlugs(cls.id);
  if (slugs.length === 0) return { className: cls.name, subjects: [] };
  const groupIds = await studentGroupIds(userId, cls.id);

  const projects = await prisma.project.findMany({
    where: { status: "PUBLISHED", classLevel: cls.level, subjectSlug: { in: slugs } },
    orderBy: [{ subjectSlug: "asc" }, { order: "asc" }],
    include: {
      subject: true,
      prereqs: { include: { module: { include: { lessons: { where: { status: "PUBLISHED" }, select: { id: true } } } } } },
      steps: { select: { id: true } },
      submissions: {
        where: { OR: [{ studentId: userId }, ...(groupIds.length ? [{ groupId: { in: groupIds } }] : [])] },
        include: { answers: { select: { done: true } }, group: { select: { name: true } } },
      },
      assignments: { where: { classId: cls.id }, select: { dueDate: true } },
      groupAssignments: groupIds.length
        ? { where: { groupId: { in: groupIds } }, select: { dueDate: true, group: { select: { name: true } } } }
        : { where: { id: "__none__" }, select: { dueDate: true, group: { select: { name: true } } } },
    },
  });

  const doneRows = await prisma.progress.findMany({ where: { studentId: userId, status: "COMPLETED" }, select: { lessonId: true } });
  const doneSet = new Set(doneRows.map((d) => d.lessonId));

  const bySubject = new Map<string, { slug: string; name: string; color: string | null; icon: string | null; projects: unknown[] }>();

  for (const p of projects) {
    const reqTotal = p.prereqs.length;
    let reqDone = 0;
    const lockedModules: string[] = [];
    for (const pr of p.prereqs) {
      if (moduleComplete(pr.module.lessons, doneSet)) reqDone++;
      else lockedModules.push(pr.module.title);
    }
    // A group connection by the teacher overrides the prerequisite gate.
    const groupAssign = p.groupAssignments[0];
    const unlocked = !!groupAssign || reqTotal === 0 || reqDone === reqTotal;

    // Prefer the shared group submission when a group assignment covers this student.
    const sub = p.submissions.find((s) => s.groupId != null) ?? p.submissions[0];
    const stepCount = p.steps.length;
    const doneSteps = sub ? sub.answers.filter((a) => a.done).length : 0;
    const status: ProjectStatus = sub ? (sub.status as ProjectStatus) : unlocked ? "AVAILABLE" : "LOCKED";

    const entry = {
      id: p.id,
      slug: p.slug,
      title: p.title,
      difficulty: p.difficulty,
      estMinutes: p.estMinutes,
      stepCount,
      status,
      pct: stepCount ? Math.round((doneSteps / stepCount) * 100) : 0,
      grade: sub?.grade ?? null,
      reqDone,
      reqTotal,
      lockedModules,
      dueDate: groupAssign?.dueDate ?? p.assignments[0]?.dueDate ?? null,
      groupName: sub?.group?.name ?? groupAssign?.group.name ?? null,
    };

    if (!bySubject.has(p.subjectSlug)) {
      bySubject.set(p.subjectSlug, { slug: p.subjectSlug, name: p.subject.name, color: p.subject.color, icon: p.subject.icon, projects: [] });
    }
    bySubject.get(p.subjectSlug)!.projects.push(entry);
  }

  return { className: cls.name, subjects: [...bySubject.values()] };
}

// ───────────────────────── Student: one project detail ───────────────────────

// Verify a project is published and belongs to a subject + level the student's
// class studies. Returns the project (with relations) and the student's class, or null.
async function accessibleProject(userId: string, projectId: string) {
  const cls = await getStudentClass(userId);
  if (!cls) return null;
  const slugs = await accessibleSubjectSlugs(cls.id);
  const project = await prisma.project.findFirst({
    where: { id: projectId, status: "PUBLISHED", classLevel: cls.level, subjectSlug: { in: slugs } },
    include: {
      subject: true,
      steps: { orderBy: { order: "asc" } },
      prereqs: { include: { module: { include: { lessons: { where: { status: "PUBLISHED" }, select: { id: true } } } } } },
      assignments: { where: { classId: cls.id }, select: { dueDate: true } },
    },
  });
  if (!project) return null;
  return { cls, project };
}

// The group assignment covering this student for a project, if any (group must
// belong to the student's class). Group assignments take precedence over the
// solo lazy-submission path.
async function studentGroupAssignment(userId: string, projectId: string, classId: string) {
  return prisma.projectGroupAssignment.findFirst({
    where: { projectId, group: { classId, members: { some: { studentId: userId } } } },
    include: {
      group: {
        select: {
          id: true,
          name: true,
          members: { select: { student: { select: { id: true, firstName: true, lastName: true, avatarColor: true } } } },
        },
      },
    },
  });
}

export async function getProject(userId: string, projectId: string) {
  const acc = await accessibleProject(userId, projectId);
  if (!acc) return null;
  const { project } = acc;
  const groupAssign = await studentGroupAssignment(userId, projectId, acc.cls.id);

  const doneRows = await prisma.progress.findMany({ where: { studentId: userId, status: "COMPLETED" }, select: { lessonId: true } });
  const doneSet = new Set(doneRows.map((d) => d.lessonId));
  const requiredModules = project.prereqs.map((pr) => ({ title: pr.module.title, complete: moduleComplete(pr.module.lessons, doneSet) }));
  // An explicit group connection by the teacher overrides the prerequisite gate —
  // the teacher decided this group works on the project now.
  const unlocked = !!groupAssign || requiredModules.length === 0 || requiredModules.every((m) => m.complete);

  const brief = {
    id: project.id,
    slug: project.slug,
    title: project.title,
    scenarioMd: project.scenarioMd,
    objectivesMd: project.objectivesMd,
    deliverableMd: project.deliverableMd,
    difficulty: project.difficulty,
    estMinutes: project.estMinutes,
    subjectName: project.subject.name,
    color: project.subject.color,
    icon: project.subject.icon,
    dueDate: groupAssign?.dueDate ?? project.assignments[0]?.dueDate ?? null,
    requiredModules,
    stepCount: project.steps.length,
    group: groupAssign
      ? { name: groupAssign.group.name, members: groupAssign.group.members.map((m) => m.student) }
      : null,
  };

  // Locked → return the brief so the UI can explain what to finish; no submission.
  if (!unlocked) return { ...brief, locked: true as const };

  // Lazily create the working submission (+ an answer row per step): the shared
  // group submission when a group assignment covers this student, else solo.
  const subWhere = groupAssign
    ? { groupId_projectId: { groupId: groupAssign.group.id, projectId } }
    : { studentId_projectId: { studentId: userId, projectId } };
  let sub = await prisma.projectSubmission.findUnique({ where: subWhere, include: { answers: true } });
  if (!sub) {
    const data = groupAssign
      ? { groupId: groupAssign.group.id, projectId, status: "IN_PROGRESS" }
      : { studentId: userId, projectId, status: "IN_PROGRESS" };
    try {
      sub = await prisma.projectSubmission.create({
        data: { ...data, answers: { create: project.steps.map((s) => ({ stepId: s.id })) } },
        include: { answers: true },
      });
    } catch (e: unknown) {
      // Two group members opening simultaneously → unique violation; refetch.
      if ((e as { code?: string })?.code === "P2002") {
        sub = await prisma.projectSubmission.findUnique({ where: subWhere, include: { answers: true } });
        if (!sub) throw e;
      } else throw e;
    }
  } else {
    // Backfill answer rows for steps added after the submission was created.
    const have = new Set(sub.answers.map((a) => a.stepId));
    const missing = project.steps.filter((s) => !have.has(s.id));
    if (missing.length) {
      await prisma.projectStepAnswer.createMany({ data: missing.map((s) => ({ submissionId: sub!.id, stepId: s.id })) });
      sub = await prisma.projectSubmission.findUnique({ where: { id: sub.id }, include: { answers: true } });
    }
  }

  const ansByStep = new Map((sub!.answers).map((a) => [a.stepId, a]));
  const steps = project.steps.map((s) => {
    const a = ansByStep.get(s.id);
    return {
      id: s.id,
      order: s.order,
      title: s.title,
      instructionMd: s.instructionMd,
      hintMd: s.hintMd,
      response: a?.responseMd ?? "",
      done: a?.done ?? false,
    };
  });

  const editable = sub!.status === "IN_PROGRESS" || sub!.status === "RETURNED";
  const allDone = steps.length > 0 && steps.every((s) => s.done);

  return {
    ...brief,
    locked: false as const,
    submission: {
      id: sub!.id,
      status: sub!.status as ProjectStatus,
      grade: sub!.grade ?? null,
      feedbackMd: sub!.feedbackMd ?? null,
      submittedAt: sub!.submittedAt,
      reviewedAt: sub!.reviewedAt,
    },
    steps,
    editable,
    canSubmit: editable && allDone,
    readOnly: !editable,
  };
}

// ───────────────────────────── Student: mutations ────────────────────────────

// Working-submission lookup key: shared group submission first, else solo.
async function workingSubmissionWhere(userId: string, projectId: string) {
  const ga = await prisma.projectGroupAssignment.findFirst({
    where: { projectId, group: { members: { some: { studentId: userId } } } },
    select: { groupId: true },
  });
  return ga
    ? { groupId_projectId: { groupId: ga.groupId, projectId } }
    : { studentId_projectId: { studentId: userId, projectId } };
}

export async function saveStepAnswer(userId: string, projectId: string, stepId: string, responseMd: string, done?: boolean) {
  const sub = await prisma.projectSubmission.findUnique({
    where: await workingSubmissionWhere(userId, projectId),
    include: { project: { select: { steps: { select: { id: true } } } } },
  });
  if (!sub) return { error: "NO_SUBMISSION" as const };
  if (sub.status === "SUBMITTED" || sub.status === "GRADED") return { error: "LOCKED" as const };
  if (!sub.project.steps.some((s) => s.id === stepId)) return { error: "BAD_STEP" as const };

  const clipped = (responseMd ?? "").slice(0, 8000);
  await prisma.projectStepAnswer.upsert({
    where: { submissionId_stepId: { submissionId: sub.id, stepId } },
    update: { responseMd: clipped, ...(done === undefined ? {} : { done: !!done }) },
    create: { submissionId: sub.id, stepId, responseMd: clipped, done: !!done },
  });

  const answers = await prisma.projectStepAnswer.findMany({ where: { submissionId: sub.id }, select: { done: true } });
  const total = sub.project.steps.length;
  const doneCount = answers.filter((a) => a.done).length;
  return { ok: true as const, doneCount, total, allDone: total > 0 && doneCount === total };
}

export async function submitProject(userId: string, projectId: string) {
  const sub = await prisma.projectSubmission.findUnique({
    where: await workingSubmissionWhere(userId, projectId),
    include: {
      project: { select: { steps: { select: { id: true } } } },
      answers: { select: { stepId: true, done: true } },
      group: { select: { members: { select: { studentId: true } } } },
    },
  });
  if (!sub) return { error: "NO_SUBMISSION" as const };
  if (sub.status === "SUBMITTED" || sub.status === "GRADED") return { error: "ALREADY_SUBMITTED" as const };

  const doneSteps = new Set(sub.answers.filter((a) => a.done).map((a) => a.stepId));
  const allDone = sub.project.steps.length > 0 && sub.project.steps.every((s) => doneSteps.has(s.id));
  if (!allDone) return { error: "INCOMPLETE" as const };

  const firstTime = !sub.submittedAt;
  await prisma.projectSubmission.update({
    where: { id: sub.id },
    data: { status: "SUBMITTED", submittedAt: new Date() },
  });
  if (firstTime) {
    // Group submit → the badge goes to every member; solo → the submitter.
    const recipients = sub.group ? sub.group.members.map((m) => m.studentId) : [userId];
    for (const rid of recipients) await awardBadge(rid, "projet-applique").catch(() => {});
  }
  await audit("PROJECT_SUBMIT", { actorId: userId, targetType: "project", targetId: projectId });
  return { ok: true as const };
}

// ───────────────────────────── Teacher: review ───────────────────────────────

// (classId, subjectSlug) pairs the teacher is responsible for.
async function teacherPairs(teacherId: string) {
  const tas = await prisma.teacherAssignment.findMany({ where: { teacherId }, select: { classId: true, subjectSlug: true } });
  return new Set(tas.map((t) => `${t.classId}|${t.subjectSlug}`));
}

export async function listTeacherSubmissions(teacherId: string, opts: { classId?: string; status?: string } = {}) {
  const pairs = await teacherPairs(teacherId);
  if (pairs.size === 0) return [];
  const classIds = [...new Set([...pairs].map((p) => p.split("|")[0]))];
  const slugs = [...new Set([...pairs].map((p) => p.split("|")[1]))];

  const statusFilter = opts.status ? [opts.status] : ["SUBMITTED", "RETURNED", "GRADED"];
  const classWhere = opts.classId ? { classId: opts.classId } : { classId: { in: classIds } };
  const subs = await prisma.projectSubmission.findMany({
    where: {
      status: { in: statusFilter },
      project: { subjectSlug: { in: slugs } },
      OR: [{ student: { enrollment: classWhere } }, { group: classWhere }],
    },
    orderBy: [{ submittedAt: "desc" }],
    include: {
      project: { select: { title: true, subjectSlug: true, steps: { select: { id: true } } } },
      answers: { select: { done: true } },
      student: { select: { id: true, firstName: true, lastName: true, avatarColor: true, enrollment: { select: { class: { select: { id: true, name: true } } } } } },
      group: {
        select: {
          name: true,
          classId: true,
          class: { select: { name: true } },
          members: { select: { student: { select: { firstName: true, lastName: true, avatarColor: true } } } },
        },
      },
    },
  });

  return subs
    .filter((s) => {
      const classId = s.student?.enrollment?.class.id ?? s.group?.classId;
      return classId && pairs.has(`${classId}|${s.project.subjectSlug}`);
    })
    .map((s) => ({
      id: s.id,
      projectTitle: s.project.title,
      subjectSlug: s.project.subjectSlug,
      isGroup: !!s.group,
      studentName: s.group
        ? `${s.group.name} (${s.group.members.map((m) => m.student.firstName).join(", ")})`
        : `${s.student!.firstName} ${s.student!.lastName}`,
      avatarColor: s.student?.avatarColor ?? null,
      members: s.group?.members.map((m) => m.student) ?? null,
      className: s.student?.enrollment?.class.name ?? s.group?.class.name ?? "",
      status: s.status,
      grade: s.grade,
      submittedAt: s.submittedAt,
      stepCount: s.project.steps.length,
    }));
}

export async function getTeacherSubmission(teacherId: string, submissionId: string) {
  const pairs = await teacherPairs(teacherId);
  const sub = await prisma.projectSubmission.findUnique({
    where: { id: submissionId },
    include: {
      project: { include: { steps: { orderBy: { order: "asc" } } } },
      answers: true,
      student: { select: { firstName: true, lastName: true, avatarColor: true, enrollment: { select: { class: { select: { id: true, name: true } } } } } },
      group: {
        select: {
          name: true,
          classId: true,
          class: { select: { name: true } },
          members: { select: { student: { select: { firstName: true, lastName: true, avatarColor: true } } } },
        },
      },
    },
  });
  if (!sub) return null;
  const classId = sub.student?.enrollment?.class.id ?? sub.group?.classId;
  if (!classId || !pairs.has(`${classId}|${sub.project.subjectSlug}`)) return null;

  const ansByStep = new Map(sub.answers.map((a) => [a.stepId, a]));
  return {
    id: sub.id,
    status: sub.status,
    grade: sub.grade,
    feedbackMd: sub.feedbackMd,
    submittedAt: sub.submittedAt,
    reviewedAt: sub.reviewedAt,
    isGroup: !!sub.group,
    groupName: sub.group?.name ?? null,
    members: sub.group?.members.map((m) => m.student) ?? null,
    studentName: sub.group ? sub.group.name : `${sub.student!.firstName} ${sub.student!.lastName}`,
    className: sub.student?.enrollment?.class.name ?? sub.group?.class.name ?? "",
    project: { id: sub.project.id, title: sub.project.title, scenarioMd: sub.project.scenarioMd, deliverableMd: sub.project.deliverableMd },
    steps: sub.project.steps.map((s) => ({
      id: s.id,
      order: s.order,
      title: s.title,
      instructionMd: s.instructionMd,
      response: ansByStep.get(s.id)?.responseMd ?? "",
      done: ansByStep.get(s.id)?.done ?? false,
    })),
  };
}

export async function reviewSubmission(
  teacherId: string,
  submissionId: string,
  input: { action: "grade" | "return"; grade?: number; feedbackMd?: string },
) {
  const detail = await getTeacherSubmission(teacherId, submissionId);
  if (!detail) return { error: "NOT_FOUND" as const };

  const feedbackMd = (input.feedbackMd ?? "").slice(0, 4000);
  if (input.action === "grade") {
    const grade = Math.max(0, Math.min(100, Math.round(Number(input.grade))));
    if (!Number.isFinite(grade)) return { error: "BAD_GRADE" as const };
    await prisma.projectSubmission.update({
      where: { id: submissionId },
      data: { status: "GRADED", grade, feedbackMd, reviewedById: teacherId, reviewedAt: new Date() },
    });
    await audit("PROJECT_GRADE", { actorId: teacherId, targetType: "project_submission", targetId: submissionId, meta: { grade } });
    return { ok: true as const, status: "GRADED" as const };
  }
  // return for revision
  await prisma.projectSubmission.update({
    where: { id: submissionId },
    data: { status: "RETURNED", feedbackMd, reviewedById: teacherId, reviewedAt: new Date() },
  });
  await audit("PROJECT_RETURN", { actorId: teacherId, targetType: "project_submission", targetId: submissionId });
  return { ok: true as const, status: "RETURNED" as const };
}

// ───────────────────────── Teacher: assign to a class ────────────────────────

export async function teacherAssignableProjects(teacherId: string) {
  const tas = await prisma.teacherAssignment.findMany({ where: { teacherId }, select: { classId: true, subjectSlug: true } });
  if (tas.length === 0) return { classes: [], projects: [] };
  const classIds = [...new Set(tas.map((t) => t.classId))];
  const slugs = [...new Set(tas.map((t) => t.subjectSlug))];
  const [classes, projects] = await Promise.all([
    prisma.classGroup.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true, level: true } }),
    prisma.project.findMany({
      where: { status: "PUBLISHED", subjectSlug: { in: slugs } },
      orderBy: [{ subjectSlug: "asc" }, { order: "asc" }],
      include: {
        steps: { select: { id: true } },
        prereqs: { include: { module: { select: { title: true } } } },
        assignments: { where: { classId: { in: classIds } }, include: { class: { select: { name: true } } } },
      },
    }),
  ]);
  return {
    classes,
    projects: projects.map((p) => ({
      id: p.id,
      title: p.title,
      subjectSlug: p.subjectSlug,
      classLevel: p.classLevel,
      difficulty: p.difficulty,
      estMinutes: p.estMinutes,
      stepCount: p.steps.length,
      prereqs: p.prereqs.map((pr) => pr.module.title),
      assigned: p.assignments.map((a) => a.class.name),
    })),
  };
}

export async function assignProject(teacherId: string, input: { classId: string; projectId: string; dueDate?: string | null }) {
  const project = await prisma.project.findUnique({ where: { id: input.projectId }, select: { subjectSlug: true } });
  if (!project) return { error: "NOT_FOUND" as const };
  const pairs = await teacherPairs(teacherId);
  if (!pairs.has(`${input.classId}|${project.subjectSlug}`)) return { error: "FORBIDDEN" as const };
  const dueDate = input.dueDate ? new Date(input.dueDate) : null;
  await prisma.projectAssignment.upsert({
    where: { classId_projectId: { classId: input.classId, projectId: input.projectId } },
    update: { dueDate },
    create: { classId: input.classId, projectId: input.projectId, dueDate, createdById: teacherId },
  });
  await audit("PROJECT_ASSIGN", { actorId: teacherId, targetType: "project", targetId: input.projectId, meta: { classId: input.classId } });
  return { ok: true as const };
}

// Used by the Copilot project-coach route: load the project + a single step
// (server-authoritative instruction text), scoped to what the student can access.
export async function getProjectStepForCoach(userId: string, projectId: string, stepId: string) {
  const acc = await accessibleProject(userId, projectId);
  if (!acc) return null;
  const step = acc.project.steps.find((s) => s.id === stepId);
  if (!step) return null;
  return {
    projectTitle: acc.project.title,
    subjectName: acc.project.subject.name,
    scenarioMd: acc.project.scenarioMd,
    step: { order: step.order, title: step.title, instructionMd: step.instructionMd },
  };
}

// ───────────────────── Teacher: author / manage projects ─────────────────────
// A teacher may create and edit projects in the subjects they are assigned to
// (ADMIN → all subjects). Mirrors the Studio content-editing permission model.

function slugifyProject(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 56) || "projet"
  );
}

export interface ProjectInput {
  title: string;
  subjectSlug: string;
  classLevel: string;
  difficulty: "INTRO" | "INTERMEDIATE" | "ADVANCED";
  estMinutes: number;
  scenarioMd: string;
  objectivesMd: string;
  deliverableMd: string;
  steps: { id?: string; title: string; instructionMd: string; hintMd?: string }[];
  prereqModuleIds: string[];
}

// Subjects (+ their modules, grouped by level) the teacher can build projects in,
// used to populate the editor's dropdowns and prerequisite picker.
export async function projectStudioOptions(user: SessionUser) {
  const slugs = await editableSubjectSlugs(user);
  if (slugs.length === 0) return { subjects: [] };
  const subjects = await prisma.subject.findMany({
    where: { slug: { in: slugs } },
    orderBy: { order: "asc" },
    include: { modules: { orderBy: { order: "asc" }, select: { id: true, title: true, classLevel: true, order: true } } },
  });
  return {
    subjects: subjects.map((s) => ({
      slug: s.slug,
      name: s.name,
      icon: s.icon,
      color: s.color,
      modules: s.modules.map((m) => ({ id: m.id, title: m.title, classLevel: m.classLevel, order: m.order })),
    })),
  };
}

export async function listEditableProjects(user: SessionUser) {
  const slugs = await editableSubjectSlugs(user);
  if (slugs.length === 0) return [];
  const projects = await prisma.project.findMany({
    where: { subjectSlug: { in: slugs } },
    orderBy: [{ subjectSlug: "asc" }, { order: "asc" }],
    include: {
      subject: { select: { name: true } },
      steps: { select: { id: true } },
      assignments: { select: { id: true } },
      submissions: { select: { id: true } },
    },
  });
  return projects.map((p) => ({
    id: p.id,
    title: p.title,
    subjectSlug: p.subjectSlug,
    subjectName: p.subject.name,
    classLevel: p.classLevel,
    difficulty: p.difficulty,
    status: p.status,
    estMinutes: p.estMinutes,
    stepCount: p.steps.length,
    assignedCount: p.assignments.length,
    submissionCount: p.submissions.length,
  }));
}

export async function getProjectForEdit(user: SessionUser, id: string) {
  const slugs = await editableSubjectSlugs(user);
  const p = await prisma.project.findFirst({
    where: { id, subjectSlug: { in: slugs } },
    include: { steps: { orderBy: { order: "asc" } }, prereqs: { select: { moduleId: true } } },
  });
  if (!p) return null;
  return {
    id: p.id,
    title: p.title,
    subjectSlug: p.subjectSlug,
    classLevel: p.classLevel,
    difficulty: p.difficulty,
    estMinutes: p.estMinutes,
    status: p.status,
    scenarioMd: p.scenarioMd,
    objectivesMd: p.objectivesMd,
    deliverableMd: p.deliverableMd,
    steps: p.steps.map((s) => ({ id: s.id, order: s.order, title: s.title, instructionMd: s.instructionMd, hintMd: s.hintMd ?? "" })),
    prereqModuleIds: p.prereqs.map((pr) => pr.moduleId),
  };
}

function validateProjectInput(input: ProjectInput): string | null {
  if (!input.title?.trim()) return "TITLE_REQUIRED";
  if (!input.subjectSlug) return "SUBJECT_REQUIRED";
  if (!["5e", "6e"].includes(input.classLevel)) return "BAD_LEVEL";
  if (!["INTRO", "INTERMEDIATE", "ADVANCED"].includes(input.difficulty)) return "BAD_DIFFICULTY";
  if (!Array.isArray(input.steps) || input.steps.length === 0) return "STEPS_REQUIRED";
  if (input.steps.some((s) => !s.title?.trim())) return "STEP_TITLE_REQUIRED";
  return null;
}

export async function createProject(user: SessionUser, input: ProjectInput) {
  const slugs = await editableSubjectSlugs(user);
  if (!slugs.includes(input.subjectSlug)) return { error: "FORBIDDEN" as const };
  const bad = validateProjectInput(input);
  if (bad) return { error: bad };

  const last = await prisma.project.aggregate({ where: { subjectSlug: input.subjectSlug }, _max: { order: true } });
  const order = (last._max.order ?? 0) + 1;
  let slug = slugifyProject(input.title);
  if (await prisma.project.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36)}`;

  const p = await prisma.project.create({
    data: {
      subjectSlug: input.subjectSlug,
      classLevel: input.classLevel,
      slug,
      title: input.title.trim(),
      scenarioMd: input.scenarioMd ?? "",
      objectivesMd: input.objectivesMd ?? "",
      deliverableMd: input.deliverableMd ?? "",
      difficulty: input.difficulty,
      estMinutes: Math.max(5, Math.min(600, Math.round(Number(input.estMinutes) || 60))),
      order,
      status: "DRAFT",
      steps: { create: input.steps.map((s, i) => ({ order: i + 1, title: s.title.trim(), instructionMd: s.instructionMd ?? "", hintMd: s.hintMd?.trim() || "" })) },
      prereqs: { create: (input.prereqModuleIds || []).map((mid) => ({ moduleId: mid })) },
    },
  });
  await audit("PROJECT_CREATE", { actorId: user.userId, actorName: `${user.firstName} ${user.lastName}`, targetType: "project", targetId: p.id });
  return { ok: true as const, id: p.id };
}

export async function updateProject(user: SessionUser, id: string, input: ProjectInput) {
  const existing = await getProjectForEdit(user, id);
  if (!existing) return { error: "NOT_FOUND" as const };
  const slugs = await editableSubjectSlugs(user);
  if (!slugs.includes(input.subjectSlug)) return { error: "FORBIDDEN" as const };
  const bad = validateProjectInput(input);
  if (bad) return { error: bad };

  // Id-aware step diff: keep & update existing steps (preserving student answers),
  // create new ones, delete removed ones (cascades their answers).
  const keepIds = input.steps.filter((s) => s.id).map((s) => s.id!) as string[];
  await prisma.projectStep.deleteMany({ where: { projectId: id, id: { notIn: keepIds.length ? keepIds : ["__none__"] } } });
  for (let i = 0; i < input.steps.length; i++) {
    const s = input.steps[i];
    const data = { order: i + 1, title: s.title.trim(), instructionMd: s.instructionMd ?? "", hintMd: s.hintMd?.trim() || "" };
    if (s.id) await prisma.projectStep.update({ where: { id: s.id }, data });
    else await prisma.projectStep.create({ data: { projectId: id, ...data } });
  }

  await prisma.projectPrereq.deleteMany({ where: { projectId: id } });
  if ((input.prereqModuleIds || []).length) {
    await prisma.projectPrereq.createMany({ data: input.prereqModuleIds.map((mid) => ({ projectId: id, moduleId: mid })) });
  }

  await prisma.project.update({
    where: { id },
    data: {
      title: input.title.trim(),
      subjectSlug: input.subjectSlug,
      classLevel: input.classLevel,
      scenarioMd: input.scenarioMd ?? "",
      objectivesMd: input.objectivesMd ?? "",
      deliverableMd: input.deliverableMd ?? "",
      difficulty: input.difficulty,
      estMinutes: Math.max(5, Math.min(600, Math.round(Number(input.estMinutes) || 60))),
    },
  });
  await audit("PROJECT_UPDATE", { actorId: user.userId, actorName: `${user.firstName} ${user.lastName}`, targetType: "project", targetId: id });
  return { ok: true as const };
}

export async function setProjectStatus(user: SessionUser, id: string, status: "PUBLISHED" | "DRAFT") {
  const existing = await getProjectForEdit(user, id);
  if (!existing) return { error: "NOT_FOUND" as const };
  await prisma.project.update({ where: { id }, data: { status } });
  await audit(status === "PUBLISHED" ? "PROJECT_PUBLISH" : "PROJECT_UNPUBLISH", { actorId: user.userId, actorName: `${user.firstName} ${user.lastName}`, targetType: "project", targetId: id });
  return { ok: true as const, status };
}

export async function deleteProject(user: SessionUser, id: string) {
  const existing = await getProjectForEdit(user, id);
  if (!existing) return { error: "NOT_FOUND" as const };
  const subs = await prisma.projectSubmission.count({ where: { projectId: id } });
  if (subs > 0) return { error: "HAS_SUBMISSIONS" as const };
  await prisma.projectStep.deleteMany({ where: { projectId: id } });
  await prisma.projectPrereq.deleteMany({ where: { projectId: id } });
  await prisma.projectAssignment.deleteMany({ where: { projectId: id } });
  await prisma.project.delete({ where: { id } });
  await audit("PROJECT_DELETE", { actorId: user.userId, actorName: `${user.firstName} ${user.lastName}`, targetType: "project", targetId: id });
  return { ok: true as const };
}
