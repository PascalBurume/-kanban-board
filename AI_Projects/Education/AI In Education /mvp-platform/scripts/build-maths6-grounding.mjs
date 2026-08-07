// One-shot builder: extract per-chapter plain text from the transcribed source
// of "Maîtriser les Maths 6" (content/sources/maths-6-scientifique-maitriser.md,
// = pdftotext of the scanned manual) and write it into public/content/grounding.json
// under the keys refine reads (`maths-6-scientifique/module-<N>-<slug>`). This
// grounds the previously-blind maths-6 exercise reconstructions in the real book
// text — statements AND the 410 worked solutions. Idempotent; re-run after the
// source changes: `node scripts/build-maths6-grounding.mjs`.
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "content/sources/maths-6-scientifique-maitriser.md");
const GJSON = path.join(ROOT, "public/content/grounding.json");

// Chapter (roman) → module-<N>-<slug>, book order. Slugs match the refined dir.
const MODULES = [
  ["I", "module-1-structures-algebriques-et-morphismes"],
  ["II", "module-2-le-corps-c-des-nombres-complexes"],
  ["III", "module-3-fonctions-exponentielles-et-logarithmiques"],
  ["IV", "module-4-developpement-d-une-fonction-par-taylor-mac-laurin"],
  ["V", "module-5-differentielles"],
  ["VI", "module-6-integrales"],
  ["VII", "module-7-generalites-sur-la-geometrie-orientee"],
  ["VIII", "module-8-courbes-parametrees"],
  ["IX", "module-9-la-droite"],
  ["X", "module-10-le-cercle"],
  ["XI", "module-11-courbes-du-second-degre-coniques"],
  ["XII", "module-12-lieux-geometriques"],
  ["XIII", "module-13-elements-d-etude-d-une-conique"],
  ["XIV", "module-14-recherche-des-equations-des-coniques"],
  ["XV", "module-15-etude-des-coniques-particulieres"],
  ["XVI", "module-16-transformations-du-plan"],
  ["XVII", "module-17-introduction-a-la-geometrie-dans-l-espace"],
];

const lines = fs.readFileSync(SRC, "utf8").split("\n");

// The body chapter heading is the LAST `CHAPITRE <roman> :` occurrence — the
// table of contents carries an identical heading earlier. The strict `:` after
// the exact roman keeps I≠II, V≠VI, X≠XI, etc.
const bodyStart = (roman) => {
  let last = -1;
  const re = new RegExp(`^CHAPITRE ${roman}\\s*:`, "i");
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) last = i;
  return last;
};

const clean = (seg) =>
  seg
    .replace(/^\s*Figure recreated by AI.*$/gim, " ")          // AI-figure caption notes
    .replace(/^\s*Illustration .*montrant.*$/gim, " ")         // cover caption
    .replace(/^\s*page \d+\s*$/gim, " ")                        // page markers
    .replace(/\f/g, " ")                                        // form feeds
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

// Resolve each chapter's body span, in file order.
const starts = MODULES.map(([roman, slug]) => ({ roman, slug, start: bodyStart(roman) }));
for (const s of starts) if (s.start < 0) throw new Error(`chapter ${s.roman} not found in source`);
starts.sort((a, b) => a.start - b.start);

const grounding = JSON.parse(fs.readFileSync(GJSON, "utf8"));
let written = 0, chars = 0;
for (let i = 0; i < starts.length; i++) {
  const { slug, start } = starts[i];
  const end = i + 1 < starts.length ? starts[i + 1].start : lines.length;
  const text = clean(lines.slice(start, end).join("\n"));
  const key = `maths-6-scientifique/${slug}`;
  grounding[key] = text;
  written++;
  chars += text.length;
  console.log(`  ${key} — ${text.length} chars`);
}

fs.writeFileSync(GJSON, JSON.stringify(grounding), "utf8");
console.log(`\nbuild-maths6-grounding: wrote ${written} chapters (${Math.round(chars / 1000)}k chars) → grounding.json`);
