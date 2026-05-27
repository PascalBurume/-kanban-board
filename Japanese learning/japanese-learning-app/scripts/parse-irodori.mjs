// Parses the Japan Foundation's Irodori markdown dumps into structured JSON
// for seeding the Lesson / GrammarPoint / Dialogue / CultureNote tables.
//
// Two-pass strategy:
//
// 1. Find all `▶トピック` markers. Each marker anchors a known chrome block:
//      <topicJp>
//      ▶トピック
//      第　  　　課
//      <lessonNum>
//      <chapterTitle>
//    This gives us *lesson region boundaries* (each chrome block starts a
//    fresh page of the same lesson). Multiple chrome blocks back-reference
//    the same (book, lessonNum) — they're page-breaks within a lesson.
//
// 2. Walk the file linearly. Maintain (currentFramework, lessonNumber,
//    topicJp, chapterTitle) state by advancing through the chrome-block
//    map. Skip chrome lines, image refs, furigana-only kana lines, and any
//    line that exactly matches the active topic/chapter title (these are
//    page chrome repeats too).
//
// 3. On each grammar marker (➊–➑), open a new GrammarPoint within the
//    current lesson. The marker is preceded by a short pattern-title line
//    (e.g., "N です") and followed by the full pattern form
//    (e.g., "N1 はN2 です") and then a JP example + EN translation.
//
// Furigana lines (1–6 char all-kana) get dropped — we'll re-derive ruby
// annotations via Kuroshiro/JMdict in a later phase.

import fs from "node:fs";
import path from "node:path";

const SOURCES = [
  { file: "Grammar_all.md", bookLabel: "入門" },
  { file: "X_all_Elementary_1_compressed.md", bookLabel: "初級1" },
  { file: "Z_all_Elementary_2_compressed.md", bookLabel: "初級2" },
  { file: "ZZ_all_Intermediate_compressed.md", bookLabel: "初中級" },
];

const TIPS_FILE = "TIPS_all_compressed.md";

const BOOK_TO_FRAMEWORK = {
  入門: "irodori-starter",
  初級1: "irodori-elem1",
  初級2: "irodori-elem2",
  初中級: "irodori-preint",
  中級: "irodori-intermediate",
};

const GRAMMAR_MARKERS = "➊➋➌➍➎➏➐➑";

const PAGE_HEADER_RE =
  /^(入門|初級1|初級2|初中級|中級)\s*L\s*(\d+)\s*-\s*(\d+)\s*$/;

const KANA = "\\u3040-\\u309F\\u30A0-\\u30FF\\u30FC";
const KANJI = "\\u4E00-\\u9FFF";
const HAS_KANJI_RE = new RegExp(`[${KANJI}]`);
const HAS_KANA_RE = new RegExp(`[${KANA}]`);
const ONLY_KANA_RE = new RegExp(`^[${KANA}]+$`);
const TERMINAL_RE = /[。！？\.\?\!]\s*」?$/;

function isFuriganaLine(line) {
  const t = line.trim();
  if (!t || t.length > 6) return false;
  if (!ONLY_KANA_RE.test(t)) return false;
  const COMMON_WORDS = ["はい", "いえ", "うん", "ねえ", "そう", "ええ"];
  if (COMMON_WORDS.includes(t)) return false;
  return true;
}

function isImageRef(line) {
  return /^!\[image\]/.test(line.trim());
}

function readSourceLines(filename) {
  const p = path.join("scripts/data/irodori", filename);
  return fs.readFileSync(p, "utf8").split(/\r?\n/);
}

