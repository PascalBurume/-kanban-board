import { streamObject } from "ai";
import { assertKey, model, JLPT_LEVELS, type JlptLevel } from "@/lib/ai/client";
import { GENERATE_SYSTEM } from "@/lib/ai/prompts";
import { generationSchema } from "@/lib/ai/schemas";

export const runtime = "nodejs";

export async function POST(req: Request) {
  assertKey();
  const { topic, level, count } = await req.json();

  if (typeof topic !== "string" || topic.trim().length === 0) {
    return new Response("Missing 'topic' in request body.", { status: 400 });
  }

  const lvl: JlptLevel = JLPT_LEVELS.includes(level) ? level : "N5";
  const n = Math.min(Math.max(Number(count) || 5, 1), 10);

  const prompt = `Generate ${n} example sentences at JLPT ${lvl}.\nGrammar point or vocabulary: ${topic}`;

  const result = streamObject({
    model,
    system: GENERATE_SYSTEM,
    prompt,
    schema: generationSchema,
    temperature: 0.6,
  });

  return result.toTextStreamResponse();
}
