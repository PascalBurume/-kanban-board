// Reconstruct garbled OCR exercises into clean, readable French statements with
// proper LaTeX, using the LOCAL Ollama (offline). Reads public/content/
// exercises.json, cleans each "ocr"-quality item, and writes a map keyed by
// exercise id to public/content/exercises-clean.json. Resumable (cache by
// id + sourceHash + PROMPT_VERSION); safe to run in the background.
//
// Env: REFINE_EX_LIMIT, REFINE_EX_BOOKS (csv), REFINE_EX_FORCE=1,
//      OLLAMA_URL, OLLAMA_MODEL.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(__dirname, "..");
const CONTENT = path.join(APP, "public", "content");
const SRC = path.join(CONTENT, "exercises.json");
const OUT = path.join(CONTENT, "exercises-clean.json");

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const MODEL = process.env.OLLAMA_MODEL || "gemma3n:e4b";
const PROMPT_VERSION = 3;

const LIMIT = Number(process.env.REFINE_EX_LIMIT || 0) || Infinity;
const ONLY_BOOKS = (process.env.REFINE_EX_BOOKS || "").split(",").map((s) => s.trim()).filter(Boolean);
const FORCE = process.env.REFINE_EX_FORCE === "1";

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);

async function ollama(prompt, { json = false, num_predict = 700, temperature = 0.3 } = {}) {
  const body = { model: MODEL, prompt, stream: false, options: { num_predict, temperature, top_p: 0.9 } };
  if (json) body.format = "json";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`OLLAMA_HTTP_${res.status}`);
    return ((await res.json()).response || "").replace(/▁/g, " ").trim();
  } finally {
    clearTimeout(timer);
  }
}

// Plain-text delimited parse — keeps LaTeX backslashes intact (JSON would
// swallow \f \n \t inside \frac \neq \textbf).
function parseDelimited(text) {
  if (!text) return null;
  const t = text.replace(/\r/g, "");
  const si = t.search(/===\s*ÉNONCÉ\s*===/i);
  const oi = t.search(/===\s*SOLUTION\s*===/i);
  if (si < 0) return null;
  const afterS = t.slice(si).replace(/===\s*ÉNONCÉ\s*===/i, "");
  let statement, solution;
  if (oi > si) {
    statement = t.slice(si, oi).replace(/===\s*ÉNONCÉ\s*===/i, "").trim();
    solution = t.slice(oi).replace(/===\s*SOLUTION\s*===/i, "").trim();
  } else {
    statement = afterS.trim();
    solution = "";
  }
  if (/^(aucune|néant|vide|n\/a)$/i.test(solution)) solution = "";
  return { statement, solution };
}

function prompt(ex) {
  return [
    `Tu es professeur de ${ex.subject} au secondaire en RDC. Le texte ci-dessous est un exercice extrait par OCR d'un manuel scanné : il contient des erreurs de numérisation (chiffres parasites, symboles mal lus, formules cassées).`,
    `Reconstruis un énoncé CLAIR et CORRECT en français :`,
    `- corrige les erreurs OCR et reconstruis les formules mathématiques en LaTeX (entre $...$) ;`,
    `- garde la numérotation des sous-questions (a, b, c…) si elle existe ;`,
    `- si une partie est dégradée, donne directement la version la plus plausible au niveau secondaire — NE commente PAS le processus OCR, n'écris pas « il y a une erreur » ;`,
    `- RÉSOUS l'exercice : fournis TOUJOURS une solution complète, claire et étape par étape dans la section SOLUTION (même si le texte d'origine n'en contient pas). Traite chaque sous-question (a, b, c…). Termine par la réponse finale.`,
    ``,
    `Réponds EXACTEMENT dans ce format, sans aucun autre texte :`,
    `===ÉNONCÉ===`,
    `<énoncé en Markdown>`,
    `===SOLUTION===`,
    `<solution complète et résolue en Markdown>`,
    ``,
    `Texte OCR :`,
    `"""`,
    (ex.text || "").slice(0, 2500),
    `"""`,
  ].join("\n");
}

function load(file, def) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return def; }
}

async function main() {
  const all = load(SRC, []);
  const out = FORCE ? {} : load(OUT, {});
  let pool = all.filter((e) => e.quality === "ocr");
  if (ONLY_BOOKS.length) pool = pool.filter((e) => ONLY_BOOKS.includes(e.book));

  let done = 0, cached = 0, failed = 0, processed = 0;
  console.log(`Refining ${Math.min(pool.length, LIMIT)} / ${pool.length} OCR exercises with ${MODEL} · v${PROMPT_VERSION}\n`);

  for (const ex of pool) {
    if (processed >= LIMIT) break;
    const key = String(ex.id);
    const hash = sha((ex.text || "") + `|v${PROMPT_VERSION}`);
    if (!FORCE && out[key] && out[key].h === hash) { cached++; continue; }
    processed++;
    try {
      const raw = await ollama(prompt(ex), { num_predict: 800 });
      const obj = parseDelimited(raw);
      const statement = (obj?.statement || "").trim();
      if (!statement || statement.length < 12) throw new Error("thin");
      out[key] = { h: hash, statement, solution: (obj?.solution || "").trim() };
      done++;
      process.stdout.write(`✓ #${ex.id} ${ex.book}\n`);
    } catch (e) {
      failed++;
      process.stdout.write(`· #${ex.id} ${ex.book} (${e.message})\n`);
    }
    // checkpoint every 10 so a long background run is resumable mid-flight.
    if (processed % 10 === 0) fs.writeFileSync(OUT, JSON.stringify(out), "utf8");
  }

  fs.writeFileSync(OUT, JSON.stringify(out), "utf8");
  console.log(`\nDone — cleaned:${done} cached:${cached} failed:${failed} · total in file:${Object.keys(out).length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
