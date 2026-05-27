/**
 * Parse grammar for Irodori Starter and Elementary 2.
 *
 * Sources:
 *   Grammar_all.md              → irodori-starter  L3–L18  (▶トピック chrome format)
 *   Z_all_Elementary_2_compressed.md (lines 7253–7944) → irodori-elem2 L1–L18 (ToC format)
 *
 * Elementary 1 and Intermediate have no clean grammar ToC in available source files.
 *
 * Output: scripts/data/irodori/parsed-grammar.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dir, "data/irodori");
const OUT = join(DATA, "parsed-grammar.json");

// ─── Shared constants ─────────────────────────────────────────────────────────

const MARKER_CHARS = "➊➋➌➍➎➏➐➑❶❷❸❹❺❻❼❽";
const MARKER_CHARS_ARR = MARKER_CHARS.split("");
const INLINE_MARKER_RE = /^([➊➋➌➍➎➏➐➑❶❷❸❹❺❻❼❽])\s+(.+)/u;

function markerIndex(ch) {
  const i = MARKER_CHARS.indexOf(ch);
  return i >= 0 ? i + 1 : 99;
}

// ─── Elementary 2 — ToC format (same layout as Pre-Intermediate) ──────────────
//
// Source: Z_all_Elementary_2_compressed.md  lines 7253–7944
// Format (identical to preint): 第N課　<title> / ➊ <pattern> / <example> / 文法ノート / 日本の生活TIPS

const ELEM2_SKIP = [
  /^©The Japan Foundation/,
  /^初級2/,
  /^文法ノート$/,
  /^活動$/,
  /^Can-do$/,
  /^[A-Z][12]$/,      // "A2" / "B1"
  /^\d+$/,            // bare page numbers
  /^[0-9]+\.$/,       // "1." "2." etc.
  /^漢字のことば$/,
  /^このトピックのストラテジー$/,
  /^▶トピック$/,
  /^▌/,
  /^!?\[image\]/,
];

function parseElem2() {
  const src = join(DATA, "Z_all_Elementary_2_compressed.md");
  if (!existsSync(src)) {
    console.warn("  WARN: Z_all_Elementary_2_compressed.md missing — skipping elem2");
    return [];
  }
  const allLines = readFileSync(src, "utf8").split("\n");

  const SEARCH_FROM = 7253;
  const SEARCH_TO   = 7945;

  function parseLessonHeader(line) {
    const m = line.match(/^第(\d+)\s*課[　\s](.+)/u);
    if (!m) return null;
    return { number: parseInt(m[1], 10), titleJp: m[2].trim() };
  }

  const lessons   = [];
  let lesson      = null;
  let gp          = null;
  let exBuf       = "";
  let candoBuf    = "";
  let state       = "seek";

  function finaliseGP() {
    if (!gp) return;
    if (exBuf) { gp.examples.push({ jp: exBuf.trim(), en: null }); exBuf = ""; }
    lesson.grammarPoints.push(gp);
    gp = null;
  }

  function finaliseLesson() {
    if (!lesson) return;
    finaliseGP();
    lessons.push(lesson);
    lesson = null;
  }

  for (let i = SEARCH_FROM; i < Math.min(allLines.length, SEARCH_TO); i++) {
    const raw = allLines[i].trim();
    if (!raw) continue;
    if (raw.startsWith("Table of Contents")) break;
    if (ELEM2_SKIP.some((p) => p.test(raw))) continue;

    const lh = parseLessonHeader(raw);
    if (lh) {
      finaliseLesson();
      lesson = {
        framework: "irodori-elem2",
        lessonNumber: lh.number,
        titleJp: lh.titleJp,
        titleEn: null,
        canDo: null,
        cultureNotes: [],
        grammarPoints: [],
      };
      candoBuf = "";
      state = "in_activities";
      continue;
    }

    if (!lesson) continue;

    // End of grammar block
    if (raw.startsWith("日本の生活TIPS")) {
      finaliseGP();
      const tips = raw.replace("日本の生活TIPS", "").split("◦").map((t) => t.trim()).filter(Boolean);
      lesson.cultureNotes = tips;
      state = "after_tips";
      continue;
    }

    // Grammar marker (inline format: "➊ N pattern")
    const gm = raw.match(INLINE_MARKER_RE);
    if (gm) {
      finaliseGP();
      gp = { order: markerIndex(gm[1]), title: gm[2].trim(), pattern: gm[2].trim(), explanation: null, examples: [] };
      exBuf = "";
      state = "in_grammar";
      continue;
    }

    // Can-do accumulation (in_activities state, Japanese text)
    if (state === "in_activities" && /[ぁ-んァ-ン一-鿻々]/.test(raw)) {
      if (raw.endsWith("できる。") || raw.endsWith("できる")) {
        candoBuf += raw;
        if (!lesson.canDo) lesson.canDo = candoBuf.replace(/\s+/g, "");
        candoBuf = "";
      } else if (candoBuf || raw.includes("ことができ")) {
        candoBuf += raw;
      }
      continue;
    }

    // Example sentence collection (in_grammar state)
    if (state === "in_grammar" && gp) {
      // Skip short form/level labels
      if (/^[A-Za-z][0-9]$/.test(raw)) continue;
      if (/^[VNS][-（]/.test(raw) && raw.length < 12) continue;

      if (exBuf) {
        exBuf += raw;
        if (/[。！？」)）]/.test(exBuf)) { gp.examples.push({ jp: exBuf.trim(), en: null }); exBuf = ""; }
      } else if (gp.examples.length === 0) {
        if (/[。！？」)）]$/.test(raw)) gp.examples.push({ jp: raw, en: null });
        else exBuf = raw;
      } else {
        if (/[。！？」)）]$/.test(raw) && raw.length > 8) gp.examples.push({ jp: raw, en: null });
      }
    }
  }

  finaliseLesson();
  return lessons;
}

// ─── Starter — ▶トピック chrome format (Grammar_all.md) ──────────────────────
//
// Lesson boundaries: ▶トピック chrome block containing lesson number + title.
// Grammar markers: bare ➊ on its own line; title from PREVIOUS JP line;
//                  pattern from NEXT JP line; examples follow.

const PAGE_FOOTER_RE = /^(入門|初級1|初級2|初中級|中級)\s*L\s*(\d+)\s*-\s*(\d+)\s*$/;
const KANA_RE        = /[぀-ゟ゠-ヿー]/;
const KANJI_RE       = /[一-鿿]/;
const ONLY_KANA_RE   = /^[぀-ゟ゠-ヿー]+$/;
const TERMINAL_RE    = /[。！？.?!]\s*」?$/;
// Short kana strings that are genuine words/verb endings, not furigana annotations
const NOT_FURIGANA = new Set([
  "はい", "いえ", "うん", "ねえ", "そう", "ええ",
  "ます", "ました", "ません", "ない", "なく", "なり",
  "です", "でした", "ある", "いる", "する", "なる",
]);

function isFurigana(t) {
  return t.length <= 6 && ONLY_KANA_RE.test(t) && !NOT_FURIGANA.has(t);
}

function parseStarter() {
  const src = join(DATA, "Grammar_all.md");
  if (!existsSync(src)) {
    console.warn("  WARN: Grammar_all.md missing — skipping starter");
    return [];
  }
  const lines = readFileSync(src, "utf8").split(/\r?\n/);

  // First pass: find ▶トピック chrome blocks → lesson regions
  const regions = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== "▶トピック") continue;
    const topicJp = (lines[i - 1] || "").trim();
    let lessonNum = null;
    let chapterTitle = null;
    for (let j = i + 1; j < Math.min(i + 7, lines.length); j++) {
      const t = lines[j].trim();
      if (/^\d{1,2}$/.test(t)) {
        lessonNum = parseInt(t, 10);
        for (let k = j + 1; k < Math.min(j + 5, lines.length); k++) {
          const tk = lines[k].trim();
          if (tk && tk !== "第　  　　課" && tk !== "第　 　　課" && !/^第\s+課$/.test(tk)) {
            chapterTitle = tk;
            break;
          }
        }
        break;
      }
    }
    if (!lessonNum) continue;
    regions.push({ startIdx: i - 1, topicJp, chapterTitle, lessonNum });
  }

  // Build lesson map (multiple regions can map to same lesson — page breaks)
  const lessonMap = new Map();
  for (const r of regions) {
    if (!lessonMap.has(r.lessonNum)) {
      lessonMap.set(r.lessonNum, {
        framework: "irodori-starter",
        lessonNumber: r.lessonNum,
        titleJp: r.chapterTitle,
        titleEn: null,
        canDo: null,
        cultureNotes: [],
        grammarPoints: [],
      });
    }
  }

  // Build line→regionIdx index
  const lessonAtLine = new Array(lines.length).fill(null);
  for (let r = 0; r < regions.length; r++) {
    const start = regions[r].startIdx;
    const end   = r + 1 < regions.length ? regions[r + 1].startIdx : lines.length;
    for (let k = start; k < end; k++) lessonAtLine[k] = r;
  }

  // Classify lines into typed items
  const raw_items = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t   = raw.trim();
    if (!t) { raw_items.push({ kind: "blank", lineIdx: i }); continue; }

    // Chrome lines
    if (
      t === "©The Japan Foundation" || t === "▶トピック" ||
      /^第\s+課$/.test(t) || t === "第　  　　課" || t === "第　 　　課" ||
      /^!\[image\]/.test(t) || PAGE_FOOTER_RE.test(t) ||
      t === "▶" || t === "▶▶"
    ) {
      raw_items.push({ kind: "chrome", raw: t, lineIdx: i }); continue;
    }

    // Lone lesson number inside chrome block
    if (/^\d{1,2}$/.test(t) && i > 0 && lines[i - 1].trim() === "▶トピック") {
      raw_items.push({ kind: "chrome", raw: t, lineIdx: i }); continue;
    }

    // Bare grammar marker (➊ alone)
    if (MARKER_CHARS_ARR.includes(t)) {
      raw_items.push({ kind: "grammar-marker", ch: t, order: markerIndex(t), lineIdx: i }); continue;
    }

    if (isFurigana(t)) { raw_items.push({ kind: "furigana", raw: t, lineIdx: i }); continue; }

    if (KANJI_RE.test(t) || KANA_RE.test(t)) {
      raw_items.push({ kind: "jp", raw: t, lineIdx: i }); continue;
    }
    raw_items.push({ kind: "en", raw: t, lineIdx: i });
  }

  // Glue consecutive same-kind lines that lack terminal punctuation
  const items = [];
  for (const it of raw_items) {
    const prev = items[items.length - 1];
    if (prev && prev.kind === it.kind && (it.kind === "jp" || it.kind === "en")) {
      if (!TERMINAL_RE.test(prev.raw)) {
        prev.raw += (it.kind === "en" ? " " : "") + it.raw;
        continue;
      }
    }
    items.push({ ...it });
  }

  // Walk items
  let currentRegionIdx = -1;
  let currentLesson    = null;
  let currentGP        = null;

  function flushGP() {
    if (currentGP && currentLesson) currentLesson.grammarPoints.push(currentGP);
    currentGP = null;
  }

  for (let i = 0; i < items.length; i++) {
    const it        = items[i];
    const regionIdx = lessonAtLine[it.lineIdx];

    if (regionIdx !== null && regionIdx !== currentRegionIdx) {
      currentRegionIdx = regionIdx;
      flushGP();
      currentLesson = lessonMap.get(regions[regionIdx].lessonNum) || null;
    }

    if (it.kind === "chrome" || it.kind === "blank" || it.kind === "furigana") continue;
    if (!currentLesson) continue;

    const curReg = regions[currentRegionIdx];
    if (curReg && (it.raw === curReg.topicJp || it.raw === curReg.chapterTitle)) continue;

    if (it.kind === "grammar-marker") {
      flushGP();

      // Title: nearest preceding JP line (prefer JP; skip stray EN like "example")
      let title = null;
      for (let j = i - 1; j >= Math.max(0, i - 8); j--) {
        const b = items[j];
        if (b.kind === "blank" || b.kind === "chrome" || b.kind === "furigana") continue;
        if (b.kind === "jp") { title = b.raw; break; }
        if (b.kind === "en" && b.raw.toLowerCase() !== "example") { title = b.raw; }
        break;
      }

      // Pattern: nearest following JP/EN line
      let pattern = null;
      for (let j = i + 1; j < Math.min(items.length, i + 6); j++) {
        const nx = items[j];
        if (nx.kind === "blank" || nx.kind === "chrome" || nx.kind === "furigana") continue;
        if (nx.kind === "jp" || nx.kind === "en") pattern = nx.raw;
        break;
      }

      currentGP = {
        order:       it.order,
        title:       title || pattern || `Grammar point ${it.order}`,
        pattern,
        explanation: null,
        examples:    [],
      };
      continue;
    }

    if (!currentGP) continue;

    if (it.kind === "jp") {
      if (it.raw === currentGP.title || it.raw === currentGP.pattern) continue;
      currentGP.examples.push({ jp: it.raw, en: null });
    } else if (it.kind === "en") {
      if (it.raw === currentGP.title || it.raw === currentGP.pattern) continue;
      const last = currentGP.examples[currentGP.examples.length - 1];
      if (last && !last.en) {
        last.en = it.raw;
      } else {
        currentGP.explanation =
          (currentGP.explanation ? currentGP.explanation + " " : "") + it.raw;
      }
    }
  }
  flushGP();

  // Post-process each lesson
  for (const lesson of lessonMap.values()) {
    // Dedupe grammar points by order — keep richest version
    const byOrder = new Map();
    for (const gp of lesson.grammarPoints) {
      const prev = byOrder.get(gp.order);
      if (!prev || gp.examples.length > prev.examples.length) byOrder.set(gp.order, gp);
    }
    lesson.grammarPoints = Array.from(byOrder.values()).sort((a, b) => a.order - b.order);

    for (const gp of lesson.grammarPoints) {
      // Strip chapterTitle that leaked in via line gluing (e.g. "よろしくお願いしますN です")
      if (lesson.titleJp && gp.title?.startsWith(lesson.titleJp)) {
        gp.title = gp.title.slice(lesson.titleJp.length).trim();
      }
      if (lesson.titleJp && gp.pattern?.startsWith(lesson.titleJp)) {
        gp.pattern = gp.pattern.slice(lesson.titleJp.length).trim() || gp.title;
      }

      // Filter junk examples
      gp.examples = gp.examples
        .filter((e) => {
          if (!e.jp || e.jp.length < 2) return false;
          const asciiRatio = e.jp.replace(/[^\x20-\x7E]/g, "").length / e.jp.length;
          return asciiRatio <= 0.4;
        })
        .slice(0, 4);

      if (!gp.title || gp.title.startsWith("Grammar point")) {
        gp.title = gp.pattern || gp.title;
      }
    }

    // Drop GPs with no pattern and no examples
    lesson.grammarPoints = lesson.grammarPoints.filter(
      (gp) => (gp.pattern && gp.pattern.length > 1) || gp.examples.length > 0
    );
  }

  return Array.from(lessonMap.values())
    .filter((l) => l.grammarPoints.length > 0)
    .sort((a, b) => a.lessonNumber - b.lessonNumber);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log("=== parse-irodori-grammar.mjs ===\n");

  console.log("Parsing Elementary 2 (Z_all_Elementary_2_compressed.md, lines 7253–7944)...");
  const elem2 = parseElem2();
  console.log(`  → ${elem2.length} lessons, ${elem2.reduce((s, l) => s + l.grammarPoints.length, 0)} GPs`);
  for (const l of elem2) {
    const gps = l.grammarPoints.map((g) => g.title.slice(0, 22)).join(" | ");
    console.log(`    L${String(l.lessonNumber).padStart(2, "0")}: ${l.titleJp}`);
    console.log(`         [${gps}]`);
  }

  console.log("\nParsing Starter (Grammar_all.md, ▶トピック format)...");
  const starter = parseStarter();
  console.log(`  → ${starter.length} lessons, ${starter.reduce((s, l) => s + l.grammarPoints.length, 0)} GPs`);
  for (const l of starter) {
    const gps = l.grammarPoints.map((g) => g.title.slice(0, 22)).join(" | ");
    console.log(`    L${String(l.lessonNumber).padStart(2, "0")}: ${l.titleJp}`);
    console.log(`         [${gps}]`);
  }

  console.log("\nNOTE: irodori-elem1 has no clean grammar ToC in available source files — skipping.");
  console.log("NOTE: irodori-intermediate source file not present — skipping.");

  const all = [...elem2, ...starter];
  const totalGPs = all.reduce((s, l) => s + l.grammarPoints.length, 0);
  const totalEx  = all.reduce((s, l) => s + l.grammarPoints.reduce((s2, g) => s2 + g.examples.length, 0), 0);
  console.log(`\nTotal: ${all.length} lessons · ${totalGPs} grammar points · ${totalEx} examples`);

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(all, null, 2), "utf8");
  console.log(`Written → ${OUT}`);
}

main();
