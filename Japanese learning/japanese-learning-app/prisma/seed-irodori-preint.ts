/**
 * Seeds grammar points for Irodori Pre-Intermediate (A2/B1) lessons.
 *
 * - Creates any missing Lesson rows (L1–L18) under the "Irodori · Pre-Intermediate" course.
 * - Fixes corrupt/placeholder titles for existing rows.
 * - Seeds GrammarPoint + ExampleSentence records.
 * - Idempotent: skips lessons that already have grammar.
 *
 * Run: npm run db:seed:irodori-preint
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

async function main() {
  const data: ParsedLesson[] = JSON.parse(
    fs.readFileSync(
      path.join("scripts/data/irodori/parsed-preint.json"),
      "utf8"
    )
  );

  // Find (or create) the course
  let course = await prisma.course.findFirst({
    where: { title: "Irodori · Pre-Intermediate" },
  });
  if (!course) {
    course = await prisma.course.create({
      data: {
        title: "Irodori · Pre-Intermediate",
        level: "A2/B1",
        description: "Japan Foundation Irodori Pre-Intermediate course.",
      },
    });
    console.log(`Created course: ${course.title}`);
  }

  let createdLessons = 0;
  let updatedLessons = 0;
  let seededGP = 0;
  let seededEx = 0;
  let skipped = 0;

  for (const pl of data) {
    // Find or create the lesson row
    let lesson = await prisma.lesson.findFirst({
      where: { courseId: course.id, number: pl.lessonNumber },
      include: { _count: { select: { grammarPoints: true } } },
    });

    if (!lesson) {
      lesson = await prisma.lesson.create({
        data: {
          courseId: course.id,
          number: pl.lessonNumber,
          titleJp: pl.titleJp,
          titleEn: pl.titleEn ?? pl.titleJp,
          framework: "irodori-preint",
          canDo: pl.canDo ?? null,
        },
        include: { _count: { select: { grammarPoints: true } } },
      });
      createdLessons++;
      console.log(`  Created L${pl.lessonNumber}: ${pl.titleJp}`);
    } else {
      // Fix corrupt title if needed
      const titleIsCorrupt =
        !lesson.titleJp ||
        lesson.titleJp.includes("第　") ||
        lesson.titleJp.includes("Focus on") ||
        lesson.titleJp.includes("about life in Japan") ||
        lesson.titleJp === "Topic";
      if (titleIsCorrupt) {
        await prisma.lesson.update({
          where: { id: lesson.id },
          data: {
            titleJp: pl.titleJp,
            titleEn: pl.titleEn ?? pl.titleJp,
            framework: "irodori-preint",
            canDo: pl.canDo ?? null,
          },
        });
        updatedLessons++;
        console.log(`  Fixed L${pl.lessonNumber}: ${pl.titleJp}`);
      }

      // Skip if already has grammar
      if ((lesson as any)._count.grammarPoints > 0) {
        console.log(
          `  L${pl.lessonNumber} already has grammar — skipping`
        );
        skipped++;
        continue;
      }
    }

    // Seed grammar points — use 1-based sequential index so duplicate
    // marker symbols (e.g. two ➌ when 文法ノート restarts numbering) don't
    // violate the (lessonId, order) unique constraint.
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

    console.log(
      `  Seeded L${pl.lessonNumber}: ${pl.titleJp} — ${pl.grammarPoints.length} GPs`
    );
  }

  console.log(
    `\nDone. Created ${createdLessons} lessons, fixed ${updatedLessons} titles, ` +
      `skipped ${skipped}, seeded ${seededGP} grammar points + ${seededEx} examples.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
