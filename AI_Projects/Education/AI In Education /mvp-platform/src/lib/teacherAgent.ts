import { prisma } from "./db";
import { classDetail, type StudentMetrics } from "./teacher";
import { ollamaOnline, ollamaGenerate, extractJson, acquireSlot, releaseSlot } from "./ollama";
import { gradingAssist, type GradeResult } from "./projectCopilot";
import type { SessionUser } from "./session";

// Agentic teacher assistant: each agent chains deterministic Prisma
// data-gathering steps with 1-2 focused LLM calls, streaming per-step progress
// so the UI can show visible "thinking". Every agent has a deterministic
// fallback when Ollama is offline (flagged `fallback: true`).

export type StepEmit = (id: string, status: "running" | "done" | "error", label: string, detail?: string) => void;

// ───────────────────────── Group composer ─────────────────────────

export interface GroupPlan {
  fallback: boolean;
  groups: { name: string; students: { id: string; firstName: string; lastName: string }[]; rationale: string }[];
}

// Deterministic fallback: serpentine deal by progress so each group mixes
// strong and struggling students.
function snakeDraft(students: StudentMetrics[], size: number): GroupPlan["groups"] {
  const sorted = [...students].sort((a, b) => b.progressPct - a.progressPct);
  const n = Math.max(1, Math.ceil(sorted.length / size));
  const groups: StudentMetrics[][] = Array.from({ length: n }, () => []);
  sorted.forEach((s, i) => {
    const round = Math.floor(i / n);
    const idx = round % 2 === 0 ? i % n : n - 1 - (i % n);
    groups[idx].push(s);
  });
  return groups.map((members, i) => ({
    name: `Groupe ${String.fromCharCode(65 + i)}`,
    students: members.map((m) => ({ id: m.id, firstName: m.firstName, lastName: m.lastName })),
    rationale: "Répartition équilibrée par progression (heuristique).",
  }));
}

