import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { prisma } from "@/lib/db";
import { isValidLevel, JLPT, type JLPTLevel, type SectionKey } from "@/lib/jlpt";
import { SectionPractice } from "./SectionPractice";

export const dynamic = "force-dynamic";
export const metadata = { title: "JLPT practice · Nihongo" };

const VALID_SECTIONS = new Set<SectionKey>(["vocab", "grammar", "reading", "listening"]);
const QUESTIONS_PER_ROUND = 12;
const DISTRACTORS = 3; // 4-choice MCQ

type SearchParams = { level?: string; mode?: "practice" | "mock" };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { section } = await params;
  const sp = (await searchParams) ?? {};

  if (!VALID_SECTIONS.has(section as SectionKey)) {
    return <StubPage title="Unknown section" body="That section doesn't exist." />;
  }

  const level: JLPTLevel = isValidLevel(sp.level) ? sp.level : "N5";
  const mode = sp.mode === "mock" ? "mock" : "practice";
  const cfg = JLPT[level];
  const sectionCfg = cfg.sections.find((s) => s.key === section)!;

  // Only "vocab" → kanji-meaning is content-backed today.
  if (section !== "vocab") {
    return (
      <StubPage
        title={`${cfg.title} · ${sectionCfg.en}`}
        level={level}
        body={
          section === "listening"
            ? `Listening practice for ${level} is on the roadmap — we need to source audio with licence-clean transcripts. In the meantime, shadow an NHK Easy clip in the news section.`
            : `${sectionCfg.en} practice for ${level} isn't seeded yet. The fastest unblock is the AI tutor — ask for ${sectionCfg.en.toLowerCase()} drills at ${level} and it will generate examples grounded in the JLPT pattern list.`
        }
        cta={
          section === "listening"
            ? { href: "/nhk", label: "open NHK Easy →" }
            : { href: `/tutor?level=${level}`, label: `ask the ${level} tutor →` }
        }
      />
    );
  }

  // Pull a pool of kanji at this level, plus a pool of "other-level" distractors
  // to fill choices when same-level meanings are too similar/repeating.
  const pool = await prisma.kanji.findMany({
    where: { jlptLevel: level, meaning: { not: null } },
    select: { id: true, character: true, meaning: true, onYomi: true, kunYomi: true },
  });

  if (pool.length < 6) {
    return (
      <StubPage
        title={`${level} · ${sectionCfg.en}`}
        level={level}
        body={`We only have ${pool.length} kanji rows at ${level} in this database, which isn't enough for a fair MCQ round. Try a different level — N1 and N5 have the largest pools.`}
        cta={{ href: `/jlpt?level=${level}`, label: "back to JLPT prep" }}
      />
    );
  }

  // Build N questions: shuffle pool, take first N, build 4-choice MCQ with
  // distractors drawn from the rest of the pool (same level → harder).
  const shuffled = shuffle(pool);
  const items = shuffled.slice(0, Math.min(QUESTIONS_PER_ROUND, shuffled.length));
  const distractorBank = shuffled.slice(items.length);

  const questions = items.map((it) => {
    // 3 unique wrong meanings — different from `it.meaning`, deduped.
    const others = pickDistinct(
      distractorBank
        .map((x) => x.meaning)
        .filter((m): m is string => !!m && m !== it.meaning),
      DISTRACTORS,
    );
    const choices = shuffle([it.meaning as string, ...others]);
    return {
      id: it.id,
      character: it.character,
      onYomi: it.onYomi,
      kunYomi: it.kunYomi,
      correct: it.meaning as string,
      choices,
    };
  });

  return (
    <AppShell active="jlpt">
      <SectionPractice
        level={level}
        section={section}
        sectionEn={sectionCfg.en}
        sectionJp={sectionCfg.jp}
        mode={mode}
        timeMin={mode === "mock" ? sectionCfg.timeMin : null}
        questions={questions}
      />
    </AppShell>
  );
}

function StubPage({
  title,
  level,
  body,
  cta,
}: {
  title: string;
  level?: JLPTLevel;
  body: string;
  cta?: { href: string; label: string };
}) {
  return (
    <AppShell active="jlpt">
      <header className="border-b border-ink-3/40 px-6 py-5 md:px-8">
        <div className="eyebrow">JLPT PREP · PRACTICE</div>
        <h1 className="font-serif text-2xl md:text-[28px]">{title}</h1>
      </header>
      <div className="p-6 md:p-8">
        <Card tone="raised" className="max-w-2xl">
          <div className="flex items-center gap-2">
            {level && <Chip>{level}</Chip>}
            <Chip tone="gold">content gated</Chip>
          </div>
          <p className="mt-3 text-base text-ink-2">{body}</p>
          <div className="mt-5 flex gap-3">
            {cta && (
              <Link href={cta.href}>
                <Button>{cta.label}</Button>
              </Link>
            )}
            <Link href="/jlpt">
              <Button variant="ghost">← JLPT prep</Button>
            </Link>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickDistinct<T>(arr: T[], n: number): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const x of shuffle(arr)) {
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
    if (out.length >= n) break;
  }
  return out;
}
