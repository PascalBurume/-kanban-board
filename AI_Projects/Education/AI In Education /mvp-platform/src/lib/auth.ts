import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { sessionOptions, type SessionData, type SessionUser, type Role, STUDENT_IDLE_MS } from "./session";

// Route-handler / server-component session accessor (uses next/headers cookies()).
export async function getSession() {
  return getIronSession<SessionData>(cookies(), sessionOptions);
}

// Read the current user, applying student idle expiry. Read-only safe.
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getSession();
  const u = session.user;
  if (!u) return null;
  if (u.role === "STUDENT" && Date.now() - u.lastActivity > STUDENT_IDLE_MS) return null;
  return u;
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) throw new AuthError(401, "NOT_AUTHENTICATED");
  return u;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const u = await requireUser();
  if (!roles.includes(u.role)) throw new AuthError(403, "FORBIDDEN");
  return u;
}

export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ---- password / PIN helpers ----
export function hashSecret(secret: string): string {
  return bcrypt.hashSync(secret, 10);
}
export function verifySecret(secret: string, hash?: string | null): boolean {
  if (!hash) return false;
  return bcrypt.compareSync(secret, hash);
}

// ---- audit ----
export async function audit(
  action: string,
  opts: { actorId?: string; actorName?: string; targetType?: string; targetId?: string; meta?: unknown } = {},
) {
  await prisma.auditLog.create({
    data: {
      action,
      actorId: opts.actorId,
      actorName: opts.actorName,
      targetType: opts.targetType,
      targetId: opts.targetId,
      metaJson: opts.meta !== undefined ? JSON.stringify(opts.meta) : undefined,
    },
  });
}
