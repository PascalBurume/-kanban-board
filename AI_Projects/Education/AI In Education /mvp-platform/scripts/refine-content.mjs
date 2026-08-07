// Refine raw/OCR module markdown into clean, structured, multi-lesson modules
// using the LOCAL Ollama (offline). For each manifest module we produce a
// refined artifact at public/content/refined/<book>/<module-slug>.json holding
// several lessons (title, objectives baked into contentMd, est. minutes) and a
// generated quiz per lesson.
//
// Strategy by source quality:
//   • status "complete"  → split the clean markdown by "## " sections; Ollama
//     lightly polishes each section into a lesson (never invents).
//   • otherwise (OCR)    → the readable OCR body is noise, but the front-matter
//     "Plan du module" lists the real topics; Ollama WRITES a clean lesson per
//     topic, grounded by subject/class/module/topic.
//
// Resumable: artifacts are cached by (sourceHash + PROMPT_VERSION). Re-running
// skips unchanged modules. If Ollama fails after retries, we fall back to a
// deterministic lesson so content is never lost (marked "degraded").
//
// Env knobs:
//   REFINE_LIMIT=<n>        max modules to process this run (default: all)
//   REFINE_BOOKS=a,b        only these book slugs
//   REFINE_STATUS=complete  only modules with this status
//   REFINE_FORCE=1          ignore cache, re-refine everything in scope
//   REFINE_MAX_LESSONS=<n>  cap lessons per module (default 6)
//   OLLAMA_URL, OLLAMA_MODEL, OLLAMA_MODEL_MATH

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(__dirname, "..");
const PUBLIC = path.join(APP, "public");
const CONTENT = path.join(PUBLIC, "content");
const REFINED = path.join(CONTENT, "refined");

// Real per-chapter OCR text extracted from the scanned books' full text, keyed
// by "book/module-slug". When present for an ocr-raw module, lessons are GROUNDED
// in the book excerpt (cleaned, not invented) instead of generated from the title.
const GROUNDING = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(CONTENT, "grounding.json"), "utf8")); }
  catch { return {}; }
})();

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const MODEL = process.env.OLLAMA_MODEL || "gemma4:e2b";
const MODEL_MATH = process.env.OLLAMA_MODEL_MATH || MODEL;
const PROMPT_VERSION = 8; // bump to invalidate all cached artifacts

const LIMIT = Number(process.env.REFINE_LIMIT || 0) || Infinity;
const ONLY_BOOKS = (process.env.REFINE_BOOKS || "").split(",").map((s) => s.trim()).filter(Boolean);
const ONLY_STATUS = (process.env.REFINE_STATUS || "").trim();
const FORCE = process.env.REFINE_FORCE === "1";
const MAX_LESSONS = Number(process.env.REFINE_MAX_LESSONS || 6);

// ---------- tiny front-matter parser (mirrors build-content) ----------
function readFM(txt) {
  if (!txt.startsWith("---")) return { data: {}, body: txt };
  const end = txt.indexOf("\n---", 3);
  if (end === -1) return { data: {}, body: txt };
  const raw = txt.slice(3, end).trim();
  const body = txt.slice(end + 4).replace(/^\n/, "");
  const data = {};
  let key = null;
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (m) {
      key = m[1];
      const v = m[2].trim();
      data[key] = v === "" ? [] : v.replace(/^"(.*)"$/, "$1");
    } else if (/^\s*-\s+/.test(line) && Array.isArray(data[key])) {
      data[key].push(line.replace(/^\s*-\s+/, "").replace(/^"(.*)"$/, "$1"));
    }
  }
  return { data, body };
}

const slugify = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "lecon";

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
const isMath = (subject) => /(math|phys|géom|geom|électr|electr)/i.test(subject || "");

// ---------- Ollama ----------
async function ollama(prompt, { json = false, model = MODEL, num_predict = 700, temperature = 0.4 } = {}) {
  const body = {
    model,
    prompt,
    stream: false,
    options: { num_predict, temperature, top_p: 0.9 },
  };
  if (json) body.format = "json";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`OLLAMA_HTTP_${res.status}`);
    const data = await res.json();
    return (data.response || "").trim();
  } finally {
    clearTimeout(timer);
  }
}

