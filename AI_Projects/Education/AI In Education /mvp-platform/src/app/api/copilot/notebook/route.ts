import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { accessibleSubjectSlugs } from "@/lib/path";
import { resolveCopilotEnabled } from "@/lib/teacher";
import { getNotebook } from "@/lib/notebook";
import { notebookCoachPrompt, streamChat, acquireSlot, releaseSlot, ollamaOnline, type ChatMessage } from "@/lib/ollama";
import { retrieveChunks } from "@/lib/rag";
import { getStudyRecord, formatStudyRecord } from "@/lib/studyRecord";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RATE_WINDOW_MS = 60000;
const RATE_MAX = 12;
const HISTORY_TURNS = 6;
const RAG_CHARS = 1500;

// The same study record the coach is grounded in, for the panel's opening line.
// The greeting used to promise help "à partir de tes notes" and then, on an empty
// carnet, refuse for exactly that reason. Naming a finished module up front makes
// the offer one the assistant can actually honour.
export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "STUDENT") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const notebookId = new URL(req.url).searchParams.get("notebookId") ?? "";
  const notebook = notebookId ? await getNotebook(u.userId, notebookId) : null;
  const classId = u.classId ?? (await prisma.enrollment.findUnique({ where: { studentId: u.userId } }))?.classId;
  if (!classId) return NextResponse.json({ finishedModules: [], weakest: null, totalDone: 0 });

  try {
    const rec = await getStudyRecord(u.userId, classId, notebook?.subjectSlug);
    return NextResponse.json({
      finishedModules: rec.modules.filter((m) => m.finished).map((m) => m.name),
      inProgressModules: rec.modules.filter((m) => !m.finished && m.doneCount > 0).map((m) => m.name),
      weakest: rec.weakest[0] ?? null,
      lastLessons: rec.lastLessons.slice(0, 3),
      totalDone: rec.totalDone,
    });
  } catch {
    return NextResponse.json({ finishedModules: [], weakest: null, totalDone: 0 });
  }
}

// Study assistant for the student's own carnet. Same guarantees as the lesson tutor
// (student-only, teacher kill-switch, per-student rate limit, one Ollama slot), but
// grounded in the student's notes, their progress on the platform, and the book
// passages that match them.
export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "STUDENT") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const notebookId = String(body.notebookId ?? "");
  const content = String(body.content ?? "").trim();
  if (!notebookId || !content) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  if (content.length > 2000) return NextResponse.json({ error: "TOO_LONG" }, { status: 400 });

  const notebook = await getNotebook(u.userId, notebookId);
  if (!notebook || notebook.deleted) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const classId = u.classId ?? (await prisma.enrollment.findUnique({ where: { studentId: u.userId } }))?.classId;
  if (!classId) return NextResponse.json({ error: "NO_CLASS" }, { status: 400 });

  const enabled = await resolveCopilotEnabled(u.userId, classId);
  if (!enabled) return NextResponse.json({ error: "COPILOT_DISABLED" }, { status: 403 });

  // Ollama runs on the school server, so no server means no assistant. Say so
  // immediately rather than hanging: the editor itself keeps working offline.
  if (!(await ollamaOnline())) return NextResponse.json({ error: "OLLAMA_OFFLINE" }, { status: 503 });

  const since = new Date(Date.now() - RATE_WINDOW_MS);
  const recent = await prisma.copilotMessage.count({
    where: { role: "user", createdAt: { gte: since }, thread: { studentId: u.userId } },
  });
  if (recent >= RATE_MAX) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const subjectName = notebook.subjectSlug
    ? (await prisma.subject.findUnique({ where: { slug: notebook.subjectSlug }, select: { name: true } }))?.name ?? "Notes libres"
    : "Notes libres";

  // What the student has already covered. Without it the coach sees only the
  // notebook, so a carnet opened for the first time — every carnet, once — got
  // "tes notes sont encore vides" instead of a revision plan drawn from lessons
  // the platform already knows they finished. Best-effort: a failure here
  // degrades to the previous behaviour rather than losing the assistant.
  let record = "";
  try {
    record = formatStudyRecord(await getStudyRecord(u.userId, classId, notebook.subjectSlug));
  } catch {
    record = "";
  }

  let system = notebookCoachPrompt(notebook.title, subjectName, notebook.contentMd || "", record);

  // Ground the answer in the actual textbook where the notes touch it.
  try {
    const slugs = notebook.subjectSlug ? [notebook.subjectSlug] : await accessibleSubjectSlugs(classId);
    // "Résume mes notes" against an empty carnet is a query with nothing in it
    // to match, so retrieval returned noise. Widening it with the lessons the
    // student actually finished pulls back the passages they were revising.
    const query =
      notebook.contentMd?.trim() || !record
        ? content
        : `${content}\n${record.split("\n").filter((l) => l.startsWith("- ")).slice(0, 4).join("\n")}`;
    const hits = await retrieveChunks(query, { k: 3, subjectSlugs: slugs });
    const blocks: string[] = [];
    let used = 0;
    for (const h of hits.filter((x) => x.score > 0.5)) {
      const t = h.text.slice(0, Math.max(0, RAG_CHARS - used));
      if (t.length < 80) break;
      blocks.push(`— ${h.lessonTitle} :\n${t}`);
      used += t.length;
    }
    if (blocks.length) {
      system += `\n\nExtraits du manuel pertinents (utilise-les si la question s'y rapporte) :\n<<<MANUEL\n${blocks.join("\n\n")}\n>>>`;
    }
  } catch {
    /* no index, no grounding — the coach still answers from the notes */
  }

  // The client sends the transcript back each turn, so treat it as untrusted input:
  // keep only well-formed entries, cap the length, and never let it set "system".
  const rawHistory: unknown[] = Array.isArray(body.history) ? body.history.slice(-HISTORY_TURNS) : [];
  const history: ChatMessage[] = [];
  for (const entry of rawHistory) {
    if (!entry || typeof entry !== "object") continue;
    const { role, content } = entry as { role?: unknown; content?: unknown };
    if (typeof content !== "string" || !content.trim()) continue;
    history.push({ role: role === "assistant" ? "assistant" : "user", content: content.slice(0, 2000) });
  }

  const messages: ChatMessage[] = [{ role: "system", content: system }, ...history, { role: "user", content }];

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