// First pass — find every (▶トピック) chrome block and the lesson it announces.
// Returns array of { startIdx, topicJp, chapterTitle, lessonNum, bookLabel }.
// The bookLabel is inferred from the NEAREST page-footer header below, since
// chrome blocks themselves don't carry it.
function findLessonRegions(lines) {
  const regions = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== "▶トピック") continue;
    const topicJp = (lines[i - 1] || "").trim();
    // Subsequent lines: 第　  　　課 / lessonNum / chapterTitle
    let lessonNum = null;
    let chapterTitle = null;
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      const t = lines[j].trim();
      if (/^\d+$/.test(t)) {
        lessonNum = parseInt(t, 10);
        // Chapter title is the next non-empty line
        for (let k = j + 1; k < Math.min(j + 4, lines.length); k++) {
          const tk = lines[k].trim();
          if (tk) {
            chapterTitle = tk;
            break;
          }
        }
        break;
      }
    }
    // Find nearest downstream page-footer to learn the book
    let bookLabel = null;
    for (let j = i; j < Math.min(i + 250, lines.length); j++) {
      const m = lines[j].trim().match(PAGE_HEADER_RE);
      if (m) {
        bookLabel = m[1];
        break;
      }
    }
    if (!lessonNum || !bookLabel) continue;
    regions.push({
      startIdx: i - 1, // topic line
      topicLine: i - 1,
      topicJp,
      chapterTitle,
      lessonNum,
      bookLabel,
    });
  }
  return regions;
}

// Walk the file and classify each line. Returns array of items
// { kind, raw, lineIdx } with kinds:
//   chrome | furigana | grammar-marker | jp | en | bullet-en | bullet-jp | example-marker | blank
function classifyLines(lines, currentTopicRef, currentChapterRef) {
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (!t) {
      items.push({ kind: "blank", lineIdx: i });
      continue;
    }
    // Chrome: page footer, ▶トピック, 第　 　　課, image refs, single ▶
    if (
      t === "©The Japan Foundation" ||
      t === "▶トピック" ||
      /^第\s+課$/.test(t) ||
      t === "第　  　　課" ||
      t === "第　 　　課" ||
      isImageRef(raw) ||
      PAGE_HEADER_RE.test(t) ||
      t === "▶" ||
      t === "▶▶"
    ) {
      items.push({ kind: "chrome", raw: t, lineIdx: i });
      continue;
    }
    // The lone lesson-number line (e.g., "3") within a chrome block — skip
    if (/^\d{1,2}$/.test(t) && i > 0 && lines[i - 1].trim() === "▶トピック") {
      items.push({ kind: "chrome", raw: t, lineIdx: i });
      continue;
    }
    // Lone grammar marker
    if (GRAMMAR_MARKERS.split("").includes(t)) {
      const order = GRAMMAR_MARKERS.indexOf(t) + 1;
      items.push({ kind: "grammar-marker", order, lineIdx: i });
      continue;
    }
    if (t.startsWith("- ") || t.startsWith("-\t")) {
      items.push({ kind: "bullet-en", raw: t.replace(/^-\s*/, ""), lineIdx: i });
      continue;
    }
    if (t.startsWith("• ")) {
      items.push({ kind: "bullet-jp", raw: t.replace(/^•\s*/, ""), lineIdx: i });
      continue;
    }
    if (/^［\s*例/.test(t) || /^\[\s*例/.test(t)) {
      items.push({ kind: "example-marker", raw: t, lineIdx: i });
      continue;
    }
    if (t.startsWith("▶")) {
      items.push({ kind: "example-line", raw: t.replace(/^▶\s*/, ""), lineIdx: i });
      continue;
    }
    if (isFuriganaLine(raw)) {
      items.push({ kind: "furigana", raw: t, lineIdx: i });
      continue;
    }
    if (HAS_KANJI_RE.test(t) || HAS_KANA_RE.test(t)) {
      items.push({ kind: "jp", raw: t, lineIdx: i });
      continue;
    }
    items.push({ kind: "en", raw: t, lineIdx: i });
  }
  return items;
}

// Glue mid-sentence wraps: when consecutive lines of the SAME kind
// (jp/en/bullet) don't end with a terminator, join them.
function glueLines(items) {
  const out = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.kind === it.kind &&
      ["jp", "en", "bullet-en", "bullet-jp", "example-line"].includes(it.kind)
    ) {
      const prevText = prev.raw;
      const prevEnd = prevText.slice(-1);
      const noTerm = !TERMINAL_RE.test(prevText) && prevEnd !== ":" && prevEnd !== "：";
      if (noTerm) {
        const sep = it.kind === "en" || it.kind === "bullet-en" ? " " : "";
        prev.raw = prevText + sep + it.raw;
        continue;
      }
    }
    out.push(it);
  }
  return out;
}

