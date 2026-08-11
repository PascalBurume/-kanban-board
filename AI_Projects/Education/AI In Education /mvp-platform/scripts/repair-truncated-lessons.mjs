// Repair lessons whose prose was cut off mid-sentence by a token budget.
//
// Regenerating is the WRONG fix for ungrounded books (most books have no entry
// in grounding.json, so refine-content falls back to generate-from-title and
// rewrites e.g. "Opérations" as generic derivative prose, losing the product /
// quotient / chain rules). Instead: ask the model to CONTINUE the existing text,
// keep it only if it finishes cleanly without changing the subject, and
// otherwise trim the dangling tail. Both paths preserve the original content.
//
//   node scripts/repair-truncated-lessons.mjs <book> [...]
//   REPAIR_DRY=1 …   report only

import fs from "node:fs";
import path from "node:path";

const OLLAMA = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const MODEL = process.env.OLLAMA_MODEL || "gemma4:e2b";
const REFINED = path.join(process.cwd(), "public", "content", "refined");
const DRY = process.env.REPAIR_DRY === "1";
const books = process.argv.slice(2);

function looksComplete(md) {
  const s = String(md || "").trim();
  if (s.length < 200) return false;
  const inline = s.replace(/\$\$[\s\S]*?\$\$/g, "");
  if ((inline.split("$").length - 1) % 2) return false;
  if ((s.split("$$").length - 1) % 2) return false;
  return /[.!?:»)\]}]\s*$/.test(s) || /\|\s*$/.test(s.split("\n").pop() || "");
}

function trimToComplete(md) {
  const lines = String(md || "").trimEnd().split("\n");
  while (lines.length) {
    const candidate = lines.join("\n").trimEnd();
    if (looksComplete(candidate)) return candidate;
    lines.pop();
  }
  return "";
}

async function ollama(prompt, num_predict = 400) {
  const r = await fetch(`${OLLAMA}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, prompt, stream: false, options: { num_predict, temperature: 0.2, top_p: 0.9 } }),
  });
  if (!r.ok) throw new Error(`ollama ${r.status}`);
  return String((await r.json()).response || "").replace(/▁/g, " ");
}

// Only the tail is regenerated, so the lesson's subject cannot drift.
function continuePrompt(title, md) {
  const tail = md.slice(-700);
  return [
    `Voici la FIN d'une leçon de mathématiques intitulée « ${title} ». La dernière phrase a été coupée en plein milieu.`,
    ``,
    `<<<`,
    tail,
    `>>>`,
    ``,
    `Écris UNIQUEMENT la suite, à partir exactement du point de coupure, pour terminer la phrase interrompue puis clore la section (une ou deux phrases au maximum).`,
    `- ne répète PAS le texte déjà écrit ;`,
    `- reste strictement sur le même sujet ; n'introduis aucune notion nouvelle ;`,
    `- termine par un point ;`,
    `- si des formules sont nécessaires, écris-les entre $...$.`,
  ].join("\n");
}

const KW = /\b(chaîne|quotient|produit|puissance|circulaire|asymptote|continuité|limite|composée|tangente|dérivée)\b/gi;
const keywords = (s) => new Set(String(s).toLowerCase().match(KW) || []);

async function repairLesson(title, md) {
  // 1. Try a continuation that finishes the interrupted sentence.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const cont = (await ollama(continuePrompt(title, md))).trim();
      if (!cont) continue;
      // Join on the *trimmed* text — testing the raw md sees its trailing "\n"
      // and skips the space, welding "…de" onto "règle…".
      const head = md.trimEnd();
      const glue = /[\s(«"']$/.test(head) || /^[\s,.;:)»]/.test(cont) ? "" : " ";
      const merged = `${head}${glue}${cont}`.trim();
      // The continuation must finish the lesson and must not wander off-topic.
      if (looksComplete(merged) && merged.length > md.length) {
        const lost = [...keywords(md)].filter((k) => !keywords(merged).has(k));
        if (lost.length === 0) return { md: merged, how: "continued" };
      }
    } catch { /* fall through to trim */ }
  }
  // 2. Otherwise drop the dangling tail: complete, on-topic, slightly shorter.
  const trimmed = trimToComplete(md);
  return trimmed ? { md: trimmed, how: "trimmed" } : { md, how: "failed" };
}

async function main() {
  const targets = books.length ? books : fs.readdirSync(REFINED);
  let fixed = 0, cont = 0, trimmed = 0, failed = 0;

  for (const book of targets) {
    const dir = path.join(REFINED, book);
    if (!fs.existsSync(dir)) { console.log(`? ${book} — introuvable`); continue; }

    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const p = path.join(dir, file);
      const art = JSON.parse(fs.readFileSync(p, "utf8"));
      let dirty = false;

      for (const l of art.lessons || []) {
        if (looksComplete(l.contentMd)) continue;
        const before = l.contentMd.length;
        const { md, how } = await repairLesson(l.title, l.contentMd);
        if (how === "failed") { failed++; console.log(`  ✗ ${book} / ${l.title} — irréparable`); continue; }
        console.log(`  ✓ ${book} / ${art.moduleTitle} / ${l.title}  ${before} → ${md.length} c  (${how})`);
        if (how === "continued") cont++; else trimmed++;
        fixed++;
        if (!DRY) { l.contentMd = `${md}\n`; dirty = true; }
      }
      if (dirty && !DRY) fs.writeFileSync(p, JSON.stringify(art, null, 2), "utf8");
    }
  }
  console.log(`\n${DRY ? "[dry-run] " : ""}réparées: ${fixed} (complétées: ${cont}, tronquées proprement: ${trimmed}) · échecs: ${failed}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
