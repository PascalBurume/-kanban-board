// Seeds Irodori lessons + culture notes from scripts/data/irodori/parsed-irodori.json.
//
// Run: tsx prisma/seed-irodori.ts  (or `npm run db:seed:irodori`)
//
// Idempotent: deletes prior irodori-* courses and re-inserts. Genki content is
// left intact.

import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

interface ParsedExample {
  jp: string;
  en: string | null;
}
interface ParsedGrammarPoint {
  order: number;
  title: string;
  pattern: string | null;
  examples: ParsedExample[];
  explanation: string;
  explanationJp: string;
}
interface ParsedLesson {
  framework: string;
  number: number;
  topicJp: string | null;
  titleJp: string | null;
  grammarPoints: ParsedGrammarPoint[];
}
interface ParsedTip {
  framework: string;
  lessonNumber: number;
  topicJp: string | null;
  chapterTitle: string | null;
  titleJp: string;
  titleEn: string | null;
  bodyEn: string;
  body: string;
}

const FRAMEWORK_LABEL: Record<string, { title: string; level: string; range: [number, number] }> = {
  "irodori-starter": { title: "Irodori · Starter", level: "A1", range: [1, 18] },
  "irodori-elem1": { title: "Irodori · Elementary 1", level: "A2", range: [1, 18] },
  "irodori-elem2": { title: "Irodori · Elementary 2", level: "A2", range: [1, 18] },
  "irodori-preint": { title: "Irodori · Pre-Intermediate", level: "A2/B1", range: [1, 24] },
  "irodori-intermediate": { title: "Irodori · Intermediate", level: "B1", range: [1, 24] },
};

const ATTRIBUTION_HTML = `© The Japan Foundation · adapted from <em>Irodori: Japanese for Life in Japan</em>, freely available at <a href="https://www.irodori.jpf.go.jp" rel="noopener">irodori.jpf.go.jp</a>.`;
const ATTRIBUTION_URL = "https://www.irodori.jpf.go.jp";

// Cleanup helper: drop pattern → split out trailing example sentence if any.
function splitPatternAndExample(pattern: string | null): {
  pattern: string | null;
  trailingExample: string | null;
} {
  if (!pattern) return { pattern, trailingExample: null };
  // If the pattern has a sentence terminator mid-string, split off the rest as
  // an example (e.g., "N1 はN2 ですトンです。" → pattern: "N1 はN2 です", ex: "トンです。")
  const m = pattern.match(/^(.+?(?:です|ます|ました|だ|る|ない))([一-鿿぀-ゟ゠-ヿ][^。]*[。！？])$/);
  if (m) {
    return { pattern: m[1].trim(), trailingExample: m[2].trim() };
  }
  return { pattern, trailingExample: null };
}

async function clearIrodori() {
  // Delete in FK-safe order: examples → grammar points → dialogues lines/dialogues →
  //   culture notes → lessons → courses.
  const courses = await prisma.course.findMany({
    where: { title: { startsWith: "Irodori" } },
    select: { id: true },
  });
  if (courses.length === 0) return;
  const courseIds = courses.map((c) => c.id);
  const lessons = await prisma.lesson.findMany({
    where: { courseId: { in: courseIds } },
    select: { id: true },
  });
  const lessonIds = lessons.map((l) => l.id);
  if (lessonIds.length) {
    const gps = await prisma.grammarPoint.findMany({
      where: { lessonId: { in: lessonIds } },
      select: { id: true },
    });
    const gpIds = gps.map((g) => g.id);
    if (gpIds.length) {
      await prisma.exampleSentence.deleteMany({
        where: { grammarPointId: { in: gpIds } },
      });
    }
    await prisma.grammarPoint.deleteMany({ where: { lessonId: { in: lessonIds } } });
    await prisma.cultureNote.deleteMany({ where: { lessonId: { in: lessonIds } } });
    const dialogues = await prisma.dialogue.findMany({
      where: { lessonId: { in: lessonIds } },
      select: { id: true },
    });
    const dialogueIds = dialogues.map((d) => d.id);
    if (dialogueIds.length) {
      await prisma.dialogueLine.deleteMany({
        where: { dialogueId: { in: dialogueIds } },
      });
    }
    await prisma.dialogue.deleteMany({ where: { lessonId: { in: lessonIds } } });
    await prisma.lessonProgress.deleteMany({
      where: { lessonId: { in: lessonIds } },
    });
    await prisma.lesson.deleteMany({ where: { id: { in: lessonIds } } });
  }
  await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
  console.log(`cleared ${courses.length} Irodori course(s)`);
}

