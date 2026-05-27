import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/me";
import { bootstrapDeckIfEmpty } from "./actions";
import { SRSReview } from "./SRSReview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review · Nihongo" };

const SESSION_SIZE = 20;
const FORECAST_DAYS = 5;
const LEECH_FAILS = 4; // ≥ N "again" ratings → leech
const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;

type SearchParams = { level?: string };

export default async function SRSPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  const sp = (await searchParams) ?? {};
  const selectedLevel =
    sp.level && (JLPT_LEVELS as readonly string[]).includes(sp.level)
      ? sp.level
      : null; // null = all levels

  // First-visit: lazy-create a starter deck. If a level filter is active, seed
  // from that level when the user has nothing at it yet.
  await bootstrapDeckIfEmpty(selectedLevel ?? undefined);

  // Due cards: dueDate <= now, ordered by oldest-due first. Pull a wider pool
  // when filtering so we still end up with a full session after the level cut.
  const pullSize = selectedLevel ? SESSION_SIZE * 4 : SESSION_SIZE;
  const dueCards = await prisma.sRSCard.findMany({
    where: { userId: user.id, dueDate: { lte: new Date() } },
    take: pullSize,
    orderBy: { dueDate: "asc" },
  });

  // Hydrate vocab payload for each card (single batched query)
  const vocabIds = dueCards
    .filter((c) => c.itemType === "VOCABULARY")
    .map((c) => c.itemId);
  const vocabRows = vocabIds.length
    ? await prisma.vocabulary.findMany({ where: { id: { in: vocabIds } } })
    : [];
  const vocabById = new Map(vocabRows.map((v) => [v.id, v]));

  const session = dueCards
    .map((c) => {
      const v = vocabById.get(c.itemId);
      if (!v || !v.kanji) return null;
      if (selectedLevel && v.jlptLevel !== selectedLevel) return null;
      return {
        cardId: c.id,
        surface: v.kanji,
        reading: v.kana,
        meaningEn: v.english,
        level: v.jlptLevel ?? user.level ?? "N5",
        ease: c.ease,
        interval: c.interval,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .slice(0, SESSION_SIZE);

  // Real 5-day forecast — count cards due each upcoming day.
  const forecast = await computeForecast(user.id, FORECAST_DAYS);

  // Real leeches — items repeatedly failed (rating < 3).
  const leeches = await computeLeeches(user.id, LEECH_FAILS);

  // Total card pool size (for an "X due of Y total" hint)
  const totalCards = await prisma.sRSCard.count({ where: { userId: user.id } });

  // Next upcoming card so we can show "next review in" if nothing is due
  let nextDue: Date | null = null;
  if (session.length === 0) {
    const upcoming = await prisma.sRSCard.findFirst({
      where: { userId: user.id, dueDate: { gt: new Date() } },
      orderBy: { dueDate: "asc" },
      select: { dueDate: true },
    });
    nextDue = upcoming?.dueDate ?? null;
  }

  return (
    <AppShell active="srs">
      <Suspense fallback={null}>
        <SRSReview
          key={selectedLevel ?? "all"}
          cards={session}
          forecast={forecast}
          leeches={leeches}
          totalCards={totalCards}
          nextDueISO={nextDue?.toISOString() ?? null}
          selectedLevel={selectedLevel}
          levels={JLPT_LEVELS as unknown as string[]}
        />
      </Suspense>
    </AppShell>
  );
}

async function computeForecast(userId: number, days: number) {
  // Bucket SRSCard.dueDate into day offsets [0..days-1] from today.
  const today = startOfDay(new Date());
  const end = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);

  const rows = await prisma.sRSCard.findMany({
    where: {
      userId,
      dueDate: { gte: today, lt: end },
    },
    select: { dueDate: true },
  });

  const buckets = Array.from({ length: days }, (_, i) => ({
    offset: i,
    count: 0,
  }));
  for (const r of rows) {
    const diff = Math.floor(
      (startOfDay(r.dueDate).getTime() - today.getTime()) /
        (24 * 60 * 60 * 1000),
    );
    if (diff >= 0 && diff < days) buckets[diff].count++;
  }
  return buckets;
}

async function computeLeeches(userId: number, threshold: number) {
  // Group ReviewLog rows by card, count rating<3 ("again"-class) reviews,
  // surface top offenders. Limited to vocab so we can show kanji + meaning.
  const logs = await prisma.reviewLog.findMany({
    where: { card: { userId } },
    select: { cardId: true, rating: true },
  });

  const fails = new Map<number, number>();
  for (const l of logs) {
    if (l.rating < 3) fails.set(l.cardId, (fails.get(l.cardId) ?? 0) + 1);
  }
  const offenders = [...fails.entries()]
    .filter(([, n]) => n >= threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (offenders.length === 0) return [];

  const cardIds = offenders.map(([id]) => id);
  const cards = await prisma.sRSCard.findMany({
    where: { id: { in: cardIds } },
  });
  const vocabIds = cards
    .filter((c) => c.itemType === "VOCABULARY")
    .map((c) => c.itemId);
  const vocab = await prisma.vocabulary.findMany({
    where: { id: { in: vocabIds } },
  });
  const vById = new Map(vocab.map((v) => [v.id, v]));

  return offenders
    .map(([cardId, count]) => {
      const c = cards.find((x) => x.id === cardId);
      const v = c ? vById.get(c.itemId) : null;
      if (!v || !v.kanji) return null;
      return { jp: v.kanji, en: v.english, fails: count };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
