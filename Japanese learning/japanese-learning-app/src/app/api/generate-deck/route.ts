import { streamObject } from "ai";
import { assertKey, model, JLPT_LEVELS, type JlptLevel } from "@/lib/ai/client";
import { DECK_BUILDER_SYSTEM } from "@/lib/ai/prompts";
import { aiDeckSchema } from "@/lib/ai/schemas";

export const runtime = "nodejs";

export async function POST(req: Request) {
  assertKey();
  const { topic, level, count } = await req.json();

  if (typeof topic !== "string" || topic.trim().length === 0) {
    return new Response("Missing 'topic' in request body.", { status: 400 });
  }

  const lvl: JlptLevel = JLPT_LEVELS.includes(level) ? level : "N5";
  const n = Math.min(Math.max(Number(count) || 10, 1), 20);

  const prompt = `Topic: ${topic}\nJLPT level: ${lvl}\nProduce exactly ${n} distinct vocabulary cards.`;

  const result = streamObject({
    model,
    system: DECK_BUILDER_SYSTEM,
    prompt,
    schema: aiDeckSchema,
    temperature: 0.5,
  });

  return result.toTextStreamResponse();
}
