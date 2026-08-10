// Inject the illustrated content of "Maîtriser les Maths 5" (source textbook for
// the Mathématiques — 5e book) into the refined lesson JSON that seed.ts consumes.
// The mechanics live in inject-book-figures.mjs, shared with maths-6 and chimie-5.
import path from "node:path";
import url from "node:url";
import { injectBookFigures } from "./inject-book-figures.mjs";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");

injectBookFigures({
  src: path.join(ROOT, "content/sources/maths-5-scientifique-maitriser.md"),
  refined: path.join(ROOT, "public/content/refined/maths-5-scientifique"),
  label: "inject-maths5",
  bookTitle: "Maîtriser les Maths 5",
});
