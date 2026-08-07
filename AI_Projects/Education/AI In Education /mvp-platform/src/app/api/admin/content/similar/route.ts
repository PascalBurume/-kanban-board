import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { similarLessons } from "@/lib/rag";
import { embedModelAvailable } from "@/lib/ollama";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Authoring assistant: lessons most similar to a draft text (duplicate check).
export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  if (!(await embedModelAvailable())) return NextResponse.json({ results: [], unavailable: true });
  try {
    return NextResponse.json({ results: await similarLessons(text, 5) });
  } catch {
    return NextResponse.json({ results: [], unavailable: true });
  }
}