export async function runGroupComposer(
  user: SessionUser,
  input: { classId: string; projectId?: string; groupSize: number },
  emit: StepEmit,
): Promise<GroupPlan | { error: string }> {
  const size = Math.max(2, Math.min(6, Math.round(input.groupSize) || 3));

  emit("roster", "running", "Analyse des élèves…");
  const detail = await classDetail(user.userId, input.classId);
  if (!detail) { emit("roster", "error", "Classe introuvable"); return { error: "NOT_FOUND" }; }
  const students = detail.students;
  if (students.length < 2) { emit("roster", "error", "Pas assez d'élèves"); return { error: "TOO_FEW" }; }
  const struggling = students.filter((s) => s.status !== "ok").length;
  emit("roster", "done", `Analyse des ${students.length} élèves`, `${struggling} en difficulté`);

  // Prerequisite completion for the target project (deterministic).
  let prereqLine = "";
  const prereqDone = new Map<string, string>();
  if (input.projectId) {
    emit("prereqs", "running", "Vérification des prérequis du projet…");
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
      include: { prereqs: { include: { module: { include: { lessons: { where: { status: "PUBLISHED" }, select: { id: true } } } } } } },
    });
    if (project && project.prereqs.length) {
      const lessonSets = project.prereqs.map((pr) => pr.module.lessons.map((l) => l.id));
      const allIds = lessonSets.flat();
      const doneRows = await prisma.progress.findMany({
        where: { studentId: { in: students.map((s) => s.id) }, lessonId: { in: allIds }, status: "COMPLETED" },
        select: { studentId: true, lessonId: true },
      });
      const doneByStudent = new Map<string, Set<string>>();
      for (const r of doneRows) {
        if (!doneByStudent.has(r.studentId)) doneByStudent.set(r.studentId, new Set());
        doneByStudent.get(r.studentId)!.add(r.lessonId);
      }
      for (const s of students) {
        const done = doneByStudent.get(s.id) ?? new Set();
        const missing = lessonSets.filter((set) => set.length && !set.every((id) => done.has(id))).length;
        prereqDone.set(s.id, missing === 0 ? "prérequis OK" : `${missing} module(s) manquant(s)`);
      }
      prereqLine = " | prérequis";
      emit("prereqs", "done", "Prérequis vérifiés", `${[...prereqDone.values()].filter((v) => v === "prérequis OK").length}/${students.length} prêts`);
    } else {
      emit("prereqs", "done", "Aucun prérequis pour ce projet");
    }
  }

  emit("compose", "running", "Composition des groupes…");
  if (!(await ollamaOnline())) {
    emit("compose", "done", "Composition des groupes", "Copilot hors ligne — heuristique");
    return { fallback: true, groups: snakeDraft(students, size) };
  }

  const roster = students
    .map((s) => `${s.id} | ${s.firstName} ${s.lastName[0]}. | progression ${s.progressPct}% | quiz ${s.avgQuiz ?? "—"}%${prereqLine ? ` | ${prereqDone.get(s.id) ?? ""}` : ""}`)
    .join("\n");
  const nGroups = Math.ceil(students.length / size);
  const prompt = [
    "Tu es l'assistant pédagogique d'un enseignant en RDC. Compose des groupes de travail équilibrés pour un projet appliqué.",
    "Règles : mélange élèves forts et en difficulté dans chaque groupe ; chaque élève apparaît EXACTEMENT une fois ; utilise les id fournis.",
    `Élèves (${students.length}) :`,
    roster,
    `Forme ${nGroups} groupes de ~${size} élèves.`,
    `Réponds UNIQUEMENT en JSON : {"groups":[{"name":"Groupe A","students":["id1","id2"],"rationale":"1 phrase en français"}]}`,
  ].join("\n");

  let data: Record<string, unknown> | null = null;
  await acquireSlot();
  try {
    for (let attempt = 0; attempt < 2 && !data; attempt++) {
      const raw = await ollamaGenerate(prompt, { json: true, num_predict: 900 });
      data = extractJson(raw) as Record<string, unknown> | null;
      if (data && !Array.isArray(data.groups)) data = null;
    }
  } catch {
    data = null;
  } finally {
    releaseSlot();
  }
  if (!data) {
    emit("compose", "done", "Composition des groupes", "Génération échouée — heuristique");
    return { fallback: true, groups: snakeDraft(students, size) };
  }
  emit("compose", "done", "Composition des groupes");

  // Verify: every student exactly once; repair drift deterministically.
  emit("verify", "running", "Vérification de la répartition…");
  const byId = new Map(students.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const groups: GroupPlan["groups"] = [];
  for (const [i, g] of (data.groups as unknown[]).entries()) {
    const o = (g || {}) as Record<string, unknown>;
    const ids = (Array.isArray(o.students) ? o.students : [])
      .map((x) => String(x))
      .filter((id) => byId.has(id) && !seen.has(id));
    ids.forEach((id) => seen.add(id));
    if (!ids.length) continue;
    groups.push({
      name: typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 40) : `Groupe ${String.fromCharCode(65 + i)}`,
      students: ids.map((id) => ({ id, firstName: byId.get(id)!.firstName, lastName: byId.get(id)!.lastName })),
      rationale: typeof o.rationale === "string" ? o.rationale.slice(0, 200) : "",
    });
  }
  // Missing students → append to the smallest groups.
  const missing = students.filter((s) => !seen.has(s.id));
  for (const s of missing) {
    if (!groups.length) groups.push({ name: "Groupe A", students: [], rationale: "" });
    groups.sort((a, b) => a.students.length - b.students.length);
    groups[0].students.push({ id: s.id, firstName: s.firstName, lastName: s.lastName });
  }
  emit("verify", "done", "Répartition vérifiée", missing.length ? `${missing.length} élève(s) réaffecté(s)` : "chaque élève placé une fois");

  return { fallback: false, groups };
}

// ───────────────────────── Grading agent ─────────────────────────

export async function runGradingAgent(
  user: SessionUser,
  input: { submissionId: string },
  emit: StepEmit,
): Promise<(GradeResult & { fallback: boolean }) | { error: string }> {
  emit("load", "running", "Lecture du rendu…");
  const sub = await prisma.projectSubmission.findUnique({
    where: { id: input.submissionId },
    select: { answers: { select: { done: true } }, project: { select: { steps: { select: { id: true } } } } },
  });
  if (!sub) { emit("load", "error", "Rendu introuvable"); return { error: "NOT_FOUND" }; }
  emit("load", "done", "Lecture du rendu", `${sub.answers.filter((a) => a.done).length}/${sub.project.steps.length} étapes terminées`);

  emit("analyse", "running", "Analyse des réponses étape par étape…");
  if (!(await ollamaOnline())) {
    emit("analyse", "error", "Copilot hors ligne");
    return { error: "OLLAMA_OFFLINE" };
  }
  await acquireSlot();
  let res: GradeResult | { error: string };
  try {
    res = await gradingAssist(user, input.submissionId);
  } finally {
    releaseSlot();
  }
  if ("error" in res) { emit("analyse", "error", "Analyse impossible"); return res; }
  emit("analyse", "done", "Analyse des réponses", `note suggérée ${res.gradeMin}–${res.gradeMax}/100`);

  emit("feedback", "running", "Rédaction du retour à l'élève…");
  emit("feedback", "done", "Retour rédigé");
  return { ...res, fallback: false };
}

// ───────────────────────── At-risk detector ─────────────────────────

export interface AtRiskReport {
  fallback: boolean;
  students: { id: string; name: string; risk: "HIGH" | "MEDIUM"; reasons: string[]; action: string }[];
}

