"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/me";
import {
  RATING_QUALITY,
  Rating,
  scheduleNext,
} from "@/lib/srs";

const INITIAL_DECK_SIZE = 40;

/**
 * Grade a single SRSCard, persist the new schedule + a ReviewLog row, and
 * return the new state so the client can verify / refresh.
 */
export async function gradeCard(cardId: number, rating: Rating) {
  const [user, card] = await Promise.all([
    getCurrentUser(),
    prisma.sRSCard.findUnique({ where: { id: cardId } }),
  ]);
  if (!card || card.userId !== user.id) {
    throw new Error("card not found");
  }

  const next = scheduleNext(
    { ease: card.ease, interval: card.interval },
    rating,
  );

  await prisma.$transaction([
    prisma.sRSCard.update({
      where: { id: cardId },
      data: {
        ease: next.ease,
        interval: next.interval,
        dueDate: next.dueDate,
      },
    }),
    prisma.reviewLog.create({
      data: { cardId, rating: RATING_QUALITY[rating] },
    }),
  ]);

  return {
    ease: next.ease,
    interval: next.interval,
    dueDate: next.dueDate.toISOString(),
    lapsed: next.lapsed,
  };
}

/**
 * Lazy-bootstrap: if the current user has zero SRSCard rows for the requested
 * JLPT level (or zero cards overall when no level is given), seed a starter
 * deck drawn from vocabulary at that level. Returns the number of cards
 * created so the page can refetch.
 */
export async function bootstrapDeckIfEmpty(targetLevel?: string) {
  const user = await getCurrentUser();
  const level = targetLevel ?? user.level ?? "N5";

  // If the user already has any cards at this level (or any cards at all when
  // no level filter is active), do nothing.
  if (targetLevel) {
    const vocabCards = await prisma.sRSCard.findMany({
      where: { userId: user.id, itemType: "VOCABULARY" },
      select: { itemId: true },
    });
    const ids = vocabCards.map((c) => c.itemId);
    const existingAtLevel = ids.length
      ? await prisma.vocabulary.count({
          where: { id: { in: ids }, jlptLevel: targetLevel },
        })
      : 0;
    if (existingAtLevel > 0) return { created: 0 };
  } else {
    const existing = await prisma.sRSCard.count({ where: { userId: user.id } });
    if (existing > 0) return { created: 0 };
  }

  // Pull vocab — prefer items that have a kanji surface form at the chosen
  // level, a friendly 40-card session.
  const vocab = await prisma.vocabulary.findMany({
    where: {
      kanji: { not: null },
      jlptLevel: level,
    },
    take: INITIAL_DECK_SIZE,
    orderBy: { id: "asc" },
  });

  if (vocab.length === 0 && !targetLevel) {
    // Fall back: any vocab with kanji (only when no explicit level was asked).
    const fallback = await prisma.vocabulary.findMany({
      where: { kanji: { not: null } },
      take: INITIAL_DECK_SIZE,
      orderBy: { id: "asc" },
    });
    vocab.push(...fallback);
  }

  if (vocab.length === 0) return { created: 0 };

  // Skip vocab already in the user's deck so we don't create duplicate cards.
  const existingItemIds = new Set(
    (
      await prisma.sRSCard.findMany({
        where: {
          userId: user.id,
          itemType: "VOCABULARY",
          itemId: { in: vocab.map((v) => v.id) },
        },
        select: { itemId: true },
      })
    ).map((c) => c.itemId),
  );
  const fresh = vocab.filter((v) => !existingItemIds.has(v.id));
  if (fresh.length === 0) return { created: 0 };

  await prisma.sRSCard.createMany({
    data: fresh.map((v) => ({
      userId: user.id,
      itemType: "VOCABULARY",
      itemId: v.id,
      ease: 2.5,
      interval: 0,
      dueDate: new Date(), // due immediately for the first session
    })),
  });

  return { created: fresh.length };
}