async function seedLessons(lessons: ParsedLesson[]) {
  // Group by framework
  const byFw: Record<string, ParsedLesson[]> = {};
  for (const l of lessons) {
    (byFw[l.framework] ||= []).push(l);
  }

  let totalGp = 0;
  let totalEx = 0;
  let totalLessons = 0;

  for (const [framework, frameworkLessons] of Object.entries(byFw)) {
    const meta = FRAMEWORK_LABEL[framework];
    if (!meta) {
      console.warn(`unknown framework ${framework} — skipping`);
      continue;
    }
    const course = await prisma.course.create({
      data: {
        title: meta.title,
        level: meta.level,
        lessonStart: meta.range[0],
        lessonEnd: meta.range[1],
      },
    });

    for (const l of frameworkLessons.sort((a, b) => a.number - b.number)) {
      // Dedupe grammar points by `order` — the file's repeated page blocks
      // can yield the same marker more than once. Keep the richest version
      // (most examples + longest JP explanation).
      const byOrder = new Map<number, ParsedGrammarPoint>();
      for (const gp of l.grammarPoints) {
        const prev = byOrder.get(gp.order);
        const score = (g: ParsedGrammarPoint) =>
          g.examples.length * 10 + (g.explanationJp?.length || 0);
        if (!prev || score(gp) > score(prev)) byOrder.set(gp.order, gp);
      }
      l.grammarPoints = Array.from(byOrder.values()).sort(
        (a, b) => a.order - b.order
      );

      const lesson = await prisma.lesson.create({
        data: {
          courseId: course.id,
          number: l.number,
          titleJp: l.titleJp ?? null,
          titleEn: l.titleJp ?? `Lesson ${l.number}`, // EN title TBD — use JP as fallback
          section: l.topicJp ?? null,
          framework,
          topicJp: l.topicJp ?? null,
          topicEn: null,
          canDo: null,
          attributionHtml: ATTRIBUTION_HTML,
          attributionUrl: ATTRIBUTION_URL,
        },
      });
      totalLessons++;

      for (const gp of l.grammarPoints) {
        const { pattern, trailingExample } = splitPatternAndExample(gp.pattern);
        const created = await prisma.grammarPoint.create({
          data: {
            lessonId: lesson.id,
            order: gp.order,
            title: gp.title,
            pattern,
            explanation: gp.explanation || null,
            explanationJp: gp.explanationJp || null,
          },
        });
        totalGp++;

        const examples: ParsedExample[] = [];
        if (trailingExample) examples.push({ jp: trailingExample, en: null });
        for (const ex of gp.examples) examples.push(ex);

        for (const ex of examples) {
          await prisma.exampleSentence.create({
            data: {
              grammarPointId: created.id,
              jp: ex.jp,
              en: ex.en ?? null,
            },
          });
          totalEx++;
        }
      }
    }
    console.log(
      `${framework}: ${frameworkLessons.length} lessons → course #${course.id}`
    );
  }
  console.log(
    `seeded ${totalLessons} lessons · ${totalGp} grammar points · ${totalEx} examples`
  );
}

async function seedTips(tips: ParsedTip[]) {
  // Look up lessons by (framework, lessonNumber)
  let count = 0;
  for (const tip of tips) {
    if (!tip.framework || !tip.lessonNumber) continue;
    const lesson = await prisma.lesson.findFirst({
      where: { framework: tip.framework, number: tip.lessonNumber },
    });
    if (!lesson) continue;
    await prisma.cultureNote.create({
      data: {
        lessonId: lesson.id,
        title: tip.titleJp || tip.titleEn || "Note",
        titleEn: tip.titleEn,
        body: tip.body || null,
        bodyEn: tip.bodyEn || null,
      },
    });
    count++;
  }
  console.log(`seeded ${count} culture notes`);
}

async function main() {
  const parsedPath = path.join("scripts/data/irodori/parsed-irodori.json");
  if (!fs.existsSync(parsedPath)) {
    console.error("parsed-irodori.json missing — run `node scripts/parse-irodori.mjs` first");
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(parsedPath, "utf8")) as {
    lessons: ParsedLesson[];
    tips: ParsedTip[];
  };

  await clearIrodori();
  await seedLessons(data.lessons);
  await seedTips(data.tips);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
