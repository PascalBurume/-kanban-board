// Delete uploaded pictures no lesson refers to any more.
//
// Dry run by default. `--apply` deletes. That default is not politeness: the one thing
// this script must never do is delete a picture a lesson still shows, and the way to
// be sure is to read the list first.
//
// It walks LessonVersion as well as Lesson, and that is the whole subtlety. History is
// restorable — restoring a two-week-old version of a lesson whose picture was pruned
// last week would bring back text with a hole in it. A referenced-anywhere-ever file
// stays.

import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

/** Every /api/uploads/… filename mentioned in a blob of markdown. */
function referenced(md, into) {
  for (const m of (md || "").matchAll(/\/api\/uploads\/lessons\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+\.[A-Za-z0-9]+)/g)) {
    into.add(`${m[1]}/${m[2]}`);
  }
}

async function main() {
  const keep = new Set();
  for (const l of await prisma.lesson.findMany({ select: { contentMd: true } })) referenced(l.contentMd, keep);
  for (const v of await prisma.lessonVersion.findMany({ select: { contentMd: true } })) referenced(v.contentMd, keep);

  const root = path.join(UPLOAD_DIR, "lessons");
  const lessons = await fs.readdir(root).catch(() => []);
  let kept = 0;
  const dead = [];
  for (const lessonId of lessons) {
    const dir = path.join(root, lessonId);
    for (const name of await fs.readdir(dir).catch(() => [])) {
      const rel = `${lessonId}/${name}`;
      if (keep.has(rel)) { kept++; continue; }
      const st = await fs.stat(path.join(dir, name)).catch(() => null);
      if (st?.isFile()) dead.push({ file: path.join(dir, name), rel, size: st.size });
    }
  }

  const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} Mo`;
  const freed = dead.reduce((a, d) => a + d.size, 0);
  console.log(`référencées : ${kept}`);
  console.log(`orphelines  : ${dead.length} (${mb(freed)})`);
  for (const d of dead) console.log(`  ${APPLY ? "supprimée" : "à supprimer"}  ${d.rel}  ${mb(d.size)}`);

  if (!APPLY) {
    console.log(dead.length ? "\nSimulation. Relancez avec --apply pour supprimer." : "\nRien à supprimer.");
    return;
  }
  for (const d of dead) await fs.rm(d.file, { force: true });
  // An empty lesson folder left behind is noise, not data.
  for (const lessonId of lessons) {
    const dir = path.join(root, lessonId);
    const rest = await fs.readdir(dir).catch(() => ["x"]);
    if (!rest.length) await fs.rmdir(dir).catch(() => {});
  }
  console.log(`\n${dead.length} fichier(s) supprimé(s), ${mb(freed)} libérés.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
