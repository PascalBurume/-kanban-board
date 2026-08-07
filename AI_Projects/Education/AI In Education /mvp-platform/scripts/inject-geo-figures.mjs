// Inject the hand-authored SVG épures from the Géométrie descriptive source book
// into the refined lesson JSON that prisma/seed.ts consumes.
//
// WHY THIS EXISTS: the source book (content/sources/geometrie-descriptive-6-muselu.md)
// carries the geometry figures as inline <figure><svg>…</svg></figure> HTML. The
// LLM refine step (scripts/refine-content.mjs) rewrites prose and would STRIP raw
// SVG, so figures cannot live in the refine output — they are injected here, AFTER
// refinement. Never re-run refine on this book expecting figures to survive; re-run
// THIS instead (it is idempotent).
//
// For each chapter (IV/V/VI → module-1/2/3) it takes the whole exercise region
// verbatim (every figure preserved), inserts "## Exercice NN" headings, bakes the
// hard breaks the lesson reader needs, splits into ~3 balanced "Exercices résolus
// avec épures" lessons, and appends them. A chapter's intro concept figure, when
// present, is added to the module's last existing lesson. Safe to run on every
// predev/prebuild — no-ops cleanly if the source or refined JSON is missing.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "content/sources/geometrie-descriptive-6-muselu.md");
const REFINED = path.join(ROOT, "public/content/refined/geometrie-descriptive-6");

if (!fs.existsSync(SRC) || !fs.existsSync(REFINED)) {
  console.log("inject-geo-figures: source or refined dir missing — skipping.");
  process.exit(0);
}

const lines = fs.readFileSync(SRC, "utf8").split("\n");

