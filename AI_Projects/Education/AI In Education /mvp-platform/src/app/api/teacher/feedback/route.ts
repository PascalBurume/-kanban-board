import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { teacherFeedbackInbox } from "@/lib/teacher";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await getCurrentUser();
  if (!u || u.role !== "TEACHER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  return NextResponse.json(await teacherFeedbackInbox(u.userId));
}
