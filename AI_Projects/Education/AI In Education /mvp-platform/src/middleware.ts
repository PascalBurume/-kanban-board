import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData, type Role, STUDENT_IDLE_MS, homeForRole } from "@/lib/session";

// Which role each protected route-group requires. `null` = any signed-in role.
// `roles` allows several. /teacher/studio also admits ADMIN: the content studio
// is where the administrator edits lessons (teachers use it for quizzes only).
const RULES: { prefix: string; role?: Role | null; roles?: Role[] }[] = [
  { prefix: "/admin", role: "ADMIN" },
  { prefix: "/teacher/studio", roles: ["TEACHER", "ADMIN"] },
  { prefix: "/teacher", role: "TEACHER" },
  // /lesson also admits staff: it is the studio's « Vue élève » preview. What they may
  // open is decided by the API (getViewableLesson — their own subjects), and every write
  // route under /api/student stays STUDENT-only, so a preview records nothing.
  { prefix: "/lesson", roles: ["STUDENT", "TEACHER", "ADMIN"] },
  { prefix: "/student", role: "STUDENT" },
  { prefix: "/practice", role: "STUDENT" },
  { prefix: "/projects", role: "STUDENT" },
  { prefix: "/module", role: "STUDENT" },
  { prefix: "/profile", role: null },
];

function redirect(req: NextRequest, to: string) {
  const url = req.nextUrl.clone();
  url.pathname = to;
  url.search = "";
  return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const rule = RULES.find((r) => path === r.prefix || path.startsWith(r.prefix + "/"));
  if (!rule) return NextResponse.next();

  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  const user = session.user;

  // Not logged in → login.
  if (!user) return redirect(req, "/login/");

  // Student idle expiry on shared devices.
  if (user.role === "STUDENT" && Date.now() - user.lastActivity > STUDENT_IDLE_MS) {
    session.destroy();
    return redirect(req, "/login/");
  }

  // Wrong role → send to their own home. (role:null / omitted = any signed-in user.)
  const allowed = rule.roles ?? (rule.role == null ? null : [rule.role]);
  if (allowed && !allowed.includes(user.role)) return redirect(req, homeForRole(user.role));

  // Sliding activity timestamp (keeps idle window fresh).
  user.lastActivity = Date.now();
  await session.save();
  return res;
}

export const config = {
  matcher: ["/student/:path*", "/lesson/:path*", "/practice/:path*", "/projects/:path*", "/module/:path*", "/teacher/:path*", "/admin/:path*", "/profile/:path*"],
};
