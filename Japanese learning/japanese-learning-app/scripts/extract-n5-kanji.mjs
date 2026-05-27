// Extract the list of N5 kanji from the kanji-data dump.
// Run: node scripts/extract-n5-kanji.mjs
import fs from "node:fs";

const all = JSON.parse(
  fs.readFileSync("scripts/data/kanji-all.json", "utf8")
);

const n5 = [];
const n4 = [];
for (const [char, info] of Object.entries(all)) {
  if (info.jlpt_new === 5) n5.push({ char, ...info });
  else if (info.jlpt_new === 4) n4.push({ char, ...info });
}
n5.sort((a, b) => (a.freq ?? 9e9) - (b.freq ?? 9e9));
n4.sort((a, b) => (a.freq ?? 9e9) - (b.freq ?? 9e9));

fs.writeFileSync(
  "scripts/data/kanji-n5.json",
  JSON.stringify(n5, null, 2)
);
fs.writeFileSync(
  "scripts/data/kanji-n4.json",
  JSON.stringify(n4, null, 2)
);
console.log(`N5: ${n5.length}, N4: ${n4.length}`);
