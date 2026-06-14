import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getAccessibleLesson } from "@/lib/path";
import { resolveCopilotEnabled } from "@/lib/teacher";
import { buildMessages, streamChat, acquireSlot, releaseSlot, ollamaOnline } from "@/lib/ollama";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RATE_WINDOW_MS = 60000;
const RATE_MAX = 12;

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "STUDENT") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const lessonId = String(body.lessonId ?? "");
  const content = String(body.content ?? "").trim();
  if (!lessonId || !content) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  if (content.length > 2000) return NextResponse.json({ error: "TOO_LONG" }, { status: 400 });

  // Optional, non-persisted context: which atelier tab + the exercise on screen.
  const ctx = body.context && typeof body.context === "object" ? body.context : null;
  const copilotContext = {
    tab: ctx?.tab ? String(ctx.tab) : undefined,
    exerciseN: ctx?.exerciseN != null ? String(ctx.exerciseN) : undefined,
    exerciseText: typeof body.exerciseText === "string" ? body.exerciseText.slice(0, 1200) : undefined,
  };

  const lesson = await getAccessibleLesson(u.userId, lessonId);
  if (!lesson) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const classId = u.classId ?? (await prisma.enrollment.findUnique({ where: { studentId: u.userId } }))?.classId;
  if (!classId) return NextResponse.json({ error: "NO_CLASS" }, { status: 400 });

  // Policy — enforced server-side. Teacher toggle blocks the next message instantly.
  const enabled = await resolveCopilotEnabled(u.userId, classId);
  if (!enabled) return NextResponse.json({ error: "COPILOT_DISABLED" }, { status: 403 });

  // Offline-first: if the local model isn't reachable, fail fast with a clear
  // signal so the UI can explain instead of hanging on a broken stream.
  if (!(await ollamaOnline())) return NextResponse.json({ error: "OLLAMA_OFFLINE" }, { status: 503 });

  // Per-student rate limit.
  const since = new Date(Date.now() - RATE_WINDOW_MS);
  const recent = await prisma.copilotMessage.count({ where: { role: "user", createdAt: { gte: since }, thread: { studentId: u.userId } } });
  if (recent >= RATE_MAX) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  // Find or create the lesson-scoped thread; load history before persisting the new turn.
  let thread = await prisma.copilotThread.findFirst({
    where: { studentId: u.userId, lessonId },
    orderBy: { startedAt: "desc" },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!thread) {
    const created = await prisma.copilotThread.create({ data: { studentId: u.userId, lessonId } });
    thread = { ...created, messages: [] };
  }
  const history = thread.messages.map((m) => ({ role: m.role, content: m.content }));
  await prisma.copilotMessage.create({ data: { threadId: thread.id, role: "user", content } });

  const messages = buildMessages({
    lessonTitle: lesson.title,
    subject: lesson.module.subject.name,
    excerpt: lesson.contentMd,
    history,
    userContent: content,
    context: copilotContext,
  });

  const threadId = thread.id;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      await acquireSlot();
      let full = "";
      try {
        for await (const delta of streamChat(messages)) {
          full += delta;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
        }
        if (full.trim()) {
          await prisma.copilotMessage.create({ data: { threadId, role: "assistant", content: full } });
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