// gemma3n sometimes emits literal SentencePiece ▁ space markers and splits
// markdown tokens (e.g. "#▁#▁Objectifs" → "# # Objectifs"). Repair them.
function cleanOllama(text) {
  return String(text || "")
    .replace(/▁/g, " ")
    .replace(/^(\s*)#[ \t]+#[ \t]+#(?=[ \t])/gm, "$1###")
    .replace(/^(\s*)#[ \t]+#(?=[ \t])/gm, "$1##")
    .replace(/^[ \t]*\*[ \t]+/gm, "- ") // normalise "* " / "*   " bullets
    .replace(/[ \t]{3,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// A lesson that ran out of tokens stops mid-sentence and/or mid-formula. Both
// are silent failures: the artifact looks fine, the page renders, the detail is
// simply gone. Reject such output instead of caching it.
export function looksComplete(md) {
  const s = String(md || "").trim();
  if (s.length < 200) return false;
  const inline = s.replace(/\$\$[\s\S]*?\$\$/g, "");
  if ((inline.split("$").length - 1) % 2) return false; // truncated mid-formula
  if ((s.split("$$").length - 1) % 2) return false;
  // Must land on a sentence terminator. A trailing bullet is NOT a pass: the
  // clipped lessons end exactly that way ("- Comprendre les règles de …, de").
  return /[.!?:»)\]}]\s*$/.test(s) || /\|\s*$/.test(s.split("\n").pop() || "");
}

// Last-resort repair for prose that is still clipped after every retry: walk
// back to the last complete line and drop any half-written formula, preserving
// the grounded content instead of regenerating a different lesson.
export function trimToComplete(md) {
  const lines = String(md || "").trimEnd().split("\n");
  while (lines.length) {
    const candidate = lines.join("\n").trimEnd();
    if (looksComplete(candidate)) return candidate;
    lines.pop();
  }
  return "";
}

async function ollamaRetry(prompt, opts, tries = 2) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const out = await ollama(prompt, opts);
      if (out && out.length > 8) return out;
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  return "";
}

// tolerant JSON extraction (model may wrap in prose / code fences)
function extractJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* keep trying */ }
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try { return JSON.parse(text.slice(a, b + 1)); } catch { /* give up */ }
  }
  return null;
}

