import { prisma } from "./db";
import type { SessionUser } from "./session";
import {
  type ChatMessage,
  type TeachCoachCtx,
  buildTeachMessages,
  lessonAuthorSystemPrompt,
  ollamaGenerate,
  ollamaOnline,
  acquireSlot,
  releaseSlot,
  cleanProse,
  parseBlocks,
  repairLatex,
} from "./ollama";
import { getViewableLesson, classForLessonInScope } from "./studio";
import type { StepEmit } from "./teacherAgent";
import { levelFromSubject } from "./studioCopilot";
import { getModulesContentForAI, renderModuleContext } from "./projectCopilot";
import { canEditVisually } from "./lessonDoc";
import { stripFigures } from "./rag";
import { isBlankContent } from "./lessonSkeleton";

// « Copilot Enseigner » — teaching support, not authoring.
//
// Two agents share this file because they share the same grounding:
//   1. the coach — a streaming conversation about HOW to teach the selected lesson;
//   2. the rédacteur — turns that conversation into a lesson, on demand.
//
// The reason this is worth building rather than pointing a teacher at any chatbot is
// `classSignals()`: the verbatim questions their pupils asked on this exact lesson,
// and where those pupils said they were lost. That data already exists and is shown
// to nobody at the moment it would be useful.

// Budgets. The whole system prompt has to fit a 2B model's context alongside the
// conversation, so every block is capped and the caps are stated once, here.
const LESSON_CHARS = 3000;
const MODULE_CHARS = 1500;
const SIGNALS_CHARS = 800;
const FEEDBACK_CHARS = 500;
const RAG_CHARS = 1200;

/** A teacher turn is one message with role "user". The unlock rule counts these. */
export const COMPOSE_MIN_TURNS = 3;

export function canCompose(messages: { role: string }[]): boolean {
  return messages.filter((m) => m.role === "user").length >= COMPOSE_MIN_TURNS;
}

