/**
 * Seeds Irodori Starter (A1) and Elementary 2 (A2) lessons from
 * scripts/data/irodori/parsed-elem.json.
 *
 * Idempotent:
 *   - Finds or creates the course for each framework.
 *   - Finds or creates each lesson by (courseId, number).
 *   - Fixes corrupt/placeholder titles (e.g. "第　 　　課", "Topic", "だい")
 *     left over from the original parse.
 *   - Skips lessons that already have grammar points.
 *   - Persists 日本の生活TIPS as CultureNote rows when none exist yet.
 *
 * Run: npm run db:seed:irodori-elem
 */

import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

interface ParsedExample {
  jp: string;
  en: string | null;
}
interface ParsedGP {
  order: number;
  title: string;
  pattern: string;
  explanation: string | null;
  examples: ParsedExample[];
}
interface ParsedLesson {
  framework: string;
  lessonNumber: number;
  titleJp: string;
  titleEn: string | null;
  canDo: string | null;
  cultureNotes: string[];
  grammarPoints: ParsedGP[];
}

const FRAMEWORK_COURSE: Record<string, { title: string; level: string; range: [number, number] }> = {
  "irodori-starter": { title: "Irodori · Starter", level: "A1", range: [1, 18] },
  "irodori-elem2": { title: "Irodori · Elementary 2", level: "A2", range: [1, 18] },
};

const ATTRIBUTION_HTML = `© The Japan Foundation · adapted from <em>Irodori: Japanese for Life in Japan</em>, freely available at <a href="https://www.irodori.jpf.go.jp" rel="noopener">irodori.jpf.go.jp</a>.`;
const ATTRIBUTION_URL = "https://www.irodori.jpf.go.jp";

function isCorruptTitle(t: string | null | undefined): boolean {
  if (!t) return true;
  return (
    t.includes("第　") ||
    t.includes("Focus on") ||
    t === "Topic" ||
    t === "だい" ||
    t.startsWith("第 ") ||
    t.length < 2
  );
}

async function main() {
  const data: ParsedLesson[] = JSON.parse(
    fs.readFileSync(path.join("scripts/data/irodori/parsed-elem.json"), "utf8"),
  );

  let createdLessons = 0;
  let updatedLessons = 0;
  let seededGP = 0;
  let seededEx = 0;
  let seededTips = 0;
  let skipped = 0;

  // Group by framework so we set up the course once.
  const byFramework = new Map<string, ParsedLesson[]>();
  for (const pl of data) {
    if (!byFramework.has(pl.framework)) byFramework.set(pl.framework, []);
    byFramework.get(pl.framework)!.push(pl);
  }

  for (const [framework, lessons] of byFramework) {
    const meta = FRAMEWORK_COURSE[framework];
    if (!meta) {
      console.warn(`Unknown framework ${framework}, skipping`);
      continue;
    }

    let course = await prisma.course.findFirst({ where: { title: meta.title } });
    if (!course) {
      course = await prisma.course.create({
        data: {
          title: meta.title,
          level: meta.level,
          lessonStart: meta.range[0],
          lessonEnd: meta.range[1],
        },
      });
      console.log(`Created course: ${course.title}`);
    }

    for (const pl of lessons) {
      let lesson = await prisma.lesson.findFirst({
        where: { courseId: course.id, number: pl.lessonNumber },
        include: {
          _count: { select: { grammarPoints: true, cultureNotes: true } },
        },
      });

      if (!lesson) {
        lesson = await prisma.lesson.create({
          data: {
            courseId: course.id,
            number: pl.lessonNumber,
            titleJp: pl.titleJp,
            titleEn: pl.titleEn ?? pl.titleJp,
            framework,
            canDo: pl.canDo ?? null,
            attributionHtml: ATTRIBUTION_HTML,
            attributionUrl: ATTRIBUTION_URL,
          },
          include: {
            _count: { select: { grammarPoints: true, cultureNotes: true } },
          },
        });
        createdLessons++;
        console.log(`  Created ${framework} L${pl.lessonNumber}: ${pl.titleJp}`);
      } else if (
        isCorruptTitle(lesson.titleJp) ||
        !lesson.canDo ||
        !lesson.framework
      ) {
        await prisma.lesson.update({
          where: { id: lesson.id },
          data: {
            titleJp: pl.titleJp,
            titleEn: pl.titleEn ?? pl.titleJp,
            framework,
            canDo: lesson.canDo ?? pl.canDo ?? null,
            attributionHtml: lesson.attributionHtml ?? ATTRIBUTION_HTML,
            attributionUrl: lesson.attributionUrl ?? ATTRIBUTION_URL,
          },
        });
        updatedLessons++;
        console.log(`  Fixed ${framework} L${pl.lessonNumber}: ${pl.titleJp}`);
      }

      // Seed grammar points if none exist
      const gpCount = (lesson as any)._count.grammarPoints;
      if (gpCount === 0 && pl.grammarPoints.length > 0) {
        for (const [idx, gp] of pl.grammarPoints.entries()) {
          const created = await prisma.grammarPoint.create({
            data: {
              lessonId: lesson.id,
              order: idx + 1,
              title: gp.title,
              pattern: gp.pattern,
              explanation: gp.explanation ?? null,
            },
          });
          seededGP++;
          for (const ex of gp.examples) {
            await prisma.exampleSentence.create({
              data: {
                grammarPointId: created.id,
                jp: ex.jp,
                en: ex.en ?? null,
              },
            });
            seededEx++;
          }
        }
      } else if (gpCount > 0) {
        skipped++;
      }

      // Seed culture notes (TIPS) if none exist
      const cnCount = (lesson as any)._count.cultureNotes;
      if (cnCount === 0 && pl.cultureNotes.length > 0) {
        for (const tip of pl.cultureNotes) {
          await prisma.cultureNote.create({
            data: { lessonId: lesson.id, title: tip },
          });
          seededTips++;
        }
      }
    }
  }

  console.log(
    `\nDone. Created ${createdLessons} lessons, fixed ${updatedLessons} titles, ` +
      `skipped ${skipped} lessons with existing grammar; ` +
      `seeded ${seededGP} grammar points + ${seededEx} examples + ${seededTips} TIPS.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
