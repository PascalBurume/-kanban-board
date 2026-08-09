// Pure shaping helpers for the admin overview.
//
// This screen is the only place anyone looks before deciding the school server
// is fine. Every figure on it has to be either actionable or absent — a bare
// "446,7 Go" with no denominator, or a health pill that says "En bon état"
// because it is hard-coded, are worse than showing nothing.

// ---- storage ----

export type Band = "ok" | "warn" | "critical";

/**
 * Storage pressure from a used-percentage.
 *
 * The overview reported `usedGB` alone and dropped freeGB, totalGB and pct —
 * all three already computed by systemHealth. 446,7 Go answers no question on
 * its own: the admin cannot tell whether that is half a disk or the last of it.
 */
export function storageBand(pct: number): Band {
  const p = Number(pct);
  if (!Number.isFinite(p)) return "ok";
  if (p >= 90) return "critical";
  if (p >= 75) return "warn";
  return "ok";
}

// ---- backups ----

export type BackupState = "never" | "stale" | "recent";

export interface BackupStatus {
  state: BackupState;
  /** Whole days since the last backup; null when there has never been one. */
  days: number | null;
}

/** A backup older than this reads as stale — one school week. */
export const BACKUP_STALE_DAYS = 7;

/**
 * How the last backup is doing.
 *
 * systemHealth has always read `backup.last` and the overview has always thrown
 * it away. On an air-gapped server holding the only copy of a school's work,
 * "nobody has ever run a backup" is the most important sentence the dashboard
 * can say, and it was saying nothing.
 */
export function backupStatus(lastBackupAt: string | Date | null | undefined, now: Date): BackupStatus {
  if (!lastBackupAt) return { state: "never", days: null };
  const at = lastBackupAt instanceof Date ? lastBackupAt : new Date(lastBackupAt);
  const ms = at.getTime();
  if (!Number.isFinite(ms)) return { state: "never", days: null };
  // A timestamp in the future is a clock problem, not a fresh backup; floor at 0
  // so it reads as "today" rather than a negative age.
  const days = Math.max(0, Math.floor((now.getTime() - ms) / 86400000));
  return { state: days >= BACKUP_STALE_DAYS ? "stale" : "recent", days };
}

// ---- overall server state ----

export interface ServerInputs {
  storagePct: number;
  ollamaOnline: boolean;
  backup: BackupState;
}

/**
 * The one-line verdict for the server card, which used to be the string
 * "En bon état" regardless of anything — it would have claimed good health on
 * a disk at 99%.
 *
 * The AI tutor being offline is deliberately only a warning: the platform is
 * built to work without it, so it must not read as a server fault.
 */
export function serverState({ storagePct, ollamaOnline, backup }: ServerInputs): Band {
  const storage = storageBand(storagePct);
  if (storage === "critical" || backup === "never") return "critical";
  if (storage === "warn" || backup === "stale" || !ollamaOnline) return "warn";
  return "ok";
}

// ---- audit feed ----

/**
 * Sign-ins and sign-outs. Real events, but they are the highest-volume and
 * lowest-information rows in the journal, and the overview only shows four.
 */
export const SESSION_ACTIONS = new Set(["LOGIN", "LOGOUT"]);

export interface AuditLike {
  action: string;
}

/**
 * The rows worth putting on an overview: what changed, not who came and went.
 *
 * Six of the eight most recent rows on a live database were LOGIN/LOGOUT, so
 * all four visible slots were session churn and the two lesson edits behind
 * them were invisible. Session rows stay in the full journal, one click away.
 *
 * Falls back to the unfiltered list rather than showing an empty panel: on a
 * quiet morning "only sign-ins happened" is better said with rows than with
 * "Aucune activité récente", which would be false.
 */
export function notableAudit<T extends AuditLike>(rows: T[], limit = 4): T[] {
  const notable = rows.filter((r) => !SESSION_ACTIONS.has(r.action));
  return (notable.length ? notable : rows).slice(0, limit);
}
