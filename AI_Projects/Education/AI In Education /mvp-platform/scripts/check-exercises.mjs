// QA audit of the AI-reconstructed book exercises. Scans exercises-clean.json,
// writes { complete, issues } onto each entry (so the teacher UI can flag them),
// and prints a per-book report. Deterministic + offline — no Ollama. Report-only:
// always exits 0 so it can sit in the predev/prebuild/seed chains without
// breaking the build. Run: node scripts/check-exercises.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditEntry } from "./exercise-checks.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = path.join(APP, "public", "content");
const SRC = path.join(CONTENT, "exercises.json");
const CLEAN = path.join(CONTENT, "exercises-clean.json");

const load = (f, def) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return def; } };

const all = load(SRC, []);
const clean = load(CLEAN, null);
if (!clean) { console.log("check-exercises: exercises-clean.json missing — skipping."); process.exit(0); }

const byId = new Map(all.map((e) => [String(e.id), e]));
const books = new Map(); // book -> { total, incomplete, katex, samples: [] }

for (const [id, entry] of Object.entries(clean)) {
  if (!entry || typeof entry !== "object") continue;
  const { complete, issues } = auditEntry(entry);
  entry.complete = complete;
  entry.issues = issues;

  const src = byId.get(id);
  const book = src?.book || "unknown";
  const b = books.get(book) || { total: 0, flagged: 0, incomplete: 0, katex: 0, samples: [] };
  b.total++;
  if (!complete) b.flagged++;
  if (issues.includes("truncated-statement") || issues.includes("truncated-solution")) b.incomplete++;
  if (issues.includes("katex")) b.katex++;
  if (!complete && b.samples.length < 3) {
    const tail = String(entry.solution || entry.statement || "").trim().slice(-60).replace(/\s+/g, " ");
    b.samples.push(`#${id} ${src?.section || ""} [${issues.join(",")}] …${tail}`);
  }
  books.set(book, b);
}

fs.writeFileSync(CLEAN, JSON.stringify(clean), "utf8");

// ---- report ----
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
let tTotal = 0, tFlagged = 0, tInc = 0, tKatex = 0;
console.log(`\ncheck-exercises — QA of reconstructed exercises\n`);
console.log(`${pad("book", 26)} ${padL("total", 6)} ${padL("flagged", 8)} ${padL("incompl", 8)} ${padL("katex", 6)}`);
console.log("-".repeat(58));
for (const [book, b] of [...books.entries()].sort()) {
  tTotal += b.total; tFlagged += b.flagged; tInc += b.incomplete; tKatex += b.katex;
  const flag = b.flagged ? " ⚠" : "";
  console.log(`${pad(book, 26)} ${padL(b.total, 6)} ${padL(b.flagged, 8)} ${padL(b.incomplete, 8)} ${padL(b.katex, 6)}${flag}`);
  for (const s of b.samples) console.log(`   ↳ ${s}`);
}
console.log("-".repeat(58));
console.log(`${pad("TOTAL", 26)} ${padL(tTotal, 6)} ${padL(tFlagged, 8)} ${padL(tInc, 8)} ${padL(tKatex, 6)}`);
console.log(`\nFlagged ${tFlagged} of ${tTotal} · complete:${tTotal - tFlagged}`);
