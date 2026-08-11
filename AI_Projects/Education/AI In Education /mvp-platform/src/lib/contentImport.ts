import { prisma } from "./db";
import { ollamaOnline, ollamaGenerate, extractJson, acquireSlot, releaseSlot } from "./ollama";
import type { SessionUser } from "./session";

// Admin book-chapter import: md/txt/pdf → DRAFT lessons in a module, with the
// same splitting/polish strategy as scripts/refine-content.mjs (ported to TS):
//   • clean markdown with ≥2 "## " sections → one lesson per section (polish)
//   • otherwise → Ollama extracts a lesson plan from the raw text, then writes
//     a clean lesson per topic (grounded, never inventing data)
// Fully usable without Ollama: raw sections land as-is, flagged "sans IA".

export type ImportEmit = (id: string, status: "running" | "done" | "error", label: string, detail?: string) => void;

const MAX_TEXT_BYTES = 5 * 1024 * 1024; // 5 MB text
const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB pdf
const MAX_LESSONS = 8;

export interface ImportInput {
  subjectSlug: string;
  moduleId?: string;
  newModule?: { title: string; classLevel: string };
  kind: "md" | "txt" | "pdf";
  filename: string;
  dataB64: string;
}

function slugify(s: string): string {
  return (
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "lecon"
  );
}

// ── splitting heuristics (ported from refine-content.mjs) ────────────────────

