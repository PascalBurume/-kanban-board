import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { Chip, Pill } from "@/components/ui/Chip";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lessons · Nihongo" };

// Visual tone for framework chips — Irodori = moss, Genki = indigo,
// Shin Kanzen = gold, anything else = neutral.
function frameworkTone(
  framework: string | null
): "moss" | "indigo" | "gold" | "neutral" {
  if (!framework) return "indigo";
  if (framework.startsWith("irodori")) return "moss";
  if (framework.startsWith("shinkanzen")) return "gold";
  if (framework === "genki") return "indigo";
  return "neutral";
}

function frameworkLabel(framework: string | null): string {
  if (!framework) return "Genki";
  if (framework === "irodori-starter") return "JF · Starter";
  if (framework === "irodori-elem1") return "JF · Elem 1";
  if (framework === "irodori-elem2") return "JF · Elem 2";
  if (framework === "irodori-preint") return "JF · Pre-Int";
  if (framework === "irodori-intermediate") return "JF · Intermediate";
  if (framework === "shinkanzen-n2") return "Shin Kanzen N2";
  if (framework === "shinkanzen-n1") return "Shin Kanzen N1";
  if (framework === "genki") return "Genki";
  return framework;
}

const FRAMEWORKS = [
  { key: null, label: "All curricula" },
  { key: "irodori-starter", label: "Irodori Starter (A1)" },
  { key: "irodori-elem1", label: "Irodori Elementary 1 (A2)" },
  { key: "irodori-elem2", label: "Irodori Elementary 2 (A2)" },
  { key: "irodori-preint", label: "Irodori Pre-Intermediate (A2/B1)" },
  { key: "genki", label: "Genki" },
] as const;

export default async function LessonsPage({
  searchParams,
}: {
  searchParams?: { framework?: string };
}) {
  const fwFilter = searchParams?.framework;

  const courses = await prisma.course.findMany({
    where: { title: { not: "AI Generated" } },
    include: {
      lessons: {
        orderBy: { number: "asc" },
        where: fwFilter ? { framework: fwFilter } : undefined,
        include: {
          _count: {
            select: { grammarPoints: true, vocabulary: true, kanji: true },
          },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  // Filter out PDF-artifact lesson titles that crept in from imperfect parsing:
  // "第　  　　課" (bare chapter-header), "Topic" (▶トピック marker), and long
  // English boilerplate sentences from intro/appendix pages.
  const CORRUPT_TITLE_FRAGMENTS = ["第　", "Focus on", "about life in Japan"];
  function isValidLesson(l: {
    titleJp: string | null;
    titleEn: string | null;
    framework: string | null;
    _count: { grammarPoints: number };
  }) {
    const t = l.titleJp ?? l.titleEn ?? "";
    if (t === "Topic") return false;
    if (CORRUPT_TITLE_FRAGMENTS.some((f) => t.includes(f))) return false;
    // Hide any Irodori lesson that hasn't been seeded with grammar yet
    // (catches parsing artifacts like L1 "だい" in Starter and empty
    // Elementary/Pre-Int lessons whose grammar hasn't been ingested from Grammar_all.md)
    if (l.framework?.startsWith("irodori-") && l._count.grammarPoints === 0) return false;
    return true;
  }

  const filteredCourses = courses
    .map((c) => ({ ...c, lessons: c.lessons.filter(isValidLesson) }))
    .filter((c) => c.lessons.length > 0);

  // True when lessons exist for the active filter but all were hidden (grammar not yet seeded).
  // Distinct from "DB is empty" so we can show a better message.
  const allLessonsFiltered =
    filteredCourses.length === 0 &&
    courses.some((c) =>
      c.lessons.some((l) => !fwFilter || l.framework === fwFilter)
    );

  return (
    <AppShell active="lessons">
      <header className="border-b border-ink-3/40 px-6 py-5 md:px-8">
        <div className="eyebrow">CURRICULUM</div>
        <h1 className="font-serif text-2xl md:text-[28px]">Lessons</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Genki-aligned grammar plus the Japan Foundation&apos;s{" "}
          <em>Irodori</em> task-based curriculum from absolute beginner through
          intermediate.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {FRAMEWORKS.map((fw) => {
            const active =
              (fwFilter ?? "") === (fw.key ?? "") ||
              (!fwFilter && fw.key === null);
            return (
              <Link
                key={fw.key ?? "all"}
                href={fw.key ? `/lessons?framework=${fw.key}` : "/lessons"}
                className={`mono rounded-sm border px-2.5 py-1 text-xs ${
                  active
                    ? "border-accent bg-accent text-[#fff7ec]"
                    : "border-ink-3/60 bg-paper text-ink-2 hover:border-accent"
                }`}
              >
                {fw.label}
              </Link>
            );
          })}
        </div>
      </header>

      <div className="space-y-10 p-6 md:p-8">
        {filteredCourses.length === 0 && allLessonsFiltered && (
          <Card tone="raised">
            <div className="mono text-[10px] text-ink-3 mb-1">COMING SOON</div>
            <p className="text-sm text-ink-2">
              Grammar notes for this curriculum are being added. In the
              meantime, try{" "}
              <Link
                href="/lessons?framework=irodori-starter"
                className="text-accent hover:underline"
              >
                Irodori Starter
              </Link>{" "}
              or{" "}
              <Link
                href="/lessons?framework=genki"
                className="text-accent hover:underline"
              >
                Genki
              </Link>
              .
            </p>
          </Card>
        )}
        {filteredCourses.length === 0 && !allLessonsFiltered && (
          <Card tone="raised">
            <p className="text-sm">
              No content yet. Run{" "}
              <code className="mono rounded bg-paper-3 px-1.5 py-0.5">
                npm run db:reset
              </code>{" "}
              to seed Genki + JLPT lists, then{" "}
              <code className="mono rounded bg-paper-3 px-1.5 py-0.5">
                npm run data:irodori && npm run db:seed:irodori
              </code>{" "}
              for Irodori.
            </p>
          </Card>
        )}
        {filteredCourses.map((c) => (
          <section key={c.id}>
            <div className="flex items-baseline justify-between border-b border-dashed border-ink-3/40 pb-2">
              <h2 className="font-serif text-xl">
                {c.title}{" "}
                <span className="text-ink-3 text-sm">· {c.level}</span>
              </h2>
              <span className="mono text-xs text-ink-3">
                {c.lessons.length} lessons
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {c.lessons.map((l) => (
                <Link key={l.id} href={`/lessons/${l.id}`}>
                  <Card
                    tone="paper"
                    className="h-full transition-shadow hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="mono text-[10px] text-ink-3">
                          LESSON {String(l.number).padStart(2, "0")}
                        </div>
                        <div className="mt-1 font-serif text-[17px]">
                          {l.titleEn === l.titleJp || !l.titleEn
                            ? l.titleJp || `Lesson ${l.number}`
                            : l.titleEn}
                        </div>
                        {l.titleJp && l.titleEn !== l.titleJp && (
                          <div className="jp text-sm text-ink-2">{l.titleJp}</div>
                        )}
                        {l.topicJp && (
                          <div className="mono mt-1 text-[10px] text-ink-3">
                            {l.topicJp}
                          </div>
                        )}
                      </div>
                      <Chip tone={frameworkTone(l.framework)}>
                        {frameworkLabel(l.framework)}
                      </Chip>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                      <Pill>{l._count.grammarPoints} grammar</Pill>
                      <Pill>{l._count.vocabulary} vocab</Pill>
                      <Pill>{l._count.kanji} kanji</Pill>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
