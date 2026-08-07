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