// ---------- content shaping ----------
function getPlanTopics(body) {
  // "## Plan du module" followed by a bullet list.
  const m = body.match(/##\s*Plan du module\s*\n([\s\S]*?)(\n#|\n##|$)/i);
  if (!m) return [];
  return m[1]
    .split("\n")
    .map((l) => l.replace(/^\s*[-*]\s+/, "").trim())
    .filter((l) => l && !l.startsWith(">"))
    .slice(0, MAX_LESSONS);
}

function getSections(body) {
  // Split clean markdown into "## " sections (skip Plan/meta sections).
  const parts = body.split(/\n(?=##\s+)/);
  const out = [];
  for (const p of parts) {
    const h = p.match(/^##\s+(.*)/);
    if (!h) continue;
    const title = h[1].trim();
    if (/^(plan du module|contenu)$/i.test(title)) continue;
    const text = p.replace(/^##\s+.*\n/, "").trim();
    if (text.length < 40) continue;
    out.push({ title, text });
  }
  return out.slice(0, MAX_LESSONS);
}

// Remove a leading H1/H2 whose text equals the lesson title (the page renders
// the title separately, so keeping it would show the title twice).
function stripLeadingTitle(md, title) {
  const lines = md.split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  const m = lines[i]?.match(/^#{1,2}\s+(.*)$/);
  if (m && m[1].trim().toLowerCase() === title.trim().toLowerCase()) {
    lines.splice(0, i + 1);
    while (lines.length && lines[0].trim() === "") lines.shift();
    return lines.join("\n");
  }
  return md.trim();
}

function buildLessonContent(title, objectives, bodyMd) {
  // No leading "# title" — the lesson page renders the title itself.
  const obj = (objectives && objectives.length)
    ? objectives.map((o) => `- ${o.replace(/^[-*]\s*/, "")}`).join("\n")
    : "- Comprendre les notions clés de cette leçon.";
  return `## Objectifs\n\n${obj}\n\n${bodyMd.trim()}\n`;
}

// Repair LaTeX/Markdown defects the local model emits so KaTeX renders cleanly:
// fix aligned-environment typos, flatten single-equation aligned blocks, and
// drop any dangling unclosed math delimiter (from a truncated tail) so an open
// $$ / $ can't bleed math-mode into the rest of the document.
function sanitizeMarkdown(md) {
  let s = String(md || "");
  // 1) "\begin{aligneed}" / "alignned" / "aligend" → "aligned".
  s = s.replace(/\\(begin|end)\s*\{\s*align[a-z]*\s*\}/gi, (_m, kw) => `\\${kw.toLowerCase()}{aligned}`);
  // 2) Single-equation aligned block (no "\\" row break) → plain display math.
  s = s.replace(/\$\$\s*\\begin\{aligned\}([\s\S]*?)\\end\{aligned\}\s*\$\$/g,
    (m, inner) => (inner.includes("\\\\") ? m : `$$ ${inner.trim()} $$`));
  // 3) Drop a dangling unclosed display block ($$ opened, never closed).
  if (((s.match(/\$\$/g) || []).length) % 2 !== 0) {
    s = s.slice(0, s.lastIndexOf("$$")).replace(/[\s:]*$/, "").trimEnd();
  }
  // 4) Drop a dangling unclosed inline $ (ignore the now-balanced $$ pairs).
  if (((s.replace(/\$\$/g, "").match(/\$/g) || []).length) % 2 !== 0) {
    s = s.slice(0, s.lastIndexOf("$")).replace(/[\s:]*$/, "").trimEnd();
  }
  return s.trim();
}

// ---------- prompts ----------
// Impératif LaTeX partagé — le petit modèle applique mal LaTeX (surtout dans les
// exemples résolus) et casse les environnements `aligned`. Règles fermes + exemples.
const LATEX_RULES = [
  `RÈGLE LaTeX (IMPÉRATIVE) — écris TOUTE expression mathématique en LaTeX, jamais en texte brut :`,
  `- variables, nombres d'un calcul, symboles et formules entre $...$ : « la norme $\\lVert u\\rVert$ », « $\\sqrt{5}$ », « $x^2$ », « $f(x)=\\frac{1}{x-1}$ » ;`,
  `- dans « Exemple résolu », CHAQUE étape de calcul est en LaTeX, ex. $\\lVert u\\rVert=\\sqrt{2^2+(-1)^2}=\\sqrt{5}$ — jamais « ||u|| = √(2² + (-1)²) » ;`,
  `- convertis tout symbole Unicode : √→\\sqrt{}, x²→x^2, x³→x^3, ≠→\\neq, ≤→\\leq, ≥→\\geq, ∞→\\infty, ×→\\times, ·→\\cdot, ±→\\pm, →→\\to, Σ→\\sum, ∈→\\in ;`,
  `- une formule affichée seule va entre $$...$$ sur UNE SEULE LIGNE ;`,
  `- INTERDIT : \\begin{aligned}, \\end{aligned} ou tout environnement ; blocs de code (\\\`\\\`\\\`) ; art ASCII (division posée avec « | », « ---- »).`,
].join("\n");

function prosePromptGenerate({ subject, classe, moduleTitle, topic }) {
  return [
    `Tu es un professeur de ${subject} pour la classe de ${classe} en République Démocratique du Congo.`,
    `Rédige une leçon claire, rigoureuse et bien structurée, en français, sur le thème « ${topic} » (chapitre « ${moduleTitle} »).`,
    ``,
    `Format Markdown. Structure EXACTE :`,
    `1) "## Objectifs" suivi de 3 puces commençant par un verbe d'action.`,
    `2) "## Introduction" : 2 à 3 phrases qui motivent le thème.`,
    `3) "## Notions clés" : définitions essentielles (utilise des **gras** et des formules LaTeX).`,
    `4) "## Exemple résolu" : un exemple concret entièrement résolu, chaque étape de calcul en LaTeX.`,
    `5) "## À retenir" : 2 ou 3 puces de synthèse.`,
    ``,
    LATEX_RULES,
    `Une division polynomiale se présente comme une factorisation, ex. $x^3-6x^2+11x-6=(x-1)(x-2)(x-3)$.`,
    ``,
    `Règles : n'invente pas de fausses données ; reste au niveau du secondaire ; 300 à 500 mots ; commence directement par "## Objectifs" (pas de titre #) ; termine TOUJOURS par "## À retenir".`,
  ].join("\n");
}

function prosePromptPolish({ subject, moduleTitle, sectionTitle, sectionText }) {
  return [
    `Voici une section de manuel de ${subject} (chapitre « ${moduleTitle} », section « ${sectionTitle} ») déjà transcrite.`,
    `Améliore UNIQUEMENT la mise en forme Markdown et corrige les coquilles évidentes.`,
    `Conserve absolument toutes les formules LaTeX ($...$ et $$...$$) et tous les exercices résolus. N'invente rien, ne supprime aucun contenu mathématique.`,
    `Convertis TOUT art ASCII ou bloc de code mathématique en LaTeX : inline $...$, multi-lignes $$\\begin{aligned} ... \\end{aligned}$$. N'utilise JAMAIS de blocs de code (\`\`\`) ni de division posée en texte (« | », « ---- »).`,
    `Commence par "## Objectifs" (3 puces déduites de la section), puis restitue la section nettoyée.`,
    ``,
    `Section :`,
    `"""`,
    sectionText.slice(0, 6000),
    `"""`,
  ].join("\n");
}

// Grounded lesson: write the sub-topic lesson using ONLY the provided book
// excerpt (raw OCR of the actual chapter). Clean the OCR, restructure, convert
// garbled math to LaTeX — but stay faithful to the book and do not invent.
function prosePromptGround({ subject, classe, moduleTitle, topic, sourceExcerpt }) {
  return [
    `Tu es un professeur de ${subject} (classe de ${classe}, RD Congo).`,
    `Ci-dessous, un EXTRAIT BRUT (OCR imparfait) du manuel scolaire pour le chapitre « ${moduleTitle} ».`,
    `Rédige la leçon sur le sous-thème « ${topic} » en te basant UNIQUEMENT sur le contenu de cet extrait :`,
    `- restitue les définitions, propriétés, formules et exemples RÉELS du manuel qui concernent « ${topic} » ;`,
    `- corrige les fautes d'OCR (accents, indices, exposants) et reconstruis les formules en LaTeX ;`,
    `- n'invente AUCUNE donnée, valeur ou exemple absent de l'extrait ; ignore le bruit d'OCR (numéros de page, « Scanned by CamScanner », artefacts) ;`,
    `- si l'extrait ne couvre pas « ${topic} », rédige une leçon complète et fidèle au niveau du chapitre sans inventer d'exemples chiffrés.`,
    ``,
    LATEX_RULES,
    ``,
    `Format Markdown, structure EXACTE : "## Objectifs" (3 puces, verbes d'action) ; "## Introduction" (2-3 phrases) ; "## Notions clés" (définitions du manuel, **gras**, LaTeX) ; "## Exemple résolu" (un exemple du manuel, résolu étape par étape, chaque calcul en LaTeX) ; "## À retenir" (2-3 puces).`,
    `Commence directement par "## Objectifs" (pas de titre #). 300 à 500 mots. Termine TOUJOURS la section "## À retenir".`,
    ``,
    `EXTRAIT DU MANUEL :`,
    `"""`,
    sourceExcerpt,
    `"""`,
  ].join("\n");
}

// Strip the worst OCR noise so the small model isn't overwhelmed: page markers,
// scanner footers, and lines that are mostly symbols/gibberish (garbled figures).
function cleanExcerpt(s) {
  return String(s || "")
    .replace(/=====\s*PDF page\s*\d+\s*=====/gi, " ")
    .replace(/Scanned by CamScanner/gi, " ")
    .split(/\n/)
    .filter((ln) => {
      const t = ln.trim();
      if (t.length < 2) return false;
      const letters = (t.match(/[A-Za-zÀ-ÿ]/g) || []).length;
      return letters >= t.length * 0.4; // drop lines <40% letters (figure gibberish)
    })
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// Slice a chapter excerpt into one overlapping window per sub-topic. Sub-topics
// follow the book's order, so window i ≈ the region of the chapter that covers
// sub-topic i. Overlap avoids losing content at window boundaries. Kept small so
// the local model stays reliable on noisy OCR.
function groundingWindow(text, index, count, cap = 3800) {
  const clean = cleanExcerpt(text);
  if (!clean) return "";
  if (clean.length <= cap || count <= 1) return clean.slice(0, cap);
  const span = clean.length / count;
  const pad = span * 0.3;
  const start = Math.max(0, Math.floor(index * span - pad));
  const end = Math.min(clean.length, Math.ceil((index + 1) * span + pad));
  return clean.slice(start, end).slice(0, cap);
}

function quizPrompt({ lessonTitle, subject, lessonText }) {
  return [
    `À partir de la leçon de ${subject} ci-dessous (« ${lessonTitle} »), crée exactement 3 questions d'évaluation en français : une de type MCQ, une de type TF (vrai/faux), une de type SHORT (réponse courte).`,
    `Réponds en JSON STRICT, sans texte autour, au format :`,
    `{"questions":[`,
    `{"type":"MCQ","prompt":"...","options":["...","...","...","..."],"answer":0,"explanation":"..."},`,
    `{"type":"TF","prompt":"...","answer":true,"explanation":"..."},`,
    `{"type":"SHORT","prompt":"...","answer":["mot-clé"],"explanation":"..."}`,
    `]}`,
    `"answer" du MCQ est l'index (0-3) de la bonne option. Les questions doivent porter sur le contenu réel de la leçon.`,
    ``,
    `Leçon :`,
    `"""`,
    lessonText.slice(0, 4000),
    `"""`,
  ].join("\n");
}

// ---------- quiz normalisation → Prisma Question shape ----------
// JSON output swallows LaTeX backslashes (\frac→form-feed, \text/\times→tab…).
// Restore the control chars the model's commands collapsed to.
function repairLatex(s) {
  return String(s ?? "")
    .replace(/\f/g, "\\f").replace(/\t/g, "\\t").replace(/\x08/g, "\\b")
    .replace(/\x0B/g, "\\v").replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}

function normaliseQuiz(raw, lessonTitle) {
  const qs = Array.isArray(raw?.questions) ? raw.questions : [];
  const out = [];
  let order = 0;
  for (const q of qs) {
    const type = String(q.type || "").toUpperCase();
    const promptMd = repairLatex(String(q.prompt || q.promptMd || "").trim());
    const explanationMd = repairLatex(String(q.explanation || q.explanationMd || "").trim()) || null;
    if (!promptMd) continue;
    if (type === "MCQ" && Array.isArray(q.options) && q.options.length >= 2) {
      let ans = Number(q.answer);
      if (!Number.isInteger(ans) || ans < 0 || ans >= q.options.length) ans = 0;
      out.push({ type: "MCQ", promptMd, optionsJson: JSON.stringify(q.options.map((o) => repairLatex(String(o)))), answerJson: JSON.stringify(ans), explanationMd, order: ++order });
    } else if (type === "TF") {
      const ans = q.answer === true || /^(true|vrai)$/i.test(String(q.answer));
      out.push({ type: "TF", promptMd, answerJson: JSON.stringify(ans), explanationMd, order: ++order });
    } else if (type === "SHORT") {
      const arr = Array.isArray(q.answer) ? q.answer.map((x) => repairLatex(String(x))) : [repairLatex(String(q.answer || ""))];
      out.push({ type: "SHORT", promptMd, answerJson: JSON.stringify(arr.filter(Boolean)), explanationMd, order: ++order });
    }
  }
  if (out.length === 0) return null;
  return { title: `Quiz — ${lessonTitle}`, questions: out };
}

function fallbackQuiz(lessonTitle, subject) {
  return {
    title: `Quiz — ${lessonTitle}`,
    questions: [
      {
        type: "MCQ",
        promptMd: `À quelle matière se rattache la leçon « ${lessonTitle} » ?`,
        optionsJson: JSON.stringify([subject, "Histoire", "Géographie", "Éducation physique"]),
        answerJson: JSON.stringify(0),
        explanationMd: `Cette leçon fait partie du cours de ${subject}.`,
        order: 1,
      },
      {
        type: "TF",
        promptMd: `Vrai ou faux : « ${lessonTitle} » est une leçon de ${subject}.`,
        answerJson: JSON.stringify(true),
        explanationMd: "Vrai.",
        order: 2,
      },
    ],
  };
}

const wordCount = (s) => s.split(/\s+/).filter(Boolean).length;
const estMinutes = (md) => Math.max(5, Math.min(30, Math.round(wordCount(md) / 130) + 5));

// ---------- per-module refinement ----------
async function refineModule(meta) {
  const { book, subject, classe, classLevel, moduleTitle, moduleOrder, relPath, status } = meta;
  const abs = path.join(PUBLIC, relPath);
  if (!fs.existsSync(abs)) return { skipped: true, reason: "missing-source" };
  const txt = fs.readFileSync(abs, "utf8");
  const { body } = readFM(txt);

  const sourceHash = sha(txt + `|v${PROMPT_VERSION}`);
  const outDir = path.join(REFINED, book);
  const moduleSlug = slugify(`module-${moduleOrder}-${moduleTitle}`);
  const outFile = path.join(outDir, `${moduleSlug}.json`);

  if (!FORCE && fs.existsSync(outFile)) {
    try {
      const prev = JSON.parse(fs.readFileSync(outFile, "utf8"));
      // A matching hash is not enough: artifacts written before the completeness
      // check can hold lessons truncated mid-sentence. Re-refine those.
      const clipped = (prev.lessons || []).filter((l) => !looksComplete(l.contentMd));
      if (prev.sourceHash === sourceHash && clipped.length === 0) {
        return { cached: true, lessons: prev.lessons.length };
      }
      if (clipped.length) {
        console.log(`  ↻ ${moduleTitle}: ${clipped.length} leçon(s) tronquée(s) → régénération (${clipped.map((l) => l.title).join(", ")})`);
      }
    } catch { /* re-refine */ }
  }

  // Real book text for this module (if extracted): grounds ocr-raw lessons in
  // the manual instead of generating them from the title alone. Tolerate the
  // padded/unpadded module-number mismatch (source files use "module-06",
  // refined slugs use "module-6").
  const gkeyUnpadded = `${book}/${moduleSlug}`;
  const gkeyPadded = `${book}/${moduleSlug.replace(/^module-(\d)-/, "module-0$1-")}`;
  const groundText = GROUNDING[gkeyUnpadded] || GROUNDING[gkeyPadded] || "";

  // REFINE_GROUNDED_ONLY=1 → only (re)process modules that have book grounding.
  if (process.env.REFINE_GROUNDED_ONLY === "1" && !groundText) {
    return { skipped: true, reason: "not-grounded" };
  }

  // REFINE_BROKEN_ONLY=1 → only (re)process modules whose current artifact has a
  // truncated or LaTeX-broken lesson; leave already-clean modules untouched.
  if (process.env.REFINE_BROKEN_ONLY === "1" && fs.existsSync(outFile)) {
    try {
      const prev = JSON.parse(fs.readFileSync(outFile, "utf8"));
      const polish = (prev.status || status) === "complete";
      const broken = (prev.lessons || []).some((l) => {
        const c = l.contentMd || "";
        const noRet = !polish && !/##\s*À\s*retenir/i.test(c);
        const ddOdd = ((c.match(/\$\$/g) || []).length) % 2 !== 0;
        const inlineOdd = ((c.replace(/\$\$/g, "").match(/\$/g) || []).length) % 2 !== 0;
        const envTypo = /aligneed|alignned|aligend/.test(c);
        const bareMath = (c.match(/[√≠≥≤∞²³·×±÷]/g) || []).length >= 2; // LaTeX not applied
        return noRet || ddOdd || inlineOdd || envTypo || bareMath;
      });
      if (!broken) return { skipped: true, reason: "already-clean" };
    } catch { /* re-refine */ }
  }

  const complete = status === "complete";
  const model = isMath(subject) ? MODEL_MATH : MODEL;

  // Decide the lesson units.
  let units; // [{title, sourceText?, ground?}]
  let mode; // "polish" | "ground" | "generate"
  if (complete) {
    mode = "polish";
    const sections = getSections(body);
    units = sections.length ? sections.map((s) => ({ title: s.title, sourceText: s.text })) : [{ title: moduleTitle, sourceText: body.slice(0, 6000) }];
  } else {
    const topics = getPlanTopics(body);
    const titles = topics.length ? topics : [moduleTitle];
    if (groundText) {
      mode = "ground";
      units = titles.map((t, i) => ({ title: t, sourceText: groundingWindow(groundText, i, titles.length) }));
    } else {
      mode = "generate";
      units = titles.map((t) => ({ title: t }));
    }
  }

  const lessons = [];
  let li = 0;
  for (const unit of units) {
    li++;
    const lessonTitle = unit.title.replace(/\s+/g, " ").trim();
    let contentMd;
    let degraded = false;

    const genFromTitle = () => prosePromptGenerate({ subject, classe, moduleTitle, topic: lessonTitle });
    try {
      const primary = mode === "polish"
        ? prosePromptPolish({ subject, moduleTitle, sectionTitle: lessonTitle, sectionText: unit.sourceText })
        : mode === "ground" && unit.sourceText
        ? prosePromptGround({ subject, classe, moduleTitle, topic: lessonTitle, sourceExcerpt: unit.sourceText })
        : genFromTitle();
      // Enough tokens for a full 5-section lesson incl. worked example + LaTeX;
      // 800 truncated ~half the lessons mid-formula (broke KaTeX + dropped
      // detail). 2000 still clipped ~9% — LaTeX-dense French runs well past it —
      // so escalate the budget until the lesson actually finishes.
      let prose = "";
      for (const budget of [3000, 4200]) {
        prose = cleanOllama(await ollamaRetry(primary, { model, num_predict: budget, temperature: mode === "generate" ? 0.5 : 0.2 }));
        if (looksComplete(prose)) break;
      }
      // If grounding/polish returns thin (garbled OCR overwhelms the small model),
      // fall back to a CLEAN generated lesson from the title — never dump raw OCR.
      // Fall back to a title-only lesson ONLY when the grounded prose is thin.
      // Never on truncation alone: genFromTitle() ignores the source, so a
      // clipped "Opérations" lesson came back as generic derivative prose with
      // the product/quotient/chain rules gone. Losing the topic is worse than
      // losing the last sentence.
      if ((!prose || wordCount(prose) < 40) && mode !== "generate") {
        prose = cleanOllama(await ollamaRetry(genFromTitle(), { model, num_predict: 3000, temperature: 0.5 }));
        if (prose && wordCount(prose) >= 40) degraded = true; // grounded → generated
      }
      if (!prose || wordCount(prose) < 40) throw new Error("thin-prose");
      // Still clipped after both budgets: keep the on-topic prose, drop the
      // dangling tail so the lesson at least ends cleanly.
      if (!looksComplete(prose)) prose = trimToComplete(prose);
      if (!prose || wordCount(prose) < 40) throw new Error("thin-prose");
      // The lesson page renders the title itself — strip any leading title/H1 the
      // model emitted so the rendered lesson shows the title only once.
      contentMd = `${sanitizeMarkdown(stripLeadingTitle(prose, lessonTitle))}\n`;
    } catch {
      degraded = true;
      contentMd = buildLessonContent(lessonTitle, null, `*(Leçon en préparation. Thème : ${lessonTitle}.)*`);
    }

    // Quiz.
    let quiz;
    try {
      const raw = await ollamaRetry(quizPrompt({ lessonTitle, subject, lessonText: contentMd }), { model, json: true, num_predict: 500, temperature: 0.3 });
      quiz = normaliseQuiz(extractJson(raw.replace(/▁/g, " ")), lessonTitle) || fallbackQuiz(lessonTitle, subject);
    } catch {
      quiz = fallbackQuiz(lessonTitle, subject);
    }

    lessons.push({
      slug: slugify(`${moduleSlug}-${li}-${lessonTitle}`),
      title: lessonTitle,
      order: li,
      estMinutes: estMinutes(contentMd),
      degraded,
      contentMd,
      quiz,
    });
    process.stdout.write(degraded ? "·" : "✓");
  }

  const artifact = {
    book, subject, classLevel, moduleTitle, moduleOrder,
    sourceRef: relPath, status, promptVersion: PROMPT_VERSION, sourceHash,
    lessons,
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(artifact, null, 2), "utf8");
  return { written: true, lessons: lessons.length, degraded: lessons.filter((l) => l.degraded).length };
}

// ---------- driver ----------
function levelFromClassId(id) {
  const s = String(id);
  if (s.startsWith("5")) return "5e";
  if (s.startsWith("6")) return "6e";
  return "examen";
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(CONTENT, "manifest.json"), "utf8"));
  // Flatten modules in manifest order (so REFINE_LIMIT picks the first N).
  const queue = [];
  const seen = new Set();
  for (const cls of manifest.classes) {
    const classLevel = levelFromClassId(cls.id);
    for (const field of cls.fields || []) {
      for (const subj of field.subjects || []) {
        const book = subj.book || subj.id;
        let n = 0;
        for (const mod of subj.modules || []) {
          n++;
          const key = `${book}:${mod.path}`;
          if (seen.has(key)) continue; // books shared across fields
          seen.add(key);
          if (ONLY_BOOKS.length && !ONLY_BOOKS.includes(book)) continue;
          if (ONLY_STATUS && (mod.status || "") !== ONLY_STATUS) continue;
          queue.push({
            book,
            subject: subj.label || subj.id,
            classe: cls.label || classLevel,
            classLevel,
            moduleTitle: mod.title,
            moduleOrder: mod.n ?? n,
            relPath: mod.path,
            status: mod.status || "",
          });
        }
      }
    }
  }

  const scope = queue.slice(0, LIMIT);
  console.log(`Refining ${scope.length} module(s) with ${MODEL} (math→${MODEL_MATH}) · promptV${PROMPT_VERSION}`);
  console.log(`Output → public/content/refined/  (✓ generated · = fallback)\n`);

  let done = 0, cached = 0, lessonTotal = 0, degradedTotal = 0;
  for (const meta of scope) {
    const label = `${meta.book}/${String(meta.moduleOrder).padStart(2, "0")} ${meta.moduleTitle}`.slice(0, 60);
    process.stdout.write(`• ${label.padEnd(62)} `);
    try {
      const r = await refineModule(meta);
      if (r.cached) { cached++; lessonTotal += r.lessons || 0; process.stdout.write(`cached (${r.lessons})\n`); }
      else if (r.skipped) { process.stdout.write(`skip: ${r.reason}\n`); }
      else { done++; lessonTotal += r.lessons; degradedTotal += r.degraded || 0; process.stdout.write(` → ${r.lessons} lessons\n`); }
    } catch (e) {
      process.stdout.write(`ERROR ${e.message}\n`);
    }
  }

  console.log(`\nDone — refined:${done} cached:${cached} lessons:${lessonTotal} fallbacks:${degradedTotal}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
