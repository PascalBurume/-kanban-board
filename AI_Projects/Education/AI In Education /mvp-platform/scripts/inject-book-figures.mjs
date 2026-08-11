// Shared injector: turn a transcribed textbook source into illustrated
// « Manuel illustré » lessons appended to the refined module JSON that seed.ts
// consumes. Extracted from inject-maths5-figures.mjs, which was already almost
// book-agnostic — maths-5, maths-6 and chimie-5 differ only in their source file,
// their refined directory and the book's name in the intro note.
//
// Figures are preserved verbatim (they are SVG recreations from the scan, kept
// with their provenance badge), bare OCR math is wrapped in $…$, headings are
// normalised to two levels, and the result is greedily packed into balanced
// lessons under hard figure/text caps.
//
// Runs AFTER refine, idempotent (it drops and rewrites its own lessons), safe on
// every predev / predb:seed.

import fs from "node:fs";
import path from "node:path";
import { pooledLexicon, titleGroups, titleCandidates } from "./book-lesson-title.mjs";
import { findRunningHeads, stripRunningHeads, anchorFigures, trimTrailingHeadings } from "./book-text-repair.mjs";
import { recap } from "./lesson-recap.mjs";

// normalizeHeadings() has already sorted the chapter's headings into two levels: "## "
// for the sections the book numbered itself ("1.2", "III.4"), "### " for everything
// else. A group of packed sections is named from the first of those it contains.
const allHeadings = (group) => {
  const text = group.join("\n\n");
  const pick = (re) => [...text.matchAll(re)].map((m) => m[1].trim());
  return { major: pick(/^##\s+(.+)$/gm), minor: pick(/^###\s+(.+)$/gm) };
};

const headingsOf = (group) => titleCandidates(allHeadings(group));

const ROMANS = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII","XIII","XIV","XV","XVI","XVII","XVIII","XIX","XX","XXI","XXII"];

// --- shared text helpers ---
const GREEK = { "α": "\\alpha", "β": "\\beta", "γ": "\\gamma", "δ": "\\delta", "π": "\\pi", "θ": "\\theta", "λ": "\\lambda", "μ": "\\mu", "ω": "\\omega", "Δ": "\\Delta", "φ": "\\varphi", "ρ": "\\rho", "σ": "\\sigma" };
const MATH_TOKEN = /((?:\([A-Za-z0-9]+\)|[A-Za-zα-ωΑ-Ω]{1,3})'?(?:[\^_](?:\{[^}]*\}|[A-Za-z0-9]+'?|\([A-Za-z0-9]+\)))+)/g;
function wrapBareMath(s) {
  return s
    .split(/(<figure class="ai-figure[\s\S]*?<\/figure>|\$\$[\s\S]*?\$\$|\$[^$\n]*?\$)/g)
    .map((part, i) => (i % 2 ? part : part.replace(MATH_TOKEN, (m) => `$${m.replace(/[α-ωΑ-Ω]/g, (c) => (GREEK[c] ? GREEK[c] + " " : c))}$`)))
    .join("");
}
const countFigs = (s) => (s.match(/<figure class="ai-figure/g) || []).length;
const stripFigs = (s) => s.replace(/<figure class="ai-figure[\s\S]*?<\/figure>/g, "");

// Flatten every figure to ONE line (blank lines inside multi-line SVGs otherwise
// break markdown's raw-HTML block); drop the internal AI-critic QA notes; translate
// the English provenance badge to French.
function prepFigures(s) {
  return s
    .replace(/<div class="fig-critic">[\s\S]*?<\/div>/g, "")
    .replace(/Figure recreated by AI[\s\S]*?transcription\./g, "Figure reconstruite d'après le scan — non le document original.")
    .replace(/<figure class="ai-figure[\s\S]*?<\/figure>/g, (f) => f.replace(/\s*\n\s*/g, " "));
}

// Strip inline math/markup from a heading so it reads cleanly in the reader's TOC.
const plainHeading = (t) => t.replace(/\$([^$]*)\$/g, "$1").replace(/\\(log|ln|pi|alpha|beta|sin|cos|tan)/g, "$1").replace(/[$\\{}]/g, "").replace(/\s+/g, " ").trim();

// Normalize messy OCR heading levels to 2 levels: dotted section numbers
// (roman "III.1" OR arabic "1.2") → "## "; every other heading → "### ".
const SECNUM = "(?:[IVXLC]+|\\d+)(?:\\.\\s*\\d+)+\\.?";
function normalizeHeadings(text) {
  return text
    .replace(/^#+\s*CHAPITRE[^\n]*$/gim, "")
    .replace(/^#{1,6}\s+(.*\S)\s*$/gim, (_, t) => `### ${plainHeading(t)}`)
    .replace(new RegExp(`^###\\s*(${SECNUM})\\s*(.*)$`, "gim"), (_, num, t) => `\n## ${num.replace(/\s+/g, "")} ${t.trim()}`.trimEnd());
}

function clean(text) {
  const out = text
    .replace(/^<!--\s*page[^>]*-->\s*$/gim, "")
    .replace(/^\s*Scanned by CamScanner\s*$/gim, "")
    // The transcription platform annotates figures whose vision reading disagrees with
    // the OCR — "[[VIS?]] A vision reading disagrees on 3 labels — check the scan". That
    // is a note to whoever proofreads the book, not something a pupil should read under
    // a diagram, and it was reaching them: 15 seeded lessons carried one.
    .replace(/<div class="fig-flags">[\s\S]*?<\/div>/g, "")
    .replace(/\[\[(?:VIS|FIG)\?[^\]]*\]\]/g, "")
    .replace(/^.*(?:\[\{"|box_2d).*$/gm, "")                            // OCR JSON-garbage lines (Ch XII corruption)
    .replace(/!\[img-\d+[^\]]*\]\([^)]*\)\s*/g, "")                     // drop stray/unconverted image placeholders
    .replace(/^\s*\d{1,3}\s*$/gm, "")
    .replace(/^\s*-{3,}\s*$/gm, "")
    .replace(/^[ \t]*(?:\.\.\.[ \t]*=[ \t]*\.\.\.|=[ \t]*\.\.\.|\.\.\.)[ \t]*$/gm, () => "$$\\vdots$$")  // ⋮ artifacts
    .replace(/(?:\$\$\\vdots\$\$\s*){2,}/g, () => "$$\\vdots$$\n\n")
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => `$${m.trim()}$`)
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => `$$${m.trim()}$$`)
    .replace(/\n{3,}/g, "\n\n");
  return wrapBareMath(out).trim();
}

/**
 * @param {object} cfg
 * @param {string} cfg.src         transcribed source, absolute path
 * @param {string} cfg.refined     refined module JSON directory, absolute path
 * @param {string} cfg.label       log prefix, e.g. "inject-maths6"
 * @param {string} cfg.bookTitle   shown in each lesson's provenance note
 */
// A PNG's pixel size, straight from the IHDR header — 8-byte signature, 4-byte
// length, "IHDR", then width and height as big-endian 32-bit integers.
function pngSize(file) {
  try {
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(24);
    fs.readSync(fd, buf, 0, 24, 0);
    fs.closeSync(fd);
    if (buf.toString("ascii", 12, 16) !== "IHDR") return null;
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  } catch { return null; }
}

// How wide to draw an extracted image.
//
// These arrive at whatever size they were embedded at: a chemistry photograph can
// be 700px wide, a maths line diagram 145px. Left alone the diagrams render tiny
// beside 492px-wide SVG figures in the same lesson. Left to fill the column they
// blur, because there are no more pixels to show — a 145px drawing stretched to
// 492 is a 3.4× upscale.
//
// So: bring small ones up to a readable size, never past 2.2× their own
// resolution, and never wider than the column.
const COLUMN = 492, MIN_TARGET = 320, MAX_UPSCALE = 2.2;
function displayWidth(natural) {
  const target = Math.min(MIN_TARGET, Math.round(natural * MAX_UPSCALE));
  return Math.round(Math.min(COLUMN, Math.max(natural, target)));
}

export function injectBookFigures({ src, refined, label, bookTitle, book, locate, intro: introText, headings }) {
  // A book whose sections are not numbered supplies its own rule for which headings may
  // name a lesson — the EXETAT manual is divided by exam session, not by "1.2".
  const namesOf = headings ? (group) => headings(allHeadings(group)) : headingsOf;
  if (!fs.existsSync(src) || !fs.existsSync(refined)) {
    console.log(`${label}: source or refined dir missing — skipping.`);
    return;
  }
  let lines = fs.readFileSync(src, "utf8").split("\n");

  // ROOT is two levels up from public/content/refined/<book>.
  const appRoot = path.resolve(path.dirname(refined), "../../..");

  // The books are their own dictionary: headings are SHOUTED and the scan drops the
  // accents from capitals, but the same words run correctly spelled through the body
  // text thousands of times. See scripts/book-lesson-title.mjs.
  const lexicon = pooledLexicon(path.join(appRoot, "content/sources"));

  // Which lines are this book's page furniture. Measured over the whole book, because
  // repetition is what identifies them.
  const runningHeads = findRunningHeads(lines.join("\n"));
  if (runningHeads.size) {
    console.log(`${label}: ${runningHeads.size} running head(s) dropped — ${[...runningHeads].slice(0, 3).map((h) => JSON.stringify(h)).join(", ")}`);
  }

  // Photographs the transcription referenced but never shipped. Their filenames
  // are unusable — chimie-5 reuses six names across thirty-four references — so
  // scripts/extract-book-images.mjs resolved each one against the PDF and wrote a
  // manifest keyed by the reference's ORDINAL in this file. Rewrite them here, in
  // that same order, before clean() would otherwise drop them.
  const srcDir = path.join(appRoot, "content/book-images", book ?? "");
  const manifestPath = path.join(appRoot, "content/book-images/manifest.json");
  const outDir = path.join(appRoot, "public/content/img", book ?? "");
  let restored = 0, dropped = 0;
  if (book && fs.existsSync(manifestPath)) {
    const entries = (JSON.parse(fs.readFileSync(manifestPath, "utf8"))[book] ?? []);
    const byOrdinal = new Map(entries.map((e) => [e.ordinal, e]));
    let seen = 0;
    lines = lines.map((line) =>
      line.replace(/!\[img-\d+\.[a-z]+\]\([^)]*\)/gi, () => {
        const e = byOrdinal.get(seen++);
        const from = e?.file ? path.join(srcDir, e.file) : null;
        if (!from || !fs.existsSync(from)) { dropped++; return " "; }
        // Copy into the served tree, which is generated and gitignored.
        fs.mkdirSync(outDir, { recursive: true });
        fs.copyFileSync(from, path.join(outDir, e.file));
        restored++;
        // Same <figure> shape as the recreated diagrams so it flows through
        // prepFigures/clean untouched, but captioned as what it is: the scan
        // itself, not a reconstruction of it.
        // A hand-drawn replacement, if one exists for this image. The extracted
        // rasters are small — several are under 150px and have to be upscaled past
        // 2× to be readable — so a redrawn vector is sharper at any size. It is
        // also a RECONSTRUCTION, and says so: the badge distinguishes it from the
        // photograph it replaces, which was the book's own.
        const drawn = path.join(appRoot, "content/book-figures", book, `${e.file}.svg`);
        if (fs.existsSync(drawn)) {
          restored++;
          const svg = fs.readFileSync(drawn, "utf8").replace(/\s*\n\s*/g, " ").trim();
          return `<figure class="ai-figure">${svg}<figcaption>`
            + `<span class="ai-badge">Figure redessinée d'après le manuel (p. ${e.page}) — non le document original.</span>`
            + `</figcaption></figure>`;
        }

        // Explicit width/height keep the reader from reflowing as each image
        // arrives, and carry the scaled-up size for the small diagrams.
        const size = pngSize(from);
        let dim = "";
        if (size?.w) {
          const w = displayWidth(size.w);
          dim = ` width="${w}" height="${Math.round((size.h * w) / size.w)}"`;
        }
        return `<figure class="ai-figure"><img src="/content/img/${book}/${e.file}" alt="Illustration du manuel"${dim} loading="lazy" />`
          + `<figcaption><span class="ai-badge">Image extraite du manuel original (p. ${e.page}).</span></figcaption></figure>`;
      }),
    );
  }

  // The chapter's BODY heading is the LAST occurrence: every table of contents
  // repeats the same headings earlier. Selecting the first heading that lacks a
  // trailing page number — the rule this started with — works only for a TOC
  // whose every entry carries one, and chimie-5's does not: four of its ten
  // chapters would have resolved to the table of contents.
  //
  // Books that are not organised into numbered chapters pass their own locator:
  // the EXETAT manual divides by school subject ("# I. MATHEMATIQUE.", "# **CHIMIE.**").
  const chapIdx = locate
    ? (_roman, i) => locate(i, lines)
    : (roman) => {
        if (!roman) return lines.length;
        let last = -1;
        const re = new RegExp(`^#*\\s*CHAPITRE\\s+${roman}\\s*:`, "i");
        for (let j = 0; j < lines.length; j++) if (re.test(lines[j])) last = j;
        return last;
      };

  // Chapters I…N map in order to module-1…module-N (sorted by numeric prefix).
  const files = fs.readdirSync(refined)
    .filter((f) => /^module-\d+-.*\.json$/.test(f))
    .sort((a, b) => Number(a.match(/^module-(\d+)/)[1]) - Number(b.match(/^module-(\d+)/)[1]));
  const chapters = files.map((file, i) => ({
    roman: ROMANS[i], nextRoman: ROMANS[i + 1] || null, file, prefix: file.replace(/\.json$/, ""), index: i,
  }));

  const intro = introText
    ?? `> Contenu et figures tirés du manuel *${bookTitle}* — les figures sont `
      + "des reconstructions vérifiées d'après le scan, non le document original.\n\n";

  let totalLessons = 0, totalFigs = 0;
  for (const ch of chapters) {
    const start = chapIdx(ch.roman, ch.index);
    // A chapter runs to the next one that was actually located, so a missing
    // heading widens its predecessor rather than collapsing it to nothing.
    let end = lines.length;
    for (let d = ch.index + 1; d < chapters.length; d++) {
      const s = chapIdx(ROMANS[d], d);
      if (s > start) { end = s; break; }
    }
    const jsonPath = path.join(refined, ch.file);
    if (start < 0 || !fs.existsSync(jsonPath)) { console.log(`${label}: skip ${ch.file} (roman ${ch.roman})`); continue; }

    // Page furniture goes first — the running head has to be gone before the text is
    // split into sections, or it lands at the top of one and reads like its title. Then
    // each figure moves under the caption that names it.
    const chapterText = trimTrailingHeadings(stripRunningHeads(lines.slice(start + 1, end).join("\n"), runningHeads));
    const body = clean(normalizeHeadings(anchorFigures(prepFigures(chapterText))));

    const textLenOf = (s) => stripFigs(s).length;
    const figsOf = (s) => (s.match(/<figure class="ai-figure/g) || []).length;

    // Cut at any heading (## major or ### sub); fall back to paragraphs.
    let secs = body.split(/(?=\n#{2,3} )/).map((s) => s.trim()).filter(Boolean);
    if (secs.length < 2) secs = body.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);

    // Sub-split any oversized section (long prose OR a run of "sketch the curve"
    // figures) at paragraph boundaries so no piece is over-long or figure-flooded.
    const PIECE_FIG = 7, PIECE_TXT = 14000;
    const fine = [];
    for (const sec of secs) {
      if (figsOf(sec) <= PIECE_FIG && textLenOf(sec) <= PIECE_TXT) { fine.push(sec); continue; }
      let buf = [], bf = 0, bt = 0;
      for (const para of sec.split(/\n\n+/)) {
        const pf = figsOf(para), pt = textLenOf(para);
        if (buf.length && (bf + pf > PIECE_FIG || bt + pt > PIECE_TXT)) { fine.push(buf.join("\n\n")); buf = []; bf = 0; bt = 0; }
        buf.push(para); bf += pf; bt += pt;
      }
      if (buf.length) fine.push(buf.join("\n\n"));
    }
    secs = fine;

    // Greedily pack pieces into lessons under hard caps — balanced, no tuning.
    const LES_FIG = 9, LES_TXT = 15000;
    const groups = [];
    let curG = [], curF = 0, curT = 0;
    for (const s of secs) {
      const sf = figsOf(s), st = textLenOf(s);
      if (curG.length && (curF + sf > LES_FIG || curT + st > LES_TXT)) { groups.push(curG); curG = []; curF = 0; curT = 0; }
      curG.push(s); curF += sf; curT += st;
    }
    if (curG.length) groups.push(curG);

    const mod = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    mod.lessons = mod.lessons.filter((l) => !/manuel-illustre/.test(l.slug));
    const base = mod.lessons.length;

    // Name each lesson after the book section it opens with. "Manuel illustré (1)…(14)"
    // told a teacher nothing about what was inside; the section headings are right here
    // in the text we just packed.
    const titles = titleGroups(groups.map(namesOf), lexicon, {
      taken: mod.lessons.map((l) => l.title),
    });
    groups.forEach((g, i) => {
      mod.lessons.push({
        slug: `${ch.prefix}-${base + 1 + i}-manuel-illustre-${i + 1}`,
        title: titles[i],
        order: base + 1 + i,
        estMinutes: 25,
        degraded: true,
        // « À retenir » closes the lesson with the results it states, in the book's own
        // words. It is omitted where the lesson states none rather than padded.
        contentMd: intro + g.join("\n\n") + recap(g.join("\n\n"), titles[i]),
        quiz: null,
      });
    });

    fs.writeFileSync(jsonPath, JSON.stringify(mod, null, 2) + "\n");
    totalLessons += groups.length; totalFigs += countFigs(body);
    console.log(`${label}: ${ch.roman.padEnd(5)} ${ch.file.padEnd(52)} → +${groups.length} lessons, ${countFigs(body)} figs`);
  }
  console.log(
    `${label}: TOTAL +${totalLessons} illustrated lessons, ${totalFigs} figures across ${chapters.length} chapters`
    + (restored || dropped ? ` · ${restored} photo(s) restored from the manual${dropped ? `, ${dropped} unresolved` : ""}` : "")
  );
}
