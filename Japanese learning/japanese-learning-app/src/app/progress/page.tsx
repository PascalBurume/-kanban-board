import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { MountainChart } from "@/components/MountainChart";
import { getCurrentUser } from "@/lib/me";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Progress · Nihongo" };

const MONTHLY_CLIMB = [
  { label: "Dec", value: 12 },
  { label: "Jan", value: 22 },
  { label: "Feb", value: 35 },
  { label: "Mar", value: 41 },
  { label: "Apr", value: 56 },
  { label: "May", value: 68 },
];

const TOP_WORDS = [
  { rank: 1, jp: "実は", en: "actually, in fact", retention: 96 },
  { rank: 2, jp: "ところで", en: "by the way", retention: 92 },
  { rank: 3, jp: "とりあえず", en: "for the time being", retention: 89 },
  { rank: 4, jp: "もちろん", en: "of course", retention: 87 },
  { rank: 5, jp: "なるほど", en: "I see, ah-ha", retention: 84 },
];

export default async function ProgressPage() {
  const user = await getCurrentUser();
  const totalKanji = await prisma.kanji.count();
  const totalVocab = await prisma.vocabulary.count();

  return (
    <AppShell active="progress">
      <header className="border-b-2 border-double border-ink/70 px-6 py-5 md:px-8">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
              STUDY ALMANAC · {new Date().getFullYear() - 1}–
              {new Date().getFullYear()} EDITION
            </div>
            <h1 className="font-serif text-3xl">Your year of Japanese</h1>
          </div>
          <Chip tone="accent">{user.level}</Chip>
        </div>
      </header>

      <div className="grid gap-8 p-6 md:grid-cols-[1.4fr_1fr] md:p-8">
        {/* LEFT COLUMN */}
        <section className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="HOURS TOTAL" value="312" suffix="hrs" />
            <Stat label="STREAK" value={String(user.streakCount)} suffix="days" />
            <Stat label="AVG SESSION" value="08:14" />
            <Stat label="BEST DAY" value="Sun" />
          </div>

          <div>
            <div className="eyebrow mb-1">MONTHLY CLIMB</div>
            <Card tone="raised" padded={false} className="overflow-hidden">
              <MountainChart
                points={MONTHLY_CLIMB}
                goal={75}
                goalLabel="N3"
              />
            </Card>
          </div>
        </section>

        {/* RIGHT COLUMN */}
        <aside className="space-y-6 border-l border-dashed border-ink-3/40 pl-6 md:pl-8">
          <div>
            <div className="eyebrow mb-2">TOP 5 WORDS LEARNED</div>
            <Card tone="paper" padded={false}>
              <table className="w-full text-sm">
                <thead className="border-b border-ink/40 bg-paper-2 text-left">
                  <tr>
                    <th className="px-3 py-2 mono text-[10px] text-ink-3">#</th>
                    <th className="px-3 py-2 mono text-[10px] text-ink-3">WORD</th>
                    <th className="px-3 py-2 mono text-[10px] text-ink-3">
                      MEANING
                    </th>
                    <th className="px-3 py-2 mono text-[10px] text-ink-3 text-right">
                      RETENTION
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {TOP_WORDS.map((w) => (
                    <tr key={w.rank} className="border-b border-ink-3/20">
                      <td className="px-3 py-2 mono text-xs text-ink-3">
                        {w.rank}
                      </td>
                      <td className="px-3 py-2 jp">{w.jp}</td>
                      <td className="px-3 py-2 text-xs text-ink-2">{w.en}</td>
                      <td className="px-3 py-2 text-right">
                        <span className="mono text-xs text-moss">
                          {w.retention}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          <div>
            <div className="eyebrow mb-2">
              KANJI HEATMAP · {totalKanji} learned of 2,136 jōyō
            </div>
            <KanjiHeatmap />
            <div className="mt-2 flex gap-3 text-[10px] text-ink-3">
              <LegendDot color="bg-accent" label="mastered" />
              <LegendDot color="bg-gold" label="learning" />
              <LegendDot color="bg-ink-3/60" label="seen" />
              <LegendDot color="bg-paper-3 border border-ink-3/40" label="ahead" />
            </div>
          </div>

          <div className="text-xs text-ink-3">
            {totalVocab.toLocaleString()} vocab indexed · all JLPT levels
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="border-l-2 border-accent pl-3">
      <div className="mono text-[10px] uppercase tracking-wider text-ink-3">
        {label}
      </div>
      <div className="font-serif text-2xl">
        {value}
        {suffix && <span className="ml-1 text-sm text-ink-3">{suffix}</span>}
      </div>
    </div>
  );
}

function KanjiHeatmap() {
  const cols = 14;
  const rows = 6;
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: cols * rows }).map((_, i) => {
        const r = (i * 17) % 100;
        let cls = "bg-paper-3 border border-ink-3/40";
        if (r < 25) cls = "bg-accent";
        else if (r < 50) cls = "bg-gold";
        else if (r < 70) cls = "bg-ink-3/60";
        return (
          <div
            key={i}
            className={`aspect-square rounded-sm ${cls}`}
            title="hover tooltip placeholder"
          />
        );
      })}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  );
}
