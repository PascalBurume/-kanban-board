import { prisma } from "./db";
import type { SessionUser } from "./session";
import { editableSubjectSlugs } from "./studio";
import { getTeacherSubmission } from "./projects";
import {
  ollamaGenerate,
  extractJson,
  repairLatex,
  streamChat,
  projectAuthorSystemPrompt,
  gradingAssistSystemPrompt,
  assignAdvisorSystemPrompt,
  type ProjectAuthorCtx,
  type ChatMessage,
} from "./ollama";

// Teacher "Copilot APS": gathers the lessons of the selected prerequisite
// modules and assembles APS-grounded generations (compose / grade / assign).

const LESSON_EXCERPT = 500; // per-lesson contentMd cap (enough to ground, keeps prompt small)
const MODULES_BUDGET = 4500; // combined module-context cap
const QUIZ_PER_LESSON = 2;

export type ModuleContext = {
  modules: { title: string; lessons: { title: string; excerpt: string; quizPrompts: string[] }[] }[];
  truncated: boolean;
};

// Load selected modules' published lessons (title + excerpt + a few quiz prompts),
// authorized against the teacher's editable subjects. Out-of-scope IDs are dropped.
export async function getModulesContentForAI(user: SessionUser, moduleIds: string[]): Promise<ModuleContext> {
  const ids = [...new Set((moduleIds || []).filter(Boolean))];
  if (ids.length === 0) return { modules: [], truncated: false };
  const slugs = await editableSubjectSlugs(user);
  if (slugs.length === 0) return { modules: [], truncated: false };

  const mods = await prisma.module.findMany({
    where: { id: { in: ids }, subjectSlug: { in: slugs } },
    orderBy: { order: "asc" },
    include: {
      lessons: {
        where: { status: "PUBLISHED" },
        orderBy: { order: "asc" },
        select: { title: true, contentMd: true, quizzes: { select: { questions: { select: { promptMd: true } } } } },
      },
    },
  });

  let used = 0;
  let truncated = false;
  const modules = mods.map((m) => {
    const lessons = m.lessons.map((l) => {
      let excerpt = (l.contentMd || "").trim();
      if (excerpt.length > LESSON_EXCERPT) {
        excerpt = excerpt.slice(0, LESSON_EXCERPT) + "…";
      }
      if (used + excerpt.length > MODULES_BUDGET) {
        excerpt = excerpt.slice(0, Math.max(0, MODULES_BUDGET - used));
        truncated = true;
      }
      used += excerpt.length;
      const quizPrompts = l.quizzes
        .flatMap((q) => q.questions.map((qq) => (qq.promptMd || "").trim()))
        .filter(Boolean)
        .slice(0, QUIZ_PER_LESSON);
      return { title: l.title, excerpt, quizPrompts };
    });
    return { title: m.title, lessons };
  });

  return { modules, truncated };
}

// Render the module context into the compact <<<LEÇONS …>>> text block.
export function renderModuleContext(ctx: ModuleContext): string {
  if (ctx.modules.length === 0) return "";
  const parts: string[] = [];
  for (const m of ctx.modules) {
    parts.push(`# Module : ${m.title}`);
    for (const l of m.lessons) {
      parts.push(`## Leçon : ${l.title}`);
      if (l.excerpt) parts.push(l.excerpt);
      if (l.quizPrompts.length) parts.push(`(questions de quiz : ${l.quizPrompts.join(" | ")})`);
    }
  }
  if (ctx.truncated) parts.push("…(contenu des modules tronqué)");
  return parts.join("\n");
}

async function authorBase(user: SessionUser, input: { subjectSlug: string; classLevel: string; difficulty: string; prereqModuleIds: string[] }): Promise<string> {
  const mc = await getModulesContentForAI(user, input.prereqModuleIds);
  const ctx: ProjectAuthorCtx = {
    subject: input.subjectSlug,
    classLevel: input.classLevel,
    difficulty: input.difficulty,
    moduleContext: renderModuleContext(mc),
  };
  return projectAuthorSystemPrompt(ctx);
}

// ───────────────────────────── Compose (JSON) ────────────────────────────────

export type ComposeAction = "full" | "situation" | "steps" | "objectives" | "refine_step";

export interface ComposeInput {
  action: ComposeAction;
  subjectSlug: string;
  classLevel: string;
  difficulty: string;
  title?: string;
  prereqModuleIds: string[];
  draft?: { scenarioMd?: string; objectivesMd?: string; deliverableMd?: string; steps?: { title: string; instructionMd: string }[] };
  stepIndex?: number;
  stepDraft?: { title?: string; instructionMd?: string; hintMd?: string };
}

