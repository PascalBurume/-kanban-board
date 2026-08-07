// Ollama (gemma4) client for the Copilot tutor — NDJSON streaming, tutor
// persona, lesson-context injection, and a small concurrency semaphore.

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma4:e2b";

const EXCERPT_CHARS = 3500;
const EXERCISE_CHARS = 1200;
const HISTORY_TURNS = 6;

// What the student is doing right now (atelier tab + the exercise on screen).
export type CopilotContext = { tab?: string; exerciseN?: string; exerciseText?: string };

const TAB_LABELS: Record<string, string> = {
  ex: "S'exercer (exercices)",
  sim: "Simuler (simulation interactive)",
  illu: "Illustrer (illustration animée)",
};

export function copilotSystemPrompt(lessonTitle: string, subject: string, excerpt: string, context?: CopilotContext): string {
  const trimmed = excerpt.length > EXCERPT_CHARS ? excerpt.slice(0, EXCERPT_CHARS) + "\n…(contenu tronqué)" : excerpt;
  const lines = [
    "Tu es **Copilot**, un tuteur patient et bienveillant pour des élèves du secondaire en République Démocratique du Congo.",
    "Tu réponds TOUJOURS en français, de façon claire, concise et encourageante, adaptée à un élève de 15 à 19 ans.",
    "",
    "Règles importantes :",
    "- Appuie-toi sur le contenu de la leçon ci-dessous. Si une question sort de la leçon, ramène gentiment l'élève au sujet.",
    "- Ne donne JAMAIS directement la réponse d'un quiz ou d'un exercice noté. Guide l'élève étape par étape avec des questions et des indices.",
    "- Utilise des exemples simples et concrets. Mets les formules mathématiques en notation LaTeX entre $...$ quand c'est utile.",
    "- Sois bref par défaut ; développe si l'élève le demande.",
    "",
    `Matière : ${subject}`,
    `Leçon : ${lessonTitle}`,
    "",
    "Contenu de la leçon (référence) :",
    "<<<",
    trimmed,
    ">>>",
  ];
  if (context?.tab && TAB_LABELS[context.tab]) {
    lines.push("", `L'élève est actuellement dans l'onglet « ${TAB_LABELS[context.tab]} ».`);
  }
  const exText = (context?.exerciseText || "").trim();
  if (exText) {
    const trimmedEx = exText.length > EXERCISE_CHARS ? exText.slice(0, EXERCISE_CHARS) + "\n…(énoncé tronqué)" : exText;
    const ref = context?.exerciseN ? ` (exercice ${context.exerciseN})` : "";
    lines.push(
      "",
      `L'élève travaille sur cet exercice${ref}. Aide-le à le résoudre PAS À PAS, sans révéler la réponse finale.`,
      "Énoncé de l'exercice (référence) :",
      "<<<EXERCICE",
      trimmedEx,
      ">>>",
    );
  }
  return lines.join("\n");
}

// Study coach for the student's own notebook. Unlike the lesson tutor, there is no
// authored lesson to stay faithful to — the reference text is the student's own
// notes, which may well be wrong. That is the point: catch the mistake and make the
// student find the fix, rather than rewrite the page for them.
export function notebookCoachPrompt(noteTitle: string, subject: string, notes: string): string {
  const trimmed = notes.length > EXCERPT_CHARS ? notes.slice(0, EXCERPT_CHARS) + "\n…(notes tronquées)" : notes;
  return [
    "Tu es **Copilot**, un tuteur patient qui aide un élève du secondaire en République Démocratique du Congo à réviser dans son carnet personnel.",
    "Tu réponds TOUJOURS en français, clairement et brièvement, pour un élève de 15 à 19 ans.",
    "",
    "Règles importantes :",
    "- Les notes ci-dessous sont écrites PAR L'ÉLÈVE : elles peuvent contenir des erreurs. Si tu en repères une, signale-la avec bienveillance et explique pourquoi.",
    "- Ne rédige pas le devoir à la place de l'élève. Explique, donne un exemple, pose une question qui le fait avancer.",
    "- Écris les formules en LaTeX entre $...$ (ou $$...$$ pour une formule centrée) : elles s'affichent directement dans le carnet.",
    "- Pour la physique et la chimie, écris proprement les unités et les équations, par exemple $\\mathrm{m/s^2}$ ou $2\\,\\mathrm{H_2} + \\mathrm{O_2} \\rightarrow 2\\,\\mathrm{H_2O}$.",
    "- Sois bref par défaut ; développe seulement si l'élève le demande.",
    "",
    `Matière : ${subject}`,
    `Carnet : ${noteTitle}`,
    "",
    "Notes de l'élève (référence) :",
    "<<<",
    trimmed || "(le carnet est encore vide)",
    ">>>",
  ].join("\n");
}

