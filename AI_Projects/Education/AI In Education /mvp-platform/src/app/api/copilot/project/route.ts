import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { resolveCopilotEnabled } from "@/lib/teacher";
import { getProjectStepForCoach } from "@/lib/projects";
import { buildProjectMessages, streamChat, acquireSlot, releaseSlot, ollamaOnline } from "@/lib/ollama";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Project-coach is ephemeral (no persisted thread): the client passes recent
// history. We keep an in-memory per-student rate limit (single offline server).
const RATE_WINDOW_MS = 60000;
const RATE_MAX = 12;
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
  if (!u || u.role !== "STUDENT") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const projectId = String(body.projectId ?? "");
  const stepId = String(body.stepId ?? "");
  const content = String(body.content ?? "").trim();
  if (!projectId || !stepId || !content) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  if (content.length > 2000) return NextResponse.json({ error: "TOO_LONG" }, { status: 400 });

  const draft = typeof body.draft === "string" ? body.draft.slice(0, 2000) : "";
  const history = Array.isArray(body.history)
    ? body.history.filter((m: unknown) => m && typeof m === "object").map((m: { role?: string; content?: string }) => ({ role: String(m.role ?? "user"), content: String(m.content ?? "").slice(0, 2000) }))
    : [];

  const step = await getProjectStepForCoach(u.userId, projectId, stepId);
  if (!step) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const classId = u.classId ?? (await prisma.enrollment.findUnique({ where: { studentId: u.userId } }))?.classId;
  if (!classId) return NextResponse.json({ error: "NO_CLASS" }, { status: 400 });

  const enabled = await resolveCopilotEnabled(u.userId, classId);
  if (!enabled) return NextResponse.json({ error: "COPILOT_DISABLED" }, { status: 403 });

  if (!(await ollamaOnline())) return NextResponse.json({ error: "OLLAMA_OFFLINE" }, { status: 503 });
  if (rateLimited(u.userId)) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const messages = buildProjectMessages({
    ctx: {
      projectTitle: step.projectTitle,
      subject: step.subjectName,
      scenario: step.scenarioMd,
      stepOrder: step.step.order,
      stepTitle: step.step.title,
      stepInstruction: step.step.instructionMd,
      draft,
    },
    history,
    userContent: content,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      await acquireSlot();
      try {
        for await (const delta of streamChat(messages)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      } catch {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "GEN_FAILED" })}\n\n`));
      } finally {
        releaseSlot();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
