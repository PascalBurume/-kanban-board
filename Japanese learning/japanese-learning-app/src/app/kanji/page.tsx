import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kanji · Nihongo" };

const LEVELS = ["N5", "N4", "N3", "N2", "N1"];

type KanjiRow = { character: string; meaning: string | null; strokes: number | null };

function groupByStrokes(items: KanjiRow[]): [number, KanjiRow[]][] {
  const map = new Map<number, KanjiRow[]>();
  for (const k of items) {
    const key = k.strokes ?? 0;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(k);
  }
  return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
}

export default async function KanjiIndexPage({
  searchParams,
}: {
  searchParams?: { level?: string };
}) {
  const level = (searchParams?.level || "N5").toUpperCase();
  const kanji = await prisma.kanji.findMany({
    where: { jlptLevel: level },
    orderBy: [{ strokes: "asc" }, { character: "asc" }],
    take: 200,
  });

  return (
    <AppShell active="kanji">
      <header className="border-b border-ink-3/40 px-6 py-5 md:px-8">
        <div className="eyebrow">WRITING PRACTICE</div>
        <h1 className="font-serif text-2xl md:text-[28px]">Kanji</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Trace each character with proper stroke order. Live scoring uses
          stroke count, direction cosine, and bounding-box IoU against
          KanjiVG ground truth.
        </p>
        <div className="mt-3 flex gap-2">
          {LEVELS.map((lv) => (
            <Link
              key={lv}
              href={`/kanji?level=${lv}`}
              className={`mono rounded-sm border px-2.5 py-1 text-xs ${
                lv === level
                  ? "border-accent bg-accent text-[#fff7ec]"
                  : "border-ink-3/60 bg-paper text-ink-2 hover:border-accent"
              }`}
            >
              {lv}
            </Link>
          ))}
        </div>
      </header>

      <div className="p-6 md:p-8">
        {kanji.length === 0 ? (
          <Card tone="raised">
            <p className="text-sm">
              No {level} kanji yet. Run{" "}
              <code className="mono">npm run data:kanjivg</code> then{" "}
              <code className="mono">npm run db:seed:extended</code>.
            </p>
          </Card>
        ) : (
          <div className="space-y-6">
            {groupByStrokes(kanji).map(([strokes, items]) => (
              <section key={strokes}>
                <div className="mb-3 flex items-baseline gap-4 border-b border-ink-3/30 pb-2">
                  <h2 className="jp flex items-baseline gap-2 text-3xl font-semibold leading-none text-ink md:text-4xl">
                    <span className="tabular-nums">{strokes}</span>
                    <span>画</span>
                  </h2>
                  <span className="eyebrow text-ink-3">
                    {strokes === 1 ? "one stroke" : `${strokes} strokes`} ·{" "}
                    {items.length}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-9 lg:grid-cols-11 xl:grid-cols-13">
                  {items.map((k) => (
                    <Link
                      key={k.character}
                      href={`/kanji/${encodeURIComponent(k.character)}`}
                      className="group flex flex-col items-center rounded-md border border-ink-3/40 bg-paper px-2 py-2 text-center hover:border-accent hover:bg-accent-soft/30"
                      title={k.meaning ?? ""}
                    >
                      <div className="jp text-[38px] leading-none text-ink group-hover:text-accent">
                        {k.character}
                      </div>
                      <div className="mt-1.5 line-clamp-2 text-[10px] leading-tight text-ink-2">
                        {(k.meaning ?? "").split(",")[0]}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
