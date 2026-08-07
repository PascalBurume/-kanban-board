import { prisma } from "./db";
import { hashSecret } from "./auth";
import { teacherClasses, classLessonTotal } from "./teacher";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DAY = 86400000;

// Academic disciplines a teacher can be given — Subject.family keys with French
// labels for the admin UI. Shared by approval + assignment flows.
const DISCIPLINE_LABELS: Record<string, string> = {
  math: "Mathématiques",
  physique: "Physique",
  chimie: "Chimie",
  geometrie: "Géométrie descriptive",
  exetat: "Révision EXETAT",
};

// Distinct disciplines that actually have content (Subject.family), ordered by
// label — the options offered to the super admin.
async function availableDisciplines() {
  const families = await prisma.subject.findMany({ where: { family: { not: null } }, select: { family: true }, distinct: ["family"] });
  return [...new Set(families.map((f) => f.family!).filter(Boolean))]
    .map((key) => ({ key, label: DISCIPLINE_LABELS[key] ?? key }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

const DB_PATH = path.join(process.cwd(), "prisma", "dev.db");
const BACKUP_DIR = path.join(process.cwd(), "backups");

export function genPin(): string {
  // 4-digit, avoid trivial 0000/1111
  let pin = "";
  do {
    pin = String(crypto.randomInt(0, 10000)).padStart(4, "0");
  } while (/^(\d)\1{3}$/.test(pin));
  return pin;
}

const AV = ["#4f46e5", "#0d9488", "#ea580c", "#16a34a", "#7c3aed", "#2563eb", "#db2777", "#d97706", "#0891b2", "#65a30d"];
export function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AV[Math.abs(h) % AV.length];
}

// ---- Overview ----
export async function adminOverview() {
  const [teachers, students, classes] = await Promise.all([
    prisma.user.count({ where: { role: "TEACHER" } }),
    prisma.user.count({ where: { role: "STUDENT" } }),
    prisma.classGroup.count({ where: { isArchived: false } }),
  ]);
  const health = await systemHealth();
  const recent = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 });
  return {
    kpis: { teachers, students, classes, storageGB: health.storage.usedGB },
    health: { ollamaOnline: health.ollama.online, model: health.ollama.model, dbSizeMB: health.db.sizeMB },
    recent: recent.map((r) => ({ id: r.id, action: r.action, actorName: r.actorName, targetType: r.targetType, createdAt: r.createdAt.toISOString() })),
  };
}

