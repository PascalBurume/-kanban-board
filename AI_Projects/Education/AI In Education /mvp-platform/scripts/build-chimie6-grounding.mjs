// One-shot builder: extract per-chapter plain text from the assembled Chimie 6
// source (content/sources/chimie-6-notions.md, = parts 1+2+3 converted markdown)
// and write it into public/content/grounding.json under the keys refine-content
// reads (`chimie-6/module-0N-<slug>`). This lets refine GROUND the ocr-raw
// chimie-6 lessons in the real manual text instead of generating from the title.
// Figures are stripped here (grounding is text-only); the inline SVG figures are
// re-attached later by inject-chimie6-figures.mjs. Idempotent; run once after the
// source changes: `node scripts/build-chimie6-grounding.mjs`.
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "content/sources/chimie-6-notions.md");
const GJSON = path.join(ROOT, "public/content/grounding.json");

// Chapter (roman) → module-0N-<slug>, in book order. Slugs match the manifest
// module titles run through refine's slugify.
const MODULES = [
  ["I", "module-01-notions-fondamentales"],
  ["II", "module-02-courbes-de-neutralisation"],
  ["III", "module-03-reactions-d-oxydo-reduction"],
  ["IV", "module-04-electrochimie"],
  ["V", "module-05-analyse-chimique-quantitative"],
  ["VI", "module-06-atomistique"],
  ["VII", "module-07-liaison-chimique"],
  ["VIII", "module-08-le-noyau-et-la-radioactivite"],
];

const lines = fs.readFileSync(SRC, "utf8").split("\n");

// The body chapter heading is the LAST `# Chapitre <roman>` occurrence (each part
// carries its own mini-TOC with an identical heading line before its body). \b
// keeps I≠II, V≠VI, etc.
const bodyStart = (roman) => {
  let last = -1;
  const re = new RegExp(`^#+\\s*Chapitre\\s+${roman}\\b`, "i");
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) last = i;
  return last;
};

const clean = (seg) =>
  seg
    .replace(/<figure class="ai-figure[\s\S]*?<\/figure>/g, " ") // drop SVG figures
    .replace(/<!--[\s\S]*?-->/g, " ")                             // page/part markers
    .replace(/<[^>]+>/g, " ")                                     // any stray HTML
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s+|\s+$/g, "");

const starts = MODULES.map(([r]) => bodyStart(r));
if (starts.some((s) => s < 0)) {
  console.error("Missing chapter heading(s):", MODULES.filter((_, i) => starts[i] < 0).map((m) => m[0]));
  process.exit(1);
}

const grounding = JSON.parse(fs.readFileSync(GJSON, "utf8"));
MODULES.forEach(([roman, slug], k) => {
  const a = starts[k];
  const b = k < MODULES.length - 1 ? starts[k + 1] : lines.length;
  const text = clean(lines.slice(a, b).join("\n"));
  grounding[`chimie-6/${slug}`] = text;
  console.log(`chimie-6/${slug}  (Ch. ${roman})  ${text.length} chars`);
});

fs.writeFileSync(GJSON, JSON.stringify(grounding, null, 2), "utf8");
console.log(`\nWrote ${GJSON} — ${Object.keys(grounding).length} total grounding keys.`);