export function buildMessages(
  opts: {
    lessonTitle: string; subject: string; excerpt: string;
    history: { role: string; content: string }[]; userContent: string; context?: CopilotContext;
    // RAG grounding: relevant passages from OTHER lessons (capped by the caller).
    ragExcerpts?: { title: string; text: string }[];
  },
): ChatMessage[] {
  let system = copilotSystemPrompt(opts.lessonTitle, opts.subject, opts.excerpt, opts.context);
  if (opts.ragExcerpts?.length) {
    const RAG_CHARS = 1500;
    let used = 0;
    const blocks: string[] = [];
    for (const r of opts.ragExcerpts) {
      const t = r.text.slice(0, Math.max(0, RAG_CHARS - used));
      if (t.length < 80) break;
      blocks.push(`— ${r.title} :\n${t}`);
      used += t.length;
    }
    if (blocks.length) {
      system += `\n\nExtraits du manuel pertinents (autres leçons — utilise-les si la question s'y rapporte) :\n<<<MANUEL\n${blocks.join("\n\n")}\n>>>`;
    }
  }
  const msgs: ChatMessage[] = [{ role: "system", content: system }];
  for (const h of opts.history.slice(-HISTORY_TURNS)) {
    msgs.push({ role: h.role === "assistant" ? "assistant" : "user", content: h.content });
  }
  msgs.push({ role: "user", content: opts.userContent });
  return msgs;
}

// Stream assistant text deltas from Ollama /api/chat (NDJSON lines).
export async function* streamChat(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_MODEL, messages, stream: true }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`OLLAMA_HTTP_${res.status}`);

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let obj: { message?: { content?: string }; done?: boolean };
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      // Strip the SentencePiece space marker (▁) gemma occasionally emits literally.
      if (obj.message?.content) yield obj.message.content.replace(/▁/g, " ");
      if (obj.done) return;
    }
  }
}

export async function ollamaOnline(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 800);
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

// ───────────────────────────── Embeddings (RAG) ──────────────────────────────
// Local embedding model for the lesson-content index. Must be pulled on the
// school server at deployment time (`ollama pull nomic-embed-text`); every
// consumer degrades gracefully when it is absent.
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";

let embedCheck: { at: number; ok: boolean } | null = null;

export async function embedModelAvailable(): Promise<boolean> {
  if (embedCheck && Date.now() - embedCheck.at < 60_000) return embedCheck.ok;
  let ok = false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) {
      const data = (await res.json()) as { models?: { name?: string }[] };
      const base = OLLAMA_EMBED_MODEL.split(":")[0];
      ok = (data.models ?? []).some((m) => (m.name ?? "").split(":")[0] === base);
    }
  } catch {
    ok = false;
  }
  embedCheck = { at: Date.now(), ok };
  return ok;
}

// Batch-embed texts via /api/embed. Throws on failure — callers decide the
// fallback (they should have checked embedModelAvailable() first).
export async function ollamaEmbed(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  const BATCH = 16;
  for (let i = 0; i < texts.length; i += BATCH) {
    const input = texts.slice(i, i + BATCH);
    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, input }),
    });
    if (!res.ok) throw new Error(`OLLAMA_EMBED_HTTP_${res.status}`);
    const data = (await res.json()) as { embeddings?: number[][] };
    if (!Array.isArray(data.embeddings) || data.embeddings.length !== input.length) throw new Error("OLLAMA_EMBED_BAD_RESPONSE");
    out.push(...data.embeddings);
  }
  return out;
}

// ---- concurrency semaphore (max 2 simultaneous generations) ----
const MAX_CONCURRENT = 2;
let active = 0;
const waiters: (() => void)[] = [];

export function acquireSlot(): Promise<void> {
  return new Promise((resolve) => {
    if (active < MAX_CONCURRENT) {
      active++;
      resolve();
    } else {
      waiters.push(resolve);
    }
  });
}

export function releaseSlot(): void {
  active = Math.max(0, active - 1);
  const next = waiters.shift();
  if (next) {
    active++;
    next();
  }
}

