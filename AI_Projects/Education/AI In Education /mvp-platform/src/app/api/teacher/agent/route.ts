import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { runGroupComposer, runGradingAgent, runAtRiskAgent, type StepEmit } from "@/lib/teacherAgent";
import { runExerciseAdvisor, type ExerciseRef } from "@/lib/exerciseCopilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Teacher agent runner. One SSE stream per run:
//   data: {"step":{"id","status":"running|done|error","label","detail?"}}
//   data: {"result":{"agent","fallback","data"}}
//   data: {"done":true}  |  data: {"error":"…"}
// Note: unlike the chat routes we do NOT fail fast when Ollama is offline —
// agents degrade to their deterministic fallback mid-run.

const RATE_WINDOW_MS = 60000;
const RATE_MAX = 4; // agents are heavier than chat turns
const hits = new Map<string, number[]>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const arr = (hits.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) { hits.set(userId, arr); return true; }
  arr.push(now);
  hits.set(userId, arr);
  return false;
}

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || (u.role !== "TEACHER" && u.role !== "ADMIN")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (rateLimited(u.userId)) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const agent = String(body.agent ?? "");
  if (!["groups", "grading", "atrisk", "exercise_advisor"].includes(agent)) {
    return NextResponse.json({ error: "BAD_AGENT" }, { status: 400 });
  }

  // exercise_advisor's ref discriminates custom vs book exercises — validate
  // the shape here so the agent only ever sees a well-formed union.
  let exerciseRef: ExerciseRef | null = null;
  if (agent === "exercise_advisor") {
    const ref = (body.ref ?? {}) as Record<string, unknown>;
    if (ref.kind === "custom" && typeof ref.exerciseId === "string" && ref.exerciseId) {
      exerciseRef = { kind: "custom", exerciseId: ref.exerciseId };
    } else if (ref.kind === "book" && typeof ref.subjectSlug === "string" && ref.subjectSlug && ref.bookId != null) {
      exerciseRef = { kind: "book", subjectSlug: ref.subjectSlug, moduleOrder: Number(ref.moduleOrder) || 0, bookId: String(ref.bookId) };
    } else {
      return NextResponse.json({ error: "BAD_REF" }, { status: 400 });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      const emit: StepEmit = (id, status, label, detail) => send({ step: { id, status, label, detail } });
      try {
        let result:
          | Awaited<ReturnType<typeof runGroupComposer>>
          | Awaited<ReturnType<typeof runGradingAgent>>
          | Awaited<ReturnType<typeof runAtRiskAgent>>
          | Awaited<ReturnType<typeof runExerciseAdvisor>>;
        if (agent === "exercise_advisor") {
          result = await runExerciseAdvisor(u, {
            ref: exerciseRef!,
            classId: body.classId ? String(body.classId) : undefined,
          }, emit);
        } else if (agent === "groups") {
          result = await runGroupComposer(u, {
            classId: String(body.classId ?? ""),
            projectId: body.projectId ? String(body.projectId) : undefined,
            groupSize: Number(body.groupSize) || 3,
          }, emit);
        } else if (agent === "grading") {
          result = await runGradingAgent(u, { submissionId: String(body.submissionId ?? "") }, emit);
        } else {
          result = await runAtRiskAgent(u, { classId: String(body.classId ?? "") }, emit);
        }
        if (result && typeof result === "object" && "error" in result) {
          send({ error: result.error });
        } else {
          const { fallback, ...data } = result as unknown as { fallback: boolean } & Record<string, unknown>;
          send({ result: { agent, fallback, data } });
          send({ done: true });
        }
      } catch (e) {
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
