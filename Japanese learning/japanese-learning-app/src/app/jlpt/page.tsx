import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { Chip, Pill } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { MountainChart } from "@/components/MountainChart";
import { getCurrentUser } from "@/lib/me";
import { prisma } from "@/lib/db";
import {
  JLPT,
  LEVELS,
  daysUntil,
  formatExamDate,
  isValidLevel,
  nextExamDate,
  weakestSection,
  type JLPTLevel,
  type SectionKey,
} from "@/lib/jlpt";

export const dynamic = "force-dynamic";
export const metadata = { title: "JLPT prep · Nihongo" };

type SearchParams = { level?: string };

// Section availability: which (level, section) combos have enough seeded
// content to power a real practice round. Anything outside this set links
// to a stub page that explains what's coming.
function availableFor(level: JLPTLevel, section: SectionKey): "practice" | "ai" | "soon" {
  // Kanji-meaning practice works at every level — we have Kanji rows for N5..N1.
  // The "vocab" card on the JLPT dashboard is the entry point for kanji-meaning.
  if (section === "vocab") return "practice";
  // Grammar / Reading / Listening have no tagged content yet — route to AI tutor.
  if (section === "grammar" || section === "reading") return "ai";
  return "soon";
}

export default async function JLPTPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  const sp = (await searchParams) ?? {};
  const level: JLPTLevel = isValidLevel(sp.level)
    ? sp.level
    : isValidLevel(user.level)
      ? user.level
      : "N5";

  const cfg = JLPT[level];
  const exam = nextExamDate();
  const dDays = daysUntil(exam);

  // Recent attempts for this user + level, newest first.
  const attempts = await prisma.jLPTAttempt.findMany({
    where: { userId: user.id, level },
    orderBy: { startedAt: "desc" },
    take: 12,
  });

  // Per-section "last score" — most recent finished attempt's scorePct.
  const lastBySection = new Map<string, number>();
  for (const a of attempts) {
    if (a.scorePct == null) continue;
    if (!lastBySection.has(a.section)) {
      lastBySection.set(a.section, Math.round(a.scorePct));
    }
  }

  // Mountain chart points — last five finished section attempts, chronological.
  const finishedChron = [...attempts]
    .filter((a) => a.scorePct != null && a.section !== "full")
    .reverse()
    .slice(-5);
  const chartPoints = finishedChron.map((a) => ({
    label: a.startedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value: Math.round(a.scorePct as number),
  }));

  // Weakness callout (only if we have any data).
  const weakest = weakestSection(
    attempts.map((a) => ({ section: a.section, scorePct: a.scorePct })),
  );

  // Overall % across all finished section attempts (excludes "full").
  const sectionScores = attempts
    .filter((a) => a.scorePct != null && a.section !== "full")
    .map((a) => a.scorePct as number);
  const overallPct =
    sectionScores.length === 0
      ? null
      : Math.round(sectionScores.reduce((s, x) => s + x, 0) / sectionScores.length);

  // Lift since first attempt (simple delta of newest minus oldest).
  const lift =
    finishedChron.length >= 2
      ? Math.round(
          (finishedChron[finishedChron.length - 1].scorePct as number) -
            (finishedChron[0].scorePct as number),
        )
      : null;

  return (
    <AppShell active="jlpt">
      <header className="flex flex-wrap items-baseline justify-between gap-4 border-b border-ink-3/40 px-6 py-5 md:px-8">
        <div>
          <div className="eyebrow">JLPT PREP · MOCK CENTER</div>
          <h1 className="font-serif text-2xl md:text-[28px]">
            JLPT {level} · {cfg.title}{" "}
            <span className="text-ink-3 text-base">
              · {dDays} days to {formatExamDate(exam)}
            </span>
          </h1>
        </div>
        <Link href={`/jlpt/mock/full?level=${level}`}>
          <Button size="lg">
            start full {cfg.totalMin}-min mock →
          </Button>
        </Link>
      </header>

      {/* level switcher */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-3/40 px-6 py-3 md:px-8">
        <span className="eyebrow mr-1">TARGET LEVEL</span>
        {LEVELS.map((L) => (
          <Link
            key={L}
            href={`/jlpt?level=${L}`}
            className={`mono rounded-sm border px-2.5 py-1 text-xs transition-colors ${
              L === level
                ? "border-accent bg-accent text-[#fff7ec]"
                : "border-ink-3/50 text-ink-2 hover:bg-paper-2"
            }`}
          >
            {L}
          </Link>
        ))}
        <span className="mono ml-auto text-[11px] text-ink-3">
          pass mark · {cfg.passMark}/180 · sectional ≥{cfg.sectionPassMark}/60
        </span>
      </div>

      <div className="space-y-8 p-6 md:p-8">
        {/* section grid */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cfg.sections.map((s) => {
            const lastPct = lastBySection.get(s.key);
            const avail = availableFor(level, s.key);
            const practiceHref =
              avail === "practice"
                ? `/jlpt/practice/${s.key}?level=${level}`
                : avail === "ai"
                  ? `/tutor?level=${level}`
                  : `/jlpt/practice/${s.key}?level=${level}`;
            const mockHref =
              avail === "practice"
                ? `/jlpt/mock/${s.key}?level=${level}`
                : `/jlpt/practice/${s.key}?level=${level}`;
            return (
              <Card key={s.key} tone="paper" className="flex flex-col">
                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="jp text-xl">{s.jp}</div>
                    <div className="font-serif text-base">{s.en}</div>
                  </div>
                  <Chip>{level}</Chip>
                </div>
                <div className="mt-3 text-xs text-ink-3">
                  {s.qCount} questions · {s.timeMin} min
                  {s.combinedWith && (
                    <span className="block text-[10px]">
                      combined with {cfg.sections.find((x) => x.key === s.combinedWith)?.en} on test day
                    </span>
                  )}
                </div>
                <div className="mt-3">
                  {lastPct != null ? (
                    <>
                      <div className="font-serif text-3xl">
                        {lastPct}
                        <span className="text-base text-ink-3">%</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-sm bg-paper-3">
                        <div
                          className="h-full bg-accent"
                          style={{ width: `${Math.min(100, lastPct)}%` }}
                        />
                      </div>
                      <div className="mono mt-1 text-[10px] text-ink-3">
                        last mock
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-serif text-3xl text-ink-3">·</div>
                      <div className="mono mt-1 text-[10px] text-ink-3">
                        no attempts yet
                      </div>
                    </>
                  )}
                </div>
                {avail === "soon" && (
                  <div className="mt-2">
                    <Pill tone="gold" className="mono">soon</Pill>
                  </div>
                )}
                {avail === "ai" && (
                  <div className="mt-2">
                    <Pill tone="indigo" className="mono">AI-assisted</Pill>
                  </div>
                )}
                <div className="mt-4 flex gap-2">
                  <Link href={practiceHref} className="flex-1">
                    <Button size="sm" variant="ghost" className="w-full">
                      practice
                    </Button>
                  </Link>
                  <Link href={mockHref} className="flex-1">
                    <Button size="sm" className="w-full">
                      mock →
                    </Button>
                  </Link>
                </div>
              </Card>
            );
          })}
        </section>

        {/* overall + weakness side-by-side */}
        <section className="grid gap-4 md:grid-cols-3">
          <Card tone="raised" className="md:col-span-1">
            <div className="eyebrow">OVERALL</div>
            <div className="mt-1 font-serif text-3xl">
              {overallPct != null ? `${overallPct}%` : "—"}
            </div>
            <div className="mono mt-1 text-[11px] text-ink-3">
              {sectionScores.length} graded {sectionScores.length === 1 ? "attempt" : "attempts"} at {level}
            </div>
            <div className="mt-3 text-sm text-ink-2">
              You need{" "}
              <span className="font-medium text-ink">
                ≥{Math.round((cfg.passMark / 180) * 100)}%
              </span>{" "}
              average to clear {level}, plus a sectional floor of{" "}
              <span className="font-medium text-ink">
                ≥{Math.round((cfg.sectionPassMark / 60) * 100)}%
              </span>{" "}
              in every paper.
            </div>
          </Card>

          <Card tone="raised" className="md:col-span-2">
            <div className="eyebrow">FOCUS AREA</div>
            {weakest ? (
              <>
                <div className="mt-1 font-serif text-xl">
                  Your weakest section is{" "}
                  <span className="text-accent">
                    {cfg.sections.find((s) => s.key === weakest.section)?.en ??
                      weakest.section}
                  </span>{" "}
                  at <span className="mono">{Math.round(weakest.scorePct)}%</span>.
                </div>
                <p className="mt-2 text-sm text-ink-2">
                  Concentrate practice rounds here for the next week. A 10-point
                  lift moves you above the sectional pass-mark floor.
                </p>
                <div className="mt-3">
                  <Link href={`/jlpt/practice/${weakest.section}?level=${level}`}>
                    <Button size="sm">drill {weakest.section} →</Button>
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div className="mt-1 font-serif text-xl">
                  Take your first section mock to unlock targeted study.
                </div>
                <p className="mt-2 text-sm text-ink-2">
                  Once you have a baseline, we&apos;ll surface your weakest section
                  and route you straight into focused practice.
                </p>
                <div className="mt-3 flex gap-2">
                  <Link href={`/jlpt/practice/vocab?level=${level}`}>
                    <Button size="sm">take the kanji-meaning mock →</Button>
                  </Link>
                </div>
              </>
            )}
          </Card>
        </section>

        {/* mountain-climb trend */}
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <div>
              <div className="eyebrow">TREND · LAST FIVE SECTION MOCKS</div>
              <h2 className="font-serif text-xl">Your climb to {level}</h2>
            </div>
            {lift != null && (
              <Pill tone={lift >= 0 ? "moss" : "accent"}>
                {lift >= 0 ? `+${lift}` : lift} pts since first mock
              </Pill>
            )}
          </div>
          <Card tone="raised" padded={false} className="overflow-hidden">
            {chartPoints.length >= 2 ? (
              <MountainChart
                points={chartPoints}
                goal={Math.round((cfg.passMark / 180) * 100)}
                goalLabel={level}
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
                <div className="jp text-3xl text-ink-3">山</div>
                <div className="font-serif text-base">
                  No mountain to climb yet.
                </div>
                <p className="max-w-md text-sm text-ink-3">
                  Finish at least two section mocks at {level} and the climb chart
                  will track your scores against the {Math.round((cfg.passMark / 180) * 100)}%
                  pass-mark summit.
                </p>
              </div>
            )}
          </Card>
        </section>

        {/* recent attempts table */}
        <section>
          <div className="mb-2 eyebrow">RECENT ATTEMPTS</div>
          <Card tone="paper" padded={false}>
            {attempts.length === 0 ? (
              <div className="p-6 text-sm text-ink-3">
                No attempts logged yet. Start with a quick{" "}
                <Link
                  href={`/jlpt/practice/vocab?level=${level}`}
                  className="text-accent underline"
                >
                  kanji-meaning practice round
                </Link>{" "}
                to put your first flag on the mountain.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-3/30 text-left">
                    <th className="mono p-3 text-[10px] uppercase tracking-wider text-ink-3">
                      When
                    </th>
                    <th className="mono p-3 text-[10px] uppercase tracking-wider text-ink-3">
                      Section
                    </th>
                    <th className="mono p-3 text-[10px] uppercase tracking-wider text-ink-3">
                      Score
                    </th>
                    <th className="mono p-3 text-[10px] uppercase tracking-wider text-ink-3">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.map((a) => (
                    <tr key={a.id} className="border-b border-ink-3/20 last:border-0">
                      <td className="p-3 text-ink-2">
                        {a.startedAt.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="p-3 text-ink-2">
                        {cfg.sections.find((s) => s.key === a.section)?.en ?? a.section}
                      </td>
                      <td className="p-3 font-serif">
                        {a.scorePct != null ? `${Math.round(a.scorePct)}%` : "—"}
                      </td>
                      <td className="p-3">
                        {a.finishedAt ? (
                          <Chip tone="moss">complete</Chip>
                        ) : (
                          <Chip tone="gold">in progress</Chip>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </section>

        {/* exam-day info */}
        <section>
          <div className="mb-2 eyebrow">EXAM DAY · {formatExamDate(exam).toUpperCase()}</div>
          <Card tone="raised">
            <div className="grid gap-5 md:grid-cols-3">
              <div>
                <div className="font-serif text-base">Bring</div>
                <ul className="mt-2 space-y-1 text-sm text-ink-2">
                  <li>· Test voucher (受験票)</li>
                  <li>· Photo ID</li>
                  <li>· HB / No. 2 pencils + eraser</li>
                  <li>· Analogue watch (no smart features)</li>
                </ul>
              </div>
              <div>
                <div className="font-serif text-base">Schedule</div>
                <ul className="mt-2 space-y-1 text-sm text-ink-2">
                  {cfg.sections.map((s) => (
                    <li key={s.key} className="flex justify-between gap-3">
                      <span>{s.en}</span>
                      <span className="mono text-ink-3">{s.timeMin} min</span>
                    </li>
                  ))}
                  <li className="flex justify-between gap-3 border-t border-ink-3/30 pt-1 font-medium">
                    <span>Total testing</span>
                    <span className="mono">{cfg.totalMin} min</span>
                  </li>
                </ul>
              </div>
              <div>
                <div className="font-serif text-base">Pass requirements</div>
                <ul className="mt-2 space-y-1 text-sm text-ink-2">
                  <li>
                    · Overall ≥
                    <span className="mono"> {cfg.passMark}/180</span>
                  </li>
                  <li>
                    · Each scaled section ≥
                    <span className="mono"> {cfg.sectionPassMark}/60</span>
                  </li>
                  <li>· No section may be left blank</li>
                  <li className="text-ink-3">· Results released ~8 weeks later</li>
                </ul>
              </div>
            </div>
          </Card>
        </section>
      </div>
    </AppShell>
  );
}