export const MODEL_NAME = OLLAMA_MODEL;

// ───────────────────────── Project coach (Projets appliqués) ─────────────────
// Same bienveillant FR tutor persona, scoped to the CURRENT step of a capstone
// project. The model sees the scenario, the step instruction and the student's
// current draft, and coaches Socratically — it must NEVER write the deliverable.

const DRAFT_CHARS = 2000;
const SCENARIO_CHARS = 1800;

export type ProjectCoachCtx = {
  projectTitle: string;
  subject: string;
  scenario: string;
  stepOrder: number;
  stepTitle: string;
  stepInstruction: string;
  draft?: string;
};

export function projectCoachSystemPrompt(c: ProjectCoachCtx): string {
  const scenario = c.scenario.length > SCENARIO_CHARS ? c.scenario.slice(0, SCENARIO_CHARS) + "\n…(contexte tronqué)" : c.scenario;
  const draft = (c.draft || "").trim();
  const lines = [
    "Tu es **Copilot**, un tuteur de projet patient et bienveillant pour des élèves du secondaire en République Démocratique du Congo.",
    "Tu réponds TOUJOURS en français, de façon claire, concise et encourageante, adaptée à un élève de 15 à 19 ans.",
    "",
    "Tu accompagnes l'élève sur un **projet appliqué** inspiré d'un cas réel. Règles importantes :",
    "- Concentre-toi sur l'**étape en cours**. Guide l'élève avec des questions et des indices, pas à pas.",
    "- N'écris JAMAIS le livrable à la place de l'élève et ne donne jamais la réponse finale toute faite. Aide-le à la construire lui-même.",
    "- Si l'élève a déjà rédigé un brouillon, réagis dessus : souligne ce qui est bien, pose une question pour l'améliorer, signale une piste manquante.",
    "- Encourage la démarche : rappeler les notions vues en cours, structurer, vérifier que le résultat a du sens.",
    "- Utilise des exemples simples et concrets. Mets les formules en LaTeX entre $...$ quand c'est utile. Sois bref par défaut.",
    "",
    `Matière : ${c.subject}`,
    `Projet : ${c.projectTitle}`,
    "",
    "Contexte du projet (cas réel) :",
    "<<<",
    scenario,
    ">>>",
    "",
    `Étape en cours — Étape ${c.stepOrder} : ${c.stepTitle}`,
    "Consigne de l'étape :",
    "<<<CONSIGNE",
    c.stepInstruction,
    ">>>",
  ];
  if (draft) {
    const trimmed = draft.length > DRAFT_CHARS ? draft.slice(0, DRAFT_CHARS) + "\n…(brouillon tronqué)" : draft;
    lines.push("", "Brouillon actuel de l'élève pour cette étape :", "<<<BROUILLON", trimmed, ">>>");
  } else {
    lines.push("", "L'élève n'a pas encore rédigé de brouillon pour cette étape — aide-le à démarrer.");
  }
  return lines.join("\n");
}

export function buildProjectMessages(opts: {
  ctx: ProjectCoachCtx;
  history: { role: string; content: string }[];
  userContent: string;
}): ChatMessage[] {
  const msgs: ChatMessage[] = [{ role: "system", content: projectCoachSystemPrompt(opts.ctx) }];
  for (const h of opts.history.slice(-HISTORY_TURNS)) {
    msgs.push({ role: h.role === "assistant" ? "assistant" : "user", content: h.content });
  }
  msgs.push({ role: "user", content: opts.userContent });
  return msgs;
}

// ───────────────────── Teacher Copilot APS — generation ──────────────────────
// Non-streaming structured generation (mirrors scripts/refine-content.mjs). Used
// by the teacher project co-author / grader / assign-advisor, which need a whole
// JSON object back rather than a token stream.

export async function ollamaGenerate(
  prompt: string,
  opts: { json?: boolean; num_predict?: number; temperature?: number; signal?: AbortSignal } = {},
): Promise<string> {
  const body: Record<string, unknown> = {
    model: OLLAMA_MODEL,
    prompt,
    stream: false,
    options: { num_predict: opts.num_predict ?? 800, temperature: opts.temperature ?? 0.4, top_p: 0.9 },
  };
  if (opts.json) body.format = "json";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  // Honour a caller-supplied abort signal too.
  if (opts.signal) opts.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`OLLAMA_HTTP_${res.status}`);
    const data = (await res.json()) as { response?: string };
    return (data.response || "").trim();
  } finally {
    clearTimeout(timer);
  }
}

