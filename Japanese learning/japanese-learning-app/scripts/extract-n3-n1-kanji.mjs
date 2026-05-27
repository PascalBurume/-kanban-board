// Extract JLPT N3, N2, N1 kanji from the kanji-data dump.
// Run: node scripts/extract-n3-n1-kanji.mjs
import fs from "node:fs";

const all = JSON.parse(
  fs.readFileSync("scripts/data/kanji-all.json", "utf8")
);

const n3 = [];
const n2 = [];
const n1 = [];

for (const [char, info] of Object.entries(all)) {
  if (info.jlpt_new === 3) n3.push({ char, ...info });
  else if (info.jlpt_new === 2) n2.push({ char, ...info });
  else if (info.jlpt_new === 1) n1.push({ char, ...info });
}

// Sort by frequency (most common first), then alphabetical for ties
const byFreq = (a, b) => (a.freq ?? 9e9) - (b.freq ?? 9e9);
n3.sort(byFreq);
n2.sort(byFreq);
n1.sort(byFreq);

fs.writeFileSync("scripts/data/kanji-n3.json", JSON.stringify(n3, null, 2));
fs.writeFileSync("scripts/data/kanji-n2.json", JSON.stringify(n2, null, 2));
fs.writeFileSync("scripts/data/kanji-n1.json", JSON.stringify(n1, null, 2));

console.log(`N3: ${n3.length}, N2: ${n2.length}, N1: ${n1.length}`);
