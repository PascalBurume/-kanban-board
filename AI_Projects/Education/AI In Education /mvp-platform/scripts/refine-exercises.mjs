// Reconstruct garbled OCR exercises into clean, readable French statements with
// proper LaTeX, using the LOCAL Ollama (offline). Reads public/content/
// exercises.json, cleans each "ocr"-quality item, and writes a map keyed by
// exercise id to public/content/exercises-clean.json. Resumable (cache by
// id + sourceHash + PROMPT_VERSION); safe to run in the background.
//
// Env: REFINE_EX_LIMIT, REFINE_EX_BOOKS (csv), REFINE_EX_IDS (csv), REFINE_EX_FORCE=1,
//      OLLAMA_URL, OLLAMA_MODEL.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fixContent } from "./fix-content-latex.mjs";
import { auditEntry, trimDanglingTail } from "./exercise-checks.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(__dirname, "..");
const CONTENT = path.join(APP, "public", "content");
const SRC = path.join(CONTENT, "exercises.json");
const OUT = path.join(CONTENT, "exercises-clean.json");
const GROUNDING = path.join(CONTENT, "grounding.json");

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const MODEL = process.env.OLLAMA_MODEL || "gemma3n:e4b";
const PROMPT_VERSION = 4; // v4: grounds reconstruction in the real chapter text

const LIMIT = Number(process.env.REFINE_EX_LIMIT || 0) || Infinity;
const ONLY_BOOKS = (process.env.REFINE_EX_BOOKS || "").split(",").map((s) => s.trim()).filter(Boolean);
const ONLY_IDS = new Set((process.env.REFINE_EX_IDS || "").split(",").map((s) => s.trim()).filter(Boolean));
const FORCE = process.env.REFINE_EX_FORCE === "1";
// REFINE_EX_DEBUG=1 prints why each rejected attempt was rejected. These runs are
// long and opaque otherwise: "thin or truncated" alone doesn't say whether the
// model overran its budget, dropped the delimiters, or stopped mid-sentence.
const DEBUG = process.env.REFINE_EX_DEBUG === "1";

// Ollama defaults num_ctx to 4096 regardless of what the model supports, which
// silently caps generation: a grounded prompt eats ~2k of that, so long worked
// solutions were being cut off mid-sentence no matter how high num_predict went.
// gemma3n:e4b carries 32k — give the run enough that num_predict is the only limit.
const NUM_CTX = Number(process.env.OLLAMA_NUM_CTX || 16384);

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);

async function ollama(prompt, { json = false, num_predict = 700, temperature = 0.3 } = {}) {
  const body = { model: MODEL, prompt, stream: false, options: { num_predict, num_ctx: NUM_CTX, temperature, top_p: 0.9 } };
  if (json) body.format = "json";
  const ctrl = new AbortController();
  // Scale the deadline with the token budget — a 9k-token worked solution on a
  // local 4B model takes minutes, and aborting it would look like a truncation.
  const timer = setTimeout(() => ctrl.abort(), Math.min(600000, Math.max(120000, num_predict * 80)));
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

// ---- grounding: the real transcribed chapter text, keyed by (book, module#) ----
const groundByKey = new Map();
{
  const g = load(GROUNDING, {});
  for (const [k, v] of Object.entries(g)) {
    const [book, mod] = k.split("/");
    const m = mod && mod.match(/module-0*(\d+)-/);
    if (book && m) groundByKey.set(`${book}:${Number(m[1])}`, String(v));
  }
}

function tokenize(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3);
}

// The chapter passages most relevant to this exercise, up to a char budget — so
// the model repairs against real book text without ingesting a 50k-char chapter.
// Scores paragraphs by keyword overlap with the OCR; falls back to the chapter
// opening (definitions) when nothing overlaps. Returns null when the book/module
// has no grounding.
function groundingExcerpt(ex, budget = 2600) {
  const full = groundByKey.get(`${ex.book}:${Number(ex.module)}`);
  if (!full) return null;
  const keys = new Set(tokenize(ex.text));
  const paras = full.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 40);
  const scored = paras
    .map((p) => ({ p, score: tokenize(p).reduce((n, t) => n + (keys.has(t) ? 1 : 0), 0) }))
    .sort((a, b) => b.score - a.score);
  const picked = [];
  let used = 0;
  for (const s of scored) {
    if (s.score === 0) break;
    if (used + s.p.length > budget) continue;
    picked.push(s.p);
    used += s.p.length;
  }
  return picked.length ? picked.join("\n\n") : full.slice(0, budget);
}

