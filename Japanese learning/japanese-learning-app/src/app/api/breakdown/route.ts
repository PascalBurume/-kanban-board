import { streamObject } from "ai";
import { assertKey, model } from "@/lib/ai/client";
import { BREAKDOWN_SYSTEM } from "@/lib/ai/prompts";
import { breakdownSchema } from "@/lib/ai/schemas";

export const runtime = "nodejs";

export async function POST(req: Request) {
  assertKey();
  const { sentence } = await req.json();

  if (typeof sentence !== "string" || sentence.trim().length === 0) {
    return new Response("Missing 'sentence' in request body.", { status: 400 });
  }

  const result = streamObject({
    model,
    system: BREAKDOWN_SYSTEM,
    prompt: sentence,
    schema: breakdownSchema,
    temperature: 0.1,
  });

  return result.toTextStreamResponse();
}
