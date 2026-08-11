import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { bookClassLinks, attachOffering, detachOffering } from "@/lib/admin";

export const dynamic = "force-dynamic";

async function admin() {
  const u = await getCurrentUser();
  return u && u.role === "ADMIN" ? u : null;
}

// Book ↔ class links (Offerings) for the « Livres ↔ Classes » diagram.
export async function GET() {
  if (!(await admin())) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  return NextResponse.json(await bookClassLinks());
}

// POST { level, field, subjectSlug } — link a book to a section.
export async function POST(req: Request) {
  const u = await admin();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const { level, field, subjectSlug } = body;
  if (!level || !subjectSlug) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const r = await attachOffering(String(level), String(field ?? ""), String(subjectSlug), u.userId, `${u.firstName} ${u.lastName}`);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.error === "DUPLICATE" ? 409 : 404 });
  return NextResponse.json(await bookClassLinks());
}

// DELETE ?id=<offeringId> — detach a book from a section (removes the affected
// teacher assignments too; the client shows the impact before calling this).
export async function DELETE(req: Request) {
  const u = await admin();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const r = await detachOffering(id, u.userId, `${u.firstName} ${u.lastName}`);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 404 });
  return NextResponse.json(await bookClassLinks());
}
