/**
 * Parse Irodori Pre-Intermediate (A2/B1) — ZZ_all_Intermediate_compressed.md
 *
 * Output: scripts/data/irodori/parsed-preint.json
 *
 * File structure (clean section begins ~L11682):
 *   第N課　<JP title>
 *   活動 / Can-do / [activities with Can-do text]
 *   漢字のことば  / <vocab line>
 *   ➊ <pattern>    ← grammar marker (also ❸ ❹ ❺ variants)
 *   <example sentence>
 *   ➋ <pattern>
 *   <example>
 *   文法ノート      ← section separator, ignore
 *   ➌ <pattern>
 *   [more examples]
 *   日本の生活TIPS ◦X ◦Y  ← ends grammar; extract culture notes
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, "data/irodori/ZZ_all_Intermediate_compressed.md");
const OUT = join(__dir, "data/irodori/parsed-preint.json");

// All numbered-circle variants used in this file
const GRAMMAR_MARKER_RE =
  /^([➊➋➌➍➎➏➐➑❶❷❸❹❺❻❼❽])\s+(.+)/u;

// Lines to unconditionally skip
const SKIP_PATTERNS = [
  /^©The Japan Foundation/,
  /^初中級　/,
  /^文法ノート$/,
  /^活動$/,
  /^Can-do$/,
  /^[A-Z][12]$/, // "A2" / "B1" labels
  /^\d+$/, // bare page numbers / activity numbers
  /^[0-9]+\.$/, // "1." "2." etc.
  /^漢字のことば$/,
  /^このトピックのストラテジー$/,
  /^▶トピック$/,
  /^▌/, // section markers
  /^!?\[image\]/, // image refs
  /^Table of Contents/, // English section start → we stop before this
];

const raw = readFileSync(SRC, "utf8");
const allLines = raw.split("\n");

// The useful content is in the Japanese table-of-contents section.
// We detect its start by finding the first well-formed lesson header
// after line 11000, then stop when we reach the English section (~12407).
const SEARCH_FROM = 11000;
const SEARCH_TO = 12500;

/** @returns {{ number: number, titleJp: string } | null} */
function parseLessonHeader(line) {
  const m = line.match(/^第(\d+)\s*課[　\s](.+)/u);
  if (!m) return null;
  return { number: parseInt(m[1], 10), titleJp: m[2].trim() };
}

/** Detect a grammar marker line → { order: number, pattern: string } | null */
function parseGrammarMarker(line) {
  const m = line.match(GRAMMAR_MARKER_RE);
  if (!m) return null;
  return { marker: m[1], pattern: m[2].trim() };
}

const MARKER_ORDER = "➊➋➌➍➎➏➐➑❶❷❸❹❺❻❼❽";
function markerIndex(ch) {
  const i = MARKER_ORDER.indexOf(ch);
  return i >= 0 ? i + 1 : 99;
}

// ─── State machine ────────────────────────────────────────────────────────────

const lessons = [];
let lesson = null; // current lesson being built
let gp = null; // current grammar point
let exampleBuffer = ""; // accumulate multi-line example
let candoBuffer = ""; // accumulate multi-line Can-do text
let state = "seek"; // seek | in_activities | in_grammar

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

for (let i = SEARCH_FROM; i < Math.min(allLines.length, SEARCH_TO); i++) {
  const raw = allLines[i].trim();
  if (!raw) continue;

  // Hard stop at English table of contents
  if (raw.startsWith("Table of Contents")) break;

  // ── Skip junk ──────────────────────────────────────────────────────
  if (SKIP_PATTERNS.some((p) => p.test(raw))) continue;

  // ── Lesson header ─────────────────────────────────────────────────
  const lh = parseLessonHeader(raw);
  if (lh) {
    finaliseLesson();
    lesson = {
      framework: "irodori-preint",
      lessonNumber: lh.number,
      titleJp: lh.titleJp,
      titleEn: null,
      canDo: null,
      cultureNotes: [],
      grammarPoints: [],
    };
    candoBuffer = "";
    state = "in_activities";
    continue;
  }

  if (!lesson) continue;

  // ── TIPS line → end of lesson grammar block ─────────────────────
  if (raw.startsWith("日本の生活TIPS")) {
    finaliseGP();
    const tips = raw
      .replace("日本の生活TIPS", "")
      .split("◦")
      .map((t) => t.trim())
      .filter(Boolean);
    lesson.cultureNotes = tips;
    state = "after_tips";
    continue;
  }

  // ── Grammar marker ────────────────────────────────────────────────
  const gm = parseGrammarMarker(raw);
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

  // ── 漢字のことば value line (vocab after the header) ──────────────
  if (state === "in_activities" && /[ぁ-んァ-ン一-鿻々]/.test(raw)) {
    // Collect Can-do text (ends with できる。or できる)
    if (raw.endsWith("できる。") || raw.endsWith("できる")) {
      candoBuffer += raw;
      if (!lesson.canDo) lesson.canDo = candoBuffer.replace(/\s+/g, "");
      candoBuffer = "";
    } else if (candoBuffer || raw.includes("ことができ")) {
      // Mid-line continuation of a Can-do sentence
      candoBuffer += raw;
    }
    continue;
  }

  // ── In grammar: collect example lines ────────────────────────────
  if (state === "in_grammar" && gp) {
    // Skip short metadata-ish lines (level labels slipped through)
    if (raw.match(/^[A-Za-z][0-9]$/) || raw.match(/^[VNS][-（]/) && raw.length < 12) continue;
    // Accumulate example text (some spans 2 lines)
    if (exampleBuffer) {
      // If current line looks like a continuation (no sentence-final punct yet)
      exampleBuffer += raw;
      if (exampleBuffer.match(/[。！？」\)）]/)) {
        gp.examples.push({ jp: exampleBuffer.trim(), en: null });
        exampleBuffer = "";
      }
    } else if (gp.examples.length === 0) {
      if (raw.match(/[。！？」\)）]$/)) {
        gp.examples.push({ jp: raw, en: null });
      } else {
        exampleBuffer = raw;
      }
    } else {
      // Additional examples (alternate forms listed after the main one)
      if (raw.match(/[。！？」\)）]$/) && raw.length > 8) {
        gp.examples.push({ jp: raw, en: null });
      }
    }
  }
}

finaliseLesson();

// ─── Output ─────────────────────────────────────────────────────────────────
console.log(`\nParsed ${lessons.length} lessons:\n`);
for (const l of lessons) {
  console.log(
    `  L${String(l.lessonNumber).padStart(2, "0")}: ${l.titleJp}\n` +
      `       Can-do: ${l.canDo?.slice(0, 60) ?? "—"}\n` +
      `       Grammar: [${l.grammarPoints.map((g) => g.title.slice(0, 20)).join(" | ")}]`
  );
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(lessons, null, 2), "utf8");
console.log(`\nWritten → ${OUT}`);
