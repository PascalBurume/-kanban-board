import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { streamChat, ollamaOnline, acquireSlot, releaseSlot } from "@/lib/ollama";
import { teachMessages } from "@/lib/teachCopilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// « Copilot Enseigner » — the coach turn. Same wire format as the student tutor
// (api/copilot/message): data: {"delta":…} / {"done":true} / {"error":…}.
//
// Two deliberate differences from the student route:
//   • authorisation is getViewableLesson, not getAccessibleLesson — teaching support
//     has to work on the 481 book lessons the teacher cannot edit, which is most of
//     the reason to have it;
//   • 10 turns/min rather than 12. The agent route's 4 is far too tight for a chat.

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const MAX_CHARS = 2000;

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || (u.role !== "TEACHER" && u.role !== "ADMIN")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const lessonId = String(body?.lessonId ?? "");
  const content = String(body?.content ?? "").trim();
  if (!lessonId || !content) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  if (content.length > MAX_CHARS) return NextResponse.json({ error: "TOO_LONG" }, { status: 400 });

  // Durable rate limit, like the student side: count persisted turns rather than keep
  // a Map, so a server restart cannot hand someone a fresh allowance.
  const since = new Date(Date.now() - RATE_WINDOW_MS);
  const recent = await prisma.teachMessage.count({
    where: { role: "user", createdAt: { gte: since }, thread: { teacherId: u.userId } },
  });
  if (recent >= RATE_MAX) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  if (!(await ollamaOnline())) return NextResponse.json({ error: "OLLAMA_OFFLINE" }, { status: 503 });

  const thread =
    (await prisma.teachThread.findUnique({
      where: { teacherId_lessonId: { teacherId: u.userId, lessonId } },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    })) ??
    (await prisma.teachThread
      .create({ data: { teacherId: u.userId, lessonId } })
      .then((t) => ({ ...t, messages: [] as { role: string; content: string }[] }))
      .catch(() => null));
  // create() throws only if the lesson vanished between the check and here.
  if (!thread) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // History is read BEFORE the new turn is persisted, or the current message would be
  // duplicated into the prompt.
  const history = thread.messages.map((m) => ({ role: m.role, content: m.content }));

  const messages = await teachMessages(u, lessonId, content, history);
  if (!messages) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await prisma.teachMessage.create({ data: { threadId: thread.id, role: "user", content } });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Enqueueing to a controller whose client has gone throws. Swallow that: the
      // generation is already paid for, and losing the answer because the teacher
      // changed page is worse than a dropped frame. (The student route has this bug —
      // it persists the question and then loses the reply, leaving an unanswered turn
      // that gets replayed as history forever.)
      let open = true;
      const send = (o: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(o)}\n\n`));
        } catch {
          open = false;
        }
      };

      await acquireSlot();
      let full = "";
      try {
        for await (const delta of streamChat(messages)) {
          full += delta;
          send({ delta });
        }
        send({ done: true });
      } catch {
        send({ error: "GEN_FAILED" });
      } finally {
        // Persist whatever was generated, on every path. A partial answer is still an
        // answer, and it is what the teacher will see when they come back.
        if (full.trim()) {
          await prisma.teachMessage
            .create({ data: { threadId: thread.id, role: "assistant", content: full } })
            .catch(() => {});
        }
        releaseSlot();
        try { controller.close(); } catch { /* already closed by the disconnect */ }
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
