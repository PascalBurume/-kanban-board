/**
 * Seeds GrammarPoint + ExampleSentence rows for irodori-starter and irodori-elem2
 * from scripts/data/irodori/parsed-grammar.json.
 *
 * Idempotent: skips lessons that already have grammar points.
 * Does NOT clear existing data — safe to run alongside seed-irodori-preint.ts.
 *
 * Run: npm run db:seed:irodori-grammar
 *   (requires parsed-grammar.json — run `node scripts/parse-irodori-grammar.mjs` first)
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
  pattern: string | null;
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

const COURSE_META: Record<string, { title: string; level: string }> = {
  "irodori-starter": { title: "Irodori · Starter", level: "A1" },
  "irodori-elem2":   { title: "Irodori · Elementary 2", level: "A2" },
};

const CORRUPT_FRAGMENTS = ["第　", "Focus on", "about life in Japan"];

function isTitleCorrupt(title: string | null): boolean {
  if (!title) return true;
  if (title === "Topic" || title === "だい" || title === "せんしゅう") return true;
  return CORRUPT_FRAGMENTS.some((f) => title.includes(f));
}

async function main() {
  const dataPath = path.join("scripts/data/irodori/parsed-grammar.json");
  if (!fs.existsSync(dataPath)) {
    console.error(
      "parsed-grammar.json not found — run `node scripts/parse-irodori-grammar.mjs` first"
    );
    process.exit(1);
  }

  const data: ParsedLesson[] = JSON.parse(fs.readFileSync(dataPath, "utf8"));

  // Group by framework
  const byFw: Record<string, ParsedLesson[]> = {};
  for (const pl of data) {
    (byFw[pl.framework] ||= []).push(pl);
  }

  let createdLessons = 0;
  let updatedLessons = 0;
  let seededGP       = 0;
  let seededEx       = 0;
  let skipped        = 0;

  for (const [framework, lessons] of Object.entries(byFw)) {
    const meta = COURSE_META[framework];
    if (!meta) {
      console.warn(`Unknown framework "${framework}" — skipping`);
      continue;
    }

    // Find or create the course
    let course = await prisma.course.findFirst({ where: { title: meta.title } });
    if (!course) {
      course = await prisma.course.create({
        data: { title: meta.title, level: meta.level },
      });
      console.log(`Created course: ${course.title}`);
    }

    console.log(`\n[${framework}] ${lessons.length} lessons → "${meta.title}"`);

    for (const pl of lessons.sort((a, b) => a.lessonNumber - b.lessonNumber)) {
      // Find or create the lesson row
      let lesson = await prisma.lesson.findFirst({
        where: { courseId: course.id, number: pl.lessonNumber },
        include: { _count: { select: { grammarPoints: true } } },
      });

      if (!lesson) {
        lesson = await prisma.lesson.create({
          data: {
            courseId: course.id,
            number:   pl.lessonNumber,
            titleJp:  pl.titleJp,
            titleEn:  pl.titleEn ?? pl.titleJp,
            framework,
            canDo:    pl.canDo ?? null,
          },
          include: { _count: { select: { grammarPoints: true } } },
        });
        createdLessons++;
        console.log(`  Created  L${pl.lessonNumber}: ${pl.titleJp}`);
      } else {
        // Fix corrupt/placeholder titles
        if (isTitleCorrupt(lesson.titleJp)) {
          await prisma.lesson.update({
            where: { id: lesson.id },
            data: {
              titleJp:  pl.titleJp,
              titleEn:  pl.titleEn ?? pl.titleJp,
              framework,
              canDo:    pl.canDo ?? null,
            },
          });
          updatedLessons++;
          console.log(`  Fixed    L${pl.lessonNumber}: ${pl.titleJp}`);
        }

        if ((lesson as any)._count.grammarPoints > 0) {
          console.log(`  Skipped  L${pl.lessonNumber} (already has grammar)`);
          skipped++;
          continue;
        }
      }

      // Seed grammar points using 1-based sequential index to avoid
      // (lessonId, order) unique constraint violations from repeated
      // marker symbols across 文法ノート sections.
      for (const [idx, gp] of pl.grammarPoints.entries()) {
        const created = await prisma.grammarPoint.create({
          data: {
            lessonId:    lesson.id,
            order:       idx + 1,
            title:       gp.title,
            pattern:     gp.pattern ?? null,
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

      console.log(
        `  Seeded   L${pl.lessonNumber}: ${pl.titleJp} — ${pl.grammarPoints.length} GPs`
      );
    }
  }

  console.log(
    `\nDone. Created ${createdLessons} lessons, fixed ${updatedLessons} titles, ` +
      `skipped ${skipped}, seeded ${seededGP} grammar points + ${seededEx} examples.`
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
