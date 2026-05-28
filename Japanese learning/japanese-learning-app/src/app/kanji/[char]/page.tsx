import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { Chip, Pill } from "@/components/ui/Chip";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/me";
import { JLPT_LEVELS, type JlptLevel } from "@/lib/ai/client";
import { TraceWorkspace } from "./TraceWorkspace";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { char: string };
}) {
  const char = decodeURIComponent(params.char);
  return { title: `${char} · Nihongo` };
}

export default async function KanjiDetailPage({
  params,
}: {
  params: { char: string };
}) {
  const char = decodeURIComponent(params.char);
  const k = await prisma.kanji.findUnique({ where: { character: char } });
  if (!k) notFound();

  let strokes: { paths: string[]; viewBox: string } | null = null;
  if (k.strokesSvg) {
    try {
      strokes = JSON.parse(k.strokesSvg);
    } catch {}
  }

  const [compounds, user] = await Promise.all([
    prisma.vocabulary.findMany({
      where: { kanji: { contains: char } },
      take: 6,
    }),
    getCurrentUser(),
  ]);
  const isJlpt = (l: string | null | undefined): l is JlptLevel =>
    (JLPT_LEVELS as readonly string[]).includes(l ?? "");
  // Default explainer to the kanji's own JLPT level so an N5 kanji opens at
  // N5. Fall back to the learner's level, then N5.
  const explainerLevel: JlptLevel = isJlpt(k.jlptLevel)
    ? (k.jlptLevel as JlptLevel)
    : isJlpt(user.level)
    ? (user.level as JlptLevel)
    : "N5";
  const kanjiLevel: JlptLevel | null = isJlpt(k.jlptLevel)
    ? (k.jlptLevel as JlptLevel)
    : null;

  const primaryMeaning = (k.meaning ?? "").split(",")[0]?.trim();

  return (
    <AppShell active="kanji">
      <header className="border-b border-ink-3/40 px-4 py-5 sm:px-6 md:px-8 md:py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/kanji"
            className="mono text-xs text-ink-3 hover:text-ink"
          >
            ← back to kanji
          </Link>
          <div className="flex items-center gap-2">
            <span className="mono text-[10px] tracking-widest text-ink-3">
              JLPT · {k.jlptLevel ?? "—"}
            </span>
            <Chip tone="accent">
              <span className="font-semibold tabular-nums">
                {k.strokes ?? "?"}
              </span>
              <span className="jp ml-1">画</span>
            </Chip>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-4 sm:flex-nowrap sm:gap-5 md:gap-8">
          <div
            className="jp shrink-0 leading-none text-ink"
            style={{ fontSize: "clamp(72px, 14vw, 144px)" }}
          >
            {k.character}
          </div>
          <div className="min-w-0 flex-1 pb-1 sm:pb-2">
            <div className="eyebrow">CHARACTER</div>
            <h1 className="mt-0.5 break-words font-serif text-2xl leading-tight text-ink md:text-3xl">
              {primaryMeaning || k.meaning}
            </h1>
            {k.meaning && k.meaning.includes(",") && (
              <p className="mt-1 text-xs text-ink-3">{k.meaning}</p>
            )}
            <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-2 text-sm">
              {k.onYomi && (
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="mono text-[10px] tracking-wider text-ink-3">
                    音 ON
                  </span>
                  <span className="jp truncate">{k.onYomi}</span>
                </span>
              )}
              {k.kunYomi && (
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="mono text-[10px] tracking-wider text-ink-3">
                    訓 KUN
                  </span>
                  <span className="jp truncate">{k.kunYomi}</span>
                </span>
              )}
              <Link
                href={`/tutor?q=${encodeURIComponent(
                  `Explain the kanji ${k.character} (${k.meaning ?? ""}) to me simply: what are its radicals, how do I remember it, what are common words that use it?`
                )}`}
                className="mono ml-auto whitespace-nowrap text-xs text-ink-2 hover:text-accent"
              >
                ask sensei →
              </Link>
            </div>
          </div>
        </div>
      </header>

      <TraceWorkspace
        character={k.character}
        strokes={strokes}
        meaning={k.meaning}
        onYomi={k.onYomi}
        kunYomi={k.kunYomi}
        radicals={k.radicals}
        mnemonic={k.mnemonic}
        userLevel={explainerLevel}
        kanjiLevel={kanjiLevel}
        compounds={compounds.map((c) => ({
          surface: c.kanji ?? c.kana,
          reading: c.kana,
          en: c.english,
        }))}
      />
    </AppShell>
  );
}
