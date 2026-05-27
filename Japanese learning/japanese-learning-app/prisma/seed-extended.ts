// Extension seed — runs after the base seed (Genki content).
// Adds: JLPT N5 + N4 vocab, JLPT N5 + top-N4 kanji with KanjiVG stroke paths,
// sample NHK Easy clips, library resources, and a demo user with streak/XP.
//
// Usage: tsx prisma/seed-extended.ts
// Or:    npm run db:seed:extended

import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

type KanjiRow = {
  char: string;
  strokes: number;
  grade?: number;
  freq?: number;
  jlpt_new?: number;
  meanings: string[];
  readings_on: string[];
  readings_kun: string[];
};

function parseCsv(text: string): string[][] {
  // Simple CSV parser that handles quoted fields with embedded commas.
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        q = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') q = true;
      else if (c === ",") {
        cur.push(field);
        field = "";
      } else if (c === "\n") {
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = "";
      } else if (c !== "\r") {
        field += c;
      }
    }
  }
  if (field.length || cur.length) {
    cur.push(field);
    rows.push(cur);
  }
  return rows;
}

async function ensureLevelLesson(courseTitle: string, level: string) {
  let course = await prisma.course.findFirst({ where: { title: courseTitle } });
  if (!course) {
    course = await prisma.course.create({
      data: {
        title: courseTitle,
        level,
        lessonStart: 1,
        lessonEnd: 1,
      },
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

async function seedVocab() {
  for (const level of ["n5", "n4"] as const) {
    const p = path.join("scripts/data", `vocab-${level}.csv`);
    if (!fs.existsSync(p)) {
      console.log(`skip ${level}: file missing`);
      continue;
    }
    const rows = parseCsv(fs.readFileSync(p, "utf8"));
    rows.shift(); // header
    const lesson = await ensureLevelLesson(
      `JLPT ${level.toUpperCase()}`,
      level.toUpperCase()
    );

    const data: Array<{
      lessonId: number;
      kana: string;
      kanji: string | null;
      english: string;
      jlptLevel: string;
    }> = [];
    for (const r of rows) {
      const [expression, reading, meaning] = r;
      if (!expression || !reading) continue;
      const hasKanji = /[一-鿿]/.test(expression);
      data.push({
        lessonId: lesson.id,
        kana: reading,
        kanji: hasKanji ? expression : null,
        english: meaning,
        jlptLevel: level.toUpperCase(),
      });
    }
    // Avoid duplicating if we re-run
    await prisma.vocabulary.deleteMany({
      where: { jlptLevel: level.toUpperCase(), lessonId: lesson.id },
    });
    await prisma.vocabulary.createMany({ data });
    console.log(`vocab ${level}: +${data.length}`);
  }
}

async function seedKanji() {
  const kanjivg = fs.existsSync("scripts/data/kanjivg.json")
    ? (JSON.parse(
        fs.readFileSync("scripts/data/kanjivg.json", "utf8")
      ) as Record<string, { paths: string[]; viewBox: string }>)
    : {};

  for (const lvl of ["n5", "n4"] as const) {
    const p = path.join("scripts/data", `kanji-${lvl}.json`);
    if (!fs.existsSync(p)) continue;
    const rows = JSON.parse(fs.readFileSync(p, "utf8")) as KanjiRow[];
    const lesson = await ensureLevelLesson(
      `JLPT ${lvl.toUpperCase()}`,
      lvl.toUpperCase()
    );
    const subset = lvl === "n5" ? rows : rows.slice(0, 40);
    for (const k of subset) {
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
    }
    console.log(`kanji ${lvl}: ${subset.length}`);
  }
}

const NHK_SAMPLES = [
  {
    publishedAt: new Date("2026-05-22"),
    titleJp: "東京の桜が見ごろになりました",
    titleEn: "Tokyo's cherry blossoms hit peak bloom",
    bodyJp:
      "東京で桜が見ごろになりました。\n公園には大勢の人が花見に来ています。\n気象庁は今年の桜は例年より3日早く咲いたと話しました。",
    summaryEn:
      "Cherry blossoms in Tokyo have reached peak bloom; crowds gathered in city parks for hanami parties.",
    durationSec: 78,
    difficulty: "N5",
  },
  {
    publishedAt: new Date("2026-05-20"),
    titleJp: "新幹線が来年から自動で走る",
    titleEn: "Shinkansen to start self-driving operations next year",
    bodyJp:
      "JR東日本は来年から、新幹線の一部で自動運転を始めると発表しました。\n運転士は乗りますが、加速や減速は機械が行います。\n人手不足の解決が期待されています。",
    summaryEn:
      "JR East announced that some shinkansen routes will begin automated operation next year.",
    durationSec: 92,
    difficulty: "N4",
  },
  {
    publishedAt: new Date("2026-05-18"),
    titleJp: "京都で外国人の観光客が過去最多",
    titleEn: "Foreign tourist numbers in Kyoto hit all-time high",
    bodyJp:
      "京都市は今年4月に来た外国人観光客が過去最多になったと発表しました。\n去年の同じ月より20%多くなりました。\n市は混雑を減らすため、朝早い時間の観光をすすめています。",
    summaryEn:
      "Kyoto saw its highest-ever number of foreign tourists in April this year, up 20% year-on-year.",
    durationSec: 64,
    difficulty: "N4",
  },
  {
    publishedAt: new Date("2026-05-15"),
    titleJp: "学校でAIを使う授業が広がる",
    titleEn: "AI-assisted lessons spread in Japanese schools",
    bodyJp:
      "文部科学省は、全国の小学校と中学校でAIを使った授業を広げると発表しました。\n生徒一人一人に合わせて問題が出ます。\n先生は授業の準備の時間が短くなると話しました。",
    summaryEn:
      "Japan's MEXT will expand AI-assisted lessons across elementary and middle schools nationwide.",
    durationSec: 100,
    difficulty: "N3",
  },
  {
    publishedAt: new Date("2026-05-12"),
    titleJp: "富士山の登山に新しいルールができた",
    titleEn: "New rules announced for climbing Mount Fuji",
    bodyJp:
      "山梨県は今年の夏から、富士山に登る人に新しいルールを作りました。\n登山者の数を1日に4千人までにします。\n安全な登山を守るためです。",
    summaryEn:
      "Yamanashi has capped daily Mount Fuji climbers at 4,000 starting this summer for safety.",
    durationSec: 71,
    difficulty: "N4",
  },
];

async function seedNHK() {
  await prisma.nHKSave.deleteMany();
  await prisma.nHKClip.deleteMany();
  for (const s of NHK_SAMPLES) {
    await prisma.nHKClip.create({ data: s });
  }
  console.log(`nhk clips: ${NHK_SAMPLES.length}`);
}

const LIBRARY_ITEMS = [
  {
    type: "textbook",
    source: "Genki",
    title: "Genki I (3rd ed.)",
    subtitle: "Chapters 1–12 · N5 grammar foundation",
    url: "https://genki3.japantimes.co.jp",
    level: "N5",
  },
  {
    type: "textbook",
    source: "Genki",
    title: "Genki II (3rd ed.)",
    subtitle: "Chapters 13–23 · bridges into N4",
    url: "https://genki3.japantimes.co.jp",
    level: "N4",
  },
  {
    type: "textbook",
    source: "Tobira",
    title: "Tobira: Gateway to Intermediate",
    subtitle: "Post-Genki bridge into N3",
    url: "https://tobiraweb.9640.jp",
    level: "N3",
  },
  {
    type: "textbook",
    source: "Shin Kanzen",
    title: "Shin Kanzen Master N2",
    subtitle: "Five-volume JLPT N2 prep series",
    level: "N2",
  },
  {
    type: "news",
    source: "NHK",
    title: "NHK News Web Easy",
    subtitle: "Daily news with furigana + audio",
    url: "https://www3.nhk.or.jp/news/easy/",
    level: "N4",
  },
  {
    type: "podcast",
    source: "Nihongo con Teppei",
    title: "Nihongo con Teppei (Beginner)",
    subtitle: "Short slow Japanese — 5 min/episode",
    url: "https://nihongoconteppei.com/",
    level: "N5",
  },
  {
    type: "podcast",
    source: "Sakura Tips",
    title: "Sakura Tips",
    subtitle: "Conversation-style Japanese learning",
    level: "N4",
  },
  {
    type: "grammar-site",
    source: "Tae Kim",
    title: "Tae Kim's Guide to Japanese",
    subtitle: "Free comprehensive grammar reference",
    url: "https://guidetojapanese.org/learn/",
    level: "N5",
  },
  {
    type: "grammar-site",
    source: "Tofugu",
    title: "Tofugu Articles",
    subtitle: "Grammar, kanji, culture — accessible writing",
    url: "https://www.tofugu.com",
    level: "N4",
  },
  {
    type: "video",
    source: "YouTube",
    title: "Comprehensible Japanese",
    subtitle: "Yuki-sensei · CI input for beginners",
    url: "https://www.youtube.com/@cijapanese",
    level: "N5",
  },
  {
    type: "manga",
    source: "Yotsuba&!",
    title: "よつばと!",
    subtitle: "Slice-of-life manga, mostly furigana",
    level: "N4",
  },
  {
    type: "video",
    source: "YouTube",
    title: "Game Gengo",
    subtitle: "Japanese learning through video games",
    url: "https://www.youtube.com/@GameGengo",
    level: "N3",
  },
];

async function seedLibrary() {
  await prisma.userShelfItem.deleteMany();
  await prisma.libraryResource.deleteMany();
  for (const r of LIBRARY_ITEMS) await prisma.libraryResource.create({ data: r });
  console.log(`library: ${LIBRARY_ITEMS.length}`);
}

async function seedDemoUser() {
  await prisma.user.upsert({
    where: { email: "demo@nihongo.app" },
    update: {
      level: "N4",
      dailyGoalMin: 30,
      streakCount: 47,
      streakLastAt: new Date(),
      dailyMinutes: 18,
      xp: 2340,
    },
    create: {
      email: "demo@nihongo.app",
      name: "Alex M.",
      level: "N4",
      dailyGoalMin: 30,
      streakCount: 47,
      streakLastAt: new Date(),
      dailyMinutes: 18,
      xp: 2340,
    },
  });
  console.log("demo user ready");
}

async function main() {
  await seedVocab();
  await seedKanji();
  await seedNHK();
  await seedLibrary();
  await seedDemoUser();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