// ---- System health ----
export async function systemHealth() {
  // Ollama ping (short timeout; offline by default in dev/air-gapped).
  const url = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
  const model = process.env.OLLAMA_MODEL || "gemma4:e2b";
  let online = false;
  let models: string[] = [];
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 800);
    const res = await fetch(`${url}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) {
      online = true;
      const data = await res.json().catch(() => ({}));
      models = Array.isArray(data?.models) ? data.models.map((m: { name: string }) => m.name) : [];
    }
  } catch {
    online = false;
  }

  let dbSizeMB = 0;
  try {
    dbSizeMB = +(fs.statSync(DB_PATH).size / 1048576).toFixed(2);
  } catch {
    /* ignore */
  }

  let usedGB = 0;
  let freeGB = 0;
  let totalGB = 0;
  try {
    const fsx = fs.statfsSync(process.cwd());
    totalGB = +((fsx.blocks * fsx.bsize) / 1073741824).toFixed(1);
    freeGB = +((fsx.bfree * fsx.bsize) / 1073741824).toFixed(1);
    usedGB = +(totalGB - freeGB).toFixed(1);
  } catch {
    /* ignore */
  }

  const [lessons, users] = await Promise.all([prisma.lesson.count(), prisma.user.count()]);
  const lastBackup = await prisma.setting.findUnique({ where: { key: "backup.last" } });

  return {
    ollama: { online, model, url, models },
    db: { sizeMB: dbSizeMB, lessons, users },
    storage: { usedGB, freeGB, totalGB, pct: totalGB ? Math.round((usedGB / totalGB) * 100) : 0 },
    network: { mode: "LAN · air-gapped", host: "mwalimu.local" },
    lastBackup: lastBackup ? JSON.parse(lastBackup.value) : null,
  };
}

// ---- Backup (to a folder = USB drive in production) ----
export async function backupDatabase(actorId: string, actorName: string) {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(BACKUP_DIR, `mwalimu-${stamp}.db`);
  // WAL checkpoint so the copy is consistent, then copy the file.
  try {
    await prisma.$executeRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE);");
  } catch {
    /* ignore */
  }
  fs.copyFileSync(DB_PATH, file);
  const sizeMB = +(fs.statSync(file).size / 1048576).toFixed(2);
  const info = { at: new Date().toISOString(), file: path.basename(file), sizeMB };
  await prisma.setting.upsert({ where: { key: "backup.last" }, update: { value: JSON.stringify(info) }, create: { key: "backup.last", value: JSON.stringify(info) } });
  await prisma.auditLog.create({ data: { actorId, actorName, action: "BACKUP", targetType: "system", metaJson: JSON.stringify(info) } });
  return info;
}

// ---- CSV import ----
export function parseStudentCsv(csv: string): { firstName: string; lastName: string; className: string }[] {
  const rows: { firstName: string; lastName: string; className: string }[] = [];
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    // skip a header row
    if (i === 0 && /nom|name|class|élève|eleve|pr[eé]nom/i.test(lines[i]) && !/\d/.test(lines[i])) continue;
    if (cols.length >= 3 && cols[0] && cols[1] && cols[2]) {
      rows.push({ firstName: cols[0], lastName: cols[1], className: cols[2] });
    } else if (cols.length === 2 && cols[0] && cols[1]) {
      const parts = cols[0].split(/\s+/);
      rows.push({ firstName: parts[0], lastName: parts.slice(1).join(" ") || "", className: cols[1] });
    }
  }
  return rows;
}

export async function importStudents(csv: string, actorId: string, actorName: string) {
  const rows = parseStudentCsv(csv);
  const classes = await prisma.classGroup.findMany();
  const byName = new Map(classes.map((c) => [c.name.toLowerCase(), c]));
  const created: { name: string; className: string; pin: string }[] = [];
  const errors: { line: string; reason: string }[] = [];

  for (const r of rows) {
    const cls = byName.get(r.className.toLowerCase());
    if (!cls) {
      errors.push({ line: `${r.firstName} ${r.lastName}`, reason: `Classe introuvable : ${r.className}` });
      continue;
    }
    const pin = genPin();
    const student = await prisma.user.create({
      data: {
        role: "STUDENT",
        firstName: r.firstName,
        lastName: r.lastName,
        pinHash: hashSecret(pin),
        avatarColor: avatarColor(`${r.firstName} ${r.lastName}`),
        locale: "fr",
      },
    });
    await prisma.enrollment.create({ data: { studentId: student.id, classId: cls.id } });
    created.push({ name: `${r.firstName} ${r.lastName}`, className: cls.name, pin });
  }

  await prisma.auditLog.create({
    data: { actorId, actorName, action: "STUDENT_IMPORT", targetType: "students", metaJson: JSON.stringify({ created: created.length, errors: errors.length }) },
  });
  return { created, errors };
}

// ---- Teacher accounts (created by the super admin only) ----

// Temporary password handed to the teacher offline; they must change it at first
// sign-in. Unambiguous alphabet (no O/0, l/1) since it gets read off a screen.
export function genTempPassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += alphabet[crypto.randomInt(0, alphabet.length)];
  return out;
}

type CreateTeacherInput = { firstName: string; lastName: string; email: string; password?: string; disciplines?: string[] };

export async function createTeacher(input: CreateTeacherInput, actorId: string, actorName: string) {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim().toLowerCase();

  if (!firstName || !lastName || !email) return { error: "MISSING_FIELDS" as const };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "BAD_EMAIL" as const };

  const password = input.password?.trim() || genTempPassword();
  if (password.length < 8) return { error: "WEAK_PASSWORD" as const };

  if (await prisma.user.findUnique({ where: { email } })) return { error: "EMAIL_TAKEN" as const };

  const clean = [...new Set((input.disciplines ?? []).map((f) => f.trim()).filter((f) => f in DISCIPLINE_LABELS))];

  const teacher = await prisma.user.create({
    data: {
      role: "TEACHER",
      firstName,
      lastName,
      email,
      passwordHash: hashSecret(password),
      avatarColor: avatarColor(`${firstName} ${lastName}`),
      isActive: true,
      mustChangePassword: true,
      ...(clean.length ? { disciplines: clean.join(",") } : {}),
      locale: "fr",
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      actorName,
      action: "TEACHER_CREATE",
      targetType: "teacher",
      targetId: teacher.id,
      metaJson: JSON.stringify({ email, disciplines: clean }),
    },
  });

  return {
    teacher: { id: teacher.id, name: `${firstName} ${lastName}`, email },
    // Returned once, never stored in the clear — the admin passes it on in person.
    password,
  };
}

// ---- Admin queue: open PIN-reset requests ----
export async function listApprovals() {
  // Open PIN-reset requests in the last 14 days (resolved ones are still shown
  // for context; the admin acts via the existing reset-pin endpoint).
  const since = new Date(Date.now() - 14 * 86400000);
  const resetReqs = await prisma.auditLog.findMany({
    where: { action: "PIN_RESET_REQUEST", createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  return {
    disciplines: await availableDisciplines(), // options for setting a teacher's subject at creation
    pinResets: resetReqs.map((r) => ({
      id: r.id,
      studentId: r.targetId,
      name: r.actorName,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

// ---- Class ↔ book wiring options ----
// The (level, field) pairs a class may legally use, with the books each pair
// studies. A class whose field doesn't match an Offering resolves to no books
// and silently falls back to an arbitrary subject, so both the admin UI and the
// class endpoints constrain the choice to this list.
export async function offeringOptions() {
  const offerings = await prisma.offering.findMany({
    include: { subject: { select: { name: true } } },
    orderBy: [{ level: "asc" }, { field: "asc" }, { subjectSlug: "asc" }],
  });
  const byPair = new Map<string, { level: string; field: string; subjects: string[] }>();
  for (const o of offerings) {
    const key = `${o.level}|${o.field}`;
    if (!byPair.has(key)) byPair.set(key, { level: o.level, field: o.field, subjects: [] });
    byPair.get(key)!.subjects.push(o.subject.name);
  }
  return [...byPair.values()];
}

// True when the pair maps to at least one book. A class with no field is allowed
// (it simply studies nothing yet); a non-empty field must be a real offering.
export async function isValidLevelField(level: string, field: string | null | undefined) {
  if (!field) return true;
  const hit = await prisma.offering.findFirst({ where: { level, field }, select: { id: true } });
  return hit !== null;
}

// ---- Class invite codes (student self-enrollment) ----
export function genInviteCode(): string {
  // 8 chars, unambiguous alphabet (no 0/O/1/I), grouped as XXXX-XXXX.
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += alpha[crypto.randomInt(0, alpha.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export async function regenerateInviteCode(classId: string, actorId: string, actorName: string) {
  const cls = await prisma.classGroup.findUnique({ where: { id: classId } });
  if (!cls) return null;
  // Retry on the (rare) unique collision.
  let code = "";
  for (let i = 0; i < 5; i++) {
    code = genInviteCode();
    try {
      await prisma.classGroup.update({ where: { id: classId }, data: { inviteCode: code } });
      break;
    } catch {
      code = "";
    }
  }
  if (!code) return null;
  await prisma.auditLog.create({
    data: { actorId, actorName, action: "INVITE_CODE", targetType: "class", targetId: classId, metaJson: JSON.stringify({ name: cls.name }) },
  });
  return { classId, inviteCode: code };
}

// ---- Assignment matrix ----
export async function assignmentMatrix() {
  const [teachers, classes, assignments, subjects, disciplines] = await Promise.all([
    prisma.user.findMany({ where: { role: "TEACHER" }, select: { id: true, firstName: true, lastName: true, disciplines: true } }),
    prisma.classGroup.findMany({ where: { isArchived: false }, orderBy: { name: "asc" }, select: { id: true, name: true, level: true, field: true } }),
    prisma.teacherAssignment.findMany(),
    prisma.subject.findMany({ select: { slug: true, name: true } }),
    availableDisciplines(),
  ]);
  const cells: Record<string, { assigned: boolean; lead: boolean; subjects: string[] }> = {};
  for (const a of assignments) {
    const key = `${a.teacherId}:${a.classId}`;
    const e = cells[key] ?? { assigned: false, lead: false, subjects: [] };
    e.assigned = true;
    if (a.isLead) e.lead = true;
    e.subjects.push(a.subjectSlug);
    cells[key] = e;
  }
  const teachersOut = teachers.map((t) => ({
    id: t.id,
    firstName: t.firstName,
    lastName: t.lastName,
    disciplines: (t.disciplines ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  }));
  return { teachers: teachersOut, classes, subjects, cells, disciplines };
}

// Super admin sets what a teacher teaches. Re-resolves all their existing
// class assignments so the books follow the new discipline(s).
export async function setTeacherDisciplines(teacherId: string, families: string[], actorId: string, actorName: string) {
  const clean = [...new Set(families.map((f) => f.trim()).filter((f) => f in DISCIPLINE_LABELS))];
  await prisma.user.update({ where: { id: teacherId }, data: { disciplines: clean.join(",") } });
  // Re-resolve every class this teacher is already assigned to.
  const classIds = [...new Set((await prisma.teacherAssignment.findMany({ where: { teacherId }, select: { classId: true } })).map((a) => a.classId))];
  for (const classId of classIds) {
    const lead = (await prisma.teacherAssignment.findFirst({ where: { teacherId, classId }, select: { isLead: true } }))?.isLead ?? false;
    await resolveAssignment(teacherId, classId, lead ? "lead" : "assigned");
  }
  await prisma.auditLog.create({ data: { actorId, actorName, action: "TEACHER_DISCIPLINES_SET", targetType: "teacher", targetId: teacherId, metaJson: JSON.stringify({ disciplines: clean }) } });
}

// Books a teacher should teach in a class = the class's Offerings whose subject
// family is in the teacher's disciplines. Falls back (no discipline set / no
// match) to the class's first offering so the toggle still does something.
async function resolveAssignment(teacherId: string, classId: string, state: "assigned" | "lead") {
  const [teacher, cls] = await Promise.all([
    prisma.user.findUnique({ where: { id: teacherId }, select: { disciplines: true } }),
    prisma.classGroup.findUnique({ where: { id: classId }, select: { level: true, field: true } }),
  ]);
  const disciplines = (teacher?.disciplines ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const offered = cls
    ? await prisma.offering.findMany({ where: { level: cls.level, field: cls.field ?? "" }, include: { subject: { select: { family: true } } }, orderBy: { subjectSlug: "asc" } })
    : [];
  let slugs = offered.filter((o) => disciplines.includes(o.subject.family ?? "")).map((o) => o.subjectSlug);
  if (slugs.length === 0) slugs = offered.slice(0, 1).map((o) => o.subjectSlug); // fallback: first book the class studies
  if (slugs.length === 0) { const any = await prisma.subject.findFirst(); if (any) slugs = [any.slug]; }
  // Replace this teacher's assignments for the class with the resolved set.
  await prisma.teacherAssignment.deleteMany({ where: { teacherId, classId } });
  for (const subjectSlug of slugs) {
    await prisma.teacherAssignment.create({ data: { teacherId, classId, subjectSlug, isLead: state === "lead" } });
  }
}

// state: "none" | "assigned" | "lead"
export async function setAssignment(teacherId: string, classId: string, state: "none" | "assigned" | "lead", actorId: string, actorName: string) {
  if (state === "none") {
    await prisma.teacherAssignment.deleteMany({ where: { teacherId, classId } });
  } else {
    await resolveAssignment(teacherId, classId, state);
  }
  await prisma.auditLog.create({ data: { actorId, actorName, action: "ASSIGNMENT_SET", targetType: "assignment", metaJson: JSON.stringify({ teacherId, classId, state }) } });
}

// ---- Class supervisors (titulaires) ----
// Class-centric view of the lead-teacher assignment. A class's titulaire is the
// teacher whose assignment carries isLead. Only classes with a titulaire are
// exposed on the student login screen (see /api/auth/classes).
export async function classSupervisors() {
  const [classes, teachers, assignments] = await Promise.all([
    prisma.classGroup.findMany({
      where: { isArchived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, level: true, field: true, _count: { select: { enrollments: true } } },
    }),
    prisma.user.findMany({
      where: { role: "TEACHER", isActive: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.teacherAssignment.findMany({ select: { teacherId: true, classId: true, isLead: true } }),
  ]);
  const tName = new Map(teachers.map((t) => [t.id, `${t.firstName} ${t.lastName}`.trim()]));
  const byClass = new Map<string, { teacherIds: Set<string>; leadId: string | null }>();
  for (const a of assignments) {
    const e = byClass.get(a.classId) ?? { teacherIds: new Set<string>(), leadId: null };
    e.teacherIds.add(a.teacherId);
    if (a.isLead) e.leadId = a.teacherId;
    byClass.set(a.classId, e);
  }
  return {
    teachers: teachers.map((t) => ({ id: t.id, name: tName.get(t.id)! })),
    classes: classes.map((c) => {
      const e = byClass.get(c.id);
      const supervisorId = e?.leadId ?? null;
      return {
        id: c.id,
        name: c.name,
        level: c.level,
        field: c.field,
        studentCount: c._count.enrollments,
        supervisorId,
        supervisorName: supervisorId ? (tName.get(supervisorId) ?? null) : null,
        teachers: e
          ? [...e.teacherIds].map((id) => ({ id, name: tName.get(id) ?? "—" })).sort((a, b) => a.name.localeCompare(b.name))
          : [],
      };
    }),
  };
}

// Set (or clear, when teacherId is null) the single titulaire of a class.
// Assigning a new titulaire demotes any previous one — a class has at most one.
export async function setClassSupervisor(classId: string, teacherId: string | null, actorId: string, actorName: string) {
  const cls = await prisma.classGroup.findUnique({ where: { id: classId }, select: { id: true } });
  if (!cls) return { error: "NOT_FOUND" as const };

  if (teacherId) {
    const t = await prisma.user.findFirst({ where: { id: teacherId, role: "TEACHER" }, select: { id: true } });
    if (!t) return { error: "BAD_TEACHER" as const };
    // Ensure the chosen teacher teaches the class and carries isLead.
    const existing = await prisma.teacherAssignment.findFirst({ where: { teacherId, classId }, select: { id: true } });
    if (existing) {
      await prisma.teacherAssignment.updateMany({ where: { teacherId, classId }, data: { isLead: true } });
    } else {
      await resolveAssignment(teacherId, classId, "lead");
    }
    // Exactly one titulaire: demote any other lead on this class (they keep teaching).
    await prisma.teacherAssignment.updateMany({ where: { classId, isLead: true, teacherId: { not: teacherId } }, data: { isLead: false } });
  } else {
    // Clear the titulaire; teachers stay assigned but the class leaves the login screen.
    await prisma.teacherAssignment.updateMany({ where: { classId, isLead: true }, data: { isLead: false } });
  }

  await prisma.auditLog.create({ data: { actorId, actorName, action: "CLASS_SUPERVISOR_SET", targetType: "class", targetId: classId, metaJson: JSON.stringify({ teacherId: teacherId ?? null }) } });
  return { ok: true as const };
}

// ---- Teacher directory (teacher-centric management) ----
// Powers the admin "Enseignants" tab: every teacher with their disciplines and their
// class↔subject assignments, plus each class's offered subjects (for the picker).
export async function teacherDirectory() {
  const [teachers, classes, assignments, offerings, disciplines] = await Promise.all([
    prisma.user.findMany({
      where: { role: "TEACHER" },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, email: true, avatarColor: true, isActive: true, lastLoginAt: true, disciplines: true },
    }),
    prisma.classGroup.findMany({ where: { isArchived: false }, orderBy: { name: "asc" }, select: { id: true, name: true, level: true, field: true } }),
    prisma.teacherAssignment.findMany({ select: { teacherId: true, classId: true, subjectSlug: true, isLead: true } }),
    prisma.offering.findMany({ include: { subject: { select: { slug: true, name: true, family: true } } } }),
    availableDisciplines(),
  ]);

  // Subjects offered per (level|field) — the books a class of that section studies.
  const offeredByPair = new Map<string, { slug: string; name: string; family: string | null }[]>();
  for (const o of offerings) {
    const key = `${o.level}|${o.field}`;
    const arr = offeredByPair.get(key) ?? [];
    if (!arr.some((s) => s.slug === o.subject.slug)) arr.push({ slug: o.subject.slug, name: o.subject.name, family: o.subject.family });
    offeredByPair.set(key, arr);
  }
  const classSubjects = (c: { level: string; field: string | null }) =>
    (offeredByPair.get(`${c.level}|${c.field ?? ""}`) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const subjName = new Map(offerings.map((o) => [o.subject.slug, o.subject.name]));
  const classById = new Map(classes.map((c) => [c.id, c]));

  // Group assignments by teacher → class.
  const byTeacher = new Map<string, Map<string, { subjects: Set<string>; isLead: boolean }>>();
  for (const a of assignments) {
    if (!byTeacher.has(a.teacherId)) byTeacher.set(a.teacherId, new Map());
    const cm = byTeacher.get(a.teacherId)!;
    const e = cm.get(a.classId) ?? { subjects: new Set<string>(), isLead: false };
    e.subjects.add(a.subjectSlug);
    if (a.isLead) e.isLead = true;
    cm.set(a.classId, e);
  }

  return {
    disciplines,
    classes: classes.map((c) => ({ id: c.id, name: c.name, level: c.level, field: c.field, subjects: classSubjects(c) })),
    teachers: teachers.map((t) => {
      const disc = (t.disciplines ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const cm = byTeacher.get(t.id);
      const assignmentsOut = cm
        ? [...cm.entries()]
            .filter(([classId]) => classById.has(classId))
            .map(([classId, e]) => {
              const c = classById.get(classId)!;
              return {
                classId,
                className: c.name,
                level: c.level,
                field: c.field,
                isLead: e.isLead,
                subjects: [...e.subjects].map((slug) => ({ slug, name: subjName.get(slug) ?? slug })).sort((a, b) => a.name.localeCompare(b.name)),
              };
            })
            .sort((a, b) => a.className.localeCompare(b.className))
        : [];
      return {
        id: t.id,
        firstName: t.firstName,
        lastName: t.lastName,
        name: `${t.firstName} ${t.lastName}`.trim(),
        email: t.email,
        avatarColor: t.avatarColor,
        isActive: t.isActive,
        lastLoginAt: t.lastLoginAt ? t.lastLoginAt.toISOString() : null,
        disciplines: disc,
        assignments: assignmentsOut,
      };
    }),
  };
}

// ---- Book ↔ class links (Offerings) ----
// The Offering table decides which books a (level, field) section studies — and so
// which books each class resolves to. Powers the « Livres ↔ Classes » diagram in the
// Contenu tab. Each link carries the teachers already assigned to teach that book in
// the section's classes, so the admin sees the impact BEFORE detaching.
export async function bookClassLinks() {
  const [subjects, moduleCounts, classes, offerings, assignments, teacherRows] = await Promise.all([
    prisma.subject.findMany({ orderBy: { order: "asc" }, select: { slug: true, name: true, color: true } }),
    prisma.module.findMany({ select: { subjectSlug: true, _count: { select: { lessons: true } } } }),
    prisma.classGroup.findMany({ where: { isArchived: false }, orderBy: { name: "asc" }, select: { id: true, name: true, level: true, field: true } }),
    prisma.offering.findMany({ orderBy: [{ level: "asc" }, { field: "asc" }] }),
    prisma.teacherAssignment.findMany({ select: { teacherId: true, classId: true, subjectSlug: true, isLead: true } }),
    prisma.user.findMany({ where: { role: "TEACHER" }, select: { id: true, firstName: true, lastName: true } }),
  ]);

  const lessonCount = new Map<string, number>();
  for (const m of moduleCounts) lessonCount.set(m.subjectSlug, (lessonCount.get(m.subjectSlug) ?? 0) + m._count.lessons);
  const tName = new Map(teacherRows.map((t) => [t.id, `${t.firstName} ${t.lastName}`.trim()]));
  const className = new Map(classes.map((c) => [c.id, c.name]));

  // Sections = (level, field) pairs, from classes AND offerings so orphan links still show.
  const sections = new Map<string, { level: string; field: string; classIds: string[] }>();
  const secKey = (level: string, field: string | null) => `${level}|${field ?? ""}`;
  for (const c of classes) {
    const key = secKey(c.level, c.field);
    if (!sections.has(key)) sections.set(key, { level: c.level, field: c.field ?? "", classIds: [] });
    sections.get(key)!.classIds.push(c.id);
  }
  for (const o of offerings) {
    const key = secKey(o.level, o.field);
    if (!sections.has(key)) sections.set(key, { level: o.level, field: o.field, classIds: [] });
  }

  // Assignment rows per (classId, subjectSlug) and per (teacherId, classId) — the latter
  // to detect a titulaire whose lead status rests solely on the book being detached.
  const byClassSubject = new Map<string, { teacherId: string; isLead: boolean }[]>();
  const teacherClassSubjects = new Map<string, Set<string>>();
  for (const a of assignments) {
    const k1 = `${a.classId}|${a.subjectSlug}`;
    (byClassSubject.get(k1) ?? byClassSubject.set(k1, []).get(k1)!).push({ teacherId: a.teacherId, isLead: a.isLead });
    const k2 = `${a.teacherId}|${a.classId}`;
    (teacherClassSubjects.get(k2) ?? teacherClassSubjects.set(k2, new Set()).get(k2)!).add(a.subjectSlug);
  }

  return {
    books: subjects.map((s) => ({ slug: s.slug, name: s.name, color: s.color, lessonCount: lessonCount.get(s.slug) ?? 0 })),
    sections: [...sections.entries()].map(([key, s]) => ({
      key,
      level: s.level,
      field: s.field,
      classes: s.classIds.map((id) => ({ id, name: className.get(id)! })),
    })),
    links: offerings.map((o) => {
      const sec = sections.get(secKey(o.level, o.field))!;
      const teachers: { id: string; name: string; classId: string; className: string; isLead: boolean; loseLead: boolean }[] = [];
      for (const classId of sec.classIds) {
        for (const row of byClassSubject.get(`${classId}|${o.subjectSlug}`) ?? []) {
          const others = teacherClassSubjects.get(`${row.teacherId}|${classId}`)!;
          teachers.push({
            id: row.teacherId,
            name: tName.get(row.teacherId) ?? "—",
            classId,
            className: className.get(classId)!,
            isLead: row.isLead,
            // Detaching would delete their only row in this class → the class loses its titulaire.
            loseLead: row.isLead && others.size === 1,
          });
        }
      }
      return { id: o.id, subjectSlug: o.subjectSlug, sectionKey: secKey(o.level, o.field), teachers };
    }),
  };
}

export async function attachOffering(level: string, field: string, subjectSlug: string, actorId: string, actorName: string) {
  const subject = await prisma.subject.findUnique({ where: { slug: subjectSlug }, select: { slug: true } });
  if (!subject) return { error: "NOT_FOUND" as const };
  const exists = await prisma.offering.findFirst({ where: { level, field, subjectSlug }, select: { id: true } });
  if (exists) return { error: "DUPLICATE" as const };
  await prisma.offering.create({ data: { level, field, subjectSlug } });
  await prisma.auditLog.create({ data: { actorId, actorName, action: "OFFERING_ATTACH", targetType: "offering", metaJson: JSON.stringify({ level, field, subjectSlug }) } });
  return { ok: true as const };
}

// Detach a book from a section. Also removes the now-invalid teacher assignments for
// that book in the section's classes (which may drop a titulaire — the UI warns first).
export async function detachOffering(id: string, actorId: string, actorName: string) {
  const o = await prisma.offering.findUnique({ where: { id } });
  if (!o) return { error: "NOT_FOUND" as const };
  const classIds = (await prisma.classGroup.findMany({
    where: { isArchived: false, level: o.level, field: o.field || null },
    select: { id: true },
  })).map((c) => c.id);
  const removed = classIds.length
    ? await prisma.teacherAssignment.deleteMany({ where: { subjectSlug: o.subjectSlug, classId: { in: classIds } } })
    : { count: 0 };
  await prisma.offering.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { actorId, actorName, action: "OFFERING_DETACH", targetType: "offering", metaJson: JSON.stringify({ level: o.level, field: o.field, subjectSlug: o.subjectSlug, assignmentsRemoved: removed.count }) },
  });
  return { ok: true as const };
}

// Toggle a single (teacher, class, subject) teaching row. Fine-grained counterpart to
// setAssignment (which bulk-resolves subjects from the teacher's disciplines). New rows
// start non-lead; the titulaire flag is managed separately via setClassSupervisor.
export async function setTeacherSubject(teacherId: string, classId: string, subjectSlug: string, on: boolean, actorId: string, actorName: string) {
  const [teacher, cls] = await Promise.all([
    prisma.user.findFirst({ where: { id: teacherId, role: "TEACHER" }, select: { id: true } }),
    prisma.classGroup.findUnique({ where: { id: classId }, select: { level: true, field: true } }),
  ]);
  if (!teacher) return { error: "BAD_TEACHER" as const };
  if (!cls) return { error: "NOT_FOUND" as const };
  // The subject must be one the class actually studies.
  const offered = await prisma.offering.findFirst({ where: { level: cls.level, field: cls.field ?? "", subjectSlug }, select: { id: true } });
  if (!offered) return { error: "BAD_SUBJECT" as const };

  if (on) {
    await prisma.teacherAssignment.upsert({
      where: { teacherId_classId_subjectSlug: { teacherId, classId, subjectSlug } },
      update: {},
      create: { teacherId, classId, subjectSlug, isLead: false },
    });
  } else {
    await prisma.teacherAssignment.deleteMany({ where: { teacherId, classId, subjectSlug } });
  }
  await prisma.auditLog.create({ data: { actorId, actorName, action: "ASSIGNMENT_SET", targetType: "assignment", metaJson: JSON.stringify({ teacherId, classId, subjectSlug, on }) } });
  return { ok: true as const };
}

// ============================================================
// Pedagogical oversight (super admin) — read-only. Shows, across the whole
// school: how far each teacher's classes have progressed, the projects teachers
// have built, and per-module course completion. Replaces the old teacher
// "Carnet de bord" (progression is an oversight concern, not a teacher tool).
// ============================================================

export async function adminPedagogy() {
  const weekAgo = new Date(Date.now() - 7 * DAY);

  // ---- 1. Teacher progression: each teacher's classes + how far students got ----
  const teacherRows = await prisma.user.findMany({
    where: { role: "TEACHER", isActive: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, email: true, lastLoginAt: true },
  });

  const teachers = [];
  for (const t of teacherRows) {
    const classes = await teacherClasses(t.id);
    const cls = [];
    for (const c of classes) {
      const totalLessons = await classLessonTotal(c.id);
      const enr = await prisma.enrollment.findMany({ where: { classId: c.id }, select: { studentId: true } });
      const studentIds = enr.map((e) => e.studentId);
      const denom = totalLessons * studentIds.length;
      const completed = denom
        ? await prisma.progress.count({ where: { studentId: { in: studentIds }, status: "COMPLETED", lesson: { module: { subjectSlug: { in: [...c.subjectSlugs] } } } } })
        : 0;
      const activeWeek = studentIds.length
        ? (await prisma.sessionLog.findMany({ where: { studentId: { in: studentIds }, startedAt: { gte: weekAgo } }, select: { studentId: true }, distinct: ["studentId"] })).length
        : 0;
      cls.push({
        id: c.id, name: c.name, level: c.level, field: c.field,
        studentCount: studentIds.length,
        avgProgress: denom ? Math.round((completed / denom) * 100) : 0,
        activeWeek,
      });
    }
    const overall = cls.length ? Math.round(cls.reduce((s, c) => s + c.avgProgress, 0) / cls.length) : 0;
    teachers.push({
      id: t.id, name: `${t.firstName} ${t.lastName}`.trim(), email: t.email,
      lastLoginAt: t.lastLoginAt ? t.lastLoginAt.toISOString() : null,
      classes: cls, avgProgress: overall,
    });
  }

  // ---- 2. Course progress: per subject → per module, students who completed ALL lessons ----
  const subjects = await prisma.subject.findMany({
    orderBy: { order: "asc" },
    include: {
      modules: { orderBy: { order: "asc" }, include: { lessons: { where: { status: "PUBLISHED" }, select: { id: true } } } },
    },
  });
  // Which students study each subject (their class has a TeacherAssignment for it).
  const tas = await prisma.teacherAssignment.findMany({ select: { classId: true, subjectSlug: true } });
  const classesBySubject = new Map<string, Set<string>>();
  for (const a of tas) {
    if (!classesBySubject.has(a.subjectSlug)) classesBySubject.set(a.subjectSlug, new Set());
    classesBySubject.get(a.subjectSlug)!.add(a.classId);
  }
  const enrollAll = await prisma.enrollment.findMany({ select: { studentId: true, classId: true } });
  const studentsByClass = new Map<string, string[]>();
  for (const e of enrollAll) {
    if (!studentsByClass.has(e.classId)) studentsByClass.set(e.classId, []);
    studentsByClass.get(e.classId)!.push(e.studentId);
  }
  const doneRows = await prisma.progress.findMany({ where: { status: "COMPLETED" }, select: { studentId: true, lessonId: true } });
  const doneByStudent = new Map<string, Set<string>>();
  for (const d of doneRows) {
    if (!doneByStudent.has(d.studentId)) doneByStudent.set(d.studentId, new Set());
    doneByStudent.get(d.studentId)!.add(d.lessonId);
  }

  const programme = subjects.map((s) => {
    const classIds = classesBySubject.get(s.slug) || new Set<string>();
    const studentIds = [...classIds].flatMap((cid) => studentsByClass.get(cid) || []);
    const studentTotal = studentIds.length;
    const modules = s.modules.map((m) => {
      const lessonIds = m.lessons.map((l) => l.id);
      let studentsCompleted = 0;
      if (lessonIds.length) {
        for (const sid of studentIds) {
          const set = doneByStudent.get(sid);
          if (set && lessonIds.every((lid) => set.has(lid))) studentsCompleted++;
        }
      }
      return {
        id: m.id, order: m.order, title: m.title, lessonCount: lessonIds.length,
        studentTotal, studentsCompleted,
        completionPct: studentTotal ? Math.round((studentsCompleted / studentTotal) * 100) : 0,
      };
    });
    const coveredCount = modules.filter((m) => m.lessonCount > 0 && m.completionPct >= 60).length;
    return { slug: s.slug, name: s.name, color: s.color, icon: s.icon, moduleCount: modules.length, coveredCount, studentTotal, modules };
  });

  // ---- 3. Projects built by teachers (author resolved via the PROJECT_CREATE audit) ----
  const projectRows = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      subject: { select: { name: true } },
      steps: { select: { id: true } },
      assignments: { select: { id: true } },
      submissions: { select: { status: true } },
    },
  });
  const creates = await prisma.auditLog.findMany({ where: { action: "PROJECT_CREATE", targetType: "project" }, select: { targetId: true, actorName: true } });
  const authorByproject = new Map(creates.map((c) => [c.targetId, c.actorName]));
  const projects = projectRows.map((p) => ({
    id: p.id, title: p.title, subjectName: p.subject.name, classLevel: p.classLevel,
    status: p.status, difficulty: p.difficulty, stepCount: p.steps.length,
    assignedCount: p.assignments.length, submissionCount: p.submissions.length,
    gradedCount: p.submissions.filter((s) => s.status === "GRADED").length,
    author: authorByproject.get(p.id) || null,
    createdAt: p.createdAt.toISOString(),
  }));

  return {
    teachers,
    programme,
    projects,
    summary: {
      teacherCount: teachers.length,
      projectCount: projects.length,
      publishedProjects: projects.filter((p) => p.status === "PUBLISHED").length,
      avgProgress: teachers.length ? Math.round(teachers.reduce((s, t) => s + t.avgProgress, 0) / teachers.length) : 0,
    },
  };
}
