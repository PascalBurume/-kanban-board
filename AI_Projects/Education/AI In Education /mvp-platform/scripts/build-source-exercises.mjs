// Lift exercises VERBATIM out of the transcribed book sources in content/sources
// into public/content/exercises-book.json.
//
// This is the honest path, and it exists to replace the dishonest one. The other
// route — build-exercises.mjs reading Tesseract `ocr-raw` modules, then
// refine-exercises.mjs rebuilding each garbled block with a local 4B model — was
// producing statements and *worked solutions* that no book ever contained. For a
// book whose transcription lives here, nothing is generated: the statement, the
// sub-questions and the « Résolution » are the ones on the page.
//
// Output is keyed the same way the app already matches book exercises
// (subjectSlug + module order), so src/lib/practice.ts can prefer these entries
// and fall back to the reconstructed ones for books not yet transcribed.
//
//   node scripts/build-source-exercises.mjs            # all configured books
//   node scripts/build-source-exercises.mjs maths-6-scientifique
//
// Idempotent. Re-run whenever a source file is re-transcribed.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { denoise, stripFigures, normalizeMath, sections, items, splitSolution, hasAnswer } from "./source-exercise-parse.mjs";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public/content/exercises-book.json");

const ROMAN = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII","XIII","XIV","XV","XVI","XVII","XVIII","XIX","XX","XXI","XXII"];

// Books whose transcription is good enough to lift verbatim. A book is listed
// here only once its source carries real LaTeX and unbroken statements — the
// earlier maths-6 source was a pdftotext dump (superscripts flattened to "a2",
// statements wrapped mid-formula) and lifting from it would have traded invented
// mathematics for broken mathematics.
const BOOKS = [
  { book: "maths-5-scientifique", src: "content/sources/maths-5-scientifique-maitriser.md", chapters: 22 },
  { book: "maths-6-scientifique", src: "content/sources/maths-6-scientifique-maitriser.md", chapters: 17 },
  { book: "chimie-5", src: "content/sources/chimie-5-notions.md", chapters: 10 },
  { book: "chimie-6", src: "content/sources/chimie-6-notions.md", chapters: 8 },
];

// The built module file for (book, chapter) — it carries the subject, chapter
// title and web path the app shows beside an exercise. Read from the build
// output rather than restated here so a re-slug of a chapter cannot desync them.
const MODULES_DIR = path.join(ROOT, "public/content/modules");
function moduleMeta(book, order) {
  const dir = path.join(MODULES_DIR, book);
  if (!fs.existsSync(dir)) return null;
  const file = fs.readdirSync(dir).find((f) => new RegExp(`^module-0*${order}-.*\\.md$`).test(f));
  if (!file) return null;
  const txt = fs.readFileSync(path.join(dir, file), "utf8");
  const end = txt.startsWith("---") ? txt.indexOf("\n---", 3) : -1;
  const fm = {};
  if (end > 0) {
    for (const line of txt.slice(3, end).split("\n")) {
      const m = line.match(/^([A-Za-z_]+):\s*"?([^"]*)"?\s*$/);
      if (m) fm[m[1]] = m[2];
    }
  }
  return {
    subject: fm.subject || "",
    bookTitle: fm.book_title || "",
    classe: fm.classe || "",
    moduleTitle: fm.module_title || "",
    lessonPath: `content/modules/${book}/${file}`,
  };
}

// Stable numeric ids, because the teacher-correction table (BookExerciseFix)
// and the /api/teacher/exercises/book/[id] route both key on a number. The
// 1_000_000 base cannot collide with the OCR-derived ids, which are 1…~300.
const idFor = (bookIdx, order, seq) => 1_000_000 + bookIdx * 100_000 + order * 1_000 + seq;

const bodyStart = (lines, roman) => {
  let last = -1;
  // The table of contents repeats every chapter heading, so the BODY heading is
  // the last occurrence. `:` after the exact roman keeps I≠II, V≠VI, X≠XI.
  const re = new RegExp(`^#*\\s*CHAPITRE\\s+${roman}\\s*:`, "i");
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) last = i;
  return last;
};

const only = process.argv[2];
const out = {};
const report = [];

for (const [bookIdx, b] of BOOKS.entries()) {
  if (only && b.book !== only) continue;
  const p = path.join(ROOT, b.src);
  if (!fs.existsSync(p)) {
    report.push({ book: b.book, missing: true });
    continue;
  }
  const lines = fs.readFileSync(p, "utf8").split("\n");
  let total = 0, solved = 0, answers = 0, chaptersFound = 0;
  const missingChapters = [];

  for (let c = 0; c < b.chapters; c++) {
    const start = bodyStart(lines, ROMAN[c]);
    if (start < 0) { missingChapters.push(ROMAN[c]); continue; }
    chaptersFound++;
    // The chapter runs to the next chapter that was actually located, so a
    // missing heading widens its predecessor instead of truncating it to zero.
    let end = lines.length;
    for (let d = c + 1; d < b.chapters; d++) {
      const s = bodyStart(lines, ROMAN[d]);
      if (s > start) { end = s; break; }
    }
    const chapter = lines.slice(start, end).join("\n");

    const moduleOrder = c + 1;
    const key = `${b.book}:${moduleOrder}`;
    const meta = moduleMeta(b.book, moduleOrder);
    const entry = (out[key] ||= { meta: meta ?? {}, items: [] });
    let seq = 0;

    for (const sec of sections(chapter)) {
      for (const it of items(denoise(stripFigures(sec.body)))) {
        const split = splitSolution(it.text);
        const statement = normalizeMath(split.statement);
        const solution = normalizeMath(split.solution);
        // A statement of a few characters is a stray list marker, not an
        // exercise. Keep the floor low: "Calculer 2 + 2." is legitimate.
        if (statement.replace(/\s+/g, " ").length < 25) continue;
        seq++;
        entry.items.push({
          id: idFor(bookIdx, moduleOrder, seq),
          n: it.n,
          section: sec.label,
          solved: sec.solved,
          statement,
          solution,
        });
        total++;
        if (solution) solved++;
        else if (hasAnswer(statement)) answers++;
      }
    }
    if (!entry.items.length) delete out[key];
  }
  report.push({ book: b.book, chapters: `${chaptersFound}/${b.chapters}`, total, solved, answers, missingChapters });
}

// Merge rather than overwrite: a run scoped to one book must not drop the books
// it did not look at.
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const merged = only ? { ...prev, ...out } : out;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(merged, null, 1));

console.log("\nbuild-source-exercises — verbatim exercises lifted from content/sources\n");
console.log("book                      chapters   exercises   worked sol.   answer only");
console.log("-".repeat(76));
for (const r of report) {
  if (r.missing) { console.log(`${r.book.padEnd(24)} source not found — skipped`); continue; }
  console.log(
    `${r.book.padEnd(24)} ${String(r.chapters).padEnd(10)} ${String(r.total).padStart(9)} ${String(r.solved).padStart(13)} ${String(r.answers).padStart(13)}`
    + (r.missingChapters.length ? `   (no heading for ${r.missingChapters.join(",")})` : "")
  );
}
const grand = report.reduce((a, r) => a + (r.total || 0), 0);
console.log("-".repeat(76));
console.log(`${String(grand).padStart(35)} exercises → ${path.relative(ROOT, OUT)}\n`);
