import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createGroup, renameGroup, deleteGroup } from "@/lib/projectGroups";

export const dynamic = "force-dynamic";

function statusFor(error: string | undefined): number {
  if (error === "FORBIDDEN") return 403;
  if (error === "NOT_FOUND") return 404;
  if (error === "HAS_SUBMISSIONS" || error === "NAME_TAKEN") return 409;
  return 400;
}

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "TEACHER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const res = await createGroup(u.userId, String(body.classId ?? ""), String(body.name ?? ""));
  if ("error" in res) return NextResponse.json(res, { status: statusFor(res.error) });
  return NextResponse.json(res);
}

export async function PATCH(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "TEACHER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const res = await renameGroup(u.userId, String(body.groupId ?? ""), String(body.name ?? ""));
  if ("error" in res) return NextResponse.json(res, { status: statusFor(res.error) });
  return NextResponse.json(res);
}

export async function DELETE(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "TEACHER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const res = await deleteGroup(u.userId, String(body.groupId ?? ""));
  if ("error" in res) return NextResponse.json(res, { status: statusFor(res.error) });
  return NextResponse.json(res);
}
