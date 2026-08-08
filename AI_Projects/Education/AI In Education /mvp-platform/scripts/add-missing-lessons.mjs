// Insert refined lessons that exist in the artifacts but not yet in the DB, without a
// reseed.
//
// sync-refined-lessons.mjs is the sibling of this: it UPDATES lessons already in the
// database and reports anything else as "absent en base". A new injector (maths 6) adds
// whole lessons rather than editing existing prose, and `db:seed` is not an option —
// it recreates Users and Modules, cascading away every teacher-authored lesson, exercise
// and thread. So: create the missing ones and touch nothing else.
//
//   node scripts/add-missing-lessons.mjs [book ...]      (default: every book)
//   ADD_DRY=1 …        report, write nothing
//
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const REFINED = path.join(process.cwd(), "public", "content", "refined");
const DRY = process.env.ADD_DRY === "1";
const only = process.argv.slice(2);

// seed.ts drops a leading "# Title" so the reader is not shown the name twice.
function stripLeadingTitle(md, title) {
  const t = String(title || "").trim().toLowerCase();
  return String(md || "").replace(/^\s*#{1,3}\s*(.+)\n+/, (whole, h) =>
    h.trim().toLowerCase() === t ? "" : whole);
}

async function main() {
  const books = fs.readdirSync(REFINED).filter((b) => !only.length || only.includes(b));
  let created = 0, present = 0, noModule = 0;
  const byBook = {};

  for (const book of books) {
    for (const file of fs.readdirSync(path.join(REFINED, book))) {
      if (!file.endsWith(".json")) continue;
      const art = JSON.parse(fs.readFileSync(path.join(REFINED, book, file), "utf8"));
      const mod = await prisma.module.findFirst({
        where: { subjectSlug: art.book, order: art.moduleOrder },
        select: { id: true, title: true },
      });
      if (!mod) { noModule++; console.log(`  ⚠︎ ${book} / ${file} — aucun module en base`); continue; }

      for (const l of art.lessons || []) {
        const exists = await prisma.lesson.findFirst({ where: { moduleId: mod.id, slug: l.slug }, select: { id: true } });
        if (exists) { present++; continue; }

        // Slot it after whatever is already there, so an inserted lesson never collides
        // with the order of a lesson the teacher wrote.
        const last = await prisma.lesson.findFirst({ where: { moduleId: mod.id }, orderBy: { order: "desc" }, select: { order: true } });
        const order = (last?.order ?? 0) + 1;

        console.log(`  + ${book} / ${mod.title} / ${l.title}  (${l.contentMd.length} c, ordre ${order})`);
        if (!DRY) {
          await prisma.lesson.create({
            data: {
              moduleId: mod.id,
              slug: l.slug,
              title: l.title,
              order,
              status: "PUBLISHED",
              contentMd: stripLeadingTitle(l.contentMd, l.title),
              estMinutes: l.estMinutes ?? 15,
              sourceRef: art.sourceRef || null,
            },
          });
        }
        created++;
        byBook[book] = (byBook[book] ?? 0) + 1;
      }
    }
  }

  console.log(`\n${DRY ? "[dry-run] " : ""}créées: ${created} · déjà présentes: ${present} · modules manquants: ${noModule}`);
  for (const [b, n] of Object.entries(byBook)) console.log(`   ${b}: +${n}`);
  if (created && !DRY) {
    console.log("\n⚠︎ Les nouvelles leçons ne sont pas indexées pour le RAG — lancez la réindexation depuis Admin › Contenu.");
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
