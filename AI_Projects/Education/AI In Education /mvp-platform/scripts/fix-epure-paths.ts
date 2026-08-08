/**
 * One-shot migration: move every épure path out of "buggy space".
 *
 * renderEpure used to transform a path's `d` by pairing up every two numbers as if they
 * were an (x, y). They are not: `A rx ry rotation large-arc sweep x y` has five
 * parameters that are not coordinates. The catalogue was GENERATED against that bug
 * (scripts/convert-catalogue.ts had the same regex), so its stored paths only render
 * correctly because the flip is its own inverse and those arcs happen to be horizontal.
 * Any arc that is not horizontal, any figure without a frame, and any comma-separated
 * path was already wrong on screen.
 *
 * With the transform fixed, the stored data has to move with it. For each path:
 *
 *     onScreen = oldTransform(stored)          ← the truth, what teachers see today
 *     newStored = newTransform(onScreen)       ← the framed transform is an involution
 *     assert newTransform(newStored) == onScreen
 *
 * so every figure renders byte-for-byte as it does now, and the data underneath finally
 * means what it says. Run with:  npx tsx scripts/fix-epure-paths.ts [--write]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { EPURE_CATALOGUE } from "../src/lib/epureCatalogue";
import { fit, renderEpure, transformPathD } from "../src/lib/epure";

const WRITE = process.argv.includes("--write");
const CATALOGUE = "src/lib/epureCatalogue.ts";

/** The transform exactly as it was, so "what is on screen today" is not a guess. */
const at1 = (n: number) => Math.round(n * 10) / 10;
const oldTransform = (d: string, g: { sx: (n: number) => number; sy: (n: number) => number }) =>
  String(d ?? "").replace(/(-?\d*\.?\d+)\s+(-?\d*\.?\d+)/g, (_m, a, b) => `${at1(g.sx(Number(a)))} ${at1(g.sy(Number(b)))}`);

/** SVG does not care where the spaces are; comparing geometry, not formatting. */
const norm = (d: string) => d.replace(/([A-Za-z])/g, " $1 ").replace(/[\s,]+/g, " ").trim();

let checked = 0;
const failures: string[] = [];

function migrate(spec: any, label: string): { spec: any; changed: string[] } {
  const changed: string[] = [];
  if (!spec?.paths?.length) return { spec, changed };
  const g = fit(spec);
  const paths = spec.paths.map((p: any, i: number) => {
    const stored = String(p.d ?? "");
    if (!stored.trim()) return p;
    const onScreen = oldTransform(stored, g);
    const newStored = transformPathD(onScreen, g);
    // The gate: the migrated data must render to exactly what is on screen today.
    const rendered = transformPathD(newStored, g);
    checked++;
    if (norm(rendered) !== norm(onScreen)) {
      failures.push(`${label}[${i}]\n    on screen : ${onScreen}\n    re-render : ${rendered}`);
    }
    changed.push(`${stored}  ->  ${newStored}`);
    return { ...p, d: newStored };
  });
  return { spec: { ...spec, paths }, changed };
}

// ── 1. the catalogue ────────────────────────────────────────────────────────
async function main() {
const newDs: string[] = [];
let figuresTouched = 0;
for (const [key, spec] of Object.entries(EPURE_CATALOGUE as any)) {
  const { spec: next, changed } = migrate(spec, key);
  if (!changed.length) continue;
  figuresTouched++;
  for (const p of (next as any).paths) newDs.push(String(p.d ?? ""));
}

// Object key order is insertion order, which is file order, and paths keep their order
// within a figure — so the nth `"d":"…"` in the file is the nth migrated value.
const src = readFileSync(CATALOGUE, "utf8");
const occurrences = src.match(/"d":"[^"]*"/g) ?? [];
if (occurrences.length !== newDs.length) {
  failures.push(`catalogue: found ${occurrences.length} "d" in the file but migrated ${newDs.length}`);
}
let n = 0;
const out = src.replace(/"d":"[^"]*"/g, () => `"d":"${newDs[n++]}"`);

// ── 2. lessons whose markdown carries an épure ──────────────────────────────
const prisma = new PrismaClient();
const lessons = await prisma.lesson.findMany({
  where: { contentMd: { contains: '"epure"' } },
  select: { id: true, title: true, contentMd: true },
});
const lessonEdits: { id: string; title: string; md: string }[] = [];
for (const l of lessons) {
  let touched = false;
  const md = l.contentMd.replace(/```figure\n([\s\S]*?)\n```/g, (whole, body) => {
    let spec: any;
    try { spec = JSON.parse(body); } catch { return whole; }
    if (spec?.type !== "epure" || !spec.paths?.length) return whole;
    const { spec: next, changed } = migrate(spec, `${l.title || l.id}`);
    if (!changed.length) return whole;
    touched = true;
    return "```figure\n" + JSON.stringify(next, null, 2) + "\n```";
  });
  if (touched) lessonEdits.push({ id: l.id, title: l.title, md });
}

// ── report ─────────────────────────────────────────────────────────────────
console.log(`catalogue : ${figuresTouched} figures, ${newDs.length} paths`);
console.log(`lessons   : ${lessonEdits.length} of ${lessons.length} épure-bearing lessons`);
console.log(`gate      : ${checked} paths checked, ${failures.length} mismatches`);
if (failures.length) {
  console.log("\nFAILED — nothing written:\n" + failures.slice(0, 10).join("\n"));
  await prisma.$disconnect();
  process.exit(1);
}

if (!WRITE) {
  console.log("\nDry run. Sample:");
  console.log("  " + (newDs[0] ?? "—"));
  await prisma.$disconnect();
  process.exit(0);
}

writeFileSync(CATALOGUE, out);
for (const e of lessonEdits) await prisma.lesson.update({ where: { id: e.id }, data: { contentMd: e.md } });
console.log(`\nwritten: ${CATALOGUE} + ${lessonEdits.length} lesson(s)`);
await prisma.$disconnect();

}

// Silence the unused-import warning while keeping renderEpure available for ad-hoc checks.
void renderEpure;
main();
