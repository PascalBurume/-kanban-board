// Puts the movable figures into the trigonometry lessons.
//
// Runs AFTER inject-trigonometrie.mjs, which rebuilds those lessons from the scan on
// every predev — so this cannot be a one-off edit to the JSON, it has to be a pass that
// re-applies itself. It is idempotent by construction: every ```figure fence carrying
// `"type": "interactive"` is stripped before anything is inserted, so the fences it
// writes are the only ones that can exist and running it twice changes nothing.
//
// Placement is deliberate. Each widget goes immediately AFTER the book's own
// reconstruction of the same figure, never instead of it. The scan is the source of
// record and the lesson still shows exactly what the 1962 page showed; the widget is the
// same figure with the point unpinned, which is the one thing print could not do.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const REFINED = path.join(ROOT, "public/content/refined/trigonometrie");

/**
 * Where each widget goes.
 *
 * Lessons are matched on their TITLE, not their slug or their index: the slugs carry a
 * positional number ("…-3-manuel-illustre-3") that shifts whenever the upstream splitter
 * groups the scan differently, and silently attaching the sinusoid to the wrong article
 * is worse than attaching it to none.
 */
const TARGETS = [
  {
    file: "module-1-arcs-et-angles-orientes.json",
    title: "Arcs orientés sur un cercle",
    spec: {
      type: "interactive",
      widget: "cercle-trigonometrique",
      angle: 52,
      // Only the arc: cosine and sine are not defined until the next chapter, and
      // showing them here would answer a question the pupil has not been asked yet.
      show: ["angle", "coords"],
      caption: "Arc orienté AM sur le cercle : déplacez M pour changer la mesure de l'arc.",
    },
  },
  {
    file: "module-2-fonctions-circulaires.json",
    title: "Définition des fonctions circulaires",
    spec: {
      type: "interactive",
      widget: "cercle-trigonometrique",
      angle: 38,
      show: ["cos", "sin", "tan", "angle"],
      caption: "Fig. 9 — l'abscisse de M est cos α, son ordonnée sin α, et la tangente en A porte tan α.",
    },
  },
  {
    file: "module-2-fonctions-circulaires.json",
    title: "Arcs associés",
    spec: {
      type: "interactive",
      widget: "arcs-associes",
      angle: 54,
      caption: "Fig. 12 — M et ses symétriques : les arcs −α, π−α et π+α suivent M.",
    },
  },
  {
    file: "module-2-fonctions-circulaires.json",
    title: "FONCTION: y = cos x",
    spec: {
      type: "interactive",
      widget: "sinusoide",
      fn: "cos",
      angle: 40,
      caption: "Le cercle à gauche, la courbe à droite : l'ordonnée de P est le cosinus de l'arc parcouru.",
    },
  },
  {
    file: "module-7-resolution-des-triangles-cas-classiques.json",
    title: "Définition",
    spec: {
      type: "interactive",
      widget: "triangle-quelconque",
      caption: "Déplacez A, B ou C : les trois quotients a/sin A, b/sin B et c/sin C restent égaux.",
    },
  },
];

const fence = (spec) => "```figure\n" + JSON.stringify(spec, null, 2) + "\n```";

/** Drop every interactive fence this script has ever written. */
function stripInteractive(md) {
  return md.replace(/```figure\n([\s\S]*?)\n```\n?/g, (whole, body) => {
    try {
      return JSON.parse(body)?.type === "interactive" ? "" : whole;
    } catch {
      return whole;
    }
  });
}

/**
 * The offset to insert at: just past the book's own figure, else past the provenance
 * note at the top, else the very start.
 */
function insertionPoint(md) {
  const fig = md.indexOf("</figure>");
  if (fig !== -1) {
    const nl = md.indexOf("\n", fig);
    return nl === -1 ? md.length : nl + 1;
  }
  const quote = md.match(/^>.*$/m);
  if (quote) {
    const end = (quote.index ?? 0) + quote[0].length;
    const nl = md.indexOf("\n", end);
    return nl === -1 ? md.length : nl + 1;
  }
  return 0;
}

if (!fs.existsSync(REFINED)) {
  console.log("inject-trigo-interactives: trigonométrie not built — skipping.");
  process.exit(0);
}

let placed = 0;
const missing = [];
const byFile = new Map();
for (const t of TARGETS) {
  if (!byFile.has(t.file)) byFile.set(t.file, []);
  byFile.get(t.file).push(t);
}

for (const [file, targets] of byFile) {
  const p = path.join(REFINED, file);
  if (!fs.existsSync(p)) {
    for (const t of targets) missing.push(`${file} (absent)`);
    continue;
  }
  const mod = JSON.parse(fs.readFileSync(p, "utf8"));
  let touched = false;

  // Strip first, across every lesson in the module — including lessons no target names
  // any more, so a widget that has been retired actually disappears.
  for (const lesson of mod.lessons ?? []) {
    const before = lesson.contentMd ?? "";
    const after = stripInteractive(before);
    if (after !== before) { lesson.contentMd = after; touched = true; }
  }

  for (const t of targets) {
    const lesson = (mod.lessons ?? []).find((l) => l.title === t.title);
    if (!lesson) { missing.push(`${file} › « ${t.title} »`); continue; }
    const md = lesson.contentMd ?? "";
    const at = insertionPoint(md);
    lesson.contentMd = `${md.slice(0, at).replace(/\s*$/, "\n")}\n${fence(t.spec)}\n\n${md.slice(at).replace(/^\s*/, "")}`;
    touched = true;
    placed += 1;
    console.log(`inject-trigo-interactives: ${t.spec.widget.padEnd(24)} → ${file.replace(/\.json$/, "")} › ${t.title}`);
  }

  if (touched) fs.writeFileSync(p, JSON.stringify(mod, null, 2) + "\n");
}

for (const m of missing) console.log(`inject-trigo-interactives: NOT PLACED — ${m}`);
console.log(`inject-trigo-interactives: ${placed}/${TARGETS.length} figure(s) interactive(s) placée(s).`);
