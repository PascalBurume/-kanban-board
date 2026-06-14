import { prisma } from "./db";
import { hashSecret } from "./auth";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

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
  const model = process.env.OLLAMA_MODEL || "gemma3n";
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

// ---- Approvals (pending teacher sign-ups + PIN reset requests) ----
export async function listApprovals() {
  const pendingTeachers = await prisma.user.findMany({
    where: { role: "TEACHER", pending: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, firstName: true, lastName: true, email: true, createdAt: true },
  });
  // Open PIN-reset requests in the last 14 days (resolved ones are still shown
  // for context; the admin acts via the existing reset-pin endpoint).
  const since = new Date(Date.now() - 14 * 86400000);
  const resetReqs = await prisma.auditLog.findMany({
    where: { action: "PIN_RESET_REQUEST", createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  return {
    teachers: pendingTeachers.map((t) => ({
      id: t.id,
      name: `${t.firstName} ${t.lastName}`.trim(),
      email: t.email,
      createdAt: t.createdAt.toISOString(),
    })),
    pinResets: resetReqs.map((r) => ({
      id: r.id,
      studentId: r.targetId,
      name: r.actorName,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export async function approveTeacher(id: string, actorId: string, actorName: string) {
  const user = await prisma.user.findFirst({ where: { id, role: "TEACHER", pending: true } });
  if (!user) return null;
  await prisma.user.update({ where: { id }, data: { pending: false, isActive: true } });
  await prisma.auditLog.create({
    data: { actorId, actorName, action: "APPROVE", targetType: "teacher", targetId: id, metaJson: JSON.stringify({ email: user.email }) },
  });
  return { id, name: `${user.firstName} ${user.lastName}`.trim() };
}

export async function rejectTeacher(id: string, actorId: string, actorName: string) {
  const user = await prisma.user.findFirst({ where: { id, role: "TEACHER", pending: true } });
  if (!user) return null;
  await prisma.user.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { actorId, actorName, action: "REJECT", targetType: "teacher", targetId: id, metaJson: JSON.stringify({ email: user.email }) },
  });
  return { id };
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
  const [teachers, classes, assignments, subjects] = await Promise.all([
    prisma.user.findMany({ where: { role: "TEACHER" }, select: { id: true, firstName: true, lastName: true } }),
    prisma.classGroup.findMany({ where: { isArchived: false }, orderBy: { name: "asc" }, select: { id: true, name: true, level: true, field: true } }),
    prisma.teacherAssignment.findMany(),
    prisma.subject.findMany({ select: { slug: true, name: true } }),
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
  return { teachers, classes, subjects, cells };
}

// state: "none" | "assigned" | "lead"
export async function setAssignment(teacherId: string, classId: string, state: "none" | "assigned" | "lead", actorId: string, actorName: string) {
  const existing = await prisma.teacherAssignment.findMany({ where: { teacherId, classId } });
  if (state === "none") {
    await prisma.teacherAssignment.deleteMany({ where: { teacherId, classId } });
  } else {
    if (existing.length === 0) {
      // pick a representative subject for the class (first assigned in class, else first subject overall)
      const inClass = await prisma.teacherAssignment.findFirst({ where: { classId } });
      let slug = inClass?.subjectSlug;
      if (!slug) slug = (await prisma.subject.findFirst())?.slug;
      await prisma.teacherAssignment.create({ data: { teacherId, classId, subjectSlug: slug ?? "general", isLead: state === "lead" } });
    } else {
      await prisma.teacherAssignment.updateMany({ where: { teacherId, classId }, data: { isLead: state === "lead" } });
    }
  }
  await prisma.auditLog.create({ data: { actorId, actorName, action: "ASSIGNMENT_SET", targetType: "assignment", metaJson: JSON.stringify({ teacherId, classId, state }) } });
}