export function teacherTurns(messages: { role: string }[]): number {
  return messages.filter((m) => m.role === "user").length;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

/**
 * The lesson as the model should read it: figures out, THEN truncated.
 *
 * Order is the whole point. 55 of the 91 figure-bearing lessons carry an <svg> inside
 * their first 3000 characters and one « Manuel illustré » was 94% path data, so
 * clipping the raw markdown spent the budget on coordinates. stripFigures keeps each
 * figcaption, so the model still learns a figure is there and what it shows.
 */
export function lessonExcerpt(md: string): string {
  return clip(stripFigures(md || ""), LESSON_CHARS);
}

/**
 * What this class actually did with this lesson.
 *
 * Two independent sources, both keyed by lessonId and both already computed for other
 * screens: the questions pupils typed at the student Copilot (insights) and the
 * « je n'ai pas compris » ratings with their free-text (the feedback inbox).
 *
 * Returns "" rather than throwing on any failure — a thinner prompt is always better
 * than a 500, and a brand-new lesson legitimately has no signal at all.
 */
export type ClassSignals = {
  questionTotal: number;
  questions: { text: string; count: number; students: number }[];
  understanding: { avg: number; count: number } | null;
  notes: { student: string; understanding: number; message: string }[];
};

export const NO_SIGNALS: ClassSignals = { questionTotal: 0, questions: [], understanding: null, notes: [] };

export function hasSignals(s: ClassSignals): boolean {
  return s.questionTotal > 0 || s.understanding != null;
}

export async function classSignals(user: SessionUser, lessonId: string, classId: string | null): Promise<ClassSignals> {
  const out: ClassSignals = { questionTotal: 0, questions: [], understanding: null, notes: [] };

  try {
    const { buildInsights } = await import("./insights");
    const ins = await buildInsights(user.userId, classId ?? undefined);
    const row = ins.modules.flatMap((m) => m.lessons).find((l) => l.lessonId === lessonId);
    if (row?.questions?.length) {
      out.questionTotal = row.count;
      out.questions = row.questions.slice(0, 8).map((q) => ({ text: q.text, count: q.count, students: q.students }));
    }
  } catch { /* insights is a nicety; never let it break the chat */ }

  try {
    const { teacherFeedbackInbox } = await import("./teacher");
    const inbox = await teacherFeedbackInbox(user.userId);
    const mine = inbox.items.filter((i) => i.lessonId === lessonId);
    if (mine.length) {
      out.understanding = {
        avg: Math.round(mine.reduce((a, i) => a + i.understanding, 0) / mine.length),
        count: mine.length,
      };
      out.notes = mine
        .filter((i) => i.message?.trim())
        .slice(0, 5)
        .map((i) => ({ student: i.studentName, understanding: i.understanding, message: i.message!.trim() }));
    }
  } catch { /* same */ }

  return out;
}

/** The same signals as prompt text. Structured first, rendered second — the panel and
 *  the model are looking at exactly the same numbers. */
export function renderSignals(s: ClassSignals): string {
  const parts: string[] = [];
  if (s.questions.length) {
    const lines = s.questions.map((q) => `- « ${q.text} » (${q.count} fois, ${q.students} élève${q.students > 1 ? "s" : ""})`);
    parts.push(`Questions posées au Copilot par les élèves sur cette leçon (${s.questionTotal} au total) :\n${clip(lines.join("\n"), SIGNALS_CHARS)}`);
  }
  if (s.understanding) {
    const block = [
      `Compréhension déclarée : ${s.understanding.avg}% en moyenne sur ${s.understanding.count} retour${s.understanding.count > 1 ? "s" : ""}.`,
      ...s.notes.map((n) => `- ${n.student} (${n.understanding}%) : « ${n.message} »`),
    ].join("\n");
    parts.push(clip(block, FEEDBACK_CHARS));
  }
  return parts.join("\n\n");
}

/** Everything the coach knows before the teacher has said anything. */
export async function teachContext(
  user: SessionUser,
  lessonId: string,
  question: string,
): Promise<{ ctx: TeachCoachCtx; signals: ClassSignals; lesson: { id: string; title: string; canEdit: boolean; subjectSlug: string | null } } | null> {
  const lesson = await getViewableLesson(user, lessonId).catch(() => null);
  if (!lesson) return null;

  const subjectSlug = lesson.module?.subjectSlug ?? lesson.subjectSlug ?? "";
  const subjectName = lesson.module?.subject?.name ?? (subjectSlug || "—");
  const classId = await classForLessonInScope(user, lessonId).catch(() => null);
  const classLevel = lesson.module?.classLevel ?? levelFromSubject(subjectSlug);

  let moduleContext = "";
  try {
    const mc = await getModulesContentForAI(user, lesson.moduleId ? [lesson.moduleId] : []);
    moduleContext = clip(renderModuleContext(mc), MODULE_CHARS);
  } catch { /* optional */ }

  let ragExcerpts = "";
  try {
    const { retrieveChunks } = await import("./rag");
    const hits = await retrieveChunks(question, {
      k: 4,
      subjectSlugs: subjectSlug ? [subjectSlug] : undefined,
      classLevel,
      excludeLessonId: lessonId,
    });
    const useful = hits.filter((h) => h.score > 0.45);
    let left = RAG_CHARS;
    const blocks: string[] = [];
    for (const h of useful) {
      const t = `— ${h.lessonTitle} :\n${clip(h.text, Math.min(400, left))}`;
      if (t.length > left) break;
      blocks.push(t);
      left -= t.length;
    }
    ragExcerpts = blocks.join("\n\n");
  } catch { /* no index yet → silence, as everywhere else */ }

  const signals = await classSignals(user, lessonId, classId);
  const ctx: TeachCoachCtx = {
    lessonTitle: lesson.title,
    subject: subjectName,
    classLevel,
    lessonText: lessonExcerpt(lesson.contentMd || ""),
    moduleContext,
    classSignals: renderSignals(signals),
    ragExcerpts,
  };

  return {
    ctx,
    signals,
    lesson: { id: lesson.id, title: lesson.title, canEdit: lesson.authorId === user.userId || user.role === "ADMIN", subjectSlug },
  };
}

/** The chat turn. Returns null when the lesson is not visible to this teacher. */
export async function teachMessages(
  user: SessionUser,
  lessonId: string,
  message: string,
  history: { role: string; content: string }[],
): Promise<ChatMessage[] | null> {
  const built = await teachContext(user, lessonId, message);
  if (!built) return null;
  return buildTeachMessages({ ctx: built.ctx, history, userContent: message });
}

// ───────────────────────── Agent 2 — the rédacteur ─────────────────────────

export type ComposeTarget =
  | { kind: "inline" } // the teacher owns this lesson: write into it
  // book lesson: a new complément beside it. subjectSlug travels with the target so
  // the panel can create the library lesson without knowing where it was mounted.
  | { kind: "complement"; sourceId: string; sourceTitle: string; subjectSlug: string };

/**
 * Where a generated lesson can actually land.
 *
 * Pure, because it is the one decision that must not surprise anyone: book content is
 * admin-only, and 481 of the ~485 seeded lessons are book content. Writing into the
 * open lesson would be a dead button almost everywhere, so those become a *complément*
 * — a lesson of the teacher's own, attached to the book lesson, which is a mechanism
 * the platform already has.
 */
export function resolveTarget(lesson: { id: string; title: string; canEdit: boolean; subjectSlug: string | null }): ComposeTarget {
  if (lesson.canEdit) return { kind: "inline" };
  return { kind: "complement", sourceId: lesson.id, sourceTitle: lesson.title, subjectSlug: lesson.subjectSlug ?? "" };
}

export type TeachComposeResult = {
  fallback: boolean;
  title: string;
  contentMd: string;
  warnings: string[];
  target: ComposeTarget;
};

const BRIEF_KEYS = ["TITRE", "ANGLE", "OBJECTIFS", "PIEGES", "EXEMPLES"];

function briefPrompt(lessonTitle: string, transcript: string): string {
  return [
    "Voici la conversation entre un enseignant et son assistant pédagogique au sujet de la leçon « " + lessonTitle + " ».",
    "Résume ce que l'enseignant veut obtenir, pour qu'un rédacteur puisse écrire la leçon sans relire la conversation.",
    "Ne réponds qu'avec les blocs demandés, sans commentaire.",
    "",
    "<<<CONVERSATION",
    transcript,
    ">>>",
    "",
    "Format EXACT :",
    "<<<TITRE",
    "un titre court et précis",
    "<<<ANGLE",
    "en deux phrases : par quelle entrée concrète aborder la notion, et pourquoi celle-là",
    "<<<OBJECTIFS",
    "- un objectif par ligne (3 maximum)",
    "<<<PIEGES",
    "- une erreur d'élève par ligne, telle qu'elle apparaît dans une copie (3 maximum)",
    "<<<EXEMPLES",
    "- un exemple chiffré par ligne, ancré en RDC (2 maximum)",
    "<<<FIN",
  ].join("\n");
}

export type TeachBrief = { title: string; angle: string; objectives: string[]; pitfalls: string[]; examples: string[] };

/** Parse the brief. Exported for tests — a truncated block must degrade, not throw. */
export function parseBrief(raw: string, fallbackTitle: string): TeachBrief {
  const b = parseBlocks(raw, BRIEF_KEYS);
  const list = (v?: string) =>
    (v || "")
      .split("\n")
      .map((l) => cleanProse(l).replace(/^[-•*\d.)\s]+/, "").trim())
      .filter(Boolean)
      .slice(0, 3);
  return {
    title: cleanProse(b.TITRE || "").trim().slice(0, 120) || fallbackTitle,
    angle: cleanProse(b.ANGLE || "").trim().slice(0, 600),
    objectives: list(b.OBJECTIFS),
    pitfalls: list(b.PIEGES),
    examples: list(b.EXEMPLES),
  };
}

