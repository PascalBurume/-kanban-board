// Inject the illustrated content of "Maîtriser les Maths 5" (source textbook for
// the Mathématiques — 5e book) into the refined lesson JSON that seed.ts consumes.
// Like inject-geo-figures.mjs: figures are preserved verbatim and bare OCR math is
// wrapped in $…$; runs AFTER refine, idempotent, safe on every predev/predb:seed.
//
// Every chapter (I–XXII → module-1…22) is normalized to a clean 2-level heading
// hierarchy, split by its major sections (roman "III.1" OR arabic "1.2" numbering),
// grouped into a few balanced "Manuel illustré" lessons, and appended to the module
// (the existing refined summary lessons are kept). Figure/heading/math cleanup and
// OCR-garbage removal are chapter-agnostic.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "content/sources/maths-5-scientifique-maitriser.md");
const REFINED = path.join(ROOT, "public/content/refined/maths-5-scientifique");

if (!fs.existsSync(SRC) || !fs.existsSync(REFINED)) { console.log("inject-maths5: source or refined dir missing — skipping."); process.exit(0); }

const lines = fs.readFileSync(SRC, "utf8").split("\n");

// Body chapter headings ("# CHAPITRE III : LES LOGARITHMES") vs Table-des-matières
// entries ("… 31") — the TOC ones end with a page number, so exclude any heading
// that ends in a digit. Word-boundary keeps I≠II≠IV, V≠VI, X≠XI, etc.
const chapIdx = (roman, from = 0) => {
  if (!roman) return lines.length;
  const re = new RegExp(`^#+\\s*CHAPITRE\\s+${roman}\\b`, "i");
  for (let i = from; i < lines.length; i++) if (re.test(lines[i]) && !/\d\s*$/.test(lines[i])) return i;
  return -1;
};

// Chapters I…XXII map in order to module-1…module-22 (sorted by numeric prefix).
const ROMANS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI", "XXII"];
const files = fs.readdirSync(REFINED)
  .filter((f) => /^module-\d+-.*\.json$/.test(f))
  .sort((a, b) => Number(a.match(/^module-(\d+)/)[1]) - Number(b.match(/^module-(\d+)/)[1]));
const CHAPTERS = files.map((file, i) => ({ roman: ROMANS[i], nextRoman: ROMANS[i + 1] || null, file, prefix: file.replace(/\.json$/, "") }));

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

let totalLessons = 0, totalFigs = 0;
for (const ch of CHAPTERS) {
  const start = chapIdx(ch.roman);
  const end = chapIdx(ch.nextRoman, start + 1);
  const jsonPath = path.join(REFINED, ch.file);
  if (start < 0 || end < 0 || !fs.existsSync(jsonPath)) { console.log(`inject-maths5: skip ${ch.file} (roman ${ch.roman})`); continue; }

  const body = clean(normalizeHeadings(prepFigures(lines.slice(start + 1, end).join("\n"))));

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
  const intro =
    "> Contenu et figures tirés du manuel *Maîtriser les Maths 5* — les figures sont " +
    "des reconstructions vérifiées d'après le scan, non le document original.\n\n";

  // Sequential numbering — clean and consistent; the lessons already sit under
  // their module (e.g. "Statistiques"), so a "(1)/(2)…" suffix reads clearly and
  // avoids mislabelling from stray section-number references in the OCR text.
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
  console.log(`inject-maths5: ${ch.roman.padEnd(5)} ${ch.file.padEnd(52)} → +${groups.length} lessons, ${countFigs(body)} figs`);
}
console.log(`inject-maths5: TOTAL +${totalLessons} illustrated lessons, ${totalFigs} figures across ${CHAPTERS.length} chapters`);