function prompt(ex, ground) {
  const lines = [
    `Tu es professeur de ${ex.subject} au secondaire en RDC. Le texte ci-dessous est un exercice extrait par OCR d'un manuel scanné : il contient des erreurs de numérisation (chiffres parasites, symboles mal lus, formules cassées).`,
  ];
  if (ground) {
    lines.push(
      ``,
      `TEXTE DU MANUEL (transcription fiable du chapitre) — c'est la référence. Sers-t'en pour rétablir la terminologie exacte, les nombres, les symboles chimiques et les réponses. Ne contredis PAS ce texte et n'invente RIEN qui aille au-delà de ce que le manuel ou l'OCR contiennent.`,
      `"""`,
      ground.slice(0, 2800),
      `"""`,
      ``,
    );
  }
  lines.push(
    `Reconstruis un énoncé CLAIR et CORRECT en français :`,
    `- corrige les erreurs OCR et reconstruis les formules mathématiques en LaTeX (entre $...$) ;`,
    `- garde la numérotation des sous-questions (a, b, c…) et toutes les questions présentes dans l'OCR ;`,
    ground
      ? `- appuie-toi sur le TEXTE DU MANUEL ci-dessus ; ne complète PAS avec des questions ou des valeurs absentes de l'OCR et du manuel — NE commente PAS le processus OCR ;`
      : `- si une partie est dégradée, donne directement la version la plus plausible au niveau secondaire — NE commente PAS le processus OCR, n'écris pas « il y a une erreur » ;`,
    `- RÉSOUS l'exercice : fournis TOUJOURS une solution complète, claire et étape par étape dans la section SOLUTION (même si le texte d'origine n'en contient pas). Traite chaque sous-question (a, b, c…). Termine par la réponse finale.`,
    // An OCR block can end mid-question two ways: the extractor's MAX cap
    // (ex.truncated) or its section-boundary heuristic cutting early. Both leave
    // a dangling tail — typically a question ending on ":" whose list the scan
    // lost — and the model faithfully copies it, so the completeness gate then
    // rejects an otherwise good reconstruction. Applies to every OCR block
    // because only the first case is detectable at extraction time.
    `- L'extrait OCR peut être COUPÉ à la fin. Si la dernière question est incomplète (elle s'arrête sur « : », sur un mot isolé, ou introduit une liste absente), OMETS-LA entièrement : ne la devine pas, ne la mentionne pas. Termine l'énoncé sur la dernière question ENTIÈRE.`,
    `- Termine toujours par une phrase complète. Ne t'arrête jamais au milieu d'un mot, d'une formule ou d'une phrase.`,
    ``,
    `Réponds EXACTEMENT dans ce format, sans aucun autre texte :`,
    `===ÉNONCÉ===`,
    `<énoncé en Markdown>`,
    `===SOLUTION===`,
    `<solution complète et résolue en Markdown>`,
    ``,
    `Texte OCR :`,
    `"""`,
    // Pass the WHOLE block. This used to be capped at 3500 chars while the
    // extractor emits up to 6000 — so for 121 of 284 OCR exercises the model was
    // asked to reconstruct an ending it had never been shown, and dutifully
    // trailed off. num_ctx (above) is what makes the full text affordable.
    (ex.text || "").slice(0, 9000),
    `"""`,
  );
  return lines.filter((l) => l !== null).join("\n");
}

// The balance/completeness guards live in exercise-checks.mjs so the refiner and
// the build-time audit can never drift apart. Re-exported for existing callers.
export { mathBalanced, bracesBalanced, usable } from "./exercise-checks.mjs";

// One reconstruction is acceptable only if the build-time QA would pass it —
// balanced math AND a statement/solution that doesn't stop mid-thought. Audits
// the post-fixContent form, i.e. exactly what gets stored and rendered.
//
// The completeness gate alone rewards BREVITY: a two-line statement trivially
// "looks complete", so re-rolling a truncated reconstruction would happily trade
// a rich-but-cut 3171-char statement for a clean 169-char one that silently drops
// most of the exercise. `src` adds a coverage floor — the statement has to retain
// a fair share of its OCR block — so a degenerate answer is rejected and re-rolled
// rather than banked. Only applied to substantial sources: short OCR blocks are
// mostly noise and legitimately compress.
const MIN_COVERAGE = 0.2;
function accepted(statement, solution, src = "") {
  if (statement.length < 12 || !solution) return false;
  if (src.length > 1500 && statement.length < src.length * MIN_COVERAGE) return false;
  return auditEntry({ statement, solution }).complete;
}

function load(file, def) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return def; }
}

