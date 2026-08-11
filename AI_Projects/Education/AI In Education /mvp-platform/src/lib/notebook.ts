import { prisma } from "./db";
import { accessibleSubjectSlugs, getStudentClass } from "./path";

export type NotebookSummary = {
  id: string;
  title: string;
  subjectSlug: string | null;
  contentMd?: string;
  clientUpdatedAt: number;
  updatedAt: number;
  deleted: boolean;
};

export type NotebookSubject = { slug: string; name: string; color: string | null; icon: string | null };

const MAX_TITLE = 120;
const MAX_CONTENT = 400_000;

function clampTitle(raw: unknown): string {
  const t = typeof raw === "string" ? raw.trim() : "";
  return (t || "Sans titre").slice(0, MAX_TITLE);
}

// The client sends its own clock. A device with a badly wrong clock could
// otherwise stamp a doc far in the future and make every later edit look stale,
// so anything ahead of the server falls back to server time.
function clampClientTime(raw: unknown): Date {
  const n = typeof raw === "number" ? raw : Date.parse(String(raw ?? ""));
  const now = Date.now();
  if (!Number.isFinite(n) || n <= 0 || n > now) return new Date(now);
  return new Date(n);
}

function toSummary(row: {
  id: string;
  title: string;
  subjectSlug: string | null;
  contentMd?: string;
  clientUpdatedAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}): NotebookSummary {
  return {
    id: row.id,
    title: row.title,
    subjectSlug: row.subjectSlug,
    ...(row.contentMd === undefined ? {} : { contentMd: row.contentMd }),
    clientUpdatedAt: row.clientUpdatedAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    deleted: row.deletedAt != null,
  };
}

/** Every notebook the student owns, tombstones included so offline devices can purge. */
export async function listNotebooks(ownerId: string): Promise<NotebookSummary[]> {
  const rows = await prisma.notebookDoc.findMany({
    where: { ownerId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, subjectSlug: true, clientUpdatedAt: true, updatedAt: true, deletedAt: true },
  });
  return rows.map(toSummary);
}

export async function getNotebook(ownerId: string, id: string): Promise<NotebookSummary | null> {
  const row = await prisma.notebookDoc.findFirst({
    where: { id, ownerId },
    select: {
      id: true,
      title: true,
      subjectSlug: true,
      contentMd: true,
      clientUpdatedAt: true,
      updatedAt: true,
      deletedAt: true,
    },
  });
  return row ? toSummary(row) : null;
}

/**
 * Create-or-update by client-supplied id. Offline devices replay this call on
 * reconnect, possibly more than once, so it must be idempotent.
 */
export async function upsertNotebook(
  ownerId: string,
  input: { id?: unknown; title?: unknown; subjectSlug?: unknown; contentMd?: unknown; clientUpdatedAt?: unknown },
): Promise<NotebookSummary | { conflict: NotebookSummary }> {
  const id = typeof input.id === "string" && input.id.trim() ? input.id.trim().slice(0, 64) : undefined;
  const title = clampTitle(input.title);
  const subjectSlug = typeof input.subjectSlug === "string" && input.subjectSlug ? input.subjectSlug.slice(0, 64) : null;
  const contentMd = typeof input.contentMd === "string" ? input.contentMd.slice(0, MAX_CONTENT) : "";
  const clientUpdatedAt = clampClientTime(input.clientUpdatedAt);

  if (id) {
    const existing = await prisma.notebookDoc.findFirst({ where: { id }, select: { ownerId: true, clientUpdatedAt: true } });
    // An id that belongs to somebody else must not be silently re-homed.
    if (existing && existing.ownerId !== ownerId) throw new NotebookError(403, "FORBIDDEN");
    if (existing && existing.clientUpdatedAt.getTime() > clientUpdatedAt.getTime()) {
      const server = await getNotebook(ownerId, id);
      return { conflict: server! };
    }
    const row = await prisma.notebookDoc.upsert({
      where: { id },
      create: { id, ownerId, title, subjectSlug, contentMd, clientUpdatedAt },
      update: { title, subjectSlug, contentMd, clientUpdatedAt, deletedAt: null },
      select: {
        id: true,
        title: true,
        subjectSlug: true,
        contentMd: true,
        clientUpdatedAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });
    return toSummary(row);
  }

  const row = await prisma.notebookDoc.create({
    data: { ownerId, title, subjectSlug, contentMd, clientUpdatedAt },
    select: {
      id: true,
      title: true,
      subjectSlug: true,
      contentMd: true,
      clientUpdatedAt: true,
      updatedAt: true,
      deletedAt: true,
    },
  });
  return toSummary(row);
}

/** Last-write-wins on the device clock: an older write never clobbers a newer one. */
export async function updateNotebook(
  ownerId: string,
  id: string,
  input: { title?: unknown; subjectSlug?: unknown; contentMd?: unknown; clientUpdatedAt?: unknown },
): Promise<NotebookSummary | { conflict: NotebookSummary } | null> {
  const existing = await prisma.notebookDoc.findFirst({ where: { id, ownerId }, select: { clientUpdatedAt: true } });
  if (!existing) return null;

  const clientUpdatedAt = clampClientTime(input.clientUpdatedAt);
  if (existing.clientUpdatedAt.getTime() > clientUpdatedAt.getTime()) {
    const server = await getNotebook(ownerId, id);
    return { conflict: server! };
  }

  const data: Record<string, unknown> = { clientUpdatedAt };
  if (input.title !== undefined) data.title = clampTitle(input.title);
  if (input.subjectSlug !== undefined) {
    data.subjectSlug = typeof input.subjectSlug === "string" && input.subjectSlug ? input.subjectSlug.slice(0, 64) : null;
  }
  if (input.contentMd !== undefined) {
    data.contentMd = typeof input.contentMd === "string" ? input.contentMd.slice(0, MAX_CONTENT) : "";
  }

  const row = await prisma.notebookDoc.update({
    where: { id },
    data,
    select: {
      id: true,
      title: true,
      subjectSlug: true,
      contentMd: true,
      clientUpdatedAt: true,
      updatedAt: true,
      deletedAt: true,
    },
  });
  return toSummary(row);
}

export async function deleteNotebook(ownerId: string, id: string): Promise<boolean> {
  const { count } = await prisma.notebookDoc.updateMany({
    where: { id, ownerId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return count > 0;
}

/** Subjects the student's class actually studies — the buckets a notebook can belong to. */
export async function notebookSubjects(userId: string): Promise<NotebookSubject[]> {
  const cls = await getStudentClass(userId);
  if (!cls) return [];
  const slugs = await accessibleSubjectSlugs(cls.id);
  if (!slugs.length) return [];
  const rows = await prisma.subject.findMany({
    where: { slug: { in: slugs } },
    orderBy: { order: "asc" },
    select: { slug: true, name: true, color: true, icon: true },
  });
  return rows;
}

export class NotebookError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
