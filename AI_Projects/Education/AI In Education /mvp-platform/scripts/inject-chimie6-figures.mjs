// Inject the illustrated content of "Notions de Chimie 6" (source textbook for the
// Chimie — 6e book) into the refined lesson JSON that seed.ts consumes. Mirrors
// inject-maths5-figures.mjs: figures are preserved verbatim and bare OCR math is
// wrapped in $…$; runs AFTER refine, idempotent, safe on every predev/predb:seed.
//
// Every chapter (I–VIII → module-1…8) is normalized to a clean 2-level heading
// hierarchy, split by its major sections (arabic "1.2" / roman numbering), grouped
// into a few balanced "Manuel illustré" lessons, and appended to the module (the
// existing refined summary lessons are kept). Figure/heading/math cleanup is
// chapter-agnostic.
//
// The assembled source (content/sources/chimie-6-notions.md = parts 1+2+3) carries
// a per-part mini table-of-contents whose chapter heading line is IDENTICAL to the
// body one, so — unlike maths5, whose TOC entries end in a page number — the body
// heading is identified as the LAST `# Chapitre <roman>` occurrence.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "content/sources/chimie-6-notions.md");
const REFINED = path.join(ROOT, "public/content/refined/chimie-6");

if (!fs.existsSync(SRC) || !fs.existsSync(REFINED)) { console.log("inject-chimie6: source or refined dir missing — skipping."); process.exit(0); }

const lines = fs.readFileSync(SRC, "utf8").split("\n");

// Body chapter heading = LAST `# Chapitre <roman>` occurrence (each part carries an
// identical heading in its mini-TOC before its body). \b keeps I≠II, V≠VI, etc.
const bodyStart = (roman) => {
  let last = -1;
  const re = new RegExp(`^#+\\s*Chapitre\\s+${roman}\\b`, "i");
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) last = i;
  return last;
};

// Chapters I…VIII map in order to module-1…module-8 (sorted by numeric prefix).
const ROMANS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const files = fs.readdirSync(REFINED)
  .filter((f) => /^module-\d+-.*\.json$/.test(f))
  .sort((a, b) => Number(a.match(/^module-(\d+)/)[1]) - Number(b.match(/^module-(\d+)/)[1]));
const starts = ROMANS.map(bodyStart);
const CHAPTERS = files.map((file, i) => ({
  roman: ROMANS[i],
  file,
  prefix: file.replace(/\.json$/, ""),
  start: starts[i],
  end: i + 1 < ROMANS.length && starts[i + 1] > 0 ? starts[i + 1] : lines.length,
}));

// --- shared text helpers (identical to inject-maths5) ---
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

// Normalize messy heading levels to 2 levels: dotted section numbers
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
    .replace(/^<!--\s*part[^>]*-->\s*$/gim, "")
    .replace(/^\s*Scanned by CamScanner\s*$/gim, "")
    .replace(/!\[img-\d+[^\]]*\]\([^)]*\)\s*/g, "")                     // drop stray image placeholders
    .replace(/^\s*\d{1,3}\s*$/gm, "")                                   // bare page numbers
    .replace(/^\s*-{3,}\s*$/gm, "")
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => `$${m.trim()}$`)
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => `$$${m.trim()}$$`)
    .replace(/\n{3,}/g, "\n\n");
  return wrapBareMath(out).trim();
}

let totalLessons = 0, totalFigs = 0;
for (const ch of CHAPTERS) {
  const jsonPath = path.join(REFINED, ch.file);
  if (ch.start < 0 || ch.end < 0 || ch.start >= ch.end || !fs.existsSync(jsonPath)) { console.log(`inject-chimie6: skip ${ch.file} (roman ${ch.roman})`); continue; }

  const body = clean(normalizeHeadings(prepFigures(lines.slice(ch.start + 1, ch.end).join("\n"))));

  const textLenOf = (s) => stripFigs(s).length;
  const figsOf = (s) => (s.match(/<figure class="ai-figure/g) || []).length;

  // Cut at any heading (## major or ### sub); fall back to paragraphs.
  let secs = body.split(/(?=\n#{2,3} )/).map((s) => s.trim()).filter(Boolean);
  if (secs.length < 2) secs = body.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);

  // Sub-split any oversized section at paragraph boundaries so no piece is
  // over-long or figure-flooded.
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
  const intro =
    "> Contenu et figures tirés du manuel *Notions de Chimie 6* — les figures sont " +
    "des reconstructions vérifiées d'après le scan, non le document original.\n\n";

  groups.forEach((g, i) => {
    mod.lessons.push({
      slug: `${ch.prefix}-${base + 1 + i}-manuel-illustre-${i + 1}`,
      title: groups.length > 1 ? `Manuel illustré (${i + 1})` : "Manuel illustré",
      order: base + 1 + i,
      estMinutes: 25,
      degraded: true,
      contentMd: intro + g.join("\n\n"),
      quiz: null,
    });
  });

  fs.writeFileSync(jsonPath, JSON.stringify(mod, null, 2) + "\n");
  totalLessons += groups.length; totalFigs += countFigs(body);
  console.log(`inject-chimie6: ${ch.roman.padEnd(5)} ${ch.file.padEnd(46)} → +${groups.length} lessons, ${countFigs(body)} figs`);
}
console.log(`inject-chimie6: TOTAL +${totalLessons} illustrated lessons, ${totalFigs} figures across ${CHAPTERS.length} chapters`);
