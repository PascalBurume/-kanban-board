import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createSubject } from "@/lib/adminContent";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const res = await createSubject(u, { name: String(body.name ?? ""), color: body.color, icon: body.icon });
  if ("error" in res) return NextResponse.json(res, { status: 400 });
  return NextResponse.json(res);
}
