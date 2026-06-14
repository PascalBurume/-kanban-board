// Ollama (gemma3n) client for the Copilot tutor — NDJSON streaming, tutor
// persona, lesson-context injection, and a small concurrency semaphore.

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma3n:e4b";

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

export function buildMessages(
  opts: { lessonTitle: string; subject: string; excerpt: string; history: { role: string; content: string }[]; userContent: string; context?: CopilotContext },
): ChatMessage[] {
  const msgs: ChatMessage[] = [{ role: "system", content: copilotSystemPrompt(opts.lessonTitle, opts.subject, opts.excerpt, opts.context) }];
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