function parseFile({ file, bookLabel }) {
  const lines = readSourceLines(file);
  const regions = findLessonRegions(lines);

  // Build an index of (lineIdx → currentRegion). At any line idx, the active
  // lesson region is the latest region whose startIdx ≤ idx.
  const lessonAtLine = new Array(lines.length).fill(null);
  for (let r = 0; r < regions.length; r++) {
    const start = regions[r].startIdx;
    const end = r + 1 < regions.length ? regions[r + 1].startIdx : lines.length;
    for (let k = start; k < end; k++) lessonAtLine[k] = r;
  }

  // Aggregate lessons by (framework, number). Multiple regions can map to the
  // same lesson — they're page breaks within one chapter.
  const lessons = new Map();
  function getLessonForRegion(r) {
    const fw = BOOK_TO_FRAMEWORK[r.bookLabel] || BOOK_TO_FRAMEWORK[bookLabel];
    const key = `${fw}-L${r.lessonNum}`;
    if (!lessons.has(key)) {
      lessons.set(key, {
        framework: fw,
        number: r.lessonNum,
        topicJp: r.topicJp,
        titleJp: r.chapterTitle,
        grammarPoints: [],
      });
    }
    return lessons.get(key);
  }

  // Classify and glue
  let items = classifyLines(lines);
  items = glueLines(items);

  // Walk items, opening grammar points as we find markers.
  let currentLesson = null;
  let currentRegionIdx = -1;
  let currentGP = null;

  function flushGP() {
    if (currentGP && currentLesson) {
      currentLesson.grammarPoints.push(currentGP);
    }
    currentGP = null;
  }

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const regionIdx = lessonAtLine[it.lineIdx];
    if (regionIdx !== null && regionIdx !== currentRegionIdx) {
      currentRegionIdx = regionIdx;
      flushGP();
      currentLesson = getLessonForRegion(regions[regionIdx]);
    }

    if (it.kind === "chrome" || it.kind === "blank" || it.kind === "furigana") {
      continue;
    }
    if (!currentLesson) continue;

    // Skip lines whose text matches the current lesson's topic or title — these
    // are page-chrome repeats that snuck through.
    const cur = regions[currentRegionIdx];
    if (cur && (it.raw === cur.topicJp || it.raw === cur.chapterTitle)) {
      continue;
    }

    if (it.kind === "grammar-marker") {
      flushGP();
      // Pattern title: previous non-blank, non-chrome JP/EN line
      let title = null;
      for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
        const back = items[j];
        if (["blank", "chrome", "furigana"].includes(back.kind)) continue;
        if (back.kind === "jp" || back.kind === "en") {
          title = back.raw;
        }
        break;
      }
      currentGP = {
        order: it.order,
        title: title || `Grammar point ${it.order}`,
        pattern: null,
        examples: [],
        explanation: [],
        explanationJp: [],
      };
      // Full pattern: next non-blank line
      for (let j = i + 1; j < Math.min(items.length, i + 6); j++) {
        const next = items[j];
        if (["blank", "chrome", "furigana"].includes(next.kind)) continue;
        if (next.kind === "jp" || next.kind === "en") {
          currentGP.pattern = next.raw;
        }
        break;
      }
      continue;
    }

    if (!currentGP) continue;

    if (it.kind === "bullet-en") {
      currentGP.explanation.push(it.raw);
    } else if (it.kind === "bullet-jp") {
      currentGP.explanationJp.push(it.raw);
    } else if (it.kind === "jp") {
      // Skip the pattern-title and pattern-form lines (already captured)
      if (
        it.raw === currentGP.title ||
        it.raw === currentGP.pattern
      ) {
        continue;
      }
      currentGP.examples.push({ jp: it.raw, en: null });
    } else if (it.kind === "en") {
      if (
        it.raw === currentGP.title ||
        it.raw === currentGP.pattern
      ) {
        continue;
      }
      const last = currentGP.examples[currentGP.examples.length - 1];
      if (last && !last.en) {
        last.en = it.raw;
      } else {
        // EN with no preceding JP — append to explanation
        currentGP.explanation.push(it.raw);
      }
    } else if (it.kind === "example-line") {
      // dialogue line starting with ▶ A：... — JP first half, EN follows
      const last = currentGP.examples[currentGP.examples.length - 1];
      if (last && !last.en && /^[A-Za-z]/.test(it.raw)) {
        last.en = it.raw;
      } else {
        currentGP.examples.push({ jp: it.raw, en: null });
      }
    }
  }
  flushGP();

  // Post-process
  for (const lesson of lessons.values()) {
    for (const gp of lesson.grammarPoints) {
      gp.explanation = gp.explanation.join(" ").replace(/\s+/g, " ").trim();
      gp.explanationJp = gp.explanationJp.join(" ").replace(/\s+/g, " ").trim();

      // Title cleanup: strip leading chapter title if it leaked in.
      if (lesson.titleJp && gp.title && gp.title.startsWith(lesson.titleJp)) {
        gp.title = gp.title.slice(lesson.titleJp.length).trim();
      }
      // Pattern cleanup: strip leading title.
      if (gp.pattern && gp.title && gp.pattern.startsWith(gp.title)) {
        const rest = gp.pattern.slice(gp.title.length).trim();
        // If a key example sentence got concatenated, split it off
        if (rest && (HAS_KANJI_RE.test(rest) || HAS_KANA_RE.test(rest))) {
          const m = rest.match(/^([^。！？]+[。！？])(.*)$/);
          if (m) {
            // Add the example as the FIRST example (it's the key example)
            gp.examples.unshift({ jp: m[1].trim(), en: null });
            gp.pattern = gp.title;
          } else {
            gp.pattern = gp.title + " · " + rest;
          }
        }
      }
      // Strip pattern repetition from the start of EN explanation when it
      // matches the key example's EN
      const firstEx = gp.examples[0];
      if (firstEx && firstEx.en && gp.explanation.startsWith(firstEx.en)) {
        gp.explanation = gp.explanation.slice(firstEx.en.length).trim();
      }

      // Examples cleanup: drop fragments that look like explanation continuations
      gp.examples = gp.examples
        .filter((e) => {
          if (!e.jp || e.jp.length < 2) return false;
          if (/^[\d\s\-]+$/.test(e.jp)) return false;
          // Drop entries with too much ASCII inline (explanation leftovers)
          const ascii = e.jp.replace(/[^\x20-\x7E]/g, "").length;
          if (ascii / e.jp.length > 0.4) return false;
          return true;
        })
        .slice(0, 4);

      // If title is empty or a placeholder, try to use the pattern
      if (!gp.title || gp.title === `Grammar point ${gp.order}` || gp.title === "example") {
        gp.title = gp.pattern || `Grammar point ${gp.order}`;
      }
    }
    // Drop empty grammar points (no pattern AND no examples AND no JP explanation)
    lesson.grammarPoints = lesson.grammarPoints.filter(
      (gp) =>
        (gp.pattern && gp.pattern.length > 1) ||
        gp.examples.length > 0 ||
        gp.explanationJp.length > 20
    );
  }

  return Array.from(lessons.values());
}