function writePrompt(brief: TeachBrief): string {
  const sec = (label: string, items: string[]) => (items.length ? `${label} :\n${items.map((i) => `- ${i}`).join("\n")}` : "");
  return [
    "Rédige la leçon complète décrite par ce cahier des charges, issu d'une conversation avec l'enseignant.",
    "",
    `Titre : ${brief.title}`,
    brief.angle ? `Angle retenu : ${brief.angle}` : "",
    sec("Objectifs visés", brief.objectives),
    sec("Erreurs d'élèves à désamorcer explicitement", brief.pitfalls),
    sec("Exemples à utiliser", brief.examples),
    "",
    "Structure la leçon en sections « ## Mise en situation », « ## Notions clés », « ## Exemple résolu », « ## À retenir ».",
    "Traite chaque erreur listée à l'endroit où elle se produit, pas dans une section à part.",
    "",
    // No <<<KEY>>> envelope here, deliberately. Asked for one, the 2B model wrote
    // `<<<Le Raisonnement par Contraposition` — it substituted the title INTO the
    // marker — and a perfectly good lesson parsed to nothing. The title already comes
    // from the brief, so the second block bought us only a way to fail.
    "Réponds UNIQUEMENT avec la leçon en markdown, en commençant directement par « ## Mise en situation ». Pas de préambule, pas de commentaire.",
  ].filter(Boolean).join("\n");
}

/**
 * Take the lesson out of whatever the model wrapped it in.
 *
 * Exported for tests. A small model asked for clean markdown still sometimes opens
 * with a stray marker line or a "Voici la leçon :" preamble; both are noise around a
 * usable lesson, and throwing the lesson away over them would be the wrong trade.
 */
