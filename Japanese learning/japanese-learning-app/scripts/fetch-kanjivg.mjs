// Fetch KanjiVG stroke-order SVGs for N5 (and a subset of N4) kanji.
// Extracts the stroke-order path "d" strings into a single JSON file.
//
// Source: https://github.com/KanjiVG/kanjivg (CC BY-SA 3.0)
// File pattern: kanji/0XXXX.svg where XXXX is the lowercase hex unicode codepoint.

import fs from "node:fs";
import path from "node:path";

const N5 = JSON.parse(fs.readFileSync("scripts/data/kanji-n5.json", "utf8"));
const N4 = JSON.parse(fs.readFileSync("scripts/data/kanji-n4.json", "utf8"));

// Use all N5 (~79) + top-40 most-frequent N4 to keep download small.
const targets = [...N5, ...N4.slice(0, 40)];

const OUT_DIR = "scripts/data/kanjivg-svg";
fs.mkdirSync(OUT_DIR, { recursive: true });

const out = {}; // char -> { paths: string[], viewBox: string }

async function fetchOne(char) {
  const cp = char.codePointAt(0).toString(16).padStart(5, "0");
  const url = `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${cp}.svg`;
  const r = await fetch(url);
  if (!r.ok) {
    console.warn(`miss ${char} (${cp}): ${r.status}`);
    return;
  }
  const svg = await r.text();
  fs.writeFileSync(path.join(OUT_DIR, `${cp}.svg`), svg);
  // Extract path "d" attributes in document order (= stroke order).
  const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
  const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
  out[char] = {
    paths,
    viewBox: viewBoxMatch ? viewBoxMatch[1] : "0 0 109 109",
  };
}

async function main() {
  // throttle: 8 in flight
  const queue = [...targets];
  const concurrency = 8;
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const k = queue.shift();
      try {
        await fetchOne(k.char);
      } catch (e) {
        console.warn("err", k.char, e.message);
      }
    }
  });
  await Promise.all(workers);
  fs.writeFileSync("scripts/data/kanjivg.json", JSON.stringify(out));
  console.log(`Saved ${Object.keys(out).length} kanji paths.`);
}
main();