// Tolerant JSON extraction — the model may wrap output in prose or code fences.
export function extractJson(text: string): unknown | null {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    /* fall through */
  }
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try {
      return JSON.parse(text.slice(a, b + 1));
    } catch {
      /* give up */
    }
  }
  return null;
}

// ───────────────────── Delimited blocks (LaTeX-safe output) ─────────────────
// JSON is the wrong container for LaTeX: every backslash has to be doubled, and
// small models do not do that reliably, so `\text` reaches us as a tab. Asking for
// `<<<KEY>>>`-delimited plain text removes escaping from the problem entirely —
// the model writes markdown exactly as it should appear.

const deaccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

// A marker line, normalised for comparison. Small models reliably produce the KEY
// but routinely drop the decoration around it — gemma writes a bare "CONTENU" line
// where the prompt asked for "<<<CONTENU>>>". Accept both, plus markdown emphasis
// and a trailing colon, so the format instruction is a hint rather than a trap.
function markerKey(line: string): string | null {
  const t = line.trim();
  if (!t || t.length > 40) return null;
  const bare = t
    .replace(/^<{2,3}\s*/, "")
    .replace(/\s*>{2,3}$/, "")
    .replace(/^[#*_\s]+/, "")
    .replace(/[#*_\s:]+$/, "")
    .trim();
  return bare ? deaccent(bare).toUpperCase() : null;
}

// Split a response into its named sections. `keys` is the closed set the caller
// expects, which keeps ordinary headings inside the lesson from being mistaken for
// markers. Tolerates a missing final marker (the model running out of tokens) and
// any preamble before the first one.
export function parseBlocks(raw: string, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const text = String(raw ?? "");
  if (!text.trim()) return out;
  const want = new Map([...keys, "FIN"].map((k) => [deaccent(k).toUpperCase(), k]));
  const lines = text.split("\n");
  const marks: { key: string; at: number }[] = [];
  lines.forEach((l, i) => {
    const k = markerKey(l);
    const hit = k && want.get(k);
    if (hit) marks.push({ key: hit, at: i });
  });
  for (let i = 0; i < marks.length; i++) {
    if (marks[i].key === "FIN") continue;
    const end = i + 1 < marks.length ? marks[i + 1].at : lines.length;
    out[marks[i].key] = lines.slice(marks[i].at + 1, end).join("\n").trim();
  }
  return out;
}

export type RawQuestion = { type: string; prompt: string; options: string[]; answer: string; explanation: string };

// Quizzes need repetition, so they use `<<<QUESTION>>>` blocks of `CLÉ: valeur`
// lines (OPTION repeats). A line with no `CLÉ:` prefix continues the previous key,
// which keeps multi-line statements intact.
export function parseQuestionBlocks(raw: string): RawQuestion[] {
  // Same tolerance as parseBlocks: the QUESTION marker may arrive bare.
  const lines = String(raw ?? "").split("\n");
  const starts: number[] = [];
  lines.forEach((l, i) => {
    if (markerKey(l) === "QUESTION") starts.push(i);
  });
  const chunks = starts.map((s, i) => lines.slice(s + 1, i + 1 < starts.length ? starts[i + 1] : lines.length).join("\n"));
  const out: RawQuestion[] = [];
  for (const chunk of chunks) {
    const q: RawQuestion = { type: "", prompt: "", options: [], answer: "", explanation: "" };
    let last: "prompt" | "explanation" | "option" | null = null;
    for (const line of chunk.split("\n")) {
      if (markerKey(line) === "FIN") break;
      const kv = line.match(/^\s*(TYPE|ENONCE|ÉNONCÉ|OPTION|REPONSE|RÉPONSE|EXPLICATION)\s*:\s*(.*)$/);
      if (kv) {
        const [, key, val] = kv;
        if (key === "TYPE") { q.type = val.trim(); last = null; }
        else if (key === "OPTION") { q.options.push(val.trim()); last = "option"; }
        else if (key === "REPONSE" || key === "RÉPONSE") { q.answer = val.trim(); last = null; }
        else if (key === "EXPLICATION") { q.explanation = val.trim(); last = "explanation"; }
        else { q.prompt = val.trim(); last = "prompt"; }
        continue;
      }
      if (!line.trim() || !last) continue;
      if (last === "option") q.options[q.options.length - 1] += " " + line.trim();
      else q[last] += " " + line.trim();
    }
    if (q.prompt) out.push(q);
  }
  return out;
}

// Markdown-safe LaTeX repair. When the model returns JSON, JSON.parse collapses
// LaTeX command prefixes into control chars: \frac→FF, \beta→BS, \vec→VT. Restore
// those (they are never legitimate in markdown).
//
// \t and \n are the hard cases: the control char is indistinguishable from a real
// tab or paragraph break, so we cannot restore them blindly (that is only safe for
// single-line fields — see scripts/repair-quiz-latex.mjs). Instead we match on the
// TAIL the collapse leaves behind ("\text" arrives as TAB+"ext", "\neq" as LF+"eq")
// and, for newlines, additionally require the position to sit inside a math span —
// a paragraph legitimately starting with "eq"/"abla" does not occur in French, but
// the math guard makes prose corruption impossible.
//
// Prefer not needing this at all: generation paths that carry LaTeX should ask for
// delimited blocks (parseBlocks) rather than JSON. This stays as a safety net for
// the callers still on `{ json: true }`.
export { repairLatex, repairTex } from "./latexRepair";

// Strip the SentencePiece ▁ marker gemma sometimes emits.
export function cleanProse(text: string): string {
  return String(text || "").replace(/▁/g, " ").trim();
}

const DIFF_LABEL: Record<string, string> = {
  INTRO: "Introduction (accessible, première découverte)",
  INTERMEDIATE: "Intermédiaire",
  ADVANCED: "Avancé (exigeant)",
};

// Shared APS persona + the mandatory Situation → Savoirs → Compétence ordering.
const APS_PREAMBLE = [
  "Tu es **Copilot APS**, un co-auteur pédagogique pour des enseignants du secondaire en République Démocratique du Congo.",
  "Tu maîtrises l'**Approche Par les Situations (APS)** — la méthode officielle du MEPST.",
  "",
  "Principe FONDAMENTAL, dans cet ordre NON négociable :",
  "1. **Situation** — pars TOUJOURS d'une situation réelle et concrète de la vie en RDC (eau, marché, école, agriculture, transport, santé, coopérative, énergie…), avec des données chiffrées plausibles. La situation PRÉCÈDE toujours le savoir abstrait : l'élève agit d'abord.",
  "2. **Savoirs essentiels** — les notions mobilisées viennent UNIQUEMENT des leçons des modules prérequis fournis ci-dessous. N'invente aucune notion hors de ces leçons.",
  "3. **Compétence** — l'élève construit une compétence en TRAITANT la situation, puis produit un livrable concret (rapport, recommandation, analyse, prévision).",
  "",
  "Tu écris en français clair, pour un élève de 15 à 19 ans. Mets les formules mathématiques en LaTeX entre $...$. Tu PROPOSES ; l'enseignant décide et modifie.",
  "N'utilise JAMAIS de crochets [...] ni de texte à compléter : choisis des noms et des valeurs concrets et réels (villes : Bukavu, Goma, Kinshasa, Lubumbashi, Kisangani, Matadi…).",
  "",
  "MISE EN FORME (markdown lisible par un enseignant non technique) :",
  "- Écris des phrases courtes et des paragraphes brefs (2 à 3 phrases maximum).",
  "- Mets en **gras** les mots-clés importants (notions, grandeurs, le livrable attendu).",
  "- Pour toute énumération (objectifs, données, critères), utilise une liste à puces avec « - » — une idée par ligne.",
  "- Présente les données chiffrées sur une ligne dédiée commençant par **Données :** suivie des valeurs.",
  "- N'utilise NI titres « # », NI tableaux, NI blocs de code : seulement des paragraphes, du gras et des puces « - ».",
].join("\n");

export type ProjectAuthorCtx = {
  subject: string;
  classLevel: string;
  difficulty: string;
  moduleContext: string; // pre-rendered <<<LEÇONS …>>> block (may be empty)
};

// Base prompt = persona + APS + (matière/niveau/difficulté) + module lessons.
// Callers append an action-specific task + JSON schema instruction (for the JSON
// actions) or use it as the chat system message (for brainstorming).
export function projectAuthorSystemPrompt(ctx: ProjectAuthorCtx): string {
  const lines = [
    APS_PREAMBLE,
    "",
    `Matière : ${ctx.subject}`,
    `Niveau : ${ctx.classLevel}`,
    `Difficulté visée : ${DIFF_LABEL[ctx.difficulty] || ctx.difficulty}`,
    "",
  ];
  if (ctx.moduleContext.trim()) {
    lines.push(
      "Modules prérequis sélectionnés — l'élève aura déjà vu ces leçons. Appuie-toi EXCLUSIVEMENT sur leurs notions :",
      "<<<LEÇONS",
      ctx.moduleContext.trim(),
      ">>>",
    );
  } else {
    lines.push("(Aucun module prérequis sélectionné pour l'instant — propose une situation générale du niveau, et invite l'enseignant à cocher des modules pour ancrer le projet dans des leçons précises.)");
  }
  return lines.join("\n");
}

// Studio authoring persona, shared by every studio action. Same APS spirit as
// projects, but lessons are TAUGHT content, so (unlike the project prompt) we WANT
// "##" section headings — those live in the lesson-specific shape below.
//
// The persona is deliberately separate from "what you are producing right now": the
// old single preamble told the model it writes LESSONS, which it then did even when
// the task asked for quiz questions (the JSON schema used to mask this).
const AUTHOR_PERSONA = [
  "Tu es **Copilot APS**, un co-auteur pédagogique pour des enseignants du secondaire en République Démocratique du Congo.",
  "Tu maîtrises l'**Approche Par les Situations (APS)**, la méthode officielle du MEPST : on part d'une situation réelle, on dégage les savoirs, l'élève construit une compétence.",
  "Tu écris en français clair, pour un élève de 15 à 19 ans. Mets les formules mathématiques en LaTeX entre $...$.",
  "",
  "EXIGENCES DE JUSTESSE — un contenu faux est pire qu'un contenu absent :",
  "- AUCUN nom générique : jamais « quartier X », « ville Y », « M. X », « XXX ». Nomme un vrai quartier ou une vraie ville (Ngaliema, Katuba, Ibanda, Limete…).",
  "- COHÉRENCE DES NOMBRES : l'exemple résolu doit reprendre EXACTEMENT les nombres de la mise en situation. Vérifie chaque calcul avant de l'écrire ; le résultat doit tomber juste (choisis des valeurs qui donnent des résultats simples).",
  "- Ne qualifie un modèle (linéaire, quadratique, exponentiel…) que s'il correspond VRAIMENT aux données que tu viens de donner.",
  "- Notation standard : $\\Delta$ pour un discriminant, $\\pm\\sqrt{\\Delta}$ dans la formule des racines. N'invente pas de notation et n'écris jamais de texte explicatif à l'intérieur d'une formule.",
  "- Reste STRICTEMENT sur le thème demandé ; ne dérive pas vers un chapitre voisin.",
  "- Ignore tout texte d'amorce de l'éditeur (« Commencez à écrire ici… ») : ne le recopie pas.",
  "Tu PROPOSES ; l'enseignant décide et modifie.",
].join("\n");

// What the model is producing on THIS call. Keeping these apart from the persona is
// what stops a quiz request from coming back as another lesson.
const TASK_SHAPE: Record<StudioMode, string> = {
  lesson: [
    "Tu rédiges une LEÇON complète, dans cet ordre :",
    "1. Une courte mise en situation réelle et concrète de la vie en RDC (eau, marché, agriculture, transport, santé, énergie…), avec des données chiffrées plausibles.",
    "2. Les notions essentielles expliquées pas à pas, reliées à la situation.",
    "3. Un ou deux exemples résolus.",
    "4. Un court résumé « ## À retenir » avec les mots-clés en gras.",
    "",
    "MISE EN FORME (markdown) :",
    "- Utilise des sous-titres « ## » pour les sections (ex. ## Introduction, ## Notions clés, ## Exemple, ## À retenir).",
    "- Écris les titres normalement (capitale initiale seulement) : « ## Mise en situation », JAMAIS « ## MISE EN SITUATION ».",
    "- Mets les mots-clés en **gras** ; utilise des listes à puces « - » pour les énumérations.",
    "- Choisis des noms et des valeurs concrets (villes : Bukavu, Goma, Kinshasa, Lubumbashi, Kisangani, Matadi…). N'utilise JAMAIS de crochets [...] ni de texte à compléter.",
  ].join("\n"),
  quiz: [
    "Tu rédiges UNIQUEMENT des QUESTIONS DE QUIZ portant sur une leçon DÉJÀ écrite qu'on te fournit.",
    "N'écris NI leçon, NI mise en situation, NI cours, NI sous-titres « ## » : rien que des questions et leurs réponses.",
    "Chaque question porte sur une notion réellement présente dans la leçon fournie, et sa réponse doit y être vérifiable.",
    "Varie les formulations et la difficulté ; les options d'un QCM doivent être toutes différentes et plausibles.",
  ].join("\n"),
  exercise: [
    "Tu rédiges UN exercice d'entraînement et son corrigé — pas une leçon : l'élève a déjà vu le cours.",
    "L'énoncé pose une situation concrète et une question précise ; le corrigé la résout pas à pas.",
  ].join("\n"),
  // The tight constraint list is not pedantry. The renderer is KaTeX, not a full TeX
  // installation, and a small local model asked for "LaTeX" reaches for a complete
  // .tex file because that is what most LaTeX in its training data looks like. A
  // \documentclass line makes an otherwise perfect answer unrenderable, and the
  // teacher sees only "KaTeX ne peut pas afficher ça" — an error they cannot act on.
  latex: [
    "Tu écris UNE formule mathématique en LaTeX, et rien d'autre : pas de leçon, pas de phrase d'introduction, pas de commentaire.",
    "",
    "CONTRAINTES DE RENDU — la formule est affichée par KaTeX, pas par une installation LaTeX complète :",
    "- Écris UNIQUEMENT le corps de la formule. Jamais \\documentclass, \\usepackage, \\begin{document} ni \\end{document}.",
    "- N'entoure pas ta réponse de $, de $$, de \\[ \\] ni d'un bloc de code.",
    "- Environnements autorisés : aligned, cases, pmatrix, bmatrix, vmatrix, Vmatrix, array, matrix. N'utilise ni equation, ni align, ni gather, ni tikzpicture, ni figure, ni tabular.",
    "- Pour une démonstration en plusieurs étapes, utilise \\begin{aligned} … \\end{aligned} avec « & » avant chaque « = » et « \\\\ » en fin de ligne.",
    // A model asked for "un tableau de 5 colonnes et 10 lignes" answers with
    // \begin{array}{ccccc} and ten rows of "& & & & \\". That is valid LaTeX which
    // typesets to nothing at all, and the teacher reports that the button did nothing.
    "- Pour un TABLEAU : \\begin{array} avec des filets verticaux dans la spécification des colonnes ({|c|c|c|}), un \\hline avant la première ligne, après la ligne d'en-têtes et après la dernière. Écris une ligne d'en-têtes, puis remplis CHAQUE case — une valeur, ou « \\cdots » si le contenu est à compléter par l'élève. Ne renvoie JAMAIS une case vide : un tableau sans filets et sans contenu s'affiche comme une page blanche.",
    "- Le texte à l'intérieur d'une formule va dans \\text{…} : \\text{si } x > 0. Les unités et les symboles chimiques vont dans \\mathrm{…} : \\mathrm{m/s}, \\mathrm{H_2O}.",
    "",
    "EXIGENCES DE JUSTESSE — une formule fausse est pire qu'une formule absente :",
    "- Vérifie chaque étape de calcul avant de l'écrire ; le résultat final doit être exact.",
    "- Quand on te demande un calcul « étape par étape », montre chaque étape intermédiaire sur sa propre ligne, pas seulement le résultat.",
    "- Garde la notation de l'enseignant quand il y en a déjà une ; n'en invente pas une autre.",
  ].join("\n"),
};

export type StudioMode = "lesson" | "quiz" | "exercise" | "latex";
export type LessonAuthorCtx = { subject: string; classLevel: string; moduleContext: string };

// Base prompt for studio generation. Callers append the action task + output format.
export function lessonAuthorSystemPrompt(ctx: LessonAuthorCtx, mode: StudioMode = "lesson"): string {
  const lines = [AUTHOR_PERSONA, "", TASK_SHAPE[mode], "", `Matière : ${ctx.subject}`, `Niveau : ${ctx.classLevel}`, ""];
  if (ctx.moduleContext.trim()) {
    lines.push(
      "Pour t'ancrer dans le programme, voici des leçons existantes du module visé (inspire-toi du niveau et du style, sans recopier) :",
      "<<<LEÇONS",
      ctx.moduleContext.trim(),
      ">>>",
    );
  }
  return lines.join("\n");
}

export type GradingAssistCtx = {
  projectTitle: string;
  scenario: string;
  deliverable?: string;
  steps: { order: number; title: string; instruction: string; response: string }[];
};

// One-shot JSON prompt: analyse a student's project submission to GUIDE the
// teacher (never a single "correct answer"; the teacher keeps authority).
export function gradingAssistSystemPrompt(c: GradingAssistCtx): string {
  const scenario = c.scenario.length > SCENARIO_CHARS ? c.scenario.slice(0, SCENARIO_CHARS) + "\n…(tronqué)" : c.scenario;
  const stepBlocks = c.steps
    .map((s) => {
      const resp = (s.response || "").trim() || "(aucune réponse)";
      const r = resp.length > 1400 ? resp.slice(0, 1400) + "\n…(tronqué)" : resp;
      return [`### Étape ${s.order} : ${s.title}`, `Consigne : ${s.instruction}`, "Réponse de l'élève :", "<<<", r, ">>>"].join("\n");
    })
    .join("\n\n");
  return [
    "Tu es **Copilot APS**, l'assistant de correction d'un enseignant du secondaire en RDC.",
    "Tu AIDES l'enseignant à évaluer un projet appliqué ; tu ne le remplaces pas et tu ne révèles pas une réponse unique.",
    `Analyse les ${c.steps.length} étapes ci-dessous, TOUTES sans en omettre. Pour CHAQUE étape, dis ce qui est **réussi**, ce qui **manque**, et signale une éventuelle **conception erronée** (misconception) — sinon null. Sois bref (1 phrase par champ).`,
    "Propose ensuite une **fourchette de note** /100 (gradeMin, gradeMax) et un court **retour bienveillant** à l'élève (draftFeedbackMd, en français, encourageant, 2 à 4 phrases, qui valorise puis oriente).",
    "Sois juste et concret : appuie-toi sur ce que l'élève a réellement écrit.",
    "",
    `Projet : ${c.projectTitle}`,
    "Contexte (situation réelle) :",
    "<<<",
    scenario,
    ">>>",
    c.deliverable ? `\nLivrable attendu : ${c.deliverable}` : "",
    "",
    stepBlocks,
    "",
    'Réponds STRICTEMENT en JSON valide, sans texte autour, au format :',
    '{"steps":[{"order":1,"title":"…","good":"…","missing":"…","misconception":null}],"gradeMin":0,"gradeMax":100,"draftFeedbackMd":"…"}',
  ]
    .filter(Boolean)
    .join("\n");
}

export type AssignAdvisorCtx = {
  projectTitle: string;
  difficulty: string;
  estMinutes: number;
  classLevel: string;
  className: string;
  prereqTitles: string[];
  avgProgress: number; // 0-100, class average
  prereqDonePct: number; // 0-100, % of class who completed all prereq modules
  today: string; // YYYY-MM-DD
};

export function assignAdvisorSystemPrompt(c: AssignAdvisorCtx): string {
  return [
    "Tu es **Copilot APS**, conseiller d'un enseignant du secondaire en RDC qui s'apprête à assigner un projet appliqué à une classe.",
    "À partir des données ci-dessous, juge si la classe est **prête** et propose une **échéance** réaliste.",
    "",
    `Projet : ${c.projectTitle} (difficulté ${DIFF_LABEL[c.difficulty] || c.difficulty}, durée estimée ${c.estMinutes} min)`,
    `Classe : ${c.className} (${c.classLevel})`,
    `Modules prérequis : ${c.prereqTitles.length ? c.prereqTitles.join(", ") : "aucun"}`,
    `Progression moyenne de la classe : ${c.avgProgress}%`,
    `Part des élèves ayant terminé TOUS les prérequis : ${c.prereqDonePct}%`,
    `Date du jour : ${c.today}`,
    "",
    "Règles : READY si ≥70% ont les prérequis ; PARTIAL si 30–70% ; NOT_READY sinon. L'échéance laisse plus de temps si la difficulté est élevée ou la classe peu prête (typiquement 7 à 21 jours).",
    "",
    'Réponds STRICTEMENT en JSON valide, sans texte autour, au format :',
    '{"readiness":"READY|PARTIAL|NOT_READY","readinessNote":"… (1 phrase)","suggestedDueDate":"YYYY-MM-DD","rationale":"… (1 phrase)"}',
  ].join("\n");
}
