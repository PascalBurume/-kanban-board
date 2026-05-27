import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { Chip, Pill } from "@/components/ui/Chip";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "NHK reader · Nihongo" };

export default async function NHKIndex() {
  const clips = await prisma.nHKClip.findMany({
    orderBy: { publishedAt: "desc" },
  });
  return (
    <AppShell active="nhk">
      <header className="border-b border-ink-3/40 px-6 py-5 md:px-8">
        <div className="eyebrow">AUTHENTIC INPUT</div>
        <h1 className="font-serif text-2xl md:text-[28px]">NHK reader</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Sentence-level karaoke playback with furigana and inline dictionary
          popovers. Save any word straight to your SRS queue.
        </p>
      </header>

      <div className="grid gap-4 p-6 md:grid-cols-2 md:p-8 xl:grid-cols-3">
        {clips.length === 0 && (
          <Card tone="raised">
            <p className="text-sm">
              No clips yet — run{" "}
              <code className="mono">npm run db:seed:extended</code>.
            </p>
          </Card>
        )}
        {clips.map((c) => (
          <Link key={c.id} href={`/nhk/${c.id}`}>
            <Card tone="paper" className="h-full hover:shadow-md">
              <div className="mono text-[10px] text-ink-3">
                {c.publishedAt.toISOString().slice(0, 10)} ·{" "}
                {c.durationSec
                  ? `${Math.floor(c.durationSec / 60)}:${String(c.durationSec % 60).padStart(2, "0")}`
                  : "—"}
              </div>
              <h2 className="jp mt-1 text-[18px] leading-snug">{c.titleJp}</h2>
              <p className="mt-1 text-sm italic text-ink-2">{c.titleEn}</p>
              <div className="mt-3 flex items-center gap-2">
                <Chip tone="accent">{c.difficulty ?? "N4"}</Chip>
                <Pill className="mono">{c.source}</Pill>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
