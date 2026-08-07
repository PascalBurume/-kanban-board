// Audit LaTeX rendering across every refined book, using the SAME remark-parse +
// remark-math the lesson reader uses — so the math nodes checked are exactly the
// ones KaTeX renders in the app (a naive $-regex disagrees with micromark). Reports
// per book: math nodes, katex failures, and bare-LaTeX leaks left in prose text.
// Read-only. Usage: node scripts/check-latex.mjs [bookSlug]
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";
import { visit } from "unist-util-visit";
import katex from "katex";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const REFINED = path.join(ROOT, "public/content/refined");
const only = globalThis.process?.argv?.[2];
const proc = unified().use(remarkParse).use(remarkMath);
const PROSE_MACRO = /\\(?:longrightarrow|xrightarrow|rightarrow|leftarrow|frac|sqrt|mathrm|text|cdot|times|begin|end|left|right|lambda|beta|alpha|mu|stackrel|underset|boxed|quad|overline|vec)\b/;

const books = fs.readdirSync(REFINED).filter((d) => fs.statSync(path.join(REFINED, d)).isDirectory() && (!only || d === only));
let gTotal = 0, gFail = 0, gLeak = 0;
const rows = [];
for (const book of books.sort()) {
  const dir = path.join(REFINED, book);
  let total = 0, fail = 0, leak = 0; const samples = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const mod = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const l of mod.lessons || []) {
      const c = (l.contentMd || "").replace(/<figure[\s\S]*?<\/figure>/g, " ");
      let tree; try { tree = proc.parse(c); proc.runSync(tree); } catch { continue; }
      visit(tree, (n) => {
        if (n.type === "math" || n.type === "inlineMath") {
          total++;
          try { katex.renderToString(n.value, { throwOnError: true, strict: false, displayMode: n.type === "math" }); }
          catch { fail++; if (samples.length < 4) samples.push(n.value.slice(0, 50).replace(/\n/g, " ")); }
        } else if (n.type === "text" && PROSE_MACRO.test(n.value)) leak++;
      });
    }
  }
  gTotal += total; gFail += fail; gLeak += leak;
  rows.push({ book, total, fail, leak, samples });
}
const w = Math.max(...rows.map((r) => r.book.length), 6);
console.log(`${"book".padEnd(w)}  nodes  fail  proseLeak`);
for (const r of rows) {
  const flag = r.fail || r.leak ? "  ⚠" : "";
  console.log(`${r.book.padEnd(w)}  ${String(r.total).padStart(5)}  ${String(r.fail).padStart(4)}  ${String(r.leak).padStart(9)}${flag}`);
  if (r.samples.length) r.samples.forEach((s) => console.log(`${" ".repeat(w)}      ↳ ${JSON.stringify(s)}`));
}
console.log(`${"TOTAL".padEnd(w)}  ${String(gTotal).padStart(5)}  ${String(gFail).padStart(4)}  ${String(gLeak).padStart(9)}`);
process.exit(gFail || gLeak ? 1 : 0);
