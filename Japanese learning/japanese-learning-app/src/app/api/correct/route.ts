import { streamObject } from "ai";
import { assertKey, model } from "@/lib/ai/client";
import { CORRECT_SYSTEM } from "@/lib/ai/prompts";
import { correctionSchema } from "@/lib/ai/schemas";

export const runtime = "nodejs";

export async function POST(req: Request) {
  assertKey();
  const { text } = await req.json();

  if (typeof text !== "string" || text.trim().length === 0) {
    return new Response("Missing 'text' in request body.", { status: 400 });
  }

  const result = streamObject({
    model,
    system: CORRECT_SYSTEM,
    prompt: text,
    schema: correctionSchema,
    temperature: 0.2,
  });

  return result.toTextStreamResponse();
}