const STEP_SCHEMA = '{"title":"…","instructionMd":"…","hintMd":"…"}';

function composeTask(input: ComposeInput): { task: string; num_predict: number } {
  const scen = (input.draft?.scenarioMd || "").trim();
  const scenBlock = scen ? `\n\nSituation déjà rédigée par l'enseignant (appuie-toi dessus) :\n<<<\n${scen.slice(0, 1800)}\n>>>` : "";
  switch (input.action) {
    case "full":
      return {
        num_predict: 2200,
        task:
          `Génère un PROJET APPLIQUÉ complet et original, structuré selon l'APS, prêt à être réalisé par l'élève en plusieurs séances.${input.title ? ` Titre souhaité : « ${input.title} ».` : ""}\n` +
          "La situation doit être réelle, ancrée en RDC, avec des données chiffrées plausibles. 3 à 5 étapes cumulatives (collecter → organiser → calculer → interpréter → recommander), chacune avec une consigne claire et un indice qui guide sans donner la réponse. Le livrable est un rapport/recommandation.\n" +
          "Sois CONCIS pour tenir dans la réponse : scénario ~120 mots, chaque consigne 1 à 2 phrases, chaque indice 1 phrase.\n" +
          "Le scénario : 1 court paragraphe de contexte, puis une ligne « **Données :** … » avec les valeurs brutes. Les objectifs : puces « - » commençant par un verbe d'action. Mets les mots-clés en **gras**.\n" +
          `Réponds STRICTEMENT en JSON valide, sans texte autour :\n{"title":"…","scenarioMd":"… (1 paragraphe puis **Données :** …)","objectivesMd":"- … (3 à 4 compétences)","deliverableMd":"…","steps":[${STEP_SCHEMA}]}`,
      };
    case "situation":
      return {
        num_predict: 600,
        task:
          "Propose UNE situation réelle de la vie en RDC adaptée à cette matière et à ce niveau, avec des données chiffrées brutes que l'élève devra exploiter. La situation précède le savoir.\n" +
          "Structure : 1 court paragraphe de contexte, puis une ligne « **Données :** … » listant les valeurs. Mets les mots-clés en **gras**.\n" +
          'Réponds STRICTEMENT en JSON valide, sans texte autour :\n{"scenarioMd":"… (1 paragraphe puis **Données :** …)"}',
      };
    case "steps":
      return {
        num_predict: 1300,
        task:
          `Propose 3 à 5 étapes cumulatives pour traiter la situation, chacune avec un titre, une consigne et un indice (l'indice guide, ne résout pas). Sois CONCIS : consigne 1 à 2 phrases, indice 1 phrase.${scenBlock}\n` +
          `Réponds STRICTEMENT en JSON valide, sans texte autour :\n{"steps":[${STEP_SCHEMA}]}`,
      };
    case "objectives":
      return {
        num_predict: 350,
        task:
          `Propose 3 à 4 objectifs de compétence (puces commençant par un verbe d'action), mobilisant uniquement les notions des leçons fournies.${scenBlock}\n` +
          'Réponds STRICTEMENT en JSON valide, sans texte autour :\n{"objectivesMd":"- …\\n- …"}',
      };
    case "refine_step": {
      const sd = input.stepDraft || {};
      const cur = [`Titre : ${sd.title || "(vide)"}`, `Consigne : ${sd.instructionMd || "(vide)"}`, `Indice : ${sd.hintMd || "(vide)"}`].join("\n");
      return {
        num_predict: 450,
        task:
          `Améliore cette étape de projet : rends la consigne plus claire et plus motivante, et propose un indice qui guide sans révéler la réponse. Garde le cadre APS et les notions des leçons fournies.${scenBlock}\n\nÉtape actuelle :\n<<<\n${cur}\n>>>\n` +
          `Réponds STRICTEMENT en JSON valide, sans texte autour :\n{"step":${STEP_SCHEMA}}`,
      };
    }
  }
}

function clean(v: unknown): string {
  if (typeof v !== "string") return "";
  // Strip gemma's SentencePiece ▁ space-marker, then restore collapsed LaTeX.
  return repairLatex(v.replace(/▁/g, " ")).replace(/[ \t]{2,}/g, " ");
}

function cleanStep(s: unknown): { title: string; instructionMd: string; hintMd: string } | null {
  if (!s || typeof s !== "object") return null;
  const o = s as Record<string, unknown>;
  const title = clean(o.title).trim();
  if (!title) return null;
  return { title, instructionMd: clean(o.instructionMd), hintMd: clean(o.hintMd) };
}

