// Backfills Kanji.radicals (comma-separated WaniKani-style radical names)
// for all N5 and N4 kanji already in the database.
//
// Run: npx tsx prisma/seed-kanji-radicals.ts

import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

interface KanjiEntry {
  char: string;
  wk_radicals?: string[];
}

async function main() {
  const n5: KanjiEntry[] = JSON.parse(
    fs.readFileSync(path.join("scripts/data/kanji-n5.json"), "utf8")
  );
  const n4: KanjiEntry[] = JSON.parse(
    fs.readFileSync(path.join("scripts/data/kanji-n4.json"), "utf8")
  );

  const map = new Map<string, string>();
  for (const k of [...n5, ...n4]) {
    if (k.wk_radicals && k.wk_radicals.length > 0) {
      map.set(k.char, k.wk_radicals.join(", "));
    }
  }

  let updated = 0;
  for (const [char, radicals] of map) {
    const result = await prisma.kanji.updateMany({
      where: { character: char, radicals: null },
      data: { radicals },
    });
    updated += result.count;
  }

  console.log(`Updated radicals for ${updated} kanji`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
