// Inject the content of "Maîtriser les Maths 6" (source textbook for Mathématiques — 6e)
// into the refined lesson JSON that seed.ts consumes. Sibling of inject-maths5-figures
// and inject-chimie6-figures: runs AFTER refine, and is idempotent.
//
// ⚠︎ NOT WIRED INTO THE PIPELINE YET, deliberately. It produces all 73 lessons across all
// 17 chapters, but 6 fail the round-trip gate in bookCorpus.test.ts and a few make the
// serialiser throw. The drift is INLINE, not block structure — same node count in both
// directions — which points at mark boundaries in the rawest passages. Wiring it in
// turns the suite red, so predev must not call it until that tail is resolved.
//
// The fix is likely upstream, not here: this transcription has never been through a
// maths-to-LaTeX pass (ONE $-span in 55 000 lines, against 11 756 in maths 5) nor figure
// reconstruction (0 figures, against 194). Once the source has had both, most of the
// pathological text should not exist. Re-run, confirm all 73 pass canEditVisually, then
// add it beside inject-chimie6-figures.mjs in build:content / predev / prebuild /
// predb:seed / predb:reset.
//
// To land the lessons in a live database afterwards WITHOUT a reseed — which would
// cascade away every teacher-authored lesson — use scripts/add-missing-lessons.mjs.
//
// This source is at an EARLIER stage than the other three. It is a flat OCR dump: no
// markdown headings at all, and its 236 figures exist only as a caption line followed by
// the AI provenance sentence — no <figure class="ai-figure"> block, no SVG. So this
// script does two things the others did not have to:
//
//   1. Recovers the heading hierarchy from the book's typography. Sections are numbered
//      "II.1. INSUFFISANCE DE R" and parts are lettered "A. OBJECTIFS"; nothing else is
//      promoted, because a line like "1. Définir un nombre complexe" is an objective in a
//      list, not a subsection, and guessing wrong shreds the document outline.
//   2. Turns each caption into a visible placeholder rather than leaving it as orphan
//      prose stranded among the OCR'd axis labels it came with.
//
// It stays figure-aware on purpose: the moment real <figure class="ai-figure"> blocks
// appear in this file, they are carried through verbatim exactly as in maths 5, and the
// placeholders alongside them disappear on the next run.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "content/sources/maths-6-scientifique-maitriser.md");
const REFINED = path.join(ROOT, "public/content/refined/maths-6-scientifique");

if (!fs.existsSync(SRC) || !fs.existsSync(REFINED)) { console.log("inject-maths6: source or refined dir missing — skipping."); process.exit(0); }

const lines = fs.readFileSync(SRC, "utf8").split("\n");

// Chapters I…XVII → module-1…module-17, in order.
const ROMANS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII"];

// Every chapter title appears TWICE: once in the table of contents near the top, once at
// the head of the chapter. maths 5 could exclude the TOC by "ends in a page number", but
// here the titles wrap ("CHAPITRE I : STRUCTURES ALGEBRIQUES ET MORPHISMES DES") and the
// number lands on the next line. The body copy is simply the later one.
const chapIdx = (roman) => {
  if (!roman) return lines.length;
  const re = new RegExp(`^\\s*CHAPITRE\\s+${roman}\\b`, "i");
  let last = -1;
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) last = i;
  return last;
};

const files = fs.readdirSync(REFINED)
  .filter((f) => /^module-\d+-.*\.json$/.test(f))
  .sort((a, b) => Number(a.match(/^module-(\d+)/)[1]) - Number(b.match(/^module-(\d+)/)[1]));
const CHAPTERS = files.map((file, i) => ({ roman: ROMANS[i], file, prefix: file.replace(/\.json$/, "") }));

