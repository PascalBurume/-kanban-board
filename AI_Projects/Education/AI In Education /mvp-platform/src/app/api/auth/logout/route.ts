import { NextResponse } from "next/server";
import { getSession, audit } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  const u = session.user;
  session.destroy();
  if (u) await audit("LOGOUT", { actorId: u.userId, actorName: `${u.firstName} ${u.lastName}` });
  return NextResponse.json({ ok: true });
}

// GET variant so a plain <a href="/api/auth/logout/"> link works (clears the
// session, then sends the user to the login screen).
export async function GET(req: Request) {
  const session = await getSession();
  const u = session.user;
  session.destroy();
  if (u) await audit("LOGOUT", { actorId: u.userId, actorName: `${u.firstName} ${u.lastName}` });
  return NextResponse.redirect(new URL("/login/", req.url));
}
