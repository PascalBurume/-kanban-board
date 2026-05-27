"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/me";
import { isValidLevel, isValidSection } from "@/lib/jlpt";

export interface RecordedAnswer {
  /** Kanji id (or other item id, future-proofing). */
  itemId: number;
  picked: string;
  correct: boolean;
}

export async function recordJlptAttempt(input: {
  level: string;
  section: string;
  mode: "practice" | "mock";
  answers: RecordedAnswer[];
  startedAtISO: string;
}) {
  const user = await getCurrentUser();

  if (!isValidLevel(input.level)) throw new Error("invalid level");
  if (!isValidSection(input.section)) throw new Error("invalid section");

  const total = input.answers.length;
  const correct = input.answers.filter((a) => a.correct).length;
  const scorePct = total === 0 ? 0 : (correct / total) * 100;

  const row = await prisma.jLPTAttempt.create({
    data: {
      userId: user.id,
      level: input.level,
      section: input.section,
      startedAt: new Date(input.startedAtISO),
      finishedAt: new Date(),
      scorePct,
      answers: JSON.stringify({ mode: input.mode, answers: input.answers }),
    },
  });

  return { attemptId: row.id, correct, total, scorePct };
}
