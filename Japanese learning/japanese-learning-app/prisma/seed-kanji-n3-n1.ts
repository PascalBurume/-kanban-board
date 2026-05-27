/**
 * Seeds JLPT N3, N2, N1 kanji — characters, meanings, readings, stroke counts,
 * and KanjiVG stroke-order paths (where available).
 *
 * - Creates a "JLPT Nx" course + single lesson for each level if not present.
 * - Upserts every kanji so the script is safe to re-run.
 *
 * Run: npm run db:seed:kanji-n3-n1
 */

import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

interface KanjiRow {
  char: string;
  strokes?: number;
  meanings?: string[];
  readings_on?: string[];
  readings_kun?: string[];
  jlpt_new?: number;
}

async function ensureLevelLesson(courseTitle: string, level: string) {
  let course = await prisma.course.findFirst({ where: { title: courseTitle } });
  if (!course) {
    course = await prisma.course.create({
      data: { title: courseTitle, level, lessonStart: 1, lessonEnd: 1 },
    });
  }
  let lesson = await prisma.lesson.findFirst({
    where: { courseId: course.id, number: 1 },
  });
  if (!lesson) {
    lesson = await prisma.lesson.create({
      data: {
        courseId: course.id,
        number: 1,
        titleEn: `${level} core`,
        titleJp: level,
        section: "JLPT core list",
      },
    });
  }
  return lesson;
}

async function main() {
  const kanjivg = fs.existsSync("scripts/data/kanjivg.json")
    ? (JSON.parse(
        fs.readFileSync("scripts/data/kanjivg.json", "utf8")
      ) as Record<string, { paths: string[]; viewBox: string }>)
    : {};

  for (const lvl of ["n3", "n2", "n1"] as const) {
    const p = path.join("scripts/data", `kanji-${lvl}.json`);
    if (!fs.existsSync(p)) {
      console.log(`skip ${lvl}: file missing — run extract-n3-n1-kanji.mjs first`);
      continue;
    }

    const rows = JSON.parse(fs.readFileSync(p, "utf8")) as KanjiRow[];
    const lesson = await ensureLevelLesson(
      `JLPT ${lvl.toUpperCase()}`,
      lvl.toUpperCase()
    );

    let seeded = 0;
    for (const k of rows) {
      const vg = kanjivg[k.char];
      const data = {
        lessonId: lesson.id,
        character: k.char,
        meaning: (k.meanings || []).slice(0, 3).join(", "),
        onYomi: (k.readings_on || []).join(", "),
        kunYomi: (k.readings_kun || []).join(", "),
        strokes: k.strokes ?? null,
        jlptLevel: lvl.toUpperCase(),
        strokesSvg: vg ? JSON.stringify(vg) : null,
      };
      await prisma.kanji.upsert({
        where: { character: k.char },
        create: data,
        update: data,
      });
      seeded++;
    }

    const withSvg = rows.filter((k) => !!kanjivg[k.char]).length;
    console.log(
      `${lvl.toUpperCase()}: ${seeded} kanji seeded (${withSvg} with stroke SVG)`
    );
  }

  console.log("\nDone.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
