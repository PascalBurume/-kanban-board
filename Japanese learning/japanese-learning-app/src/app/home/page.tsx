import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Pill, Chip } from "@/components/ui/Chip";
import { getCurrentUser } from "@/lib/me";
import { buildTodayPlan, TodayTask } from "@/lib/today";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Today · Nihongo" };

const KANJI_BY_KIND: Record<TodayTask["kind"], string> = {
  srs: "復",
  lesson: "課",
  kanji: "漢",
  nhk: "報",
  shadow: "話",
};

const DOW_JP = ["日", "月", "火", "水", "木", "金", "土"];

export default async function HomePage() {
  const user = await getCurrentUser();
  const plan = await buildTodayPlan(user.level || "N4");
  const totalPlannedMin = plan.reduce((s, t) => s + t.minutes, 0);

  const headlines = await prisma.nHKClip.findMany({
    orderBy: { publishedAt: "desc" },
    take: 5,
  });
  const featuredKanji = await prisma.kanji.findFirst({
    where: { jlptLevel: user.level || "N4" },
    orderBy: { strokes: "asc" },
  });

  const today = new Date();
  const goal = user.dailyGoalMin || 30;
  const studied = user.dailyMinutes || 0;
  const pct = Math.min(100, Math.round((studied / goal) * 100));

  return (
    <AppShell active="home">
      {/* topbar */}
      <header className="flex flex-wrap items-baseline justify-between gap-4 border-b border-ink-3/40 px-6 py-5 md:px-8">
        <div>
          <div className="eyebrow">
            {today.toLocaleDateString("en-US", { weekday: "long" })} · day{" "}
            {user.streakCount} · {today.getDate()}{" "}
            {DOW_JP[today.getDay()]}曜日
          </div>
          <h1 className="font-serif text-2xl md:text-[28px]">
            Good morning, {user.name?.split(" ")[0] ?? "friend"}.
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <div>
            <div className="eyebrow">STREAK</div>
            <div className="font-serif text-xl">
              {user.streakCount} <span className="text-accent">★</span>
            </div>
          </div>
          <div>
            <div className="eyebrow">TODAY</div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-28 overflow-hidden rounded-sm border border-ink-2/60 bg-paper-3">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="mono text-[11px]">
                {studied} / {goal} min
              </span>
            </div>
          </div>
          <Link href="/me">
            <Button variant="secondary" size="sm">
              customize plan
            </Button>
          </Link>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[1.4fr_1fr]">
        {/* TODAY'S PLAN */}
        <section className="overflow-auto border-r border-dashed border-ink-3/40 p-5 md:p-7">
          <div className="mono text-[10px] text-ink-3">━ TODAY&apos;S PLAN ━</div>
          <div className="mt-3 flex flex-col gap-3">
            {plan.map((t) => (
              <Link
                key={t.id}
                href={t.href}
                className={`flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-paper-2/60 ${
                  t.current
                    ? "border-accent bg-accent-soft/40 shadow-sm"
                    : t.done
                    ? "border-moss/40 bg-moss/10"
                    : "border-ink-3/40 bg-paper"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex size-4 shrink-0 items-center justify-center rounded-sm border ${
                    t.done
                      ? "border-moss bg-moss text-[10px] text-[#fff7ec]"
                      : "border-ink-3/60 bg-paper"
                  }`}
                >
                  {t.done ? "✓" : ""}
                </span>
                <div
                  className={`jp flex size-9 shrink-0 items-center justify-center rounded-md border text-base ${
                    t.current
                      ? "border-accent bg-accent text-[#fff7ec]"
                      : "border-ink-3/60 text-ink-2"
                  }`}
                >
                  {KANJI_BY_KIND[t.kind]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-serif text-[15px] truncate">{t.title}</div>
                  <div className="text-xs text-ink-3 truncate">
                    {t.subtitle}
                  </div>
                </div>
                <Chip tone="neutral" className="mono">
                  {t.minutes}m
                </Chip>
                {t.current && (
                  <span className="mono text-xs font-medium text-accent">
                    start →
                  </span>
                )}
              </Link>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-ink-3/50 bg-paper-2 p-3">
            <div className="text-sm">
              <span className="font-serif">JLPT {user.level || "N4"}</span>
              <span className="text-ink-3"> · 64 days to go</span>
            </div>
            <div className="flex gap-2">
              <Pill tone="accent" className="mono">~{totalPlannedMin} min today</Pill>
              <Link href="/jlpt">
                <Button variant="ghost" size="sm">
                  open prep →
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* WEB-ONLY SIDE: path, NHK, kanji-of-the-day */}
        <aside className="hidden flex-col gap-5 overflow-auto p-5 md:p-7 lg:flex">
          <PathWidget level={user.level || "N4"} />

          <div>
            <div className="mono text-[10px] text-ink-3">━ NHK HEADLINES ━</div>
            <ul className="mt-2 divide-y divide-ink-3/30 rounded-md border border-ink-3/40 bg-paper">
              {headlines.length === 0 && (
                <li className="p-3 text-sm text-ink-3">
                  No clips yet. Run <span className="mono">db:seed:extended</span>.
                </li>
              )}
              {headlines.map((c) => (
                <li key={c.id} className="p-3">
                  <Link href={`/nhk/${c.id}`} className="block group">
                    <div className="jp text-[15px] group-hover:text-accent">
                      {c.titleJp}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-3">
                      <span className="mono">
                        {c.publishedAt.toISOString().slice(0, 10)}
                      </span>
                      <Chip tone="neutral" className="text-[10px]">
                        {c.difficulty ?? "N4"}
                      </Chip>
                      <span className="truncate">{c.titleEn}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <KanjiOfTheDay kanji={featuredKanji} />
        </aside>
      </div>
    </AppShell>
  );
}

function PathWidget({ level }: { level: string }) {
  const nodes = [
    { kanji: "は", label: "topic は", state: "done" },
    { kanji: "の", label: "possessive の", state: "done" },
    { kanji: "て", label: "te-form", state: "current" },
    { kanji: "た", label: "past plain", state: "next" },
    { kanji: "ば", label: "ば conditional", state: "next" },
  ] as const;
  return (
    <div>
      <div className="mono text-[10px] text-ink-3">━ YOUR PATH ━</div>
      <Card tone="raised" className="relative mt-2 overflow-hidden p-0">
        <svg
          viewBox="0 0 320 130"
          className="block h-32 w-full"
          aria-hidden="true"
        >
          <path
            d="M 16 100 C 60 90, 80 30, 130 50 S 220 100, 260 40 S 312 60, 312 60"
            fill="none"
            stroke="var(--ink-3)"
            strokeWidth="1.5"
            strokeDasharray="4 5"
          />
        </svg>
        <div className="absolute inset-x-0 top-0 grid grid-cols-5 px-4 py-3">
          {nodes.map((n) => {
            const tone =
              n.state === "current"
                ? "bg-accent text-[#fff7ec] border-accent"
                : n.state === "done"
                ? "bg-moss/20 text-moss border-moss/50"
                : "bg-paper text-ink-2 border-ink-3/60";
            return (
              <div
                key={n.label}
                className="flex flex-col items-center"
                style={{ marginTop: ["54px", "30px", "12px", "54px", "30px"][nodes.indexOf(n)] }}
              >
                <div
                  className={`jp flex size-10 items-center justify-center rounded-full border text-[15px] ${tone}`}
                >
                  {n.kanji}
                </div>
                {n.state === "current" && (
                  <span className="mt-1 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-medium text-[#fff7ec]">
                    you
                  </span>
                )}
                <span className="mt-1 text-center text-[10px] text-ink-2 line-clamp-2">
                  {n.label}
                </span>
              </div>
            );
          })}
        </div>
        <div className="border-t border-dashed border-ink-3/40 px-4 py-2 text-xs text-ink-3">
          {level} grammar path · 3 of 24 cleared
        </div>
      </Card>
    </div>
  );
}

function KanjiOfTheDay({
  kanji,
}: {
  kanji: { character: string; meaning: string | null; onYomi: string | null; kunYomi: string | null; strokes: number | null } | null;
}) {
  if (!kanji) {
    return null;
  }
  return (
    <div>
      <div className="mono text-[10px] text-ink-3">━ KANJI OF THE DAY ━</div>
      <Card tone="paper" className="mt-2 flex items-center gap-4 p-4">
        <Link
          href={`/kanji/${encodeURIComponent(kanji.character)}`}
          className="jp text-[88px] leading-none text-ink hover:text-accent"
        >
          {kanji.character}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="font-serif text-base">{kanji.meaning}</div>
          <div className="mt-1 text-xs text-ink-3">
            <span className="mono">on </span>
            {kanji.onYomi || "—"}
          </div>
          <div className="text-xs text-ink-3">
            <span className="mono">kun </span>
            {kanji.kunYomi || "—"}
          </div>
          <div className="mt-1 text-[11px] text-ink-3">
            {kanji.strokes ?? "?"} strokes
          </div>
        </div>
        <Link href={`/kanji/${encodeURIComponent(kanji.character)}`}>
          <Button size="sm">trace →</Button>
        </Link>
      </Card>
    </div>
  );
}
