import type { SessionOptions } from "iron-session";

export type Role = "STUDENT" | "TEACHER" | "ADMIN";

export interface SessionUser {
  userId: string;
  role: Role;
  firstName: string;
  lastName: string;
  classId?: string; // students: their enrolled class
  locale: string;
  lastActivity: number; // epoch ms — drives student idle logout
}

export interface SessionData {
  user?: SessionUser;
}

const DEV_FALLBACK = "dev-only-mwalimu-session-secret-change-me-32+";
const password = process.env.SESSION_PASSWORD || DEV_FALLBACK;

// The session cookie is encrypted with this secret — anyone who knows it can
// mint an ADMIN session. The fallback above ships in the repo, so a production
// build must never run with it (or with a weak one): fail the boot instead.
if (process.env.NODE_ENV === "production" && (password === DEV_FALLBACK || password.length < 32)) {
  throw new Error("SESSION_PASSWORD must be set to a unique secret of at least 32 characters in production.");
}

export const sessionOptions: SessionOptions = {
  password,
  cookieName: "mwalimu_session",
  cookieOptions: {
    httpOnly: true,
    // Offline school servers often run production builds over plain-HTTP LAN,
    // where a Secure cookie would never be stored and login would silently
    // break — SESSION_SECURE=0 opts out for those deployments.
    secure: process.env.NODE_ENV === "production" && process.env.SESSION_SECURE !== "0",
    sameSite: "lax",
    maxAge: 60 * 60 * 8, // 8h hard cap
    path: "/",
  },
};

// Students on shared devices auto-logout after 15 min idle (SYSTEM_DESIGN §9).
export const STUDENT_IDLE_MS = 15 * 60 * 1000;

// Where each role lands after login.
export function homeForRole(role: Role): string {
  if (role === "ADMIN") return "/admin/";
  if (role === "TEACHER") return "/teacher/";
  return "/student/";
}