export type ComposeResult =
  | { action: "full"; title: string; scenarioMd: string; objectivesMd: string; deliverableMd: string; steps: { title: string; instructionMd: string; hintMd: string }[] }
  | { action: "situation"; scenarioMd: string }
  | { action: "objectives"; objectivesMd: string }
  | { action: "steps"; steps: { title: string; instructionMd: string; hintMd: string }[] }
  | { action: "refine_step"; step: { title: string; instructionMd: string; hintMd: string } };

export async function composeProject(user: SessionUser, input: ComposeInput): Promise<ComposeResult | { error: string }> {
  const base = await authorBase(user, input);
  const { task, num_predict } = composeTask(input);
  const prompt = `${base}\n\n---\nTÂCHE :\n${task}`;
  // The local model occasionally returns truncated/invalid JSON — retry once.
  let data: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt < 2 && !data; attempt++) {
    const raw = await ollamaGenerate(prompt, { json: true, num_predict });
    data = extractJson(raw) as Record<string, unknown> | null;
  }
  if (!data) return { error: "GEN_FAILED" };

  switch (input.action) {
    case "full":
      return {
        action: "full",
        title: clean(data.title).trim(),
        scenarioMd: clean(data.scenarioMd),
        objectivesMd: clean(data.objectivesMd),
        deliverableMd: clean(data.deliverableMd),
        steps: (Array.isArray(data.steps) ? data.steps : []).map(cleanStep).filter(Boolean) as { title: string; instructionMd: string; hintMd: string }[],
      };
    case "situation":
      return { action: "situation", scenarioMd: clean(data.scenarioMd) };
    case "objectives":
      return { action: "objectives", objectivesMd: clean(data.objectivesMd) };
    case "steps":
      return { action: "steps", steps: (Array.isArray(data.steps) ? data.steps : []).map(cleanStep).filter(Boolean) as { title: string; instructionMd: string; hintMd: string }[] };
    case "refine_step": {
      const step = cleanStep(data.step);
      if (!step) return { error: "GEN_FAILED" };
      return { action: "refine_step", step };
    }
  }
}

// ───────────────────────────── Compose (chat) ────────────────────────────────

export async function composeChatMessages(
  user: SessionUser,
  input: { subjectSlug: string; classLevel: string; difficulty: string; prereqModuleIds: string[]; message: string; history?: { role: string; content: string }[] },
): Promise<ChatMessage[]> {
  const base = await authorBase(user, input);
  const system =
    base +
    "\n\n---\nTu discutes avec l'enseignant pour faire émerger des idées de projet APS. Sois concret et bref, propose des pistes ancrées dans des situations réelles de RDC et dans les leçons fournies. Tu peux suggérer une situation, des étapes ou des objectifs si on te le demande.";
  const msgs: ChatMessage[] = [{ role: "system", content: system }];
  for (const h of (input.history || []).slice(-6)) {
    msgs.push({ role: h.role === "assistant" ? "assistant" : "user", content: h.content });
  }
  msgs.push({ role: "user", content: input.message });
  return msgs;
}

export { streamChat };

// ───────────────────────────── Grade assist ──────────────────────────────────

export interface GradeResult {
  steps: { order: number; title: string; good: string; missing: string; misconception: string | null }[];
  gradeMin: number;
  gradeMax: number;
  draftFeedbackMd: string;
}

export async function gradingAssist(user: SessionUser, submissionId: string): Promise<GradeResult | { error: string }> {
  const sub = await getTeacherSubmission(user.userId, submissionId);
  if (!sub) return { error: "NOT_FOUND" };

  const prompt = gradingAssistSystemPrompt({
    projectTitle: sub.project.title,
    scenario: sub.project.scenarioMd,
    deliverable: sub.project.deliverableMd,
    steps: sub.steps.map((s) => ({ order: s.order, title: s.title, instruction: s.instructionMd, response: s.response })),
  });
  let data: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt < 2 && !data; attempt++) {
    const raw = await ollamaGenerate(prompt, { json: true, num_predict: 1500 });
    data = extractJson(raw) as Record<string, unknown> | null;
  }
  if (!data) return { error: "GEN_FAILED" };

  const steps = (Array.isArray(data.steps) ? data.steps : []).map((s, i) => {
    const o = (s || {}) as Record<string, unknown>;
    return {
      order: typeof o.order === "number" ? o.order : i + 1,
      title: clean(o.title) || `Étape ${i + 1}`,
      good: clean(o.good),
      missing: clean(o.missing),
      misconception: o.misconception && typeof o.misconception === "string" ? repairLatex(o.misconception) : null,
    };
  });
  const clamp = (n: unknown, d: number) => {
    const v = Math.round(Number(n));
    return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : d;
  };
  let gradeMin = clamp(data.gradeMin, 0);
  let gradeMax = clamp(data.gradeMax, 100);
  if (gradeMin > gradeMax) [gradeMin, gradeMax] = [gradeMax, gradeMin];
  return { steps, gradeMin, gradeMax, draftFeedbackMd: clean(data.draftFeedbackMd) };
}

