import { prisma } from "./db";
import type { SessionUser } from "./session";
import type { StepEmit } from "./teacherAgent";
import { editableSubjectSlugs, classScope } from "./studio";
import { matchExercisesFixed } from "./practice";
import { retrieveChunks } from "./rag";
import { ollamaOnline, ollamaGenerate, extractJson, acquireSlot, releaseSlot, cleanProse, type ChatMessage } from "./ollama";

// « Conseiller d'exercices » — the exercises-page agent. Given ONE exercise
// (teacher-authored or straight from the book), it explains it pedagogically
// and proposes which lessons to link it to, grounded only in that exercise's
// text plus RAG-retrieved lesson excerpts from the same book. Mirrors the
// teacherAgent.ts conventions: deterministic steps + two narrow-schema LLM
// calls, visible step streaming, graceful fallback when Ollama is down.

const STATEMENT_CAP = 1800;
const SOLUTION_CAP = 900;
const LESSON_EXCERPT = 500;
const CHAT_BUDGET = 3500;
const HISTORY_TURNS = 6;

export type ExerciseRef =
  | { kind: "custom"; exerciseId: string }
  | { kind: "book"; subjectSlug: string; moduleOrder: number; bookId: string };

export interface ExerciseAdvice {
  fallback: boolean;
  exercise: { kind: "custom" | "book"; id: string; title: string; editable: boolean };
  explanation: {
    notions: string[];
    difficulty: 1 | 2 | 3;
    difficultyWhy: string;
    prerequisites: string[];
    summary: string;
  };
  suggestions: {
    lessonId: string;
    moduleId: string;
    lessonTitle: string;
    moduleTitle: string;
    reason: string;
    confidence: number; // 0-100
    alreadyLinked: boolean;
  }[];
}

// OCR scans leave runs of spaces/dashes — collapse them so the prompt stays sane.
function tidy(t: string): string {
  return t.replace(/[ \t]{2,}/g, " ").replace(/[—–-]{3,}/g, " … ").replace(/\n{3,}/g, "\n\n").trim();
}

interface LoadedExercise {
  subjectSlug: string;
  subjectName: string;
  classLevel?: string;
  title: string;
  statement: string;
  solution: string;
  quality: string; // "clean" | "ocr" | "custom"
  editable: boolean;
  links: { moduleId: string | null; lessonId: string | null }[];
}

// Resolve + authorize either exercise kind into a compact, prompt-ready shape.
export async function loadExerciseForAI(user: SessionUser, ref: ExerciseRef, classId?: string): Promise<LoadedExercise | null> {
  const slugs = await editableSubjectSlugs(user);
  const classLevel = classId ? (await classScope(user, classId))?.level : undefined;

  if (ref.kind === "custom") {
    const e = await prisma.exercise.findUnique({
      where: { id: ref.exerciseId },
      include: { subject: { select: { name: true } }, links: { select: { moduleId: true, lessonId: true } } },
    });
    if (!e || !slugs.includes(e.subjectSlug)) return null;
    return {
      subjectSlug: e.subjectSlug,
      subjectName: e.subject.name,
      classLevel,
      title: e.title || e.statementMd.slice(0, 60),
      statement: e.statementMd.slice(0, STATEMENT_CAP),
      solution: e.solutionMd.slice(0, SOLUTION_CAP),
      quality: "custom",
      editable: user.role === "ADMIN" || e.authorId === user.userId,
      links: e.links,
    };
  }

  if (!slugs.includes(ref.subjectSlug)) return null;
  const book = (await matchExercisesFixed(ref.subjectSlug, ref.moduleOrder)).find((e) => String(e.id) === String(ref.bookId));
  if (!book) return null;
  const subject = await prisma.subject.findUnique({ where: { slug: ref.subjectSlug }, select: { name: true } });
  return {
    subjectSlug: ref.subjectSlug,
    subjectName: subject?.name ?? ref.subjectSlug,
    classLevel,
    title: book.section || (book.n ? `Exercice ${book.n}` : "Exercice du manuel"),
    statement: tidy(book.text).slice(0, STATEMENT_CAP),
    solution: tidy(book.solution || "").slice(0, SOLUTION_CAP),
    quality: book.quality,
    editable: false,
    links: [],
  };
}

