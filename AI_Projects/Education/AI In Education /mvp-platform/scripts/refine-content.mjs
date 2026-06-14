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

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const MODEL = process.env.OLLAMA_MODEL || "gemma3n:e4b";
const MODEL_MATH = process.env.OLLAMA_MODEL_MATH || MODEL;
const PROMPT_VERSION = 4; // bump to invalidate all cached artifacts

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

// ---------- prompts ----------
function prosePromptGenerate({ subject, classe, moduleTitle, topic }) {
  return [
    `Tu es un professeur de ${subject} pour la classe de ${classe} en République Démocratique du Congo.`,
    `Rédige une leçon claire, rigoureuse et bien structurée, en français, sur le thème « ${topic} » (chapitre « ${moduleTitle} »).`,
    ``,
    `Format Markdown. Structure EXACTE :`,
    `1) "## Objectifs" suivi de 3 puces commençant par un verbe d'action.`,
    `2) "## Introduction" : 2 à 3 phrases qui motivent le thème.`,
    `3) "## Notions clés" : définitions essentielles (utilise des **gras** et des formules LaTeX entre $...$ si utile).`,
    `4) "## Exemple résolu" : un exemple concret entièrement résolu, étape par étape.`,
    `5) "## À retenir" : 2 ou 3 puces de synthèse.`,
    ``,
    `MATHÉMATIQUES — RÈGLE ABSOLUE : écris TOUTES les expressions et TOUS les calculs en LaTeX.`,
    `- inline avec $...$ (ex. $x^2 - 5x + 6$) ;`,
    `- calculs sur plusieurs lignes avec $$\\begin{aligned} ... \\end{aligned}$$ alignés sur le signe = ;`,
    `- n'utilise JAMAIS de blocs de code (\`\`\`), NI d'art ASCII : pas de division posée avec des « | » et des « ---- », pas de tableaux dessinés en texte.`,
    `- Une division polynomiale se présente comme une factorisation, ex. : $$x^3 - 6x^2 + 11x - 6 = (x-1)(x^2 - 5x + 6) = (x-1)(x-2)(x-3).$$`,
    ``,
    `Règles : n'invente pas de fausses données ; reste au niveau du secondaire ; 250 à 450 mots ; commence directement par "## Objectifs" (pas de titre #).`,
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
      if (prev.sourceHash === sourceHash) return { cached: true, lessons: prev.lessons.length };
    } catch { /* re-refine */ }
  }

  const complete = status === "complete";
  const model = isMath(subject) ? MODEL_MATH : MODEL;

  // Decide the lesson units.
  let units; // [{title, sourceText?}]
  if (complete) {
    const sections = getSections(body);
    units = sections.length ? sections.map((s) => ({ title: s.title, sourceText: s.text })) : [{ title: moduleTitle, sourceText: body.slice(0, 6000) }];
  } else {
    const topics = getPlanTopics(body);
    units = (topics.length ? topics : [moduleTitle]).map((t) => ({ title: t }));
  }

  const lessons = [];
  let li = 0;
  for (const unit of units) {
    li++;
    const lessonTitle = unit.title.replace(/\s+/g, " ").trim();
    let contentMd;
    let degraded = false;

    try {
      const prompt = complete
        ? prosePromptPolish({ subject, moduleTitle, sectionTitle: lessonTitle, sectionText: unit.sourceText })
        : prosePromptGenerate({ subject, classe, moduleTitle, topic: lessonTitle });
      const prose = cleanOllama(await ollamaRetry(prompt, { model, num_predict: 800, temperature: complete ? 0.2 : 0.5 }));
      if (!prose || wordCount(prose) < 40) throw new Error("thin-prose");
      // The lesson page renders the title itself — strip any leading title/H1 the
      // model emitted so the rendered lesson shows the title only once.
      contentMd = `${stripLeadingTitle(prose, lessonTitle)}\n`;
    } catch {
      degraded = true;
      const fallbackBody = complete && unit.sourceText ? unit.sourceText : `*(Leçon en préparation. Thème : ${lessonTitle}.)*`;
      contentMd = buildLessonContent(lessonTitle, null, fallbackBody);
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
