import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Chip, Pill } from "@/components/ui/Chip";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/me";
import { JLPT_LEVELS, type JlptLevel } from "@/lib/ai/client";
import { LessonPlayer } from "./LessonPlayer";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}) {
  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) return { title: "Lesson · Nihongo" };
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    select: { titleEn: true },
  });
  return { title: lesson ? `${lesson.titleEn} · Nihongo` : "Lesson · Nihongo" };
}

export default async function LessonPage({
  params,
}: {
  params: { id: string };
}) {
  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) notFound();
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    include: {
      course: true,
      grammarPoints: {
        orderBy: { order: "asc" },
        include: { examples: true },
      },
      vocabulary: { take: 12 },
      kanji: { take: 8 },
      cultureNotes: true,
    },
  });
  if (!lesson) notFound();

  const isIrodori = lesson.framework?.startsWith("irodori");

  const user = await getCurrentUser();
  const userLevel: JlptLevel = (JLPT_LEVELS as readonly string[]).includes(
    user.level ?? "",
  )
    ? (user.level as JlptLevel)
    : "N5";

  return (
    <AppShell active="lessons">
      <header className="border-b border-ink-3/40 px-6 py-4 md:px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/lessons" className="text-ink-2 hover:text-ink">
              ← back
            </Link>
            <div>
              <div className="mono text-[10px] text-ink-3">
                {lesson.course.title} · LESSON {String(lesson.number).padStart(2, "0")}
                {lesson.topicJp && (
                  <span className="ml-2 jp">{lesson.topicJp}</span>
                )}
              </div>
              <h1 className="font-serif text-xl jp">
                {lesson.titleJp || lesson.titleEn}
              </h1>
              {lesson.titleEn && lesson.titleEn !== lesson.titleJp && (
                <p className="text-sm text-ink-2 italic">{lesson.titleEn}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Chip tone="accent">{lesson.course.level}</Chip>
            <Pill>{lesson.grammarPoints.length} grammar</Pill>
            {lesson.cultureNotes.length > 0 && (
              <Pill tone="moss">{lesson.cultureNotes.length} TIPS</Pill>
            )}
          </div>
        </div>

        {lesson.canDo && (
          <div className="mt-3 rounded-md border border-moss/40 bg-moss/10 px-3 py-2 text-sm text-moss">
            <span className="mono text-[10px] mr-2">▣ TODAY YOU&apos;LL BE ABLE TO</span>
            {lesson.canDo}
          </div>
        )}
      </header>

      <LessonPlayer
        points={lesson.grammarPoints.map((g) => ({
          id: g.id,
          title: g.title,
          pattern: g.pattern,
          explanation: g.explanation,
          explanationJp: g.explanationJp,
          examples: g.examples.map((e) => ({
            jp: e.jp,
            romaji: e.romaji ?? "",
            en: e.en ?? "",
          })),
        }))}
        vocab={lesson.vocabulary.map((v) => ({
          kana: v.kana,
          kanji: v.kanji,
          english: v.english,
        }))}
        kanji={lesson.kanji.map((k) => ({
          character: k.character,
          meaning: k.meaning,
        }))}
        cultureNotes={lesson.cultureNotes.map((cn) => ({
          titleJp: cn.title,
          titleEn: cn.titleEn,
          body: cn.body,
          bodyEn: cn.bodyEn,
        }))}
        userLevel={userLevel}
      />

      {isIrodori && lesson.attributionHtml && (
        <footer className="mt-8 border-t border-dashed border-ink-3/40 px-6 py-4 text-xs text-ink-3 md:px-8">
          <div
            className="mono"
            // attributionHtml is author-controlled (seeded constant), safe to render
            dangerouslySetInnerHTML={{ __html: lesson.attributionHtml }}
          />
        </footer>
      )}
    </AppShell>
  );
}