const CHAPTERS = [
  { re: /^#\s*IV\.\s*RABATTEMENTS/i,   next: /^#\s*V\.\s*CHANGEMENT/i,  file: "module-1-rabattements.json",                     prefix: "module-1-rabattements",                     min: 61, max: 80 },
  { re: /^#\s*V\.\s*CHANGEMENT/i,      next: /^#\s*VI\.\s*PROBLEMES/i,  file: "module-2-changement-de-plans-de-projection.json", prefix: "module-2-changement-de-plans-de-projection", min: 81, max: 90 },
  { re: /^#\s*VI\.\s*PROBLEMES/i,      next: /^#\s*BIBLIOGRAPHIE/i,     file: "module-3-problemes-de-synthese.json",            prefix: "module-3-problemes-de-synthese",            min: 91, max: 105 },
];

const lineIdx = (re, from = 0) => { for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i; return -1; };

// Exercise-start detector: "NN.", "# NN.", and the OCR alias "B1." (→ 81).
function exerciseNo(line) {
  // Statement starts with any non-space (some exercises open with a lowercase
  // sub-item, e.g. "80. a. Marquer…"); the min/max range guard at the call site
  // rejects page numbers and stray references.
  const m = line.match(/^#?\s*-?\s*([B0-9]\d{0,2})\.\s+\S/);
  if (!m) return null;
  let tok = m[1];
  if (/^B/.test(tok)) tok = "8" + tok.slice(1);
  const n = Number(tok);
  return Number.isFinite(n) ? n : null;
}

// The OCR left descriptive-geometry notation (A^H, d^V, A_R, ch^V, (ABC)_R^V…)
// as bare text in chapters V/VI — carets show literally and KaTeX never runs.
// Wrap those tokens in $…$. Existing $…$/$$…$$ spans and <figure> blocks are
// protected so nothing is double-wrapped or touched inside SVG.
const GREEK = { "α": "\\alpha", "β": "\\beta", "γ": "\\gamma", "δ": "\\delta", "π": "\\pi", "θ": "\\theta", "λ": "\\lambda", "μ": "\\mu", "ω": "\\omega", "Δ": "\\Delta" };
const MATH_TOKEN = /((?:\([A-Za-z0-9]+\)|[A-Za-zα-ωΑ-Ω]{1,3})'?(?:[\^_](?:\{[^}]*\}|[A-Za-z0-9]+'?|\([A-Za-z0-9]+\)))+)/g;
function wrapBareMath(s) {
  return s
    .split(/(<figure class="ai-figure[\s\S]*?<\/figure>|\$\$[\s\S]*?\$\$|\$[^$\n]*?\$)/g)
    .map((part, i) => (i % 2 ? part : part.replace(MATH_TOKEN, (m) => `$${m.replace(/[α-ωΑ-Ω]/g, (c) => (GREEK[c] ? GREEK[c] + " " : c))}$`)))
    .join("");
}

function clean(text) {
  const out = text
    .replace(/^<!--\s*page[^>]*-->\s*$/gim, "")
    .replace(/^\s*\d{1,3}\s*$/gm, "")                                  // lone page numbers
    .replace(/^\s*-{3,}\s*$/gm, "")                                    // OCR page rules
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => `$${m.trim()}$`)         // \(..\) → $..$
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => `$$${m.trim()}$$`)       // \[..\] → $$..$$
    .replace(/^#?\s*SOLUTION\s*:?\s*(.*)$/gim, (_, r) => `**Solution.** ${r.trim()}`.trim())
    .replace(/^#\s+(.*\S)\s*$/gm, (_, t) => `**${t.trim()}**`)         // stray "# sub" → bold
    .replace(/\n{3,}/g, "\n\n");
  return wrapBareMath(out).trim();
}

// Bake hard breaks (same $$-protected logic as src/components/Markdown.js) so
// exercise sub-items render on their own line without the reader's `breaks` prop.
const bakeBreaks = (md) =>
  md.split(/(\$\$[\s\S]*?\$\$)/g).map((p, i) => (i % 2 ? p : p.replace(/(?<! {2})\n(?!\n)/g, "  \n"))).join("");

const INTRO =
  "> Les figures ci-dessous sont des épures **redessinées à la main d'après le scan** " +
  "de l'ouvrage de Muselu wa Muswiyi (*Exercices de géométrie descriptive*, Coll. Boboto, 1988) — " +
  "ce sont des reconstructions vérifiées, non le document original.\n\n";

const countFigs = (s) => (s.match(/<figure class="ai-figure/g) || []).length;

for (const ch of CHAPTERS) {
  const start = lineIdx(ch.re);
  const end = lineIdx(ch.next, start + 1);
  const jsonPath = path.join(REFINED, ch.file);
  if (start < 0 || end < 0 || !fs.existsSync(jsonPath)) { console.log(`inject-geo-figures: skip ${ch.file}`); continue; }
  const region = lines.slice(start + 1, end);

  let firstEx = region.findIndex((l) => { const n = exerciseNo(l); return n !== null && n >= ch.min && n <= ch.max; });
  if (firstEx < 0) { console.log(`inject-geo-figures: no exercises in ${ch.file}`); continue; }

  const conceptFig = (region.slice(0, firstEx).join("\n").match(/<figure class="ai-figure[\s\S]*?<\/figure>/) || [null])[0];

  const out = [];
  for (const line of region.slice(firstEx)) {
    const n = exerciseNo(line);
    if (n !== null && n >= ch.min && n <= ch.max) {
      out.push(`\n## Exercice ${n}\n`, line.replace(/^#?\s*-?\s*[B0-9]\d{0,2}\.\s*/, ""));
    } else out.push(line);
  }
  let body = clean(out.join("\n")).replace(/([^\n])\n(\*\*Solution\.\*\*)/g, "$1\n\n$2");
  body = bakeBreaks(body);

  const chunks = body.split(/(?=\n## Exercice )/).map((s) => s.trim()).filter(Boolean);
  const TARGET = 3;
  const perLesson = Math.max(1, Math.ceil(countFigs(body) / TARGET));
  const groups = [];
  let cur = [], curF = 0;
  for (const c of chunks) {
    const f = countFigs(c);
    if (cur.length && curF + f > perLesson && groups.length < TARGET - 1) { groups.push(cur); cur = []; curF = 0; }
    cur.push(c); curF += f;
  }
  if (cur.length) groups.push(cur);

  const mod = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  mod.lessons = mod.lessons.filter((l) => !/exercices-resolus-epures/.test(l.slug));
  const baseOrder = mod.lessons.length;

  if (conceptFig && mod.lessons.length) {
    const last = mod.lessons[mod.lessons.length - 1];
    last.contentMd = last.contentMd.replace(/\n*## Exemple d'épure[\s\S]*$/, "").trimEnd() +
      `\n\n## Exemple d'épure\n\nExemple d'épure de ce chapitre :\n\n${conceptFig}`;
  }

  groups.forEach((g, i) => {
    const nums = g.join("").match(/## Exercice (\d+)/g)?.map((s) => s.match(/\d+/)[0]) || [];
    const label = !nums.length ? `(${i + 1})`
      : nums[0] === nums[nums.length - 1] ? `nº ${nums[0]}`
      : `nº ${nums[0]} à ${nums[nums.length - 1]}`;
    mod.lessons.push({
      slug: `${ch.prefix}-${baseOrder + 1 + i}-exercices-resolus-epures-${i + 1}`,
      title: `Exercices résolus avec épures (${i + 1}) — ${label}`,
      order: baseOrder + 1 + i,
      estMinutes: 20,
      degraded: true,
      contentMd: INTRO + g.join("\n\n"),
      quiz: null,
    });
  });

  fs.writeFileSync(jsonPath, JSON.stringify(mod, null, 2) + "\n");
  const figsInNew = groups.reduce((s, g) => s + countFigs(g.join("")), 0);
  console.log(`inject-geo-figures: ${ch.file} → +${groups.length} lessons, ${figsInNew} figs${conceptFig ? " +1 concept" : ""}`);
}
