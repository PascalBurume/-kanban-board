import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip, Pill } from "@/components/ui/Chip";

export const metadata = {
  title: "Nihongo · Learn Japanese from こんにちは to JLPT N1",
};

const NAV = [
  { href: "#features", label: "Features" },
  { href: "#method", label: "Method" },
  { href: "#testimonials", label: "Reviews" },
  { href: "#pricing", label: "Pricing" },
  { href: "/library", label: "Library" },
  { href: "/start", label: "Placement" },
];

export default function MarketingPage() {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="bg-paper text-ink">
      {/* sticky nav */}
      <header className="sticky top-0 z-30 border-b border-ink/70 bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 md:px-8">
          <Link href="/" className="flex items-center gap-2">
            <span className="hanko size-7 text-[13px]">学</span>
            <span className="font-serif text-lg">
              nihongo<span className="text-accent">.</span>app
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-md px-3 py-1.5 text-sm text-ink-2 hover:bg-paper-2 hover:text-ink"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/home" className="hidden text-sm text-ink-2 hover:text-ink md:inline">
              login
            </Link>
            <Link href="/start">
              <Button size="sm">start free →</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* masthead */}
      <section className="relative border-b-2 border-double border-ink/70">
        <div className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-16">
          <div className="flex items-center justify-between border-b border-ink/40 pb-2 text-xs">
            <span className="mono uppercase tracking-[0.18em] text-ink-3">
              NIHONGO DAILY · VOL. III · NO. 047 · 日本語新聞
            </span>
            <span className="mono text-ink-3">{today}</span>
          </div>

          <div className="grid items-center gap-8 pt-8 md:grid-cols-[1.5fr_1fr]">
            <div>
              <h1 className="font-serif text-3xl leading-[1.1] text-balance md:text-[56px]">
                Learn Japanese from{" "}
                <span className="jp">こんにちは</span> all the way to{" "}
                <span className="text-accent">JLPT N1</span>.
              </h1>
              <p className="mt-5 max-w-xl text-lg text-ink-2">
                Structured lessons aligned with Genki and Tobira, kanji
                tracing with KanjiVG stroke scoring, daily NHK reading, and a
                spaced-repetition engine that respects your time.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link href="/start">
                  <Button size="lg">take the 8-question placement →</Button>
                </Link>
                <Link href="/home">
                  <Button variant="ghost" size="lg">
                    see the dashboard
                  </Button>
                </Link>
                <Pill tone="moss" className="mono">
                  free · no card required
                </Pill>
              </div>
              <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 xl:grid-cols-4 xl:gap-x-0">
                <Stat n="2,136" l="jōyō kanji" />
                <Stat n="N5 → N1" l="path" divider />
                <Stat n="8 min" l="median session" divider />
                <Stat n="12k" l="learners" divider />
              </div>
            </div>

            <div className="relative">
              <div className="hanko mx-auto flex size-44 items-center justify-center text-[88px] md:h-52 md:w-52 md:text-[112px]">
                学
              </div>
              <div className="mono mt-3 text-center text-[11px] uppercase tracking-wider text-ink-3">
                学 · gaku · to learn
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4-column feature strip */}
      <section id="features" className="border-b border-ink/30">
        <div className="mx-auto max-w-7xl px-5 py-12 md:px-8">
          <div className="eyebrow mb-2">FOUR PILLARS</div>
          <h2 className="font-serif text-2xl md:text-3xl">
            Read. Write. Test. Speak.
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-4">
            <Pillar
              jp="読"
              en="Read"
              body="Daily NHK Easy with sentence-level karaoke playback, click-any-word dictionary, save straight to SRS."
            />
            <Pillar
              jp="書"
              en="Write"
              body="Kanji tracing canvas scored against KanjiVG stroke order, direction cosine, and bbox IoU."
              accent
            />
            <Pillar
              jp="試"
              en="Test"
              body="JLPT N5–N1 mock tests with question maps, flag-for-review, and a mountain-climb trend chart."
            />
            <Pillar
              jp="話"
              en="Speak"
              body="Shadow real NHK sentences. Whisper-graded pronunciation feedback (coming soon)."
            />
          </div>
        </div>
      </section>

      {/* 2-col preview band */}
      <section id="method" className="border-b border-ink/30 bg-paper-2">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-2 md:px-8">
          <div>
            <div className="eyebrow">METHOD</div>
            <h2 className="mt-2 font-serif text-2xl md:text-3xl">
              One plan a day. Built around your level, not a textbook.
            </h2>
            <p className="mt-4 text-base text-ink-2">
              Every morning Nihongo assembles a 20–40 minute plan from your
              due SRS, the next grammar pattern, a kanji to trace, and one
              short NHK clip. You finish on time, or come back tomorrow with
              the rest, with no penalty.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-ink-2">
              {[
                "Adaptive placement at sign-up: no level shopping",
                "FSRS scheduler (modern SM-2 replacement)",
                "Server-authoritative streaks, with a bedtime grace window",
                "Genki, Tobira, Shin Kanzen: content cross-referenced",
              ].map((p) => (
                <li key={p} className="flex items-start gap-2">
                  <span className="mt-0.5 text-accent">·</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>

          <Card tone="paper" className="border-2 border-ink">
            <div className="mono mb-2 text-[10px] uppercase tracking-wider text-ink-3">
              TODAY · TUESDAY 火曜日
            </div>
            <h3 className="font-serif text-xl">Good morning, Alex.</h3>
            <ul className="mt-4 space-y-2 text-sm">
              {[
                ["復", "Spaced repetition", "12 cards due", "6m", false],
                ["課", "Lesson · ても form", "even if / even though", "9m", true],
                ["漢", "学 · learn, study", "trace + 3 compounds", "5m", false],
                ["報", "NHK · Tokyo cherry blossoms", "1 clip · loop sentence", "4m", false],
              ].map(([k, t, s, m, cur]) => (
                <li
                  key={t as string}
                  className={`flex items-center gap-3 rounded-md border p-2.5 ${
                    cur
                      ? "border-accent bg-accent-soft/40"
                      : "border-ink-3/40"
                  }`}
                >
                  <span
                    className={`jp flex size-8 items-center justify-center rounded-md border text-base ${
                      cur
                        ? "border-accent bg-accent text-[#fff7ec]"
                        : "border-ink-3/60 text-ink-2"
                    }`}
                  >
                    {k}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-serif text-sm">{t as string}</div>
                    <div className="text-[11px] text-ink-3 truncate">
                      {s as string}
                    </div>
                  </div>
                  <Chip className="mono">{m}</Chip>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      {/* testimonials */}
      <section id="testimonials" className="border-b border-ink/30">
        <div className="mx-auto max-w-7xl px-5 py-14 md:px-8">
          <div className="eyebrow mb-2">READER LETTERS</div>
          <h2 className="font-serif text-2xl md:text-3xl">
            Why learners stick around.
          </h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {[
              {
                quote:
                  "Passed N3 in 11 months from absolute zero. The mock-trend chart kept me honest about my weak section.",
                who: "Mei L.",
                where: "Sydney · N3",
              },
              {
                quote:
                  "Finally a kanji app that scores stroke order instead of just direction. My ぼ vs ぽ confusion is gone.",
                who: "Tomás R.",
                where: "Mexico City · N4",
              },
              {
                quote:
                  "The daily NHK clip with the loop-sentence button is what unblocked my listening. I'm an N2 now.",
                who: "Priya K.",
                where: "Bengaluru · N2",
              },
            ].map((t) => (
              <Card key={t.who} tone="paper" className="flex h-full flex-col">
                <p className="font-serif text-[15px] italic leading-relaxed">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="mt-auto pt-4 border-t border-ink-3/30">
                  <div className="font-serif text-sm">{t.who}</div>
                  <div className="mono text-[11px] text-ink-3">{t.where}</div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* pricing */}
      <section id="pricing" className="bg-paper-2">
        <div className="mx-auto max-w-7xl px-5 py-14 md:px-8">
          <div className="eyebrow mb-2">PRICING</div>
          <h2 className="font-serif text-2xl md:text-3xl">
            Three tiers. No middle-school sales tactics.
          </h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            <PricingCard
              name="Free"
              price="¥0"
              cadence="forever"
              features={[
                "N5 + N4 vocab and kanji",
                "5 SRS reviews per day",
                "1 NHK Easy clip per week",
                "Placement test",
              ]}
              cta="Start free"
            />
            <PricingCard
              name="Student"
              price="¥900"
              cadence="per month"
              featured
              tag="most picked"
              features={[
                "Everything in Free",
                "Unlimited SRS + lessons",
                "Daily NHK + dictionary",
                "JLPT mock tests",
                "Kanji trace scoring",
              ]}
              cta="14-day trial"
            />
            <PricingCard
              name="Scholar"
              price="¥2,200"
              cadence="per month"
              features={[
                "Everything in Student",
                "Tutor matching",
                "Speaking grading (Whisper)",
                "Offline mobile mode",
                "Priority support",
              ]}
              cta="Become a Scholar"
            />
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t-2 border-double border-ink/70">
        <div className="mx-auto max-w-7xl px-5 py-8 md:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="hanko size-7 text-[13px]">学</span>
              <span className="font-serif text-base">
                nihongo<span className="text-accent">.</span>app
              </span>
              <span className="mono ml-2 text-xs text-ink-3">
                © {new Date().getFullYear()}
              </span>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-ink-2">
              <Link href="/library">Library</Link>
              <Link href="/start">Placement</Link>
              <Link href="/home">Dashboard</Link>
              <Link href="/jlpt">JLPT prep</Link>
              <Link href="/progress">Progress</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Stat({ n, l, divider }: { n: string; l: string; divider?: boolean }) {
  return (
    <div
      className={
        divider ? "xl:border-l xl:border-ink-3 xl:pl-5" : undefined
      }
    >
      <div className="font-serif text-2xl whitespace-nowrap">{n}</div>
      <div className="mono text-[10px] uppercase tracking-wider text-ink-3">
        {l}
      </div>
    </div>
  );
}

function Pillar({
  jp,
  en,
  body,
  accent,
}: {
  jp: string;
  en: string;
  body: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`border-l-2 pl-4 ${
        accent ? "border-accent" : "border-ink-3/60"
      }`}
    >
      <div className={`jp text-[44px] leading-none ${accent ? "text-accent" : ""}`}>
        {jp}
      </div>
      <div className="mt-2 font-serif text-lg">{en}</div>
      <p className="mt-2 text-sm text-ink-2">{body}</p>
    </div>
  );
}

function PricingCard({
  name,
  price,
  cadence,
  features,
  cta,
  featured,
  tag,
}: {
  name: string;
  price: string;
  cadence: string;
  features: string[];
  cta: string;
  featured?: boolean;
  tag?: string;
}) {
  return (
    <Card
      tone={featured ? "paper" : "raised"}
      className={`relative flex h-full flex-col ${
        featured ? "border-2 border-accent shadow-md" : ""
      }`}
    >
      {tag && (
        <span className="absolute -top-3 left-4 rounded-full bg-accent px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-[#fff7ec]">
          {tag}
        </span>
      )}
      <div className="font-serif text-xl">{name}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-serif text-3xl">{price}</span>
        <span className="mono text-xs text-ink-3">{cadence}</span>
      </div>
      <ul className="mt-5 space-y-2 text-sm text-ink-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <span className="text-accent">·</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Link href="/start" className="mt-auto pt-6">
        <Button
          variant={featured ? "primary" : "secondary"}
          className="w-full"
        >
          {cta} →
        </Button>
      </Link>
    </Card>
  );
}
