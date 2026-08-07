import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { acquireSlot, releaseSlot, ollamaOnline, streamChat } from "@/lib/ollama";
import { composeProject, composeChatMessages, type ComposeAction } from "@/lib/projectCopilot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// In-memory per-teacher rate limit (single offline server). Slightly lower than
// the student tutor since each compose call is a heavier generation.
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

const JSON_ACTIONS: ComposeAction[] = ["full", "situation", "steps", "objectives", "refine_step"];

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || (u.role !== "TEACHER" && u.role !== "ADMIN")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const subjectSlug = String(body.subjectSlug ?? "");
  const classLevel = String(body.classLevel ?? "5e");
  const difficulty = String(body.difficulty ?? "INTERMEDIATE");
  const prereqModuleIds = Array.isArray(body.prereqModuleIds) ? body.prereqModuleIds.map(String) : [];
  if (!subjectSlug) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  if (!(await ollamaOnline())) return NextResponse.json({ error: "OLLAMA_OFFLINE" }, { status: 503 });
  if (rateLimited(u.userId)) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  // ── Brainstorm chat → SSE ──
  if (action === "chat") {
    const message = String(body.message ?? "").trim().slice(0, 2000);
    if (!message) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
    const history = Array.isArray(body.history)
      ? body.history.filter((m: unknown) => m && typeof m === "object").map((m: { role?: string; content?: string }) => ({ role: String(m.role ?? "user"), content: String(m.content ?? "").slice(0, 2000) }))
      : [];
    const messages = await composeChatMessages(u, { subjectSlug, classLevel, difficulty, prereqModuleIds, message, history });
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
    return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
  }

  // ── Structured generation → JSON ──
  if (!JSON_ACTIONS.includes(action as ComposeAction)) return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });

  await acquireSlot();
  try {
    const res = await composeProject(u, {
      action: action as ComposeAction,
      subjectSlug,
      classLevel,
      difficulty,
      title: typeof body.title === "string" ? body.title : undefined,
      prereqModuleIds,
      draft: body.draft && typeof body.draft === "object" ? body.draft : undefined,
      stepIndex: typeof body.stepIndex === "number" ? body.stepIndex : undefined,
      stepDraft: body.stepDraft && typeof body.stepDraft === "object" ? body.stepDraft : undefined,
    });
    if ("error" in res) return NextResponse.json(res, { status: 502 });
    return NextResponse.json(res);
  } catch {
    return NextResponse.json({ error: "GEN_FAILED" }, { status: 502 });
  } finally {
    releaseSlot();
  }
}
