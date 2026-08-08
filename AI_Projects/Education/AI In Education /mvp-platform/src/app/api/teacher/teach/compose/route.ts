import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { runTeachComposer } from "@/lib/teachCopilot";
import type { StepEmit } from "@/lib/teacherAgent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The rédacteur. Speaks the teacher-agent dialect, not the chat one:
//   data: {"step":{"id","status","label","detail?"}}
//   data: {"result":{"agent","fallback","data"}}
//   data: {"done":true}  |  data: {"error":"…"}
// so useAgentStream() and <AgentSteps> render it with no new client code.
//
// Unlike the coach this does NOT fail fast on an offline check before the stream —
// the run opens, and the step that needs the model errors visibly. A teacher watching
// steps appear learns more from "Copilot hors ligne" on the right step than from a
// bare 503 on a page that never showed anything.

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 4; // composing a whole lesson is the heaviest call in the product
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
  if (!u || (u.role !== "TEACHER" && u.role !== "ADMIN")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const lessonId = String(body?.lessonId ?? "");
  if (!lessonId) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  if (rateLimited(u.userId)) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(o)}\n\n`));
      const emit: StepEmit = (id, status, label, detail) => send({ step: { id, status, label, detail } });
      try {
        const result = await runTeachComposer(u, { lessonId }, emit);
        if ("error" in result) {
          send({ error: result.error });
        } else {
          const { fallback, ...data } = result;
          send({ result: { agent: "teach_compose", fallback, data } });
          send({ done: true });
        }
      } catch {
        send({ error: "AGENT_FAILED" });
      } finally {
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