// ───────────────────────────── Assign advice ─────────────────────────────────

export interface AssignAdvice {
  readiness: "READY" | "PARTIAL" | "NOT_READY";
  readinessNote: string;
  suggestedDueDate: string;
  rationale: string;
}

// Class readiness for a project: average progress + % of students who finished
// ALL the prerequisite modules' published lessons.
async function classReadiness(classId: string, prereqModuleIds: string[]): Promise<{ avgProgress: number; prereqDonePct: number }> {
  const enr = await prisma.enrollment.findMany({ where: { classId }, select: { studentId: true } });
  const studentIds = enr.map((e) => e.studentId);
  if (studentIds.length === 0) return { avgProgress: 0, prereqDonePct: 0 };

  // Average overall progress across the class's subjects.
  const tas = await prisma.teacherAssignment.findMany({ where: { classId }, select: { subjectSlug: true } });
  const slugs = [...new Set(tas.map((t) => t.subjectSlug))];
  const totalLessons = slugs.length
    ? await prisma.lesson.count({ where: { status: "PUBLISHED", module: { subjectSlug: { in: slugs } } } })
    : 0;

  const prereqLessons = prereqModuleIds.length
    ? await prisma.lesson.findMany({ where: { status: "PUBLISHED", moduleId: { in: prereqModuleIds } }, select: { id: true } })
    : [];
  const prereqIds = new Set(prereqLessons.map((l) => l.id));

  const done = await prisma.progress.findMany({
    where: { studentId: { in: studentIds }, status: "COMPLETED" },
    select: { studentId: true, lessonId: true },
  });
  const byStudent = new Map<string, Set<string>>();
  for (const d of done) {
    if (!byStudent.has(d.studentId)) byStudent.set(d.studentId, new Set());
    byStudent.get(d.studentId)!.add(d.lessonId);
  }

  let progressSum = 0;
  let prereqDoneCount = 0;
  for (const sid of studentIds) {
    const set = byStudent.get(sid) || new Set();
    progressSum += totalLessons ? set.size / totalLessons : 0;
    if (prereqIds.size > 0 && [...prereqIds].every((id) => set.has(id))) prereqDoneCount++;
  }
  return {
    avgProgress: Math.round((progressSum / studentIds.length) * 100),
    prereqDonePct: prereqIds.size === 0 ? 100 : Math.round((prereqDoneCount / studentIds.length) * 100),
  };
}

export async function assignAdvice(user: SessionUser, projectId: string, classId: string, today: string): Promise<AssignAdvice | { error: string }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { prereqs: { include: { module: { select: { title: true } } } } },
  });
  if (!project) return { error: "NOT_FOUND" };
  // Teacher must teach this class+subject.
  const owns = await prisma.teacherAssignment.findFirst({ where: { teacherId: user.userId, classId, subjectSlug: project.subjectSlug } });
  if (!owns) return { error: "FORBIDDEN" };
  const cls = await prisma.classGroup.findUnique({ where: { id: classId }, select: { name: true, level: true } });
  if (!cls) return { error: "NOT_FOUND" };

  const prereqModuleIds = project.prereqs.map((p) => p.moduleId);
  const { avgProgress, prereqDonePct } = await classReadiness(classId, prereqModuleIds);

  const prompt = assignAdvisorSystemPrompt({
    projectTitle: project.title,
    difficulty: project.difficulty,
    estMinutes: project.estMinutes,
    classLevel: cls.level,
    className: cls.name,
    prereqTitles: project.prereqs.map((p) => p.module.title),
    avgProgress,
    prereqDonePct,
    today,
  });
  const raw = await ollamaGenerate(prompt, { json: true, num_predict: 300 });
  const data = extractJson(raw) as Record<string, unknown> | null;
  if (!data) return { error: "GEN_FAILED" };

  const readiness = ["READY", "PARTIAL", "NOT_READY"].includes(String(data.readiness)) ? (data.readiness as AssignAdvice["readiness"]) : "PARTIAL";
  const due = typeof data.suggestedDueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.suggestedDueDate) ? data.suggestedDueDate : "";
  return {
    readiness,
    readinessNote: clean(data.readinessNote),
    suggestedDueDate: due,
    rationale: clean(data.rationale),
  };
}
