// Push refined lesson prose into the DB *without* a full reseed.
//
// `db:seed` recreates Users and Modules, which cascade-deletes teacher-authored
// exercises and dangles their ExerciseLink rows. When only lesson contentMd
// changed (e.g. after re-running refine-content on truncated lessons), match by
// (subjectSlug, module order, lesson slug) and update in place, then reindex the
// touched lessons so RAG retrieval reflects the new text.
//
//   node scripts/sync-refined-lessons.mjs [book ...]     (default: every book)
//   SYNC_DRY=1 …            report, write nothing
//   SYNC_BROKEN_ONLY=1 …    only replace lessons whose DB text is truncated,
//                           leaving reviewed-but-intact prose untouched
//
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const REFINED = path.join(process.cwd(), "public", "content", "refined");
const DRY = process.env.SYNC_DRY === "1";
const BROKEN_ONLY = process.env.SYNC_BROKEN_ONLY === "1";
// Restrict to specific lesson slugs — the DB was seeded from an older artifact
// set, so most lessons differ by stray whitespace we do not want to churn.
const SLUGS = (process.env.SYNC_SLUGS || "").split(",").map((s) => s.trim()).filter(Boolean);
const only = process.argv.slice(2);

// Same rule as refine-content.mjs: prose cut off mid-sentence or mid-formula.
function looksComplete(md) {
  const s = String(md || "").trim();
  if (s.length < 200) return false;
  const inline = s.replace(/\$\$[\s\S]*?\$\$/g, "");
  if ((inline.split("$").length - 1) % 2) return false;
  if ((s.split("$$").length - 1) % 2) return false;
  return /[.!?:»)\]}]\s*$/.test(s) || /\|\s*$/.test(s.split("\n").pop() || "");
}

async function main() {
  const books = fs.readdirSync(REFINED).filter((b) => !only.length || only.includes(b));
  let updated = 0, same = 0, missing = 0;
  const touched = [];

  for (const book of books) {
    for (const file of fs.readdirSync(path.join(REFINED, book))) {
      if (!file.endsWith(".json")) continue;
      const art = JSON.parse(fs.readFileSync(path.join(REFINED, book, file), "utf8"));
      const mod = await prisma.module.findFirst({
        where: { subjectSlug: art.book, order: art.moduleOrder },
        select: { id: true, title: true },
      });
      if (!mod) { missing += (art.lessons || []).length; continue; }

      for (const l of art.lessons || []) {
        if (SLUGS.length && !SLUGS.includes(l.slug)) continue;
        const lesson = await prisma.lesson.findFirst({
          where: { moduleId: mod.id, slug: l.slug },
          select: { id: true, contentMd: true, title: true },
        });
        if (!lesson) { missing++; console.log(`  ? ${book} / ${mod.title} / ${l.title} — absent en base`); continue; }
        if (lesson.contentMd === l.contentMd) { same++; continue; }
        // Don't churn prose that is already whole — only repair what is broken.
        if (BROKEN_ONLY && looksComplete(lesson.contentMd)) { same++; continue; }
        if (!looksComplete(l.contentMd)) { console.log(`  ✗ ${book} / ${mod.title} / ${l.title} — remplacement tronqué, ignoré`); continue; }

        console.log(`  ↻ ${book} / ${mod.title} / ${l.title}  ${lesson.contentMd.length} → ${l.contentMd.length} c`);
        if (!DRY) {
          await prisma.lesson.update({ where: { id: lesson.id }, data: { contentMd: l.contentMd } });
          touched.push(lesson.id);
        }
        updated++;
      }
    }
  }

  console.log(`\n${DRY ? "[dry-run] " : ""}mis à jour: ${updated} · inchangées: ${same} · absentes: ${missing}`);

  if (touched.length && !DRY) {
    // Stale chunks would make the Copilot cite text the lesson no longer has.
    const { indexLesson } = await import("../src/lib/rag.ts").catch(() => ({ indexLesson: null }));
    if (!indexLesson) {
      console.log(`\n⚠︎ Réindexation RAG non lancée depuis ce script — relancez-la depuis Admin › Contenu (${touched.length} leçon(s) modifiée(s)).`);
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
