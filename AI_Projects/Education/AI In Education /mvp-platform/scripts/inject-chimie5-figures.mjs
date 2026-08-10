// Inject the illustrated content of "Notions de Chimie 5" into the refined lesson
// JSON that seed.ts consumes. The mechanics live in inject-book-figures.mjs,
// shared with maths-5 and maths-6.
import path from "node:path";
import url from "node:url";
import { injectBookFigures } from "./inject-book-figures.mjs";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");

injectBookFigures({
  src: path.join(ROOT, "content/sources/chimie-5-notions.md"),
  refined: path.join(ROOT, "public/content/refined/chimie-5"),
  label: "inject-chimie5",
  bookTitle: "Notions de Chimie 5",
  book: "chimie-5",
});
