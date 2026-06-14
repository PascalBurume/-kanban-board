// Reads the digitalized content (platform_content) and emits a web-ready bundle
// into public/content : manifest.json, search-index.json, and per-module markdown.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(__dirname, "..");
const SRC =
  process.env.CONTENT_SRC ||
  path.resolve(APP, "..", "Books  ", "platform_content");
const OUT = path.join(APP, "public", "content");
const MODOUT = path.join(OUT, "modules");

function readFM(txt) {
  if (!txt.startsWith("---")) return { data: {}, body: txt };
  const end = txt.indexOf("\n---", 3);
  if (end === -1) return { data: {}, body: txt };
  const raw = txt.slice(3, end).trim();
  const body = txt.slice(end + 4).replace(/^\n/, "");
  const data = {};
  let key = null;
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (m) {
      key = m[1];
      let v = m[2].trim();
      if (v === "") data[key] = [];
      else data[key] = v.replace(/^"(.*)"$/, "$1");
    } else if (/^\s*-\s+/.test(line) && Array.isArray(data[key])) {
      data[key].push(line.replace(/^\s*-\s+/, "").replace(/^"(.*)"$/, "$1"));
    }
  }
  return { data, body };
}

function toPlain(md) {
  return md
    .replace(/```[\s\S]*?```/g, (b) => b.replace(/```\w*/g, " "))
    .replace(/[#>*_`$|-]+/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

if (!fs.existsSync(SRC)) {
  console.error("CONTENT SOURCE NOT FOUND:", SRC);
  process.exit(1);
}
// (no rm: filesystem blocks deletion; overwrite instead)
fs.mkdirSync(MODOUT, { recursive: true });

const manifest = JSON.parse(fs.readFileSync(path.join(SRC, "manifest.json"), "utf8"));
const search = [];
const copied = new Set();
let moduleCount = 0;

function processModule(bookSlug, relPath) {
  const abs = path.join(SRC, relPath);
  if (!fs.existsSync(abs)) return null;
  const txt = fs.readFileSync(abs, "utf8");
  const { data, body } = readFM(txt);
  const fname = path.basename(relPath);
  const outDir = path.join(MODOUT, bookSlug);
  fs.mkdirSync(outDir, { recursive: true });
  const webPath = `content/modules/${bookSlug}/${fname}`;
  if (!copied.has(webPath)) {
    fs.writeFileSync(path.join(outDir, fname), txt, "utf8");
    copied.add(webPath);
    moduleCount++;
    const plain = toPlain(body);
    search.push({
      book: bookSlug,
      bookTitle: data.book_title || bookSlug,
      classe: data.classe || "",
      subject: data.subject || "",
      module: Number(data.module) || 0,
      title: data.module_title || fname,
      status: data.status || "",
      path: webPath,
      text: plain.slice(0, 12000),
    });
  }
  return { webPath, status: data.status || "" };
}

for (const c of manifest.classes) {
  for (const f of c.fields) {
    for (const s of f.subjects) {
      for (const m of s.modules) {
        const info = processModule(s.book, m.path);
        if (info) { m.path = info.webPath; m.status = info.status; }
      }
    }
  }
}

fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest), "utf8");
fs.writeFileSync(path.join(OUT, "search-index.json"), JSON.stringify(search), "utf8");
console.log(`OK content built: ${moduleCount} modules, ${search.length} indexed, ${manifest.classes.length} classes`);