export function extractLesson(raw: string): string {
  let t = cleanProse(raw).trim();
  t = t.replace(/^<<<[^\n]*\n/, "").replace(/\n>{3,}\s*$/, "").replace(/\n<<<FIN[\s\S]*$/i, "");
  // Drop anything before the first heading — that is where the lesson really starts.
  const h = t.search(/^#{1,3}\s/m);
  if (h > 0) t = t.slice(h);
  return t.trim();
}

/**
 * The composer. Five steps in the teacher-agent dialect, so `useAgentStream()` and
 * `<AgentSteps>` render it with no new client code.
 *
 * There is no deterministic fallback here, unlike the group composer: "write a lesson
 * with no language model" has no honest answer, so an offline run errors the step and
 * says so — the same choice runGradingAgent makes.
 */
export async function runTeachComposer(
  user: SessionUser,
  input: { lessonId: string },
  emit: StepEmit,
): Promise<TeachComposeResult | { error: string }> {
  // 1 ── load
  emit("load", "running", "Lecture de la conversation…");
  const built = await teachContext(user, input.lessonId, "");
  if (!built) {
    emit("load", "error", "Leçon introuvable");
    return { error: "NOT_FOUND" };
  }
  const thread = await prisma.teachThread.findUnique({
    where: { teacherId_lessonId: { teacherId: user.userId, lessonId: input.lessonId } },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  const msgs = thread?.messages ?? [];
  if (!canCompose(msgs)) {
    emit("load", "error", "Conversation trop courte");
    return { error: "TOO_SHORT" };
  }
  const turns = teacherTurns(msgs);
  emit("load", "done", "Lecture de la conversation", `${turns} échange${turns > 1 ? "s" : ""}`);

  if (!(await ollamaOnline())) {
    emit("brief", "error", "Copilot hors ligne");
    return { error: "OLLAMA_OFFLINE" };
  }

  // The transcript is the brief. Cap each turn so one long paste cannot crowd out the rest.
  const transcript = msgs
    .map((m) => `${m.role === "user" ? "ENSEIGNANT" : "ASSISTANT"} : ${clip(m.content, 700)}`)
    .join("\n\n")
    .slice(-6000);

  // 2 ── brief
  emit("brief", "running", "Synthèse de vos échanges…");
  let brief: TeachBrief | null = null;
  await acquireSlot();
  try {
    for (let attempt = 0; attempt < 2 && !brief; attempt++) {
      const raw = await ollamaGenerate(briefPrompt(built.lesson.title, transcript), { num_predict: 700 });
      const parsed = parseBrief(raw, built.lesson.title);
      if (parsed.angle || parsed.objectives.length) brief = parsed;
    }
  } catch { /* fall through to the error below */ } finally { releaseSlot(); }
  if (!brief) {
    emit("brief", "error", "Synthèse impossible");
    return { error: "GEN_FAILED" };
  }
  emit("brief", "done", "Synthèse de vos échanges", brief.title);

  // 3 ── write
  emit("write", "running", "Rédaction de la leçon…");
  const system = lessonAuthorSystemPrompt(
    { subject: built.ctx.subject, classLevel: built.ctx.classLevel, moduleContext: built.ctx.moduleContext },
    "lesson",
  );
  const title = brief.title;
  let contentMd = "";
  await acquireSlot();
  try {
    for (let attempt = 0; attempt < 2 && !contentMd.trim(); attempt++) {
      const raw = await ollamaGenerate(`${system}\n\n${writePrompt(brief)}`, { num_predict: 2200 });
      const body = extractLesson(raw);
      if (body) contentMd = repairLatex(body);
    }
  } catch { /* handled below */ } finally { releaseSlot(); }
  if (!contentMd.trim() || isBlankContent(contentMd)) {
    emit("write", "error", "Rédaction échouée");
    return { error: "GEN_FAILED" };
  }
  emit("write", "done", "Rédaction de la leçon", `${contentMd.split(/\s+/).filter(Boolean).length} mots`);

  // 4 ── verify (deterministic; the model gets no say here)
  emit("verify", "running", "Vérification…");
  const warnings = verifyLesson(contentMd);
  emit(
    "verify",
    "done",
    "Vérification",
    warnings.length ? `${warnings.length} point${warnings.length > 1 ? "s" : ""} à revoir` : "formules et structure correctes",
  );

  return { fallback: false, title, contentMd, warnings, target: resolveTarget(built.lesson) };
}

/**
 * Deterministic checks on generated markdown. Exported for tests.
 *
 * `canEditVisually` is the one that matters: a lesson the word processor refuses to
 * open would land the teacher in a raw markdown textarea, which is exactly the
 * experience « Rédiger une leçon » was built to remove.
 */
export function verifyLesson(md: string): string[] {
  const out: string[] = [];
  const gate = canEditVisually(md);
  if (!gate.ok) out.push(`La leçon s'ouvrira en mode Markdown : ${gate.reason ?? "construction non prise en charge"}.`);
  if (/\[[^\]]*\.{3}[^\]]*\]|\[à compléter\]|\[…\]/i.test(md)) out.push("Des passages à compléter subsistent — relisez avant de publier.");
  if (!/^##\s/m.test(md)) out.push("Aucune section « ## » — la leçon n'a pas la structure APS attendue.");
  return out;
}
