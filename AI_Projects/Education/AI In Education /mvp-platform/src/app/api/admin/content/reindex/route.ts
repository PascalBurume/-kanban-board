import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { reindexAll, indexStats, type StepEmit } from "@/lib/rag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  return NextResponse.json(await indexStats());
}

// Full content reindex → SSE step events (shared protocol).
export async function POST() {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      const emit: StepEmit = (id, status, label, detail) => send({ step: { id, status, label, detail } });
      try {
        const result = await reindexAll(emit);
        send({ result });
        send({ done: true });
      } catch {
        send({ error: "REINDEX_FAILED" });
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
