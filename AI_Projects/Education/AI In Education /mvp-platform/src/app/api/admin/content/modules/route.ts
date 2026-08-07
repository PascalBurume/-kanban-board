import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createModule, reorderModules } from "@/lib/adminContent";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const res = await createModule(u, {
    subjectSlug: String(body.subjectSlug ?? ""),
    classLevel: String(body.classLevel ?? "5e"),
    title: String(body.title ?? ""),
  });
  if ("error" in res) return NextResponse.json(res, { status: res.error === "NOT_FOUND" ? 404 : 400 });
  return NextResponse.json(res);
}

// Reorder modules within a subject: { subjectSlug, order: [moduleIds] }
export async function PATCH(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!body.subjectSlug || !Array.isArray(body.order)) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const res = await reorderModules(u, String(body.subjectSlug), body.order.map(String));
  return NextResponse.json(res);
}
