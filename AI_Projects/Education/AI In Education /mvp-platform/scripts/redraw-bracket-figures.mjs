// Replace the rough AI-traced "Mantisses/Nombres" interpolation figures in the
// Maths-5 source with clean, purpose-built SVG. These figures are just three
// numbers grouped by two nested brackets (a partial difference d′/α inside a
// total difference d) — the traced versions are uneven and some have stray OCR
// text baked in ("ue le nombre augmente de 1."). We regenerate them uniformly.
//
// Idempotent: matches each figure by a stable phrase from its caption and swaps
// the whole <figure>…</figure>; re-running regenerates identical output.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "content/sources/maths-5-scientifique-maitriser.md");

// Clean interpolation-bracket figure. rows = [top, mid, bot]; inner labels the
// top→mid bracket, outer the top→bot bracket.
function bracketFig({ title, rows, inner, outer, cap }) {
  const [top, mid, bot] = rows;
  const yTop = 118, yMid = 200, yBot = 282;
  const numX = 250;
  const ul = 34 + title.length * 15;            // title underline width
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 330" width="560" height="330">` +
    `<rect width="560" height="330" fill="#fff"/>` +
    `<g font-family="Georgia, 'Times New Roman', serif" fill="#111">` +
    `<text x="34" y="46" font-size="30" font-weight="700">${esc(title)}</text>` +
    `<line x1="34" y1="55" x2="${ul}" y2="55" stroke="#111" stroke-width="2"/>` +
    `<text x="${numX}" y="${yTop + 10}" font-size="30" text-anchor="end">${esc(top)}</text>` +
    `<text x="${numX}" y="${yMid + 10}" font-size="30" text-anchor="end">${esc(mid)}</text>` +
    `<text x="${numX}" y="${yBot + 10}" font-size="30" text-anchor="end">${esc(bot)}</text>` +
    // inner bracket (top → mid)
    `<path d="M284 ${yTop} H302 V${yMid} H284" fill="none" stroke="#111" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<text x="316" y="${(yTop + yMid) / 2 + 9}" font-size="27" font-style="italic">${esc(inner)}</text>` +
    // outer bracket (top → bot)
    `<path d="M372 ${yTop} H390 V${yBot} H372" fill="none" stroke="#111" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<text x="404" y="${(yTop + yBot) / 2 + 9}" font-size="27" font-style="italic">${esc(outer)}</text>` +
    `</g></svg>`;
  return `<figure class="ai-figure">${svg}<figcaption>${cap} <span class="ai-badge">Figure reconstruite d'après le scan — non le document original.</span></figcaption></figure>`;
}

const FIGS = [
  { key: "3 674,9 entre 3 674 et 3 675", title: "Nombres", rows: ["3 674", "3 674,9", "3 675"], inner: "0,9", outer: "1", cap: "Encadrement de 3 674,9 entre 3 674 et 3 675 : la mantisse augmente de 0,9 sur un pas total de 1." },
  { key: "variation totale de 12", title: "Mantisses", rows: ["56 514", "?", "56 526"], inner: "α", outer: "12", cap: "Mantisses : la variation intermédiaire α se lit dans la variation totale de 12." },
  { key: "écarts entre les nombres 2 305", title: "Nombres", rows: ["2 305", "2 305,64", "2 306"], inner: "0,64", outer: "1", cap: "Écarts entre 2 305, 2 305,64 et 2 306 : partie 0,64 dans un pas de 1." },
  { key: "écart α entre 36 267 et 36 286", title: "Mantisses", rows: ["36 267", "?", "36 286"], inner: "α", outer: "19", cap: "Lecture des mantisses : l'écart α cherché dans l'écart total de 19." },
  { key: "interpolation entre les nombres 2 526 et 2 527", title: "Nombres", rows: ["2 526", "?", "2 527"], inner: "d″", outer: "1", cap: "Interpolation entre 2 526 et 2 527 : différence intermédiaire d″ dans un pas de 1." },
  { key: "d′ = 3 à l’intérieur de l’écart total", title: "Mantisses", rows: ["40 243", "40 246", "40 261"], inner: "d′ = 3", outer: "d = 18", cap: "Écart de mantisse d′ = 3 à l'intérieur de l'écart total d = 18." },
  { key: "encadrement de 3 823 et 3 824", title: "Nombres", rows: ["3 823", "?", "3 824"], inner: "d″", outer: "1", cap: "Encadrement de 3 823 et 3 824 : différence d″ inconnue dans un pas de 1." },
  { key: "interpolation linéaire entre trois mantisses", title: "Mantisses", rows: ["58 240", "58 244", "58 252"], inner: "d′ = 4", outer: "d = 12", cap: "Interpolation entre trois mantisses : d′ = 4 dans d = 12." },
];

let md = fs.readFileSync(SRC, "utf8");
const figRe = /<figure class="ai-figure[\s\S]*?<\/figure>/g;
let replaced = 0;
md = md.replace(figRe, (fig) => {
  const m = FIGS.find((f) => fig.includes(f.key) || fig.includes(f.cap.slice(0, 30)));
  if (!m) return fig;
  replaced++;
  return bracketFig(m);
});
fs.writeFileSync(SRC, md);
console.log(`redraw-bracket-figures: replaced ${replaced}/${FIGS.length} bracket figures with clean SVG`);