// TIPS parser — culture notes. Each entry starts with ● + bilingual title.
// Walk linearly; ● marks a new note. Track current lesson via the most-recent
// chrome block (▶トピック region) above the ●.
function parseTips() {
  const file = path.join("scripts/data/irodori", TIPS_FILE);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const regions = findLessonRegions(lines);
  const lessonAtLine = new Array(lines.length).fill(null);
  for (let r = 0; r < regions.length; r++) {
    const start = regions[r].startIdx;
    const end = r + 1 < regions.length ? regions[r + 1].startIdx : lines.length;
    for (let k = start; k < end; k++) lessonAtLine[k] = r;
  }

  const tips = [];
  let cur = null;
  let bufKind = "en";

  function pushCur() {
    if (cur && cur.lessonNumber) tips.push(cur);
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (!t) continue;
    if (
      t === "©The Japan Foundation" ||
      t === "▶トピック" ||
      /^第\s+課$/.test(t) ||
      isImageRef(raw) ||
      PAGE_HEADER_RE.test(t) ||
      t === "▶" ||
      t === "▶▶"
    ) {
      continue;
    }
    if (t.startsWith("●")) {
      pushCur();
      const stripped = t.slice(1).trim();
      const m = stripped.match(/^([^A-Za-z]+?)[\s　]+([A-Za-z].*)$/);
      const regionIdx = lessonAtLine[i];
      const region = regionIdx !== null ? regions[regionIdx] : null;
      cur = {
        framework: region
          ? BOOK_TO_FRAMEWORK[region.bookLabel] || "irodori-starter"
          : "irodori-starter",
        lessonNumber: region ? region.lessonNum : null,
        topicJp: region ? region.topicJp : null,
        chapterTitle: region ? region.chapterTitle : null,
        titleJp: m ? m[1].trim() : stripped,
        titleEn: m ? m[2].trim() : null,
        bodyEn: "",
        body: "",
      };
      bufKind = "en";
      continue;
    }
    if (!cur) continue;
    // Skip standalone lesson-number / page-chrome remnants
    if (/^\d{1,2}$/.test(t)) continue;

    // Skip lines matching current region's topic / chapter title
    const regionIdx = lessonAtLine[i];
    const region = regionIdx !== null ? regions[regionIdx] : null;
    if (region && (t === region.topicJp || t === region.chapterTitle)) continue;

    if (isFuriganaLine(raw)) continue;

    const hasKanji = HAS_KANJI_RE.test(t);
    const hasKana = HAS_KANA_RE.test(t);
    if (hasKanji || hasKana) {
      bufKind = "jp";
      cur.body += (cur.body ? " " : "") + t;
    } else if (bufKind === "en") {
      cur.bodyEn += (cur.bodyEn ? " " : "") + t;
    } else {
      cur.body += " " + t;
    }
  }
  pushCur();

  for (const tip of tips) {
    tip.body = tip.body.replace(/\s+/g, " ").trim();
    tip.bodyEn = tip.bodyEn.replace(/\s+/g, " ").trim();
  }
  return tips;
}