// --- shared text helpers, same behaviour as the maths 5 injector ---
const GREEK = { "α": "\\alpha", "β": "\\beta", "γ": "\\gamma", "δ": "\\delta", "π": "\\pi", "θ": "\\theta", "λ": "\\lambda", "μ": "\\mu", "ω": "\\omega", "Δ": "\\Delta", "φ": "\\varphi", "ρ": "\\rho", "σ": "\\sigma" };
const MATH_TOKEN = /((?:\([A-Za-z0-9]+\)|[A-Za-zα-ωΑ-Ω]{1,3})'?(?:[\^_](?:\{[^}]*\}|[A-Za-z0-9]+'?|\([A-Za-z0-9]+\)))+)/g;
function wrapBareMath(s) {
  return s
    .split(/(<figure class="ai-figure[\s\S]*?<\/figure>|\$\$[\s\S]*?\$\$|\$[^$\n]*?\$)/g)
    .map((part, i) => (i % 2 ? part : part.replace(MATH_TOKEN, (m) => `$${m.replace(/[α-ωΑ-Ω]/g, (c) => (GREEK[c] ? GREEK[c] + " " : c))}$`)))
    .join("");
}
const countFigs = (s) => (s.match(/<figure class="ai-figure/g) || []).length;
const countPlaceholders = (s) => (s.match(/^> \*\*Figure à reconstituer\*\*/gm) || []).length;
const stripFigs = (s) => s.replace(/<figure class="ai-figure[\s\S]*?<\/figure>/g, "");

const PROVENANCE = /^Figure recreated by AI[^\n]*$/;

function prepFigures(s) {
  return s
    .replace(/<div class="fig-critic">[\s\S]*?<\/div>/g, "")
    .replace(/<figure class="ai-figure[\s\S]*?<\/figure>/g, (f) => f.replace(/\s*\n\s*/g, " "));
}

/**
 * A figure in this source is a caption line followed by the provenance sentence, sitting
 * under whatever loose axis labels and tick numbers the OCR picked out of the drawing.
 * Emit a placeholder carrying the caption, and drop the debris above it: a run of very
 * short lines directly before a caption is the scatter of "x", "-2", "j̄", "O".
 */
function figurePlaceholders(text) {
  const src = text.split("\n");
  const out = [];
  for (let i = 0; i < src.length; i++) {
    if (!PROVENANCE.test(src[i].trim())) { out.push(src[i]); continue; }
    // The caption is the last non-empty line before the provenance sentence.
    let c = out.length - 1;
    while (c >= 0 && !out[c].trim()) c--;
    const caption = c >= 0 ? out[c].trim() : "";
    if (c >= 0) out.length = c; // drop the caption; it is re-emitted below
    // Then eat the drawing's own labels, which the OCR spilled above the caption as a
    // run of short lines: "y", "C", "M(x , y)", "B(x₂ , y₂)", "-2". The test is a
    // lowercase word of three letters or more — real prose has one, an axis label does
    // not, and "Soit les points A (x₁, y₁)" is therefore kept.
    while (out.length) {
      const t = out[out.length - 1].trim();
      if (!t) { out.pop(); continue; }
      if (t.length <= 24 && !/[a-zà-ÿ]{3,}/i.test(t)) { out.pop(); continue; }
      break;
    }
    out.push("", `> **Figure à reconstituer** — ${caption || "figure du manuel"}`, "");
  }
  return out.join("\n");
}

// Recover the two heading levels this book actually has. Nothing else is promoted.
// Blank line on BOTH sides: a paragraph glued under a heading parses one way first and
// another way on the reparse, which is drift the round-trip gate rightly refuses.
const SECTION = /^\s*([IVXLC]+\.\s?\d+(?:\.\d+)*)\.?\s+(\S.*)$/;
const PART = /^\s*([A-Z])\.\s+([A-Z][A-Z\s'’ÉÈÊÀÇ-]{3,})\s*$/;
function recoverHeadings(text) {
  return text
    .split("\n")
    .map((line) => {
      const sec = SECTION.exec(line);
      if (sec) return `\n## ${sec[1].replace(/\s+/g, "")} ${sec[2].trim().replace(/\s+/g, " ")}\n`;
      const part = PART.exec(line);
      if (part) return `\n## ${part[2].trim().replace(/\s+/g, " ")}\n`;
      return line;
    })
    .join("\n");
}

/**
 * Markdown renumbers an ordered list from 1. This book's exercise runs continue across
 * page breaks, so a lesson can open at "7." — which comes back as "1." and fails the
 * round-trip gate, dropping the teacher into a raw textarea. Escaping the dot keeps the
 * text identical on screen and makes it prose, which survives.
 */
function tameOrderedLists(text) {
  const src = text.split("\n");
  const isItem = (s) => /^\s*\d+\.\s/.test(s ?? "");
  let i = 0;
  while (i < src.length) {
    if (!isItem(src[i])) { i++; continue; }
    let j = i;
    while (j < src.length && (isItem(src[j]) || (!src[j].trim() && isItem(src[j + 1])) || (src[j].trim() && !isItem(src[j]) && j > i))) {
      if (src[j].trim() && !isItem(src[j]) && j > i && !isItem(src[j + 1])) break; // continuation prose, then out
      j++;
    }
    const first = Number(/^\s*(\d+)\./.exec(src[i])[1]);
    if (first !== 1) for (let k = i; k < j; k++) src[k] = src[k].replace(/^(\s*\d+)\./, "$1\\.");
    i = Math.max(j, i + 1);
  }
  return src.join("\n");
}

/**
 * A list glued straight under a paragraph is read as lazy continuation on the first
 * parse and as a real list on the second, so the document changes shape between the two
 * and fails the round-trip gate. One blank line settles which it is.
 */
function separateBlocks(text) {
  const isItem = (s) => /^\s*(?:\d+\\?\.|[-*+])\s+\S/.test(s ?? "");
  const out = [];
  for (const line of text.split("\n")) {
    const prev = out[out.length - 1];
    const prevIsProse = prev !== undefined && prev.trim() && !isItem(prev) && !/^\s*#{1,6}\s/.test(prev) && !/^\s*>/.test(prev);
    if (isItem(line) && prevIsProse) out.push("");
    out.push(line);
  }
  return out.join("\n");
}

function clean(text) {
  const out = text
    // A bare "=" or "-" on its own line under a text line is a SETEXT HEADING in
    // markdown, so "3x + 4y − 35" followed by "=" silently became an <h1>. These are
    // OCR fragments of an equation, meaningless alone.
    .replace(/^[ \t]*=+[ \t]*$/gm, "")
    .replace(/^[ \t]*-+[ \t]*$/gm, "")
    .replace(/^\s*page \d+\s*$/gim, "")
    .replace(/^\s*Scanned by CamScanner\s*$/gim, "")
    .replace(/^.*(?:\[\{"|box_2d).*$/gm, "")
    .replace(/!\[img-\d+[^\]]*\]\([^)]*\)\s*/g, "")
    .replace(/^\s*\d{1,3}\s*$/gm, "")               // bare page numbers
    .replace(/^\s*-{3,}\s*$/gm, "")
    .replace(/^[ \t]*(?:\.\.\.[ \t]*=[ \t]*\.\.\.|=[ \t]*\.\.\.|\.\.\.)[ \t]*$/gm, () => "$$\\vdots$$")
    .replace(/(?:\$\$\\vdots\$\$\s*){2,}/g, () => "$$\\vdots$$\n\n")
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => `$${m.trim()}$`)
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => `$$${m.trim()}$$`)
    .replace(/\n{3,}/g, "\n\n");
  // NOT wrapBareMath here, unlike maths 5 and chimie 6. Those sources had already been
  // through a maths-to-LaTeX pass (11 756 and 4 149 $-spans); this one has exactly ONE in
  // 55 000 lines, so wrapping bare tokens would be inventing markup — and the speculative
  // spans it produced were themselves the inline drift that failed the round-trip gate.
  // The real conversion belongs upstream, with the figures.
  return separateBlocks(tameOrderedLists(out)).trim();
}

let totalLessons = 0, totalFigs = 0, totalPlaceholders = 0;
for (let i = 0; i < CHAPTERS.length; i++) {
  const ch = CHAPTERS[i];
  const start = chapIdx(ch.roman);
  const end = i + 1 < CHAPTERS.length ? chapIdx(CHAPTERS[i + 1].roman) : lines.length;
  const jsonPath = path.join(REFINED, ch.file);
  if (start < 0 || end < 0 || end <= start || !fs.existsSync(jsonPath)) { console.log(`inject-maths6: skip ${ch.file} (roman ${ch.roman})`); continue; }

  // Chapter titles wrap, so the line after "CHAPITRE II : LE CORPS C DES" is
  // "NOMBRES COMPLEXES" — the rest of the title, not content. Drop the shouting lines
  // at the very top; the module already carries this name.
  // ...but "A. OBJECTIFS" is also all capitals, and it is the chapter's first heading.
  // Stop at anything the heading pass will recognise.
  const raw = lines.slice(start + 1, end);
  while (raw.length && /^[^a-zà-ÿ]*$/.test(raw[0]) && raw[0].trim().length < 60
         && !PART.test(raw[0]) && !SECTION.test(raw[0])) raw.shift();

  const body = clean(recoverHeadings(figurePlaceholders(prepFigures(raw.join("\n")))));

  const textLenOf = (s) => stripFigs(s).length;
  const figsOf = (s) => countFigs(s) + countPlaceholders(s);

  let secs = body.split(/(?=\n#{2,3} )/).map((s) => s.trim()).filter(Boolean);
  if (secs.length < 2) secs = body.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);

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
  const figs = countFigs(body);
  const holes = countPlaceholders(body);
  const intro =
    "> Contenu tiré du manuel *Maîtriser les Maths 6*." +
    (holes ? " Les figures de ce chapitre restent à reconstituer — elles sont signalées dans le texte." : "") +
    "\n\n";

  groups.forEach((g, k) => {
    mod.lessons.push({
      slug: `${ch.prefix}-${base + 1 + k}-manuel-illustre-${k + 1}`,
      title: groups.length > 1 ? `Manuel illustré (${k + 1})` : "Manuel illustré",
      order: base + 1 + k,
      estMinutes: 25,
      degraded: true,
      contentMd: intro + g.join("\n\n"),
      quiz: null,
    });
  });

  fs.writeFileSync(jsonPath, JSON.stringify(mod, null, 2) + "\n");
  totalLessons += groups.length; totalFigs += figs; totalPlaceholders += holes;
  console.log(`inject-maths6: ${ch.roman.padEnd(5)} ${ch.file.padEnd(52)} → +${groups.length} lessons, ${figs} figs, ${holes} à reconstituer`);
}
console.log(`inject-maths6: TOTAL +${totalLessons} lessons, ${totalFigs} figures, ${totalPlaceholders} placeholders across ${CHAPTERS.length} chapters`);
