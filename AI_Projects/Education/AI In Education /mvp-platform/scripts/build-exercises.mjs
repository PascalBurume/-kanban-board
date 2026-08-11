// Extract lesson-linked exercises from public/content/modules → public/content/exercises.json
// Structured "**Exercice N.**" markers (complete modules) + "Exercices…" cues in OCR blocks.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.CONTENT_OUT || join(HERE, "..", "public", "content");
const OUT = join(ROOT, "exercises.json");

function* mdFiles(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* mdFiles(p);
    else if (e.endsWith(".md")) yield p;
  }
}
function fm(txt) {
  if (!txt.startsWith("---")) return [{}, txt];
  const end = txt.indexOf("\n---", 3);
  const raw = txt.slice(3, end);
  const meta = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Za-z_]+):\s*"?([^"]*)"?\s*$/);
    if (m) meta[m[1]] = m[2];
  }
  return [meta, txt.slice(end + 4)];
}

const exercises = [];
let id = 0;
for (const f of mdFiles(join(ROOT, "modules"))) {
  const txt = readFileSync(f, "utf8");
  const [meta, body] = fm(txt);
  const rel = "content/modules/" + f.split("/modules/")[1].split("\\").join("/");
  const base = {
    book: meta.book, bookTitle: meta.book_title, subject: meta.subject,
    classe: meta.classe, module: Number(meta.module),
    moduleTitle: meta.module_title, lessonPath: rel, status: meta.status,
  };
  if (meta.status === "complete") {
    const lines = body.split("\n");
    let section = "", cur = null;
    const flush = () => { if (cur && cur.text.trim()) { exercises.push(cur); } cur = null; };
    for (const line of lines) {
      const h = line.match(/^##+\s+(.*)/);
      if (h) { flush(); section = h[1].trim(); continue; }
      const m = line.match(/^\*\*Exercice\s+(\d+)\.?\*\*\s*(.*)/);
      if (m) { flush(); cur = { id: ++id, ...base, n: Number(m[1]), section, quality: "clean", text: m[2] }; continue; }
      if (cur) cur.text += "\n" + line;
    }
    flush();
  } else {
    const lines = body.split("\n");
    const MAX = 6000;
    const isCue = (s) => /^\s*Exercices(\s+r[ée]solus)?\s*$/i.test(s);
    for (let i = 0; i < lines.length; i++) {
      if (isCue(lines[i])) {
        // Capture the WHOLE exercise block — from this cue to the next heading or
        // the next cue — so questions and their answer keys (Rép:, Réponse) are
        // not cut mid-way. The old fixed 13-line / 1200-char window truncated
        // exercises, which led the refiner to invent the missing parts. `MAX`
        // guards a runaway block (e.g. no following heading); `truncated` flags it.
        // Stop at the next section boundary so we don't bleed following theory
        // into the exercises: a markdown heading, another cue, or an OCR-style
        // multi-level section header ("3.2." / "3.2.1." — exercise items are
        // single-level "1." and sub-questions "a)", so those are not matched).
        const isBoundary = (s) => /^##+\s/.test(s) || isCue(s) || /^\s*\d+\.\d+\.?\s+\S/.test(s);
        const block = [];
        for (let j = i + 1; j < lines.length; j++) {
          if (isBoundary(lines[j])) break;
          block.push(lines[j]);
        }
        let text = block.join("\n").trim();
        const truncated = text.length > MAX;
        if (truncated) text = text.slice(0, MAX);
        if (text.length > 80) {
          exercises.push({ id: ++id, ...base, n: null, section: lines[i].trim(), quality: "ocr", text, truncated });
        }
      }
    }
  }
}
for (const e of exercises) e.text = e.text.replace(/\n{3,}/g, "\n\n").trim();
writeFileSync(OUT, JSON.stringify(exercises));
const clean = exercises.filter((e) => e.quality === "clean").length;
console.log(`OK exercises: ${exercises.length} (${clean} clean, ${exercises.length - clean} ocr) → public/content/exercises.json`);
