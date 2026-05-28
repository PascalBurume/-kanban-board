import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip, Pill } from "@/components/ui/Chip";
import { isValidLevel, JLPT, type JLPTLevel } from "@/lib/jlpt";

export const dynamic = "force-dynamic";
export const metadata = { title: "Full mock · JLPT · Nihongo" };

type SearchParams = { level?: string };

export default async function FullMockPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const level: JLPTLevel = isValidLevel(sp.level) ? sp.level : "N5";
  const cfg = JLPT[level];

  return (
    <AppShell active="jlpt">
      <header className="border-b border-ink-3/40 px-6 py-5 md:px-8">
        <div className="eyebrow">JLPT PREP · FULL MOCK</div>
        <h1 className="font-serif text-2xl md:text-[28px]">
          {level} · full {cfg.totalMin}-min mock
        </h1>
      </header>

      <div className="space-y-4 p-6 md:p-8">
        <Card tone="raised" className="max-w-2xl">
          <div className="flex items-center gap-2">
            <Chip>{level}</Chip>
            <Pill tone="gold">section-by-section</Pill>
          </div>
          <p className="mt-3 text-base text-ink-2">
            The end-to-end full mock (locked papers, a single submit, scaled
            scoring) is on the roadmap. Until then, run the sections back-to-back
            yourself: each section mock writes its own attempt, so your trend chart
            still reflects the climb.
          </p>

          <div className="mt-5 grid gap-2">
            {cfg.sections.map((s) => (
              <Link
                key={s.key}
                href={`/jlpt/mock/${s.key}?level=${level}`}
                className="flex items-center justify-between rounded-md border border-ink-3/40 bg-paper p-3 transition-colors hover:bg-paper-2"
              >
                <div className="flex items-center gap-3">
                  <span className="jp text-xl">{s.jp}</span>
                  <span className="font-serif">{s.en}</span>
                </div>
                <span className="mono text-xs text-ink-3">
                  {s.qCount} q · {s.timeMin} min
                </span>
              </Link>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link href={`/jlpt/mock/vocab?level=${level}`}>
              <Button>start with vocabulary →</Button>
            </Link>
            <Link href={`/jlpt?level=${level}`}>
              <Button variant="ghost">← JLPT prep</Button>
            </Link>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
