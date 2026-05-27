// Seeds Genki I/II grammar for lessons 4–23 and fixes lesson titles.
// Idempotent: skips lessons that already have grammar points.
//
// Run: npx tsx prisma/seed-genki.ts   (or `npm run db:seed:genki`)

import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

interface RawExample {
  jp: string;
  romaji: string;
  en: string;
}
interface RawGP {
  lesson: number;
  order: number;
  title: string;
  pattern: string | null;
  explanation: string | null;
  examples: RawExample[];
}

// Proper lesson titles for Genki I (L1–L12) and Genki II (L13–L23).
// These are topic-based titles that match the Genki textbook chapter themes.
const LESSON_TITLES: Record<number, { titleEn: string; titleJp?: string }> = {
  1: { titleEn: "New Friends" },
  2: { titleEn: "Shopping" },
  3: { titleEn: "Making a Date" },
  4: { titleEn: "The First Date" },
  5: { titleEn: "A Trip to Okinawa" },
  6: { titleEn: "A Day in Robert's Life" },
  7: { titleEn: "Family Picture" },
  8: { titleEn: "Barbecue" },
  9: { titleEn: "Kabuki" },
  10: { titleEn: "Winter Vacation Plans" },
  11: { titleEn: "After the Vacation" },
  12: { titleEn: "Feeling Ill" },
  13: { titleEn: "Resolutions" },
  14: { titleEn: "Valentine's Day" },
  15: { titleEn: "A Trip to Nagano" },
  16: { titleEn: "Lost and Found" },
  17: { titleEn: "Greetings and Farewells" },
  18: { titleEn: "John's Part-time Job" },
  19: { titleEn: "Meeting the Boss" },
  20: { titleEn: "Toward a Healthy Life" },
  21: { titleEn: "Job Hunting" },
  22: { titleEn: "Planning the Future" },
  23: { titleEn: "Mankind and the Environment" },
};

async function main() {
  // Fix lesson titles for all Genki lessons that still say "Lesson N"
  const genki = await prisma.course.findMany({
    where: { title: { startsWith: "Genki" } },
    include: { lessons: { orderBy: { number: "asc" } } },
  });

  let titlesFixed = 0;
  for (const course of genki) {
    for (const lesson of course.lessons) {
      const meta = LESSON_TITLES[lesson.number];
      if (meta && (lesson.titleEn?.startsWith("Lesson ") || !lesson.titleEn)) {
        await prisma.lesson.update({
          where: { id: lesson.id },
          data: { titleEn: meta.titleEn, titleJp: meta.titleJp ?? lesson.titleJp ?? meta.titleEn },
        });
        titlesFixed++;
      }
    }
  }
  console.log(`Fixed ${titlesFixed} lesson titles`);

  // Ensure all Genki lessons have framework = "genki"
  // (lessons seeded before the framework column existed have framework = NULL)
  const fwResult = await prisma.lesson.updateMany({
    where: {
      course: { title: { startsWith: "Genki" } },
      framework: null,
    },
    data: { framework: "genki" },
  });
  console.log(`Set framework="genki" on ${fwResult.count} lessons`);

  // Load full grammar JSON (L1–L3 already in DB; L4–L23 new)
  const gpsL4Plus: RawGP[] = JSON.parse(
    fs.readFileSync(path.join("src/data/grammar-genki-l4-l23.json"), "utf8")
  );

  let totalGP = 0;
  let totalEx = 0;

  for (const course of genki) {
    for (const lesson of course.lessons) {
      const lessonGPs = gpsL4Plus.filter((g) => g.lesson === lesson.number);
      if (lessonGPs.length === 0) continue;

      // Check if already seeded
      const existingCount = await prisma.grammarPoint.count({
        where: { lessonId: lesson.id },
      });
      if (existingCount > 0) {
        console.log(`  L${lesson.number} already has ${existingCount} GPs — skipping`);
        continue;
      }

      for (const gp of lessonGPs.sort((a, b) => a.order - b.order)) {
        const created = await prisma.grammarPoint.create({
          data: {
            lessonId: lesson.id,
            order: gp.order,
            title: gp.title,
            pattern: gp.pattern ?? null,
            explanation: gp.explanation ?? null,
          },
        });
        totalGP++;

        for (const ex of gp.examples) {
          await prisma.exampleSentence.create({
            data: {
              grammarPointId: created.id,
              jp: ex.jp,
              romaji: ex.romaji ?? null,
              en: ex.en ?? null,
            },
          });
          totalEx++;
        }
      }
      console.log(`  Seeded L${lesson.number} (${lessonGPs.length} GPs)`);
    }
  }

  console.log(`\nTotal: ${totalGP} grammar points · ${totalEx} examples`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
