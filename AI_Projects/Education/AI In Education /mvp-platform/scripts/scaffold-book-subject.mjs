// Add a new book to the content store as its own subject.
//
// Every subject the platform serves comes from platform_content/manifest.json: it names
// the classes, the sections within them, and the books each section carries, and
// build-content.mjs turns that into what seed.ts reads. A book that is not in the
// manifest does not exist, however well it is transcribed.
//
// This makes the three pieces a new book needs, idempotently:
//   1. a module stub per chapter, under platform_content/books/<slug>/
//   2. the subject + its modules registered in the manifest, under the given sections
//   3. an empty refined module JSON per chapter, for the inject script to fill
//
// Nothing here writes lesson text. The book's own chapters are the lessons, and
// inject-book-figures.mjs puts them in — so no chapter is ever summarised by a model
// and then served as if it were the book.
//
// Usage: imported by a per-book script (see scaffold-trigonometrie.mjs).

import fs from "node:fs";
import path from "node:path";

const slugify = (s) =>
  String(s).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const pad2 = (n) => String(n).padStart(2, "0");

/**
 * @param {object} cfg
 * @param {string} cfg.contentRoot  platform_content, absolute
 * @param {string} cfg.appRoot      the Next app, absolute
 * @param {string} cfg.slug         book slug, e.g. "trigonometrie"
 * @param {string} cfg.bookTitle    full title as printed
 * @param {string} cfg.subjectLabel what a teacher sees, e.g. "Trigonométrie"
 * @param {string} cfg.classe       "5e" | "6e"
 * @param {string} cfg.sourcePdf    filename of the scan, for provenance
 * @param {string[]} cfg.chapters   chapter titles, in book order
 * @param {string[]} cfg.fieldIds   manifest field ids to attach the subject to
 */
export function scaffoldBookSubject(cfg) {
  const { contentRoot, appRoot, slug, bookTitle, subjectLabel, classe, sourcePdf, chapters, fieldIds } = cfg;
  const manifestPath = path.join(contentRoot, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.log(`scaffold(${slug}): no manifest at ${manifestPath} — skipping.`);
    return null;
  }

  const booksDir = path.join(contentRoot, "books", slug);
  fs.mkdirSync(booksDir, { recursive: true });

  const modules = chapters.map((title, i) => {
    const n = i + 1;
    const file = `module-${pad2(n)}-${slugify(title)}.md`;
    const abs = path.join(booksDir, file);
    if (!fs.existsSync(abs)) {
      // A stub, deliberately: the chapter's real text is injected later, straight from
      // the transcription. status "ocr-raw" is the honest label — nothing has been
      // rewritten, and the refine pass has not run over it.
      fs.writeFileSync(abs,
        `---\nbook: ${slug}\nbook_title: "${bookTitle}"\nclasse: "${classe}"\n`
        + `subject: "${subjectLabel}"\nmodule: ${n}\nmodule_title: "${title}"\nfields:\n`
        + fieldIds.map((f) => `  - "${f}"\n`).join("")
        + `source_pdf: "${sourcePdf}"\nsource_pages: ""\nstatus: "ocr-raw"\nlanguage: "fr"\n---\n`
        + `# Module ${n} — ${title}\n\n`
        + `**Classe :** ${classe} · **Matière :** ${subjectLabel} · **Manuel :** ${bookTitle}\n\n`
        + `Le texte de ce chapitre provient du manuel lui-même ; il est inséré par le pipeline.\n`,
        "utf8");
    }
    return { n, title, path: `books/${slug}/${file}` };
  });

  // Register the subject under each requested section, leaving every other book alone.
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  let attached = 0;
  for (const cls of manifest.classes || []) {
    for (const field of cls.fields || []) {
      const label = `${cls.label} · ${field.label}`;
      if (!fieldIds.includes(label) && !fieldIds.includes(field.id)) continue;
      field.subjects = field.subjects || [];
      const existing = field.subjects.find((s) => (s.book || s.id) === slug);
      const entry = {
        id: slug,
        label: subjectLabel,
        book: slug,
        book_title: bookTitle,
        book_index: `books/${slug}/_index.md`,
        modules,
      };
      if (existing) Object.assign(existing, entry);
      else field.subjects.push(entry);
      attached++;
    }
  }
  if (!attached) {
    console.log(`scaffold(${slug}): no manifest section matched ${fieldIds.join(", ")} — nothing attached.`);
    return null;
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  // An empty refined artifact per chapter. seed.ts reads these; the inject script fills
  // them. Writing them empty rather than not at all keeps the two steps independent —
  // the scaffold can be re-run without touching content already injected.
  const refinedDir = path.join(appRoot, "public/content/refined", slug);
  fs.mkdirSync(refinedDir, { recursive: true });
  let created = 0;
  for (const m of modules) {
    const file = path.join(refinedDir, `${slugify(`module-${m.n}-${m.title}`)}.json`);
    if (fs.existsSync(file)) continue;
    fs.writeFileSync(file, JSON.stringify({
      book: slug,
      subject: subjectLabel,
      classLevel: classe,
      moduleTitle: m.title,
      moduleOrder: m.n,
      sourceRef: `content/modules/${slug}/${path.basename(m.path)}`,
      status: "ocr-raw",
      lessons: [],
    }, null, 2) + "\n", "utf8");
    created++;
  }

  console.log(`scaffold(${slug}): ${modules.length} modules, attached to ${attached} section(s), ${created} refined stub(s) created.`);
  return { modules, attached, created };
}