// Deterministic risk signals from the metrics the platform already tracks.
function riskSignals(students: StudentMetrics[], feedbackCounts: Map<string, number>) {
  return students
    .map((s) => {
      const reasons: string[] = [];
      if (s.lastActiveDays === null) reasons.push("jamais actif");
      else if (s.lastActiveDays > 7) reasons.push(`inactif depuis ${s.lastActiveDays} j`);
      if (s.progressPct < 30) reasons.push(`progression faible (${s.progressPct}%)`);
      if (s.avgQuiz !== null && s.avgQuiz < 55) reasons.push(`quiz moyens (${s.avgQuiz}%)`);
      const fb = feedbackCounts.get(s.id) ?? 0;
      if (fb > 0) reasons.push(`${fb} signal(aux) d'incompréhension non résolus`);
      const risk: "HIGH" | "MEDIUM" = reasons.length >= 2 ? "HIGH" : "MEDIUM";
      return { s, reasons, risk };
    })
    .filter((x) => x.reasons.length > 0)
    .sort((a, b) => b.reasons.length - a.reasons.length);
}

export async function runAtRiskAgent(
  user: SessionUser,
  input: { classId: string },
  emit: StepEmit,
): Promise<AtRiskReport | { error: string }> {
  emit("metrics", "running", "Collecte des métriques de la classe…");
  const detail = await classDetail(user.userId, input.classId);
  if (!detail) { emit("metrics", "error", "Classe introuvable"); return { error: "NOT_FOUND" }; }
  emit("metrics", "done", `Métriques de ${detail.students.length} élèves collectées`);

  emit("signals", "running", "Détection des signaux de risque…");
  const feedbacks = await prisma.lessonFeedback.groupBy({
    by: ["studentId"],
    where: { studentId: { in: detail.students.map((s) => s.id) }, resolved: false, understanding: { lt: 75 } },
    _count: { id: true },
  });
  const fbCounts = new Map(feedbacks.map((f) => [f.studentId, f._count.id]));
  const signals = riskSignals(detail.students, fbCounts).slice(0, 8);
  emit("signals", "done", "Signaux détectés", `${signals.length} élève(s) à surveiller`);

  const fallbackReport = (): AtRiskReport => ({
    fallback: true,
    students: signals.map((x) => ({
      id: x.s.id,
      name: `${x.s.firstName} ${x.s.lastName}`,
      risk: x.risk,
      reasons: x.reasons,
      action: x.risk === "HIGH" ? "Voir l'élève en priorité cette semaine." : "Suivre l'évolution cette semaine.",
    })),
  });

  if (signals.length === 0) return { fallback: false, students: [] };

  emit("synthese", "running", "Synthèse et recommandations…");
  if (!(await ollamaOnline())) {
    emit("synthese", "done", "Synthèse", "Copilot hors ligne — signaux bruts");
    return fallbackReport();
  }

  const lines = signals.map((x) => `${x.s.id} | ${x.s.firstName} ${x.s.lastName} | ${x.reasons.join(" ; ")}`).join("\n");
  const prompt = [
    "Tu es l'assistant pédagogique d'un enseignant en RDC. Voici les élèves à risque détectés (signaux factuels) :",
    lines,
    'Pour CHAQUE élève listé, propose UNE action concrète (1 phrase, français simple). Réponds UNIQUEMENT en JSON :',
    '{"students":[{"id":"…","risk":"HIGH|MEDIUM","action":"…"}]}',
  ].join("\n");

  let data: Record<string, unknown> | null = null;
  await acquireSlot();
  try {
    const raw = await ollamaGenerate(prompt, { json: true, num_predict: 700 });
    data = extractJson(raw) as Record<string, unknown> | null;
  } catch {
    data = null;
  } finally {
    releaseSlot();
  }
  if (!data || !Array.isArray(data.students)) {
    emit("synthese", "done", "Synthèse", "Génération échouée — signaux bruts");
    return fallbackReport();
  }
  emit("synthese", "done", "Synthèse et recommandations");

  const actionById = new Map<string, { risk?: string; action?: string }>();
  for (const s of data.students as unknown[]) {
    const o = (s || {}) as Record<string, unknown>;
    if (typeof o.id === "string") actionById.set(o.id, { risk: String(o.risk || ""), action: typeof o.action === "string" ? o.action : "" });
  }
  return {
    fallback: false,
    students: signals.map((x) => {
      const llm = actionById.get(x.s.id);
      return {
        id: x.s.id,
        name: `${x.s.firstName} ${x.s.lastName}`,
        risk: llm?.risk === "HIGH" || llm?.risk === "MEDIUM" ? (llm.risk as "HIGH" | "MEDIUM") : x.risk,
        reasons: x.reasons,
        action: llm?.action?.slice(0, 240) || "Suivre l'évolution cette semaine.",
      };
    }),
  };
}
