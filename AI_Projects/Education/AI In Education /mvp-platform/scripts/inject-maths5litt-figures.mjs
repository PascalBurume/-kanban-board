// Inject the illustrated content of "Maîtriser les Maths 5.2" — the Loyola edition for
// the littéraire, pédagogique and technique sections — into Mathématiques (littéraire)
// — 5e. Its eleven chapters match that subject's eleven modules one for one, in order,
// which is the mapping injectBookFigures already assumes.
//
// This book carries its figures as SVG in the transcription itself, so unlike maths-6
// scientifique there is nothing to extract from the PDF and nothing to redraw.
import path from "node:path";
import url from "node:url";
import { injectBookFigures } from "./inject-book-figures.mjs";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");

injectBookFigures({
  src: path.join(ROOT, "content/sources/maths-5-litteraire-maitriser.md"),
  refined: path.join(ROOT, "public/content/refined/maths-5-litteraire"),
  label: "inject-maths5litt",
  bookTitle: "Maîtriser les Maths 5.2",
  book: "maths-5-litteraire",
});