const DIFF_LABEL: Record<number, string> = { 1: "facile", 2: "moyen", 3: "difficile" };

function fallbackExplanation(ex: LoadedExercise): ExerciseAdvice["explanation"] {
  return {
    notions: [],
    difficulty: 2,
    difficultyWhy: "",
    prerequisites: [],
    summary: `Exercice de ${ex.subjectName}${ex.classLevel ? ` (${ex.classLevel})` : ""} — analyse détaillée indisponible (Copilot hors ligne).`,
  };
}

const clip = (v: unknown, n: number) => (typeof v === "string" ? cleanProse(v).trim().slice(0, n) : "");

export async function runExerciseAdvisor(
  user: SessionUser,
  input: { ref: ExerciseRef; classId?: string },
  emit: StepEmit,
): Promise<ExerciseAdvice | { error: string }> {
  // 1 ── load ────────────────────────────────────────────────────────────────
  emit("load", "running", "Lecture de l'exercice…");
  const ex = await loadExerciseForAI(user, input.ref, input.classId);
  if (!ex) { emit("load", "error", "Exercice introuvable"); return { error: "NOT_FOUND" }; }
  emit("load", "done", "Lecture de l'exercice",
    input.ref.kind === "custom" ? `mon exercice · ${ex.links.length} lien(s)` : `manuel · ${ex.quality === "ocr" ? "scan OCR" : "corrigé vérifié"}`);

  const online = await ollamaOnline();
  let fallback = !online;

  // 2 ── notions (LLM #1: pedagogical read of the statement alone) ──────────
  emit("notions", "running", "Analyse pédagogique de l'énoncé…");
  let explanation = fallbackExplanation(ex);
  if (!online) {
    emit("notions", "done", "Analyse pédagogique", "Copilot hors ligne — analyse simplifiée");
  } else {
    const ocrNote = ex.quality === "ocr" ? "\n(Énoncé issu d'un scan OCR — le texte peut être bruité, concentre-toi sur le sens.)" : "";
    const prompt = [
      `Tu es conseiller pédagogique pour un enseignant de ${ex.subjectName}${ex.classLevel ? ` en ${ex.classLevel}` : ""} en RDC.`,
      `Analyse cet exercice d'entraînement.${ocrNote}`,
      `Énoncé :\n<<<\n${ex.statement}\n>>>`,
      ...(ex.solution ? [`Corrigé (extrait) :\n<<<\n${ex.solution.slice(0, 600)}\n>>>`] : []),
      "Réponds UNIQUEMENT en JSON :",
      '{"notions":["notion clé (2-4 mots)"],"difficulty":1|2|3,"difficultyWhy":"1 phrase","prerequisites":["prérequis"],"summary":"2 à 3 phrases pédagogiques en français simple : ce que travaille l\'exercice et comment l\'aborder"}',
    ].join("\n");

    let data: Record<string, unknown> | null = null;
    await acquireSlot();
    try {
      for (let attempt = 0; attempt < 2 && !data; attempt++) {
        const raw = await ollamaGenerate(prompt, { json: true, num_predict: 500 });
        data = extractJson(raw) as Record<string, unknown> | null;
        if (data && typeof data.summary !== "string") data = null;
      }
    } catch { data = null; } finally { releaseSlot(); }

    if (!data) {
      fallback = true;
      emit("notions", "done", "Analyse pédagogique", "Génération échouée — analyse simplifiée");
    } else {
      const diff = Number(data.difficulty);
      explanation = {
        notions: (Array.isArray(data.notions) ? data.notions : []).map((n) => clip(n, 40)).filter(Boolean).slice(0, 5),
        difficulty: diff === 1 || diff === 3 ? diff : 2,
        difficultyWhy: clip(data.difficultyWhy, 160),
        prerequisites: (Array.isArray(data.prerequisites) ? data.prerequisites : []).map((p) => clip(p, 60)).filter(Boolean).slice(0, 4),
        summary: clip(data.summary, 450),
      };
      emit("notions", "done", "Analyse pédagogique",
        `${explanation.notions.length} notion(s) · difficulté ${DIFF_LABEL[explanation.difficulty]}`);
    }
  }

  const base = {
    fallback,
    exercise: {
      kind: input.ref.kind,
      id: input.ref.kind === "custom" ? input.ref.exerciseId : String(input.ref.bookId),
      title: ex.title,
      editable: ex.editable,
    },
    explanation,
  };

  // 3 ── retrieve (deterministic RAG over the same book) ────────────────────
  emit("retrieve", "running", "Recherche des leçons pertinentes…");
  const query = `${explanation.notions.join(", ")} — ${ex.statement.slice(0, 600)}`;
  const candidates = await retrieveChunks(query, { k: 6, subjectSlugs: [ex.subjectSlug], classLevel: ex.classLevel });
  if (candidates.length === 0) {
    emit("retrieve", "done", "Recherche des leçons", online ? "Index RAG vide pour cette matière" : "Copilot hors ligne — recherche indisponible");
    return { ...base, suggestions: [] };
  }
  emit("retrieve", "done", "Recherche des leçons", `${candidates.length} leçon(s) candidate(s)`);

  // 4 ── match (LLM #2: rank the candidates against the statement) ──────────
  emit("match", "running", "Mise en correspondance exercice ↔ leçons…");
  type Match = { lessonId: string; reason: string; confidence: number };
  let matches: Match[] | null = null;

  if (online) {
    const listing = candidates
      .map((c, i) => `${i + 1}. [${c.lessonId}] ${c.moduleTitle} › ${c.lessonTitle} : ${c.text.slice(0, 350)}`)
      .join("\n");
    const prompt = [
      "Tu aides un enseignant à rattacher un exercice aux leçons du manuel qu'il illustre le mieux.",
      `Exercice :\n<<<\n${ex.statement.slice(0, 900)}\n>>>`,
      `Leçons candidates :\n${listing}`,
      "Choisis les 1 à 4 leçons les PLUS pertinentes (utilise les id entre crochets). Réponds UNIQUEMENT en JSON :",
      '{"matches":[{"lessonId":"…","reason":"1 phrase en français : pourquoi cette leçon","confidence":1-5}]}',
    ].join("\n");

    let data: Record<string, unknown> | null = null;
    await acquireSlot();
    try {
      for (let attempt = 0; attempt < 2 && !data; attempt++) {
        const raw = await ollamaGenerate(prompt, { json: true, num_predict: 600 });
        data = extractJson(raw) as Record<string, unknown> | null;
        if (data && !Array.isArray(data.matches)) data = null;
      }
    } catch { data = null; } finally { releaseSlot(); }

    if (data) {
      matches = (data.matches as unknown[]).map((m) => {
        const o = (m || {}) as Record<string, unknown>;
        const conf = Math.round(Number(o.confidence));
        return {
          lessonId: String(o.lessonId ?? ""),
          reason: clip(o.reason, 200),
          confidence: Math.max(20, Math.min(100, (Number.isFinite(conf) ? Math.max(1, Math.min(5, conf)) : 3) * 20)),
        };
      });
      emit("match", "done", "Mise en correspondance");
    } else {
      fallback = true;
      emit("match", "done", "Mise en correspondance", "Génération échouée — similarité seule");
    }
  } else {
    emit("match", "done", "Mise en correspondance", "Copilot hors ligne — similarité seule");
  }

  if (!matches) {
    matches = candidates.slice(0, 4).map((c) => ({
      lessonId: c.lessonId,
      reason: "Contenu proche de l'énoncé (similarité).",
      confidence: Math.max(0, Math.min(100, Math.round(c.score * 100))),
    }));
  }

  // 5 ── verify (deterministic: whitelist against candidates, dedupe) ───────
  emit("verify", "running", "Vérification des suggestions…");
  const byLesson = new Map(candidates.map((c) => [c.lessonId, c]));
  const linkedLessons = new Set(ex.links.map((l) => l.lessonId).filter(Boolean) as string[]);
  const linkedModules = new Set(ex.links.map((l) => l.moduleId).filter(Boolean) as string[]);
  const seen = new Set<string>();
  const suggestions: ExerciseAdvice["suggestions"] = [];
  for (const m of matches) {
    const c = byLesson.get(m.lessonId);
    if (!c || seen.has(m.lessonId)) continue; // the LLM cannot invent targets
    seen.add(m.lessonId);
    suggestions.push({
      lessonId: c.lessonId,
      moduleId: c.moduleId,
      lessonTitle: c.lessonTitle,
      moduleTitle: c.moduleTitle,
      reason: m.reason,
      confidence: m.confidence,
      alreadyLinked: linkedLessons.has(c.lessonId) || linkedModules.has(c.moduleId),
    });
    if (suggestions.length >= 4) break;
  }
  suggestions.sort((a, b) => b.confidence - a.confidence);
  emit("verify", "done", "Vérification des suggestions", `${suggestions.length} suggestion(s) retenue(s)`);

  return { ...base, fallback, suggestions };
}

