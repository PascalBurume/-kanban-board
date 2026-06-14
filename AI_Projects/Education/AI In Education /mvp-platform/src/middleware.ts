import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData, type Role, STUDENT_IDLE_MS, homeForRole } from "@/lib/session";

// Which role each protected route-group requires. `null` = any signed-in role.
const RULES: { prefix: string; role: Role | null }[] = [
  { prefix: "/admin", role: "ADMIN" },
  { prefix: "/teacher", role: "TEACHER" },
  { prefix: "/lesson", role: "STUDENT" },
  { prefix: "/student", role: "STUDENT" },
  { prefix: "/practice", role: "STUDENT" },
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

  // Wrong role → send to their own home. (role:null = any signed-in user.)
  if (rule.role !== null && user.role !== rule.role) return redirect(req, homeForRole(user.role));

  // Sliding activity timestamp (keeps idle window fresh).
  user.lastActivity = Date.now();
  await session.save();
  return res;
}

export const config = {
  matcher: ["/student/:path*", "/lesson/:path*", "/practice/:path*", "/module/:path*", "/teacher/:path*", "/admin/:path*", "/profile/:path*"],
};
