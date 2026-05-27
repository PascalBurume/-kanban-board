import { streamText, convertToCoreMessages } from "ai";
import { assertKey, model, JLPT_LEVELS, type JlptLevel } from "@/lib/ai/client";
import { tutorSystemPrompt } from "@/lib/ai/prompts";

export const runtime = "nodejs";

export async function POST(req: Request) {
  assertKey();
  const { messages, level } = await req.json();
  const lvl: JlptLevel = JLPT_LEVELS.includes(level) ? level : "N5";

  const result = streamText({
    model,
    system: tutorSystemPrompt(lvl),
    messages: convertToCoreMessages(messages),
    temperature: 0.7,
  });

  return result.toDataStreamResponse();
}
