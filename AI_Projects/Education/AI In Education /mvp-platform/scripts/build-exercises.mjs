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
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*Exercices(\s+r[ée]solus)?\s*$/i.test(lines[i])) {
        const snippet = lines.slice(i + 1, i + 14).join("\n").trim();
        if (snippet.length > 80) {
          exercises.push({ id: ++id, ...base, n: null, section: lines[i].trim(), quality: "ocr", text: snippet.slice(0, 1200) });
        }
      }
    }
  }
}
for (const e of exercises) e.text = e.text.replace(/\n{3,}/g, "\n\n").trim();
writeFileSync(OUT, JSON.stringify(exercises));
const clean = exercises.filter((e) => e.quality === "clean").length;
console.log(`OK exercises: ${exercises.length} (${clean} clean, ${exercises.length - clean} ocr) → public/content/exercises.json`);
