import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { prisma } from "@/lib/db";
import { KaraokeReader } from "./KaraokeReader";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}) {
  const clip = await prisma.nHKClip.findUnique({
    where: { id: parseInt(params.id, 10) },
    select: { titleJp: true, titleEn: true },
  });
  if (!clip) return { title: "NHK clip · Nihongo" };
  return {
    title: `${clip.titleJp} · NHK reader`,
    description: clip.titleEn ?? undefined,
  };
}

function splitSentences(body: string): string[] {
  return body
    .replace(/\r\n/g, "\n")
    .split(/(?<=。)|\n+/)
    .map((s) => s.trim())
    .filter((s) => s && /[^\s。、!?！？]/.test(s));
}

export default async function NHKClipPage({
  params,
}: {
  params: { id: string };
}) {
  const clip = await prisma.nHKClip.findUnique({
    where: { id: parseInt(params.id, 10) },
  });
  if (!clip) notFound();

  const sentences = splitSentences(clip.bodyJp);

  // Per-sentence durations: scale proportionally to clip.durationSec when
  // we have one (so the progress bar matches the header). Otherwise fall
  // back to a char-based heuristic.
  const weights = sentences.map((s) => Math.max(s.length, 1));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const target = clip.durationSec ?? weightSum * 0.22;
  const timings = weights.map((w) => Math.max(1.8, (w / weightSum) * target));

  const totalSec = Math.round(timings.reduce((a, b) => a + b, 0));

  return (
    <AppShell active="nhk">
      <header className="flex items-center justify-between gap-4 border-b border-ink-3/40 px-6 py-4 md:px-8">
        <Link href="/nhk" className="text-ink-2 hover:text-ink">
          ← clips
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <div className="eyebrow">
            {clip.source} ·{" "}
            {clip.publishedAt.toISOString().slice(0, 10)}
            {clip.url && (
              <>
                {" · "}
                <a
                  href={clip.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-dotted hover:text-accent"
                >
                  source ↗
                </a>
              </>
            )}
          </div>
          <h1 className="jp truncate text-base md:text-lg">{clip.titleJp}</h1>
        </div>
        <div className="whitespace-nowrap text-xs text-ink-3">
          {clip.difficulty ?? "N4"} · {totalSec}s
        </div>
      </header>
      <KaraokeReader
        sentences={sentences}
        timings={timings}
        clipId={clip.id}
        titleEn={clip.titleEn ?? ""}
        summaryEn={clip.summaryEn ?? null}
        audioUrl={clip.audioUrl ?? null}
        bodyJpWithFuri={clip.bodyJpWithFuri ?? null}
      />
    </AppShell>
  );
}
