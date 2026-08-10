// Inject the illustrated content of "Maîtriser les Maths 6" (source textbook for
// the Mathématiques — 6e book) into the refined lesson JSON that seed.ts consumes.
// The mechanics live in inject-book-figures.mjs, shared with maths-5 and chimie-5.
import path from "node:path";
import url from "node:url";
import { injectBookFigures } from "./inject-book-figures.mjs";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");

injectBookFigures({
  src: path.join(ROOT, "content/sources/maths-6-scientifique-maitriser.md"),
  refined: path.join(ROOT, "public/content/refined/maths-6-scientifique"),
  label: "inject-maths6",
  bookTitle: "Maîtriser les Maths 6",
  book: "maths-6-scientifique",
});
