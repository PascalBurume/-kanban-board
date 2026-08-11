// "Trigonométrie" (V. Lespinard & R. Pernet, programme 1962) — a complete trigonometry
// course, given to the two 6e scientific sections as their own subject.
//
// It is not one of the Congolese school manuals: it is a French « Classe de
// Mathématiques » text, and its nine chapters answer to no module list already in the
// platform. So it brings its own — scaffolded here, then filled from the book.
//
// Two things differ from the other books and are handled below:
//   * its chapter headings carry no colon ("CHAPITRE VII", not "CHAPITRE VII : ..."),
//     and the title sits on the following line;
//   * chapter VIII's marker lost its "#" in the scan, so the heading is a bare line.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { injectBookFigures } from "./inject-book-figures.mjs";
import { scaffoldBookSubject } from "./scaffold-book-subject.mjs";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "content/sources/trigonometrie-lespinard.md");
const CONTENT = path.resolve(ROOT, "..", "Books  ", "platform_content");
const REFINED = path.join(ROOT, "public/content/refined/trigonometrie");

if (!fs.existsSync(SRC)) {
  console.log("inject-trigonometrie: source missing — skipping.");
  process.exit(0);
}

// The chapter titles as the book prints them, in order.
const CHAPTERS = [
  "Arcs et angles orientés",
  "Fonctions circulaires",
  "Formules d'addition et de transformation",
  "Équations trigonométriques",
  "Inéquations trigonométriques",
  "Systèmes d'équations trigonométriques",
  "Résolution des triangles — cas classiques",
  "Résolution des triangles — cas non classiques",
  "Quadrilatère convexe inscriptible",
];

scaffoldBookSubject({
  contentRoot: CONTENT,
  appRoot: ROOT,
  slug: "trigonometrie",
  bookTitle: "Trigonométrie — Lespinard & Pernet (programme 1962)",
  subjectLabel: "Trigonométrie",
  classe: "6e",
  sourcePdf: "557062068-Trigonometrie-by-mathsbooks.pdf",
  chapters: CHAPTERS,
  fieldIds: ["6e · Scientifique — Math-Physique", "6e · Scientifique — Biologie-Chimie"],
});

const ROMANS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
const lines = fs.readFileSync(SRC, "utf8").split("\n");

// "CHAPITRE VII" alone on its line — with or without the "#" the scan sometimes drops,
// and never followed by a colon. \\b keeps I from matching II.
const locate = (i) => {
  const roman = ROMANS[i];
  if (!roman) return -1;
  const re = new RegExp(`^#*\\s*CHAPITRE\\s+${roman}\\s*\\.?\\s*$`, "i");
  let last = -1;
  for (let j = 0; j < lines.length; j++) if (re.test(lines[j])) last = j;
  return last;
};

injectBookFigures({
  src: SRC,
  refined: REFINED,
  label: "inject-trigo",
  bookTitle: "Trigonométrie (Lespinard & Pernet)",
  book: "trigonometrie",
  locate,
});