async function main() {
  const all = load(SRC, []);
  const out = FORCE ? {} : load(OUT, {});
  const bookById = new Map(all.map((e) => [String(e.id), e.book]));
  // Evict previously-cached entries the QA would now flag — truncated mid-formula
  // OR mid-sentence (cached before the completeness gate existed) — so this run
  // regenerates them. When the run is scoped, only evict in-scope entries;
  // otherwise a scoped run would drop reconstructions it never regenerates.
  const inScope = (id) =>
    (ONLY_IDS.size === 0 || ONLY_IDS.has(id)) &&
    (ONLY_BOOKS.length === 0 || ONLY_BOOKS.includes(bookById.get(id)));
  let evicted = 0;
  for (const [k, v] of Object.entries(out)) {
    if (!inScope(k)) continue;
    const srcText = all.find((e) => String(e.id) === k)?.text || "";
    if (!accepted(String(v?.statement || ""), String(v?.solution || ""), srcText)) { delete out[k]; evicted++; }
  }
  if (evicted) console.log(`Evicted ${evicted} incomplete entr${evicted === 1 ? "y" : "ies"} from the cache.`);
  let pool = all.filter((e) => e.quality === "ocr");
  if (ONLY_BOOKS.length) pool = pool.filter((e) => ONLY_BOOKS.includes(e.book));
  if (ONLY_IDS.size) pool = pool.filter((e) => ONLY_IDS.has(String(e.id)));

  let done = 0, cached = 0, failed = 0, processed = 0, grounded = 0;
  console.log(`Refining ${Math.min(pool.length, LIMIT)} / ${pool.length} OCR exercises with ${MODEL} · v${PROMPT_VERSION}\n`);

  for (const ex of pool) {
    if (processed >= LIMIT) break;
    const key = String(ex.id);
    // Include the grounding excerpt in the hash so re-transcribing a chapter
    // (new grounding) re-refines its exercises even when the OCR is unchanged.
    const ground = groundingExcerpt(ex);
    const hash = sha((ex.text || "") + (ground || "") + `|v${PROMPT_VERSION}`);
    if (!FORCE && out[key] && out[key].h === hash) { cached++; continue; }
    processed++;
    try {
      // A statement carrying many sub-questions gets a worked solution running
      // to thousands of tokens, so escalate the budget before giving up. Accept
      // only what the build-time QA would pass: balanced math AND text that
      // doesn't stop mid-thought. Normalize with fixContent BEFORE judging, so
      // the verdict is on the form that actually gets stored and rendered.
      // Escalate the budget, then simply re-roll: at temperature 0.3 a local 4B
      // model trails off on maybe a third of long worked solutions, and the same
      // prompt that fails once usually passes on the next sample. Cheaper and
      // more honest than loosening the gate.
      let statement = "", solution = "";
      for (const budget of [4000, 9000, 9000, 9000]) {
        const raw = await ollama(prompt(ex, ground), { num_predict: budget });
        const obj = parseDelimited(raw);
        statement = trimDanglingTail(fixContent((obj?.statement || "").trim()));
        solution = (obj?.solution || "").trim() ? trimDanglingTail(fixContent((obj?.solution || "").trim())) : "";
        if (accepted(statement, solution, ex.text || "")) break;
        if (DEBUG) {
          const src = ex.text || "";
          const why = !obj ? "no ===ÉNONCÉ=== markers"
            : statement.length < 12 ? `thin statement (${statement.length} chars)`
            : !solution ? "empty solution"
            : src.length > 1500 && statement.length < src.length * MIN_COVERAGE
              ? `coverage ${(statement.length / src.length).toFixed(2)} < ${MIN_COVERAGE} (dropped part of the source)`
              : auditEntry({ statement, solution }).issues.join(",");
          const tail = (s) => JSON.stringify(String(s).trim().slice(-70));
          process.stdout.write(`    ↳ #${ex.id} budget=${budget} rejected: ${why} · raw=${raw.length}c stmt=${statement.length}c sol=${solution.length}c\n`);
          process.stdout.write(`       stmt tail ${tail(statement)}\n       sol  tail ${tail(solution)}\n`);
        }
        statement = "";
      }
      if (!statement) throw new Error("thin or truncated");
      out[key] = { h: hash, statement, solution, grounded: !!ground };
      done++;
      if (ground) grounded++;
      process.stdout.write(`✓ #${ex.id} ${ex.book}${ground ? " [grounded]" : ""}\n`);
    } catch (e) {
      failed++;
      // We only reach here for a non-cached (stale/new) item. If a stale entry
      // failed to regenerate, drop it so the exercise falls back to honest raw
      // OCR ("Brouillon") the teacher can complete from the book — better than
      // silently keeping an outdated/hallucinated reconstruction.
      if (out[key]) delete out[key];
      process.stdout.write(`· #${ex.id} ${ex.book} (${e.message})\n`);
    }
    // Checkpoint often: these runs are long and get interrupted (Ollama dying,
    // the shell going away), and the file is small enough that rewriting it
    // every few items is far cheaper than redoing minutes of LLM work.
    if (processed % 3 === 0) fs.writeFileSync(OUT, JSON.stringify(out), "utf8");
  }

  fs.writeFileSync(OUT, JSON.stringify(out), "utf8");
  console.log(`\nDone — cleaned:${done} (grounded:${grounded}/${done}) cached:${cached} failed:${failed} · total in file:${Object.keys(out).length}`);
}

// Guarded so importing the exported guards (mathBalanced/usable) from the QA
// checker doesn't kick off a full Ollama reconstruction run.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
