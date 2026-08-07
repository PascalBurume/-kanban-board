import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { acquireSlot, releaseSlot, ollamaOnline } from "@/lib/ollama";
import { assignAdvice } from "@/lib/projectCopilot";

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

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || (u.role !== "TEACHER" && u.role !== "ADMIN")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const projectId = String(body.projectId ?? "");
  const classId = String(body.classId ?? "");
  if (!projectId || !classId) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  if (!(await ollamaOnline())) return NextResponse.json({ error: "OLLAMA_OFFLINE" }, { status: 503 });
  if (rateLimited(u.userId)) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  // Today's date (server-local) for the model to compute a due date.
  const today = new Date().toISOString().slice(0, 10);

  await acquireSlot();
  try {
    const res = await assignAdvice(u, projectId, classId, today);
    if ("error" in res) {
      const code = res.error === "NOT_FOUND" ? 404 : res.error === "FORBIDDEN" ? 403 : 502;
      return NextResponse.json(res, { status: code });
    }
    return NextResponse.json({ ok: true, advice: res });
  } catch {
    return NextResponse.json({ error: "GEN_FAILED" }, { status: 502 });
  } finally {
    releaseSlot();
  }
}
