import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { acquireSlot, releaseSlot, ollamaOnline } from "@/lib/ollama";
import { gradingAssist } from "@/lib/projectCopilot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RATE_WINDOW_MS = 60000;
const RATE_MAX = 8;
const hits = new Map<string, number[]>();
function rateLimited(userId: string): boolean {
  const now = Date.now();
  const arr = (hits.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  arr.push(now);
  hits.set(userId, arr);
  return arr.length > RATE_MAX;
}

// AI grading guidance: the server loads the submission itself (never trusts the
// client for the student's answers).
export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || (u.role !== "TEACHER" && u.role !== "ADMIN")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const submissionId = String(body.submissionId ?? "");
  if (!submissionId) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  if (!(await ollamaOnline())) return NextResponse.json({ error: "OLLAMA_OFFLINE" }, { status: 503 });
  if (rateLimited(u.userId)) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  await acquireSlot();
  try {
    const res = await gradingAssist(u, submissionId);
    if ("error" in res) return NextResponse.json(res, { status: res.error === "NOT_FOUND" ? 404 : 502 });
    return NextResponse.json({ ok: true, analysis: res });
  } catch {
    return NextResponse.json({ error: "GEN_FAILED" }, { status: 502 });
  } finally {
    releaseSlot();
  }
}