function main() {
  const allLessons = [];
  for (const src of SOURCES) {
    const filePath = path.join("scripts/data/irodori", src.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`skip: ${src.file} (missing)`);
      continue;
    }
    const ls = parseFile(src);
    console.log(
      `${src.file}: ${ls.length} lessons, ${ls.reduce(
        (s, l) => s + l.grammarPoints.length,
        0
      )} grammar points`
    );
    for (const l of ls) allLessons.push(l);
  }

  // Merge duplicates across files — keep the entry with most grammar points
  const byKey = new Map();
  for (const l of allLessons) {
    const k = `${l.framework}-L${l.number}`;
    const prev = byKey.get(k);
    if (
      !prev ||
      l.grammarPoints.length > prev.grammarPoints.length ||
      (prev.grammarPoints.length === l.grammarPoints.length &&
        (!prev.topicJp || !prev.titleJp))
    ) {
      byKey.set(k, l);
    }
  }
  const merged = Array.from(byKey.values()).sort((a, b) => {
    if (a.framework !== b.framework) return a.framework.localeCompare(b.framework);
    return a.number - b.number;
  });

  const tips = parseTips();
  console.log(`tips: ${tips.length}`);

  // Stats by framework
  const lessonsBy = {};
  const gpBy = {};
  for (const l of merged) {
    lessonsBy[l.framework] = (lessonsBy[l.framework] || 0) + 1;
    gpBy[l.framework] = (gpBy[l.framework] || 0) + l.grammarPoints.length;
  }
  console.log("Lessons by framework:", lessonsBy);
  console.log("Grammar points by framework:", gpBy);

  const outPath = "scripts/data/irodori/parsed-irodori.json";
  fs.writeFileSync(
    outPath,
    JSON.stringify({ lessons: merged, tips }, null, 2)
  );
  console.log(
    `wrote ${outPath}: ${merged.length} lessons, ${tips.length} tips`
  );
}

main();
