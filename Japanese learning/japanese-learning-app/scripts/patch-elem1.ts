/**
 * One-shot patch for Irodori Elementary 1 (初級1) — the only Elementary 1
 * data extractable from X_all_Elementary_1_compressed.md:
 *
 *   L1  – update canDo + titleEn from the Can-do チェック section
 *   L2  – create (missing from DB), set title + canDo
 *   L4  – fix corrupt title ("第　  　　課") — no clean replacement found,
 *          but we know L4 of 初級1 does not match the Starter title, so we
 *          leave it until a proper source is available; just clear the
 *          corrupt marker so it doesn't look broken.
 *
 * Run:  npx tsx scripts/patch-elem1.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ATTRIBUTION_HTML =
  `© The Japan Foundation · adapted from <em>Irodori: Japanese for Life in Japan</em>, freely available at <a href="https://www.irodori.jpf.go.jp" rel="noopener">irodori.jpf.go.jp</a>.`;
const ATTRIBUTION_URL = "https://www.irodori.jpf.go.jp";

const PATCHES = [
  {
    number: 1,
    titleJp: "レストランで働いています",
    titleEn: "I work in a restaurant.",
    // 3rd activity Can-do — most on-topic for lesson title
    canDo: "日本でしている仕事について、簡単に話すことができる。",
  },
  {
    number: 2,
    titleJp: "ゲームをするのが好きです",
    titleEn: "I like playing video games.",
    canDo: "趣味や好きなことについて、簡単に話すことができる。",
  },
];

async function main() {
  const course = await prisma.course.findFirst({
    where: { title: "Irodori · Elementary 1" },
  });
  if (!course) {
    console.error("Course 'Irodori · Elementary 1' not found — has it been seeded?");
    process.exit(1);
  }
  console.log(`Found course: ${course.title} (id=${course.id})`);

  for (const p of PATCHES) {
    const existing = await prisma.lesson.findFirst({
      where: { courseId: course.id, number: p.number },
    });

    if (!existing) {
      await prisma.lesson.create({
        data: {
          courseId: course.id,
          number: p.number,
          titleJp: p.titleJp,
          titleEn: p.titleEn,
          framework: "irodori-elem1",
          canDo: p.canDo,
          attributionHtml: ATTRIBUTION_HTML,
          attributionUrl: ATTRIBUTION_URL,
        },
      });
      console.log(`  Created L${p.number}: ${p.titleJp}`);
    } else {
      await prisma.lesson.update({
        where: { id: existing.id },
        data: {
          titleJp: p.titleJp,
          titleEn: p.titleEn,
          framework: "irodori-elem1",
          canDo: p.canDo,
          attributionHtml: existing.attributionHtml ?? ATTRIBUTION_HTML,
          attributionUrl: existing.attributionUrl ?? ATTRIBUTION_URL,
        },
      });
      console.log(`  Updated L${p.number}: ${p.titleJp}`);
    }
  }

  // Fix the corrupt L4 title — strip the placeholder so it at least has
  // an empty-but-not-broken title until the real source is available.
  const l4 = await prisma.lesson.findFirst({
    where: { courseId: course.id, number: 4 },
  });
  if (l4 && (l4.titleJp?.includes("第　") || l4.titleJp === "第　  　　課")) {
    await prisma.lesson.update({
      where: { id: l4.id },
      data: { titleJp: "（初級1 第4課）", titleEn: "Elementary 1 Lesson 4" },
    });
    console.log("  Fixed corrupt L4 title");
  }

  console.log("\nDone.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
