// Repair KaTeX in the AI-reconstructed book exercises, using the SAME validate/
// repair/degrade pipeline the lessons use (fixContent from fix-content-latex).
// A local model sometimes emits malformed LaTeX (e.g. a double subscript
// "HCOO_N_4") that renders as a red KaTeX error; this normalizes each exercise's
// statement + solution so every math span renders. Idempotent → safe on reseed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fixContent } from "./fix-content-latex.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(APP, "public", "content", "exercises-clean.json");

let clean;
try {
  clean = JSON.parse(fs.readFileSync(FILE, "utf8"));
} catch {
  console.log("fix-exercises-latex: exercises-clean.json missing — skipping.");
  process.exit(0);
}

let changed = 0;
for (const key of Object.keys(clean)) {
  const e = clean[key];
  if (!e || typeof e !== "object") continue;
  let touched = false;
  for (const field of ["statement", "solution"]) {
    const before = e[field] || "";
    if (!before) continue;
    const after = fixContent(before);
    if (after !== before) { e[field] = after; touched = true; }
  }
  if (touched) changed++;
}

fs.writeFileSync(FILE, JSON.stringify(clean), "utf8");
console.log(`fix-exercises-latex: entries=${Object.keys(clean).length} changed=${changed}`);

// The verbatim exercises (exercises-book.json) go through the same validate/
// repair/degrade pass. They are the book's own text, so this only ever touches
// math that would otherwise render as a red KaTeX error — a transcription can
// still emit a malformed span, and the reader gains nothing from seeing it raw.
const BOOK = path.join(APP, "public", "content", "exercises-book.json");
if (fs.existsSync(BOOK)) {
  const book = JSON.parse(fs.readFileSync(BOOK, "utf8"));
  let items = 0, touchedItems = 0;
  for (const chapter of Object.values(book)) {
    for (const it of chapter.items || []) {
      items++;
      let touched = false;
      for (const field of ["statement", "solution"]) {
        const before = it[field] || "";
        if (!before) continue;
        const after = fixContent(before);
        if (after !== before) { it[field] = after; touched = true; }
      }
      if (touched) touchedItems++;
    }
  }
  fs.writeFileSync(BOOK, JSON.stringify(book, null, 1), "utf8");
  console.log(`fix-exercises-latex: book entries=${items} changed=${touchedItems}`);
}
