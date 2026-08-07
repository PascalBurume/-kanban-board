import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { runImportJob, type ImportEmit } from "@/lib/contentImport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Chapter import job → SSE stream (same event shape as api/teacher/agent):
//   data: {"step":{id,status,label,detail?}} … {"result":…} … {"done":true} | {"error":…}

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 2; // imports are heavy (LLM per lesson)
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
  if (!u || u.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (rateLimited(u.userId)) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const body = await req.json().catch(() => null);
  if (!body?.subjectSlug || !body?.filename || !body?.dataB64) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  const kind = ["md", "txt", "pdf"].includes(body.kind) ? body.kind : "txt";
  // Reject oversized payloads before decoding (base64 ≈ 4/3 of raw size).
  const maxB64 = (kind === "pdf" ? 20 : 5) * 1024 * 1024 * 1.4;
  if (typeof body.dataB64 !== "string" || body.dataB64.length > maxB64) {
    return NextResponse.json({ error: "FILE_TOO_LARGE" }, { status: 413 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      const emit: ImportEmit = (id, status, label, detail) => send({ step: { id, status, label, detail } });
      try {
        const result = await runImportJob(u, {
          subjectSlug: String(body.subjectSlug),
          moduleId: body.moduleId ? String(body.moduleId) : undefined,
          newModule: body.newModule ? { title: String(body.newModule.title ?? ""), classLevel: String(body.newModule.classLevel ?? "5e") } : undefined,
          kind,
          filename: String(body.filename).slice(0, 120),
          dataB64: body.dataB64,
        }, emit);
        if (result && "error" in result) {
          send({ error: result.error });
        } else {
          send({ result });
          send({ done: true });
        }
      } catch {
        send({ error: "IMPORT_FAILED" });
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