// ───────────────────────── Focused follow-up chat ─────────────────────────
// System context = ONLY this exercise + up to 4 lesson excerpts, re-fetched
// server-side (the client sends ids, never content).
export async function exerciseChatMessages(
  user: SessionUser,
  input: { ref: ExerciseRef; classId?: string; lessonIds: string[]; message: string; history?: { role: string; content: string }[] },
): Promise<ChatMessage[] | null> {
  const ex = await loadExerciseForAI(user, input.ref, input.classId);
  if (!ex) return null;

  const ids = [...new Set(input.lessonIds)].slice(0, 4);
  const lessons = ids.length
    ? await prisma.lesson.findMany({
        where: { id: { in: ids }, status: "PUBLISHED", module: { subjectSlug: ex.subjectSlug } },
        select: { title: true, contentMd: true, module: { select: { title: true } } },
      })
    : [];

  let budget = CHAT_BUDGET;
  const excerpts = lessons
    .map((l) => {
      const body = l.contentMd.slice(0, Math.max(0, Math.min(LESSON_EXCERPT, budget)));
      budget -= body.length;
      return `## Leçon « ${l.title} » (${l.module?.title ?? ""})\n${body}${l.contentMd.length > body.length ? "…" : ""}`;
    })
    .filter((s) => s.length > 40);

  const system = [
    `Tu es le « Conseiller d'exercices » — assistant pédagogique d'un enseignant de ${ex.subjectName}${ex.classLevel ? ` en ${ex.classLevel}` : ""} en RDC.`,
    `Exercice analysé : « ${ex.title} »`,
    `Énoncé :\n${ex.statement}`,
    ...(ex.solution ? [`Corrigé :\n${ex.solution}`] : []),
    ...(excerpts.length ? [`Extraits des leçons liées ou suggérées :\n${excerpts.join("\n\n")}`] : []),
    "Réponds en français simple et concret, ancré UNIQUEMENT dans ce contexte (l'exercice et ces leçons). Si la question sort de ce cadre, dis-le et ramène la discussion à l'exercice.",
  ].join("\n\n");

  const msgs: ChatMessage[] = [{ role: "system", content: system }];
  for (const h of (input.history || []).slice(-HISTORY_TURNS)) {
    msgs.push({ role: h.role === "assistant" ? "assistant" : "user", content: String(h.content || "").slice(0, 2000) });
  }
  msgs.push({ role: "user", content: input.message });
  return msgs;
}
