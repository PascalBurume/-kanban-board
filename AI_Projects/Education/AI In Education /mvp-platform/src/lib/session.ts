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

const password =
  process.env.SESSION_PASSWORD || "dev-only-mwalimu-session-secret-change-me-32+";

export const sessionOptions: SessionOptions = {
  password,
  cookieName: "mwalimu_session",
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
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
