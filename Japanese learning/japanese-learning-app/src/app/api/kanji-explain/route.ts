import { streamObject } from "ai";
import { assertKey, model, JLPT_LEVELS, type JlptLevel } from "@/lib/ai/client";
import { KANJI_EXPLAINER_SYSTEM, kanjiExplainerPrompt } from "@/lib/ai/prompts";
import { kanjiExplainerSchema } from "@/lib/ai/schemas";

export const runtime = "nodejs";

export async function POST(req: Request) {
  assertKey();
  const { character, meaning, onYomi, kunYomi, radicals, level } =
    await req.json();

  if (typeof character !== "string" || character.length === 0) {
    return new Response("Missing 'character' in request body.", { status: 400 });
  }

  const lvl: JlptLevel = JLPT_LEVELS.includes(level) ? level : "N5";

  const result = streamObject({
    model,
    system: KANJI_EXPLAINER_SYSTEM,
    prompt: kanjiExplainerPrompt({
      character,
      meaning: meaning ?? null,
      onYomi: onYomi ?? null,
      kunYomi: kunYomi ?? null,
      radicals: radicals ?? null,
      level: lvl,
    }),
    schema: kanjiExplainerSchema,
    temperature: 0.5,
  });

  return result.toTextStreamResponse();
}