function getSections(body: string): { title: string; text: string }[] {
  const parts = body.split(/\n(?=##\s+)/);
  const out: { title: string; text: string }[] = [];
  for (const p of parts) {
    const h = p.match(/^##\s+(.*)/);
    if (!h) continue;
    const title = h[1].trim();
    if (/^(plan du module|contenu|objectifs)$/i.test(title)) continue;
    const text = p.replace(/^##\s+.*\n/, "").trim();
    if (text.length < 40) continue;
    out.push({ title, text });
  }
  return out.slice(0, MAX_LESSONS);
}

function polishPrompt(subject: string, moduleTitle: string, sectionTitle: string, sectionText: string): string {
  return [
    `Voici une section de manuel de ${subject} (chapitre « ${moduleTitle} », section « ${sectionTitle} ») déjà transcrite.`,
    `Améliore UNIQUEMENT la mise en forme Markdown et corrige les coquilles évidentes.`,
    `Conserve absolument toutes les formules LaTeX ($...$ et $$...$$). N'invente rien, ne supprime aucun contenu.`,
    `Convertis tout art ASCII mathématique en LaTeX. N'utilise JAMAIS de blocs de code (\`\`\`).`,
    `Commence par "## Objectifs" (3 puces déduites de la section), puis restitue la section nettoyée.`,
    ``,
    `Section :`,
    `"""`,
    sectionText.slice(0, 6000),
    `"""`,
  ].join("\n");
}

function planPrompt(subject: string, classLevel: string, moduleTitle: string, rawText: string): string {
  return [
    `Voici le texte brut (peut contenir des erreurs de numérisation) d'un chapitre de manuel de ${subject} pour la classe de ${classLevel} en RDC, intitulé « ${moduleTitle} ».`,
    `Identifie les 3 à ${MAX_LESSONS} leçons que ce chapitre devrait contenir.`,
    `Réponds en JSON STRICT : {"lessons":["Titre leçon 1","Titre leçon 2",…]}`,
    ``,
    `Texte :`,
    `"""`,
    rawText.slice(0, 6000),
    `"""`,
  ].join("\n");
}

function generatePrompt(subject: string, classLevel: string, moduleTitle: string, topic: string, rawText: string): string {
  return [
    `Tu es un professeur de ${subject} pour la classe de ${classLevel} en République Démocratique du Congo.`,
    `Rédige une leçon claire et bien structurée, en français, sur « ${topic} » (chapitre « ${moduleTitle} »).`,
    `Appuie-toi sur cet extrait du manuel (source de vérité, ignore les erreurs de numérisation) :`,
    `"""${rawText.slice(0, 4000)}"""`,
    ``,
    `Format Markdown. Structure : "## Objectifs" (3 puces), "## Introduction", "## Notions clés" (formules LaTeX entre $...$ si utile), "## Exemple résolu", "## À retenir".`,
    `Règles : n'invente pas de fausses données ; 250 à 450 mots ; jamais de blocs de code ; commence directement par "## Objectifs".`,
  ].join("\n");
}

// ── extraction ────────────────────────────────────────────────────────────────

async function extractText(kind: "md" | "txt" | "pdf", dataB64: string): Promise<{ text: string } | { error: string }> {
  const buf = Buffer.from(dataB64, "base64");
  if (kind === "pdf") {
    if (buf.length > MAX_PDF_BYTES) return { error: "FILE_TOO_LARGE" };
    // Import the inner module: the package root reads a test PDF at load time.
    const { default: pdfParse } = await import("pdf-parse/lib/pdf-parse.js");
    const parsed = await pdfParse(buf);
    return { text: (parsed.text || "").trim() };
  }
  if (buf.length > MAX_TEXT_BYTES) return { error: "FILE_TOO_LARGE" };
  return { text: buf.toString("utf8").trim() };
}

// ── the job ───────────────────────────────────────────────────────────────────

export async function runImportJob(user: SessionUser, input: ImportInput, emit: ImportEmit) {
  const subject = await prisma.subject.findUnique({ where: { slug: input.subjectSlug } });
  if (!subject) return { error: "NOT_FOUND" as const };

  // 1) extract
  emit("extract", "running", `Lecture de ${input.filename}…`);
  let text: string;
  try {
    const ext = await extractText(input.kind, input.dataB64);
    if ("error" in ext) { emit("extract", "error", "Fichier trop volumineux"); return { error: ext.error }; }
    text = ext.text;
  } catch {
    emit("extract", "error", "Lecture du fichier impossible");
    return { error: "EXTRACT_FAILED" as const };
  }
  if (text.length < 80) { emit("extract", "error", "Fichier vide ou illisible"); return { error: "EMPTY_FILE" as const }; }
  emit("extract", "done", `Lecture de ${input.filename}`, `${Math.round(text.length / 1000)} k caractères`);

  // 2) resolve target module (existing or new)
  let moduleId = input.moduleId ?? null;
  let moduleTitle: string;
  let classLevel: string;
  if (moduleId) {
    const m = await prisma.module.findFirst({ where: { id: moduleId, subjectSlug: input.subjectSlug } });
    if (!m) return { error: "NOT_FOUND" as const };
    moduleTitle = m.title;
    classLevel = m.classLevel ?? "5e"; // shared-level module: default imported content to 5e
  } else {
    const nm = input.newModule;
    if (!nm?.title?.trim()) return { error: "TITLE_REQUIRED" as const };
    classLevel = ["5e", "6e", "examen"].includes(nm.classLevel) ? nm.classLevel : "5e";
    const last = await prisma.module.aggregate({ where: { subjectSlug: input.subjectSlug, classLevel }, _max: { order: true } });
    const m = await prisma.module.create({
      data: { subjectSlug: input.subjectSlug, classLevel, title: nm.title.trim().slice(0, 90), order: (last._max.order ?? 0) + 1 },
    });
    moduleId = m.id;
    moduleTitle = m.title;
  }

  // 3) split
  emit("split", "running", "Découpage en leçons…");
  const online = await ollamaOnline();
  let plan: { title: string; text: string; generate: boolean }[];
  const sections = getSections(text);
  if (sections.length >= 2) {
    plan = sections.map((s) => ({ ...s, generate: false }));
    emit("split", "done", "Découpage en leçons", `${plan.length} sections « ## » détectées`);
  } else if (online) {
    let topics: string[] = [];
    await acquireSlot();
    try {
      const raw = await ollamaGenerate(planPrompt(subject.name, classLevel, moduleTitle, text), { json: true, num_predict: 400 });
      const data = extractJson(raw) as { lessons?: unknown[] } | null;
      topics = (Array.isArray(data?.lessons) ? data!.lessons! : []).map((t) => String(t).trim()).filter(Boolean).slice(0, MAX_LESSONS);
    } catch { /* fall through */ } finally { releaseSlot(); }
    if (topics.length === 0) topics = [moduleTitle];
    plan = topics.map((t) => ({ title: t, text, generate: true }));
    emit("split", "done", "Découpage en leçons", `${plan.length} leçon(s) proposée(s) par l'IA`);
  } else {
    plan = [{ title: moduleTitle, text, generate: false }];
    emit("split", "done", "Découpage en leçons", "1 leçon brute — Copilot hors ligne");
  }

  // 4) create DRAFT lessons (polished by Ollama when available)
  const created: { id: string; title: string; status: string; degraded: boolean }[] = [];
  const orderBase = (await prisma.lesson.aggregate({ where: { moduleId }, _max: { order: true } }))._max.order ?? 0;

  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    const stepId = `lesson-${i + 1}`;
    emit(stepId, "running", `Leçon ${i + 1} : ${p.title.slice(0, 40)}…`);

    let contentMd = "";
    let degraded = true;
    if (online) {
      await acquireSlot();
      try {
        const prompt = p.generate
          ? generatePrompt(subject.name, classLevel, moduleTitle, p.title, p.text)
          : polishPrompt(subject.name, moduleTitle, p.title, p.text);
        const out = await ollamaGenerate(prompt, { num_predict: 1600 });
        if (out && out.trim().length > 100) { contentMd = out.trim(); degraded = false; }
      } catch { /* degraded below */ } finally { releaseSlot(); }
    }
    if (!contentMd) {
      // No AI: keep the raw section so no content is ever lost.
      contentMd = p.generate ? `## ${p.title}\n\n${p.text.slice(0, 8000)}` : p.text.slice(0, 8000);
    }

    const lesson = await prisma.lesson.create({
      data: {
        moduleId,
        slug: `${slugify(p.title)}-${Date.now().toString(36)}${i}`,
        title: p.title.slice(0, 120),
        order: orderBase + i + 1,
        status: "DRAFT",
        contentMd,
        estMinutes: 15,
        authorId: null, // book content
        sourceRef: `import:${input.filename}`,
        subjectSlug: input.subjectSlug,
      },
    });
    created.push({ id: lesson.id, title: lesson.title, status: lesson.status, degraded });
    emit(stepId, "done", `Leçon ${i + 1} : ${p.title.slice(0, 40)}`, degraded ? "sans IA (texte brut)" : "rédigée par l'IA");
  }

  await prisma.auditLog.create({
    data: {
      actorId: user.userId,
      actorName: `${user.firstName} ${user.lastName}`,
      action: "CONTENT_IMPORT",
      targetType: "module",
      targetId: moduleId,
      metaJson: JSON.stringify({ filename: input.filename, lessons: created.length, subjectSlug: input.subjectSlug }),
    },
  });

  return { moduleId, moduleTitle, lessons: created };
}
