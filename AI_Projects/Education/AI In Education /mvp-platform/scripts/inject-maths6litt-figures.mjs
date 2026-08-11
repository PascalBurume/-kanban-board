// Inject the illustrated content of "Maîtriser les Maths 6.2" — the Loyola edition for
// the littéraire, pédagogique and technique sections — into Mathématiques (littéraire)
// — 6e. Its seven chapters (Ensembles et relations → Étude d'une fonction) match that
// subject's seven modules one for one, in order.
//
// Figures arrive as SVG inside the transcription, so nothing is extracted or redrawn.
import path from "node:path";
import url from "node:url";
import { injectBookFigures } from "./inject-book-figures.mjs";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");

injectBookFigures({
  src: path.join(ROOT, "content/sources/maths-6-litteraire-maitriser.md"),
  refined: path.join(ROOT, "public/content/refined/maths-6-litteraire"),
  label: "inject-maths6litt",
  bookTitle: "Maîtriser les Maths 6.2",
  book: "maths-6-litteraire",
});
