"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/me";
import type { AiDeckCard } from "@/lib/ai/schemas";

const AI_COURSE_TITLE = "AI Generated";
const AI_LESSON_TITLE = "AI Generated Deck";

async function ensureAiLessonId(): Promise<number> {
  let course = await prisma.course.findFirst({
    where: { title: AI_COURSE_TITLE },
  });
  if (!course) {
    course = await prisma.course.create({
      data: {
        title: AI_COURSE_TITLE,
        level: null,
        lessonStart: 0,
        lessonEnd: 0,
      },
    });
  }

  let lesson = await prisma.lesson.findFirst({
    where: { courseId: course.id, number: 0 },
  });
  if (!lesson) {
    lesson = await prisma.lesson.create({
      data: {
        courseId: course.id,
        number: 0,
        titleEn: AI_LESSON_TITLE,
      },
    });
  }
  return lesson.id;
}

export async function commitAiDeck(
  cards: AiDeckCard[],
  level: string,
): Promise<{ created: number }> {
  const user = await getCurrentUser();
  const clean = cards.flatMap((c) => {
    const item = {
      kana: (c.kana ?? "").trim(),
      kanji: (c.kanji ?? "").trim(),
      english: (c.english ?? "").trim(),
      partOfSpeech: c.partOfSpeech?.trim() || null,
    };
    return item.kana.length > 0 && item.kanji.length > 0 && item.english.length > 0
      ? [item]
      : [];
  });

  if (clean.length === 0) return { created: 0 };

  const lessonId = await ensureAiLessonId();

  // De-dupe against vocab that already exists in this user's AI deck. We key
  // on (kanji, kana, english) which is reasonable for hand-built cards.
  const existing = await prisma.vocabulary.findMany({
    where: {
      lessonId,
      OR: clean.map((c) => ({
        kanji: c.kanji,
        kana: c.kana,
        english: c.english,
      })),
    },
  });
  const existingKey = new Set(
    existing.map((v) => `${v.kanji ?? ""}|${v.kana}|${v.english}`),
  );

  const fresh = clean.filter(
    (c) => !existingKey.has(`${c.kanji}|${c.kana}|${c.english}`),
  );

  if (fresh.length === 0) {
    // All cards already exist as vocab; still ensure SRSCards exist for them.
    return ensureSrsCardsForVocab(user.id, existing.map((v) => v.id));
  }

  // Create the Vocabulary rows. SQLite's createMany cannot return rows, so
  // re-query by lessonId + the keys we just inserted.
  await prisma.vocabulary.createMany({
    data: fresh.map((c) => ({
      lessonId,
      kana: c.kana,
      kanji: c.kanji,
      english: c.english,
      partOfSpeech: c.partOfSpeech,
      jlptLevel: level,
    })),
  });

  const justInserted = await prisma.vocabulary.findMany({
    where: {
      lessonId,
      OR: fresh.map((c) => ({
        kanji: c.kanji,
        kana: c.kana,
        english: c.english,
      })),
    },
  });

  const allIds = [...existing.map((v) => v.id), ...justInserted.map((v) => v.id)];
  return ensureSrsCardsForVocab(user.id, allIds);
}

async function ensureSrsCardsForVocab(
  userId: number,
  vocabIds: number[],
): Promise<{ created: number }> {
  if (vocabIds.length === 0) return { created: 0 };

  const existingCards = await prisma.sRSCard.findMany({
    where: {
      userId,
      itemType: "VOCABULARY",
      itemId: { in: vocabIds },
    },
    select: { itemId: true },
  });
  const have = new Set(existingCards.map((c) => c.itemId));
  const missing = vocabIds.filter((id) => !have.has(id));

  if (missing.length === 0) return { created: 0 };

  await prisma.sRSCard.createMany({
    data: missing.map((id) => ({
      userId,
      itemType: "VOCABULARY",
      itemId: id,
      ease: 2.5,
      interval: 0,
      dueDate: new Date(),
    })),
  });

  return { created: missing.length };
}
