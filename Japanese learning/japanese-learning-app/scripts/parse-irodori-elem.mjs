/**
 * Parse Irodori Starter (A1) and Elementary 2 (A2) from their compressed
 * markdown dumps. Adapted from parse-irodori-preint.mjs — both files have the
 * same Japanese table-of-contents section structure:
 *
 *   第N課　<JP title>
 *   活動 / Can-do / [activities with Can-do text ending in できる。]
 *   [漢字のことば] / [vocab line]
 *   ➊ <pattern> / <example sentence>
 *   ➋ <pattern> / <example>
 *   文法ノート               ← section separator, ignore
 *   ➌ <pattern> / [examples]
 *   日本の生活TIPS ◦X ◦Y    ← ends grammar; tips become culture notes
 *
 * Note on filenames: despite the name, X_all_Elementary_1_compressed.md
 * contains STARTER (入門 / A1) content — its English TOC banner reads
 * "Irodori Starter (A1)". Z_all_Elementary_2_compressed.md contains
 * Elementary 2 content.
 *
 * Output: scripts/data/irodori/parsed-elem.json
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dir, "data/irodori");
const OUT = join(DATA_DIR, "parsed-elem.json");

const SOURCES = [
  {
    file: "X_all_Elementary_1_compressed.md",
    framework: "irodori-starter",
    searchFrom: 7250,
    searchTo: 7920,
  },
  {
    file: "Z_all_Elementary_2_compressed.md",
    framework: "irodori-elem2",
    searchFrom: 7250,
    searchTo: 7950,
  },
];

const GRAMMAR_MARKER_RE =
  /^([➊➋➌➍➎➏➐➑❶❷❸❹❺❻❼❽])\s*(.+)/u;

const SKIP_PATTERNS = [
  /^©The Japan Foundation/,
  /^(入門|初級1|初級2|初中級|中級)　/,
  /^文法ノート$/,
  /^活動$/,
  /^Can-do$/,
  /^[A-Z][12]$/,
  /^\d+$/,
  /^[0-9]+\.$/,
  /^漢字のことば$/,
  /^ひらがなのことば/,
  /^カタカナのことば/,
  /^このトピックのストラテジー$/,
  /^▶トピック$/,
  /^▌/,
  /^!?\[image\]/,
];

const MARKER_ORDER = "➊➋➌➍➎➏➐➑❶❷❸❹❺❻❼❽";
function markerIndex(ch) {
  const i = MARKER_ORDER.indexOf(ch);
  return i >= 0 ? i + 1 : 99;
}

function parseLessonHeader(line) {
  const m = line.match(/^第(\d+)\s*課[　\s](.+)/u);
  if (!m) return null;
  // The title field may contain a trailing English gloss separated by
  // a full-width space (e.g. "レストランで働いています　I work in a restaurant.").
  // Strip the ASCII tail for titleJp; preserve it as titleEn.
  const full = m[2].trim();
  const idx = full.search(/[ \t]+[A-Za-z]/);
  let titleJp = full;
  let titleEn = null;
  if (idx > 0) {
    titleJp = full.slice(0, idx).trim();
    titleEn = full.slice(idx).trim();
  }
  return { number: parseInt(m[1], 10), titleJp, titleEn };
}

function parseGrammarMarker(line) {
  const m = line.match(GRAMMAR_MARKER_RE);
  if (!m) return null;
  return { marker: m[1], pattern: m[2].trim() };
}

function parseFile({ file, framework, searchFrom, searchTo }) {
  const raw = readFileSync(join(DATA_DIR, file), "utf8");
  const allLines = raw.split("\n");

  const lessons = [];
  let lesson = null;
  let gp = null;
  let exampleBuffer = "";
  let candoBuffer = "";
  let state = "seek"; // seek | in_activities | in_grammar | after_tips

  function finaliseGP() {
    if (!gp) return;
    if (exampleBuffer) {
      gp.examples.push({ jp: exampleBuffer.trim(), en: null });
      exampleBuffer = "";
    }
    lesson.grammarPoints.push(gp);
    gp = null;
  }

  function finaliseLesson() {
    if (!lesson) return;
    finaliseGP();
    lessons.push(lesson);
    lesson = null;
  }

  for (let i = searchFrom; i < Math.min(allLines.length, searchTo); i++) {
    const r = allLines[i].trim();
    if (!r) continue;
    if (r.startsWith("Table of Contents")) break;
    if (SKIP_PATTERNS.some((p) => p.test(r))) continue;

    const lh = parseLessonHeader(r);
    if (lh) {
      finaliseLesson();
      lesson = {
        framework,
        lessonNumber: lh.number,
        titleJp: lh.titleJp,
        titleEn: lh.titleEn,
        canDo: null,
        cultureNotes: [],
        grammarPoints: [],
      };
      candoBuffer = "";
      state = "in_activities";
      continue;
    }

    if (!lesson) continue;

    if (r.startsWith("日本の生活TIPS")) {
      finaliseGP();
      const tips = r
        .replace("日本の生活TIPS", "")
        .split("◦")
        .map((t) => t.trim())
        .filter(Boolean);
      lesson.cultureNotes = tips;
      state = "after_tips";
      continue;
    }

    const gm = parseGrammarMarker(r);
    if (gm) {
      finaliseGP();
      gp = {
        order: markerIndex(gm.marker),
        title: gm.pattern,
        pattern: gm.pattern,
        explanation: null,
        examples: [],
      };
      exampleBuffer = "";
      state = "in_grammar";
      continue;
    }

    if (state === "in_activities" && !lesson.canDo && /[ぁ-んァ-ン一-鿻々]/.test(r)) {
      // Accumulate JP lines after "Can-do" header until we hit a できる terminator.
      // Multi-line Can-dos are common (mid-sentence wrap from PDF).
      candoBuffer += r;
      if (candoBuffer.includes("できる")) {
        lesson.canDo = candoBuffer.replace(/\s+/g, "");
        candoBuffer = "";
      }
      continue;
    }

    if (state === "in_grammar" && gp) {
      if (r.match(/^[A-Za-z][0-9]$/)) continue;
      if (r.match(/^[VNS][-（]/) && r.length < 12) continue;
      if (exampleBuffer) {
        exampleBuffer += r;
        if (exampleBuffer.match(/[。！？」\)）]/)) {
          gp.examples.push({ jp: exampleBuffer.trim(), en: null });
          exampleBuffer = "";
        }
      } else if (gp.examples.length === 0) {
        if (r.match(/[。！？」\)）]$/)) {
          gp.examples.push({ jp: r, en: null });
        } else {
          exampleBuffer = r;
        }
      } else if (r.match(/[。！？」\)）]$/) && r.length > 8) {
        gp.examples.push({ jp: r, en: null });
      }
    }
  }

  finaliseLesson();
  return lessons;
}

const all = [];
for (const src of SOURCES) {
  const ls = parseFile(src);
  console.log(`${src.file} (${src.framework}): ${ls.length} lessons`);
  for (const l of ls) {
    console.log(
      `  L${String(l.lessonNumber).padStart(2, "0")}: ${l.titleJp} — ${
        l.grammarPoints.length
      } GP, ${l.cultureNotes.length} TIPS, canDo=${l.canDo ? "✓" : "—"}`
    );
  }
  all.push(...ls);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(all, null, 2), "utf8");
console.log(`\nWritten ${all.length} lessons → ${OUT}`);
