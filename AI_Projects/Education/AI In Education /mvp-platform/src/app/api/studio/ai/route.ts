import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { acquireSlot, releaseSlot, ollamaOnline, streamChat } from "@/lib/ollama";
import { studioCompose, studioChatMessages, type StudioAction } from "@/lib/studioCopilot";
import { exerciseChatMessages, type ExerciseRef } from "@/lib/exerciseCopilot";
import type { ChatMessage } from "@/lib/ollama";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Per-teacher rate limit (single offline server), matching the project compose route.
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

const JSON_ACTIONS: StudioAction[] = ["lesson_full", "improve", "quiz", "quiz_fix", "exercise", "latex"];

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || (u.role !== "TEACHER" && u.role !== "ADMIN")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  // Content generation is available to teachers too — they can only *save* it to lessons
  // they authored (canEditLesson gates the write), so generation itself is harmless.
  const subjectSlug = String(body.subjectSlug ?? "");
  const moduleId = body.moduleId ? String(body.moduleId) : null;
  // Level of the class the studio is scoped to; absent for admin's "tous les manuels".
  const classLevel = typeof body.classLevel === "string" && body.classLevel ? body.classLevel : undefined;
  // Book lesson the draft accompanies; its text is fetched server-side (authorised
  // by getViewableLesson) and given to the model as the subject of the lesson.
  const sourceLessonId = typeof body.sourceLessonId === "string" && body.sourceLessonId ? body.sourceLessonId : null;
  // exercise_chat carries its subject inside exerciseRef, which the advisor
  // resolves and authorizes itself. "latex" rewrites a formula the client already has:
  // the subject only tunes the notation, so a lesson with no subject in scope (the
  // student carnet) must still be able to ask.
  if (!subjectSlug && action !== "exercise_chat" && action !== "latex") return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  if (!(await ollamaOnline())) return NextResponse.json({ error: "OLLAMA_OFFLINE" }, { status: 503 });
  if (rateLimited(u.userId)) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  // ── Chats → SSE (brainstorm, or exercise-focused advisor chat) ──
  if (action === "chat" || action === "exercise_chat") {
    const message = String(body.message ?? "").trim().slice(0, 2000);
    if (!message) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
    const history = Array.isArray(body.history)
      ? body.history.filter((m: unknown) => m && typeof m === "object").map((m: { role?: string; content?: string }) => ({ role: String(m.role ?? "user"), content: String(m.content ?? "").slice(0, 2000) }))
      : [];

    let messages: ChatMessage[];
    if (action === "exercise_chat") {
      // Context is re-fetched server-side from ids — the client never ships
      // lesson content, and authorization happens in exerciseChatMessages.
      const lessonIds = Array.isArray(body.lessonIds) ? body.lessonIds.filter((x: unknown) => typeof x === "string").slice(0, 4) : [];
      const built = await exerciseChatMessages(u, {
        ref: body.exerciseRef as ExerciseRef,
        classId: body.classId ? String(body.classId) : undefined,
        lessonIds,
        message,
        history,
      }).catch(() => null);
      if (!built) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
      messages = built;
    } else {
      messages = await studioChatMessages(u, { subjectSlug, moduleId, classLevel, sourceLessonId, message, history });
    }
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
  if (!JSON_ACTIONS.includes(action as StudioAction)) return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });

  await acquireSlot();
  try {
    const res = await studioCompose(u, {
      action: action as StudioAction,
      subjectSlug,
      moduleId,
      classLevel,
      sourceLessonId,
      topic: typeof body.topic === "string" ? body.topic : undefined,
      contentMd: typeof body.contentMd === "string" ? body.contentMd : undefined,
      instruction: typeof body.instruction === "string" ? body.instruction : undefined,
      tex: typeof body.tex === "string" ? body.tex : undefined,
      question: body.question && typeof body.question === "object" ? body.question : undefined,
      problem: typeof body.problem === "string" ? body.problem : undefined,
    });
    if ("error" in res) return NextResponse.json(res, { status: 502 });
    return NextResponse.json(res);
  } catch {
    return NextResponse.json({ error: "GEN_FAILED" }, { status: 502 });
  } finally {
    releaseSlot();
  }
}
