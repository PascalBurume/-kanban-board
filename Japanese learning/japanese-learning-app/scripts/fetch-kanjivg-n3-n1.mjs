// Fetch KanjiVG stroke-order SVGs for N3, N2, N1 kanji.
// Merges results into the existing kanjivg.json.
//
// Source: https://github.com/KanjiVG/kanjivg (CC BY-SA 3.0)
// File pattern: kanji/0XXXX.svg where XXXX is the lowercase hex unicode codepoint.
//
// Run: node scripts/fetch-kanjivg-n3-n1.mjs

import fs from "node:fs";
import path from "node:path";

const N3 = JSON.parse(fs.readFileSync("scripts/data/kanji-n3.json", "utf8"));
const N2 = JSON.parse(fs.readFileSync("scripts/data/kanji-n2.json", "utf8"));
const N1 = JSON.parse(fs.readFileSync("scripts/data/kanji-n1.json", "utf8"));

const targets = [...N3, ...N2, ...N1];

// Load existing kanjivg.json so we don't re-fetch already-downloaded kanji
const VG_PATH = "scripts/data/kanjivg.json";
const existing = fs.existsSync(VG_PATH)
  ? JSON.parse(fs.readFileSync(VG_PATH, "utf8"))
  : {};

const OUT_DIR = "scripts/data/kanjivg-svg";
fs.mkdirSync(OUT_DIR, { recursive: true });

const out = { ...existing };
let fetched = 0;
let skipped = 0;
let missing = 0;

async function fetchOne(char) {
  if (out[char]) { skipped++; return; } // already have it
  const cp = char.codePointAt(0).toString(16).padStart(5, "0");
  const svgPath = path.join(OUT_DIR, `${cp}.svg`);

  let svg;
  if (fs.existsSync(svgPath)) {
    svg = fs.readFileSync(svgPath, "utf8");
  } else {
    const url = `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${cp}.svg`;
    const r = await fetch(url);
    if (!r.ok) { missing++; return; }
    svg = await r.text();
    fs.writeFileSync(svgPath, svg);
  }

  const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
  const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
  out[char] = {
    paths,
    viewBox: viewBoxMatch ? viewBoxMatch[1] : "0 0 109 109",
  };
  fetched++;
}

async function main() {
  const queue = [...targets];
  const concurrency = 12;
  let done = 0;
  const total = queue.length;

  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const k = queue.shift();
      try {
        await fetchOne(k.char);
      } catch (e) {
        console.warn("err", k.char, e.message);
      }
      done++;
      if (done % 100 === 0) process.stdout.write(`  ${done}/${total}...\n`);
    }
  });

  await Promise.all(workers);
  fs.writeFileSync(VG_PATH, JSON.stringify(out));
  console.log(`\nDone. Fetched: ${fetched}, skipped (existing): ${skipped}, missing: ${missing}`);
  console.log(`Total kanji in kanjivg.json: ${Object.keys(out).length}`);
}

main().catch(console.error);
