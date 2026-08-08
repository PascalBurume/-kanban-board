// Seed: subjects/modules/lessons from the content bundle (manifest.json),
// plus 1 admin, 2 teachers, 3 classes, 12 students (bcrypt PINs), assignments,
// settings and badges. Idempotent: wipes domain tables then re-creates.
//
// ⚠️  DESTRUCTIVE — NEVER RUN ON A LIVE SCHOOL SERVER AFTER GO-LIVE.
// `db:seed` / `db:reset` DELETE EVERYTHING, including books/subjects/lessons
// the administrator created in the « Contenu » tab, teacher compléments,
// project groups, student work and the RAG index. Admin-portal content lives
// ONLY in the database — it is not in the bundle and will NOT come back.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();
const PUBLIC = path.join(process.cwd(), "public");

// Deterministic avatar colour (mirrors src/lib/icons.js avatarColor).
const AV = ["#4f46e5", "#0d9488", "#ea580c", "#16a34a", "#7c3aed", "#2563eb", "#db2777", "#d97706", "#0891b2", "#65a30d"];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AV[Math.abs(h) % AV.length];
}

type SubjStyle = { icon: string; color: string };
function subjectStyle(label: string, id: string): SubjStyle {
  const s = (label + " " + id).toLowerCase();
  if (/(math|alg|géom|geom)/.test(s)) return { icon: "math", color: "#2563eb" };
  if (/(chim)/.test(s)) return { icon: "chimie", color: "#0d9488" };
  if (/(phys|électr|electr)/.test(s)) return { icon: "physique", color: "#ea580c" };
  if (/(bio|svt|vie|terre|nature)/.test(s)) return { icon: "svt", color: "#16a34a" };
  if (/(info|tech|sptic|numer)/.test(s)) return { icon: "sptic", color: "#7c3aed" };
  return { icon: "book", color: "#4f46e5" };
}

function levelFromClassId(id: string): string {
  if (id.startsWith("5")) return "5e";
  if (id.startsWith("6")) return "6e";
  return "examen";
}

// Academic discipline of a book — finer than icon (géométrie shares the "math"
// icon). Drives grouping/labels; NOT a content key.
function familyFromSlug(slug: string): string {
  if (/geom/.test(slug)) return "geometrie";
  if (/exetat|sciences-1/.test(slug)) return "exetat";
  if (/math/.test(slug)) return "math";
  if (/chim/.test(slug)) return "chimie";
  if (/phys|electr/.test(slug)) return "physique";
  return "autre";
}

function slugFromPath(p: string): string {
  return path.basename(p).replace(/\.md$/i, "");
}

// Mirrors slugify() in scripts/refine-content.mjs so we can locate a module's
// refined artifact by the same deterministic filename.
function slugify(s: string): string {
  return (
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "lecon"
  );
}

interface RefinedQuestion {
  type: string;
  promptMd: string;
  optionsJson?: string;
  answerJson: string;
  explanationMd?: string | null;
  order: number;
}
interface RefinedLesson {
  slug: string;
  title: string;
  order: number;
  estMinutes?: number;
  contentMd: string;
  quiz?: { title: string; questions: RefinedQuestion[] } | null;
}
interface RefinedModule {
  book: string;
  moduleTitle: string;
  moduleOrder: number;
  sourceRef?: string;
  lessons: RefinedLesson[];
}

// Load the refined artifact for a module, if the pipeline produced one.
function readRefined(book: string, moduleOrder: number, moduleTitle: string): RefinedModule | null {
  const file = path.join(PUBLIC, "content", "refined", book, `${slugify(`module-${moduleOrder}-${moduleTitle}`)}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as RefinedModule;
  } catch {
    return null;
  }
}

// Drop a leading H1/H2 equal to the lesson title — the lesson page renders the
// title itself, so keeping it in the body would show the title twice. (Cleans
// artifacts written by older pipeline versions on reseed.)
function stripLeadingTitle(md: string, title: string): string {
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

function readContent(relPath: string): string {
  try {
    return fs.readFileSync(path.join(PUBLIC, relPath), "utf8");
  } catch {
    return "";
  }
}

async function wipe() {
  // Order matters (FKs). Cascades handle most, but be explicit.
  await prisma.auditLog.deleteMany();
  await prisma.badgeAward.deleteMany();
  await prisma.badge.deleteMany();
  await prisma.copilotMessage.deleteMany();
  await prisma.copilotThread.deleteMany();
  await prisma.copilotTopic.deleteMany();
  await prisma.copilotPolicy.deleteMany();
  await prisma.quizAttempt.deleteMany();
  await prisma.question.deleteMany();
  await prisma.quiz.deleteMany();
  await prisma.sessionLog.deleteMany();
  await prisma.lessonFeedback.deleteMany();
  await prisma.progress.deleteMany();
  await prisma.assignment.deleteMany();
  // Custom teacher exercises are cascade-deleted with users/modules anyway —
  // reseeding wipes them (known MVP limitation, same as teacher library lessons).
  await prisma.exerciseLink.deleteMany();
  await prisma.exercise.deleteMany();
  await prisma.modulePlan.deleteMany();
  await prisma.notebookProject.deleteMany();
  await prisma.projectStepAnswer.deleteMany();
  await prisma.projectSubmission.deleteMany();
  await prisma.projectAssignment.deleteMany();
  await prisma.projectPrereq.deleteMany();
  await prisma.projectStep.deleteMany();
  await prisma.project.deleteMany();
  await prisma.lessonVersion.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.module.deleteMany();
  await prisma.offering.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.teacherAssignment.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.classGroup.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.user.deleteMany();
}

async function seedContent() {
  const manifest = JSON.parse(fs.readFileSync(path.join(PUBLIC, "content/manifest.json"), "utf8"));
  const seenSubject = new Set<string>();
  let subjectCount = 0;
  let moduleCount = 0;
  let lessonCount = 0;
  let quizCount = 0;
  let refinedCount = 0;
  let order = 0;

  // Pre-scan: which levels each book serves (physique-electricite spans 5e+6e).
  // Shared books get Module.classLevel = null ("all levels"). Also count label
  // reuse ("Mathématiques" ×4) so colliding names get a level/section suffix —
  // a teacher assigned to 5e AND 6e maths sees two distinct subject buckets.
  const levelsBySlug = new Map<string, Set<string>>();
  const labelCount = new Map<string, number>();
  const seenForLabel = new Set<string>();
  for (const cls of manifest.classes) {
    const lvl = levelFromClassId(String(cls.id));
    for (const field of cls.fields || []) {
      for (const subj of field.subjects || []) {
        const slug: string = subj.book || subj.id;
        if (!levelsBySlug.has(slug)) levelsBySlug.set(slug, new Set());
        levelsBySlug.get(slug)!.add(lvl);
        if (!seenForLabel.has(slug)) {
          seenForLabel.add(slug);
          labelCount.set(subj.label, (labelCount.get(subj.label) ?? 0) + 1);
        }
      }
    }
  }
  function subjectName(label: string, slug: string, levels: Set<string>): string {
    if ((labelCount.get(label) ?? 0) <= 1) return label;
    const section = /litteraire/.test(slug) ? " (littéraire)" : "";
    const lvl = levels.size === 1 ? ` — ${[...levels][0]}` : "";
    return `${label}${section}${lvl}`;
  }

  for (const cls of manifest.classes) {
    const clsLevel = levelFromClassId(String(cls.id));
    for (const field of cls.fields || []) {
      for (const subj of field.subjects || []) {
        const slug: string = subj.book || subj.id;
        // A subject maps to one book. Books are aliased across several fields in
        // the manifest, so only create the subject + its modules the first time.
        if (seenSubject.has(slug)) continue;
        const style = subjectStyle(subj.label, subj.id);
        // null classLevel = book shared across levels (matches any class level)
        const classLevel = levelsBySlug.get(slug)!.size > 1 ? null : clsLevel;
        await prisma.subject.create({
          data: {
            slug,
            name: subjectName(subj.label, slug, levelsBySlug.get(slug)!),
            color: style.color,
            icon: style.icon,
            family: familyFromSlug(slug),
            order: order++,
          },
        });
        seenSubject.add(slug);
        subjectCount++;

        let n = 0;
        for (const mod of subj.modules || []) {
          n++;
          const modOrder = mod.n ?? n;
          const m = await prisma.module.create({
            data: { subjectSlug: slug, classLevel, title: mod.title, order: modOrder },
          });
          moduleCount++;

          const refined = readRefined(slug, modOrder, mod.title);
          if (refined && refined.lessons.length) {
            // Refined module → several clean lessons, each with a real quiz.
            refinedCount++;
            const usedSlugs = new Set<string>();
            for (const rl of refined.lessons) {
              // Guarantee a unique slug within the module (long module titles can
              // truncate two lesson slugs to the same 60 chars).
              let lessonSlug = rl.slug || slugify(`${slugFromPath(mod.path || `lesson-${n}`)}-${rl.order}`);
              if (usedSlugs.has(lessonSlug)) lessonSlug = `${lessonSlug.slice(0, 52)}-l${rl.order}`;
              usedSlugs.add(lessonSlug);
              const lesson = await prisma.lesson.create({
                data: {
                  moduleId: m.id,
                  slug: lessonSlug,
                  title: rl.title,
                  order: rl.order,
                  status: "PUBLISHED",
                  contentMd: stripLeadingTitle(rl.contentMd, rl.title),
                  estMinutes: rl.estMinutes ?? 15,
                  sourceRef: refined.sourceRef || mod.path || null,
                },
              });
              lessonCount++;
              if (rl.quiz && rl.quiz.questions.length) {
                const quiz = await prisma.quiz.create({ data: { lessonId: lesson.id, title: rl.quiz.title } });
                await prisma.question.createMany({
                  data: rl.quiz.questions.map((q) => ({
                    quizId: quiz.id,
                    type: q.type,
                    promptMd: q.promptMd,
                    optionsJson: q.optionsJson ?? null,
                    answerJson: q.answerJson,
                    explanationMd: q.explanationMd ?? null,
                    order: q.order,
                  })),
                });
                quizCount++;
              }
            }
          } else {
            // Unrefined → keep the raw chapter as a single lesson (fallback).
            await prisma.lesson.create({
              data: {
                moduleId: m.id,
                slug: slugFromPath(mod.path || `lesson-${n}`),
                title: mod.title,
                order: 1,
                status: "PUBLISHED",
                contentMd: readContent(mod.path || ""),
                sourceRef: mod.path || null,
              },
            });
            lessonCount++;
          }
        }
      }
    }
  }

  // Materialize the manifest's (level, field) → book truth. Admin + seed
  // resolve class↔book links through this table, so a class can only ever be
  // wired to a book its level/section actually studies.
  let offeringCount = 0;
  for (const cls of manifest.classes) {
    const lvl = levelFromClassId(String(cls.id));
    for (const field of cls.fields || []) {
      const fieldLabel: string = field.label || field.id;
      for (const subj of field.subjects || []) {
        await prisma.offering.create({
          data: { level: lvl, field: fieldLabel, subjectSlug: subj.book || subj.id },
        });
        offeringCount++;
      }
    }
  }

  return { subjectCount, moduleCount, lessonCount, quizCount, refinedCount, offeringCount };
}

// Demo quiz fallback: one MCQ+TF+SHORT on a subject's first lesson, ONLY when
// that lesson has no real quiz yet (refined lessons already carry one). Keeps
// the quiz engine populated for subjects the pipeline hasn't reached.
async function seedQuizzes() {
  const subjects = await prisma.subject.findMany();
  let quizCount = 0;
  for (const subj of subjects) {
    const firstModule = await prisma.module.findFirst({
      where: { subjectSlug: subj.slug },
      orderBy: { order: "asc" },
      include: { lessons: { orderBy: { order: "asc" }, take: 1, include: { quizzes: { select: { id: true } } } } },
    });
    const lesson = firstModule?.lessons[0];
    if (!lesson || lesson.quizzes.length > 0) continue;
    const quiz = await prisma.quiz.create({
      data: { lessonId: lesson.id, title: `Quiz — ${lesson.title}` },
    });
    await prisma.question.createMany({
      data: [
        {
          quizId: quiz.id,
          type: "MCQ",
          promptMd: `Quel énoncé décrit le mieux le thème **« ${lesson.title} »** ?`,
          optionsJson: JSON.stringify([
            "Un sujet sans rapport avec le programme",
            `Un chapitre clé de ${subj.name}`,
            "Un exercice de récréation",
            "Une note de bas de page",
          ]),
          answerJson: JSON.stringify(1),
          explanationMd: `Cette leçon fait partie du programme de **${subj.name}**.`,
          order: 1,
        },
        {
          quizId: quiz.id,
          type: "TF",
          promptMd: `Vrai ou faux : cette leçon appartient au cours de ${subj.name}.`,
          answerJson: JSON.stringify(true),
          explanationMd: "Vrai — elle est rattachée à cette matière.",
          order: 2,
        },
        {
          quizId: quiz.id,
          type: "SHORT",
          promptMd: `En un mot, à quelle matière appartient cette leçon ? (indice : ${subj.name.split(" ")[0].toLowerCase()})`,
          answerJson: JSON.stringify([subj.name.split(" ")[0].toLowerCase(), subj.slug]),
          explanationMd: `Réponse attendue : ${subj.name}.`,
          order: 3,
        },
      ],
    });
    quizCount++;
  }
  return quizCount;
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
const rint = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

// Realistic per-student activity so teacher analytics have data + trigger alerts.
// 4 archetypes: advanced / average / behind / inactive. The per-student archetype
// comes from the class roster (archByStudent) so classes have distinct profiles;
// falls back to round-robin if a student isn't mapped.
async function seedActivity(archByStudent: Map<string, number>) {
  const COPILOT_QS = [
    "Je ne comprends pas cette étape, peux-tu l'expliquer autrement ?",
    "Donne-moi un exemple concret s'il te plaît.",
    "Comment résoudre ce type d'exercice ?",
    "Quelle est la différence entre ces deux notions ?",
    "Peux-tu m'interroger sur cette leçon ?",
    "Pourquoi cette formule fonctionne-t-elle ?",
  ];
  // Realistic tutor replies (Markdown, Socratic) — index-matched to COPILOT_QS.
  const COPILOT_AS = [
    "Bien sûr 🙂 Reprenons autrement : oublie la formule un instant et garde l'**idée**. On part de ce que tu connais déjà, puis on avance d'**un seul pas**. Quelle est la dernière chose qui te semblait claire avant de bloquer ?",
    "Avec plaisir. Prenons un cas **simple**, avec de petits nombres, pour bien voir ce qui se passe — ensuite on généralisera. Veux-tu qu'on déroule cet exemple ensemble, étape par étape ?",
    "Bon réflexe de chercher une méthode ! En général on procède en **3 temps** :\n\n1. **Identifier** ce que l'énoncé demande et les données.\n2. **Choisir** la propriété ou la formule adaptée.\n3. **Vérifier** que le résultat a du sens.\n\nPar laquelle veux-tu commencer ?",
    "Très bonne question — c'est souvent là que naît la confusion. L'une répond plutôt à « **quoi ?** » et l'autre à « **comment ?** ». Pour les distinguer, je garde un exemple typique de chacune en tête. Peux-tu me dire, avec tes mots, ce que fait chacune ?",
    "Avec plaisir, faisons un petit test ✏️ Première question : explique **avec tes propres mots** l'idée principale de la leçon. Pas de panique — si tu hésites, je te donne un indice.",
    "Excellente curiosité ! Une formule n'est pas magique : elle traduit une **idée**. Chaque terme y représente quelque chose de concret. Si on **augmentait** un des termes, que se passerait-il d'après toi pour le résultat ?",
  ];
  const c = { progress: 0, attempts: 0, sessions: 0, threads: 0, messages: 0 };
  const classes = await prisma.classGroup.findMany();

  for (const cls of classes) {
    const tas = await prisma.teacherAssignment.findMany({ where: { classId: cls.id }, select: { subjectSlug: true } });
    const slugs = [...new Set(tas.map((t) => t.subjectSlug))];
    const subjects = await prisma.subject.findMany({
      where: { slug: { in: slugs } },
      orderBy: { order: "asc" },
      include: {
        modules: {
          orderBy: { order: "asc" },
          include: { lessons: { where: { status: "PUBLISHED" }, orderBy: { order: "asc" }, include: { quizzes: { select: { id: true } } } } },
        },
      },
    });
    const lessons: { id: string; quizId?: string }[] = [];
    for (const s of subjects) for (const m of s.modules) {
      for (const l of m.lessons) lessons.push({ id: l.id, quizId: l.quizzes[0]?.id });
    }
    if (lessons.length === 0) continue;

    const enr = await prisma.enrollment.findMany({ where: { classId: cls.id } });
    let i = 0;
    for (const e of enr) {
      const arch = archByStudent?.get(e.studentId) ?? i % 4;
      i++;
      const frac = [0.7, 0.4, 0.18, 0.08][arch];
      const lastActive = [0, 1, 3, 10][arch]; // days ago of most recent activity
      const quizBase = [88, 72, 52, 45][arch];
      const nThreads = [3, 2, 1, 0][arch];
      const completeN = Math.max(1, Math.min(lessons.length, Math.floor(lessons.length * frac)));

      for (let k = 0; k < completeN; k++) {
        const l = lessons[k];
        const when = daysAgo(lastActive + Math.floor((completeN - k) / 2));
        const secs = rint(300, 1200);
        await prisma.progress.create({ data: { studentId: e.studentId, lessonId: l.id, status: "COMPLETED", completedAt: when, totalSeconds: secs } }).catch(() => {});
        c.progress++;
        await prisma.sessionLog.create({ data: { studentId: e.studentId, lessonId: l.id, startedAt: when, endedAt: when, seconds: secs } });
        c.sessions++;
        if (l.quizId) {
          await prisma.quizAttempt.create({ data: { studentId: e.studentId, quizId: l.quizId, score: Math.min(100, quizBase + rint(-8, 10)), answersJson: "{}", durationS: rint(40, 120), createdAt: when } });
          c.attempts++;
        }
      }
      // current in-progress lesson
      if (completeN < lessons.length) {
        await prisma.progress.create({ data: { studentId: e.studentId, lessonId: lessons[completeN].id, status: "IN_PROGRESS", totalSeconds: rint(120, 600), updatedAt: daysAgo(lastActive) } }).catch(() => {});
        c.progress++;
      }
      // copilot questions
      for (let t = 0; t < nThreads; t++) {
        const l = lessons[t % completeN];
        const thread = await prisma.copilotThread.create({ data: { studentId: e.studentId, lessonId: l.id, startedAt: daysAgo(lastActive + t) } });
        c.threads++;
        const qCount = rint(1, 3);
        for (let q = 0; q < qCount; q++) {
          const when = daysAgo(lastActive + t);
          when.setHours(8 + rint(0, 8), rint(0, 59), 0, 0); // spread over school hours for usage-by-hour
          const qi = (i + t + q) % COPILOT_QS.length;
          await prisma.copilotMessage.create({ data: { threadId: thread.id, role: "user", content: COPILOT_QS[qi], createdAt: when } });
          await prisma.copilotMessage.create({ data: { threadId: thread.id, role: "assistant", content: COPILOT_AS[qi], createdAt: new Date(when.getTime() + 4000) } });
          c.messages += 2;
        }
      }
    }
  }
  return c;
}


// Seed example "Projets appliqués" — capstone projects tied to real DRC contexts.
// Robust: looks up the maths subject by icon + its modules by title, so it works
// regardless of the exact subject slug. Skips silently if no modules exist.
async function seedProjects() {
  const math = await prisma.subject.findFirst({ where: { icon: "math" }, orderBy: { order: "asc" } });
  if (!math) return 0;
  const modules = await prisma.module.findMany({ where: { subjectSlug: math.slug }, orderBy: { order: "asc" } });
  if (modules.length === 0) return 0;
  const level = modules[0].classLevel || "5e";

  const pick = (regexes: RegExp[], fallback: number) => {
    const out: typeof modules = [];
    for (const re of regexes) for (const m of modules) if (re.test(m.title) && !out.includes(m)) out.push(m);
    return (out.length ? out : modules.slice(0, fallback)).slice(0, 3);
  };

  let created = 0;

  // ── Project 1 — Statistics & probability capstone ──────────────────────────
  const statsMods = pick([/statistiq/i, /probabilit/i, /combinatoire/i], 3);
  await prisma.project.create({
    data: {
      subjectSlug: math.slug,
      classLevel: level,
      slug: "enquete-eau-bukavu",
      title: "Mini-enquête statistique : l'accès à l'eau à Bukavu",
      difficulty: "INTERMEDIATE",
      estMinutes: 120,
      order: 1,
      status: "PUBLISHED",
      scenarioMd:
        "Tu es **bénévole** dans une ONG de quartier à **Bukavu**. Le comité veut savoir combien de temps les familles passent chaque jour à aller chercher de l'eau, pour décider où installer une nouvelle borne-fontaine.\n\nOn te confie un petit relevé : le **temps quotidien (en minutes)** déclaré par 20 familles d'un même quartier. Ta mission : transformer ces chiffres bruts en une **recommandation claire** que le comité pourra utiliser.\n\n> Données (minutes/jour) : 15, 40, 25, 60, 30, 45, 20, 90, 35, 50, 25, 70, 30, 40, 55, 20, 65, 35, 45, 30",
      objectivesMd:
        "- Organiser des données réelles dans un **tableau de fréquences**\n- Calculer et interpréter **moyenne, médiane et écart-type**\n- Représenter les données par un **graphique** adapté\n- Utiliser une **probabilité simple** pour appuyer une décision",
      deliverableMd:
        "Un court **rapport** (les 5 étapes ci-contre remplies) se terminant par **une recommandation** au comité : faut-il installer la borne ? Pourquoi, d'après tes chiffres ?",
      steps: {
        create: [
          {
            order: 1,
            title: "Formuler la question et lire les données",
            instructionMd:
              "Reformule **avec tes mots** la question à laquelle le comité veut répondre, puis recopie les 20 valeurs. Combien de familles y a-t-il ? Quelle est la valeur la plus petite, la plus grande ?",
            hintMd: "Une bonne question statistique précise **qui** (les familles du quartier), **quoi** (le temps de collecte d'eau) et **pourquoi** (décider de la borne).",
          },
          {
            order: 2,
            title: "Construire un tableau de fréquences",
            instructionMd:
              "Regroupe les valeurs en **classes** (par exemple 0–20, 20–40, 40–60, 60–80, 80–100 min). Pour chaque classe, donne l'**effectif** et la **fréquence** (en %). Présente le tout dans un tableau.",
            hintMd: "La somme des effectifs doit faire 20, et la somme des fréquences 100 %. Vérifie-le !",
          },
          {
            order: 3,
            title: "Calculer les indicateurs",
            instructionMd:
              "Calcule la **moyenne**, la **médiane** et l'**écart-type** du temps de collecte. Explique en une phrase ce que chacun raconte sur la situation des familles.",
            hintMd: "La médiane est la valeur du milieu une fois les 20 nombres rangés dans l'ordre (moyenne des 10e et 11e). L'écart-type mesure si les familles sont toutes logées à la même enseigne… ou pas.",
          },
          {
            order: 4,
            title: "Représenter et interpréter",
            instructionMd:
              "Décris (ou dessine) l'**histogramme** des classes de l'étape 2. Que remarques-tu ? Y a-t-il beaucoup de familles très au-dessus de la moyenne ?",
            hintMd: "Un histogramme montre d'un coup d'œil où se concentrent les familles. Repère la classe la plus haute (le mode).",
          },
          {
            order: 5,
            title: "Probabilité et recommandation",
            instructionMd:
              "Si on choisit une famille **au hasard**, quelle est la probabilité qu'elle passe **plus de 45 minutes** par jour ? Termine par ta **recommandation** au comité, appuyée sur tes chiffres.",
            hintMd: "Probabilité = (nombre de familles à plus de 45 min) ÷ 20. Une probabilité élevée est un argument fort pour la borne.",
          },
        ],
      },
      prereqs: { create: statsMods.map((m) => ({ moduleId: m.id })) },
    },
  });
  created++;

  // ── Project 2 — Functions / modelling capstone (more advanced) ─────────────
  const fnMods = pick([/suites/i, /fonction/i, /d[ée]riv/i, /limite/i], 2);
  await prisma.project.create({
    data: {
      subjectSlug: math.slug,
      classLevel: level,
      slug: "modeliser-rumeur-fonction",
      title: "Modéliser la propagation d'une information avec une fonction",
      difficulty: "ADVANCED",
      estMinutes: 150,
      order: 2,
      status: "PUBLISHED",
      scenarioMd:
        "Dans ton école à Bukavu, une **information importante** (la date d'un examen) se répand de bouche à oreille. Le matin, 5 élèves la connaissent. Chaque heure, le nombre d'élèves informés **augmente régulièrement**.\n\nTon rôle : **modéliser** ce phénomène avec une fonction, puis prévoir quand toute l'école (600 élèves) sera au courant — pour aider la direction à décider s'il faut afficher l'information officiellement.",
      objectivesMd:
        "- Traduire une situation réelle en **fonction**\n- Étudier le **sens de variation** et la **croissance**\n- Utiliser la fonction pour faire une **prévision** et la critiquer",
      deliverableMd:
        "Une **note d'analyse** (les 4 étapes) avec ta fonction, ta prévision chiffrée, et **une limite du modèle** (pourquoi la réalité peut différer).",
      steps: {
        create: [
          {
            order: 1,
            title: "Poser le modèle",
            instructionMd:
              "On suppose qu'à chaque heure, le nombre d'élèves informés augmente de 40. Écris une fonction f(t) qui donne le nombre d'élèves informés après t heures, sachant f(0) = 5.",
            hintMd: "Une augmentation **constante** par heure se modélise par une fonction **affine** : f(t) = a·t + b. Ici b = 5.",
          },
          {
            order: 2,
            title: "Étudier la fonction",
            instructionMd:
              "La fonction est-elle croissante ou décroissante ? Justifie. Que représente concrètement le coefficient directeur dans cette histoire ?",
            hintMd: "Le coefficient directeur, c'est la vitesse de propagation : combien d'élèves de plus chaque heure.",
          },
          {
            order: 3,
            title: "Faire la prévision",
            instructionMd:
              "Au bout de combien d'heures les 600 élèves seront-ils informés ? Pose et résous l'équation f(t) = 600.",
            hintMd: "Résous 40·t + 5 = 600. Arrondis à l'heure supérieure : on ne peut pas informer 'une demi-heure' d'élèves.",
          },
          {
            order: 4,
            title: "Critiquer le modèle",
            instructionMd:
              "Dans la vraie vie, la propagation ralentit quand presque tout le monde sait déjà. Explique pourquoi ton modèle affine devient faux vers la fin, et propose une amélioration.",
            hintMd: "Pense à ce qui se passe quand il ne reste presque plus d'élèves à informer : la 'vitesse' ne peut pas rester constante.",
          },
        ],
      },
      prereqs: { create: fnMods.map((m) => ({ moduleId: m.id })) },
    },
  });
  created++;

  return created;
}

// Seed a handful of realistic student submissions so a teacher can actually
// exercise the grading flow (À corriger / Renvoyés / Notés) out of the box.
// Idempotent: relies on a fresh DB (submissions are wiped at the top of main()).
async function seedProjectSubmissions() {
  // Realistic step answers, keyed by project slug → ordered step responses.
  const answers: Record<string, string[]> = {
    "enquete-eau-bukavu": [
      "Le comité veut savoir combien de temps les familles passent à chercher de l'eau pour décider où placer la borne. Il y a 20 familles ; le minimum est 15 min, le maximum 90 min.",
      "0–20 : 3 familles (15 %) ; 20–40 : 8 (40 %) ; 40–60 : 5 (25 %) ; 60–80 : 3 (15 %) ; 80–100 : 1 (5 %). Total 20 familles, 100 %.",
      "Moyenne ≈ 41,3 min, médiane = 37,5 min, écart-type ≈ 18 min. La moyenne et la médiane sont proches ; l'écart-type montre que les familles ne sont pas toutes logées à la même enseigne.",
      "L'histogramme est le plus haut sur la classe 20–40 min (le mode). Quelques familles dépassent largement la moyenne (70 et 90 min).",
      "Familles à plus de 45 min : 7 sur 20, soit une probabilité de 0,35. Je recommande d'installer la borne : plus d'un tiers des familles y passent beaucoup de temps.",
    ],
    "modeliser-rumeur-fonction": [
      "f(t) = 40·t + 5, où t est le nombre d'heures écoulées et f(0) = 5 élèves informés au départ.",
      "La fonction est croissante car le coefficient directeur (40) est positif. Ce coefficient représente le nombre d'élèves informés en plus chaque heure.",
      "On résout 40·t + 5 = 600, donc t = 595/40 ≈ 14,9. Arrondi à l'heure supérieure : au bout de 15 heures toute l'école est informée.",
      "Le modèle affine devient faux vers la fin car il reste de moins en moins d'élèves à informer, donc la vitesse ne peut pas rester constante. Une fonction qui ralentit (logistique) serait plus réaliste.",
    ],
  };

  // (student full name, project slug, final status, grade?, feedback?)
  const plan: Array<{ name: string; slug: string; status: string; grade?: number; feedback?: string; daysAgo: number }> = [
    { name: "Jonathan Kasongo", slug: "enquete-eau-bukavu", status: "SUBMITTED", daysAgo: 0 },
    { name: "Divine Mapendo", slug: "enquete-eau-bukavu", status: "SUBMITTED", daysAgo: 1 },
    { name: "Grâce Bisimwa", slug: "modeliser-rumeur-fonction", status: "SUBMITTED", daysAgo: 1 },
    { name: "Esther Nshombo", slug: "enquete-eau-bukavu", status: "RETURNED", daysAgo: 3, feedback: "Bon début ! Reprends le calcul de l'écart-type à l'étape 3 et justifie davantage ta recommandation finale." },
    { name: "Amani Kabasele", slug: "enquete-eau-bukavu", status: "GRADED", grade: 78, daysAgo: 5, feedback: "Très bon travail, tableau clair et probabilité correcte. Soigne la présentation de l'histogramme." },
    { name: "Christian Bahati", slug: "modeliser-rumeur-fonction", status: "GRADED", grade: 85, daysAgo: 6, feedback: "Excellent raisonnement sur le modèle affine et sa critique. Continue comme ça !" },
  ];

  const projects = await prisma.project.findMany({ include: { steps: { orderBy: { order: "asc" } } } });
  const bySlug = new Map(projects.map((p) => [p.slug, p]));
  let created = 0;

  for (const row of plan) {
    const [firstName, ...rest] = row.name.split(" ");
    const lastName = rest.join(" ");
    const student = await prisma.user.findFirst({ where: { role: "STUDENT", firstName, lastName } });
    const project = bySlug.get(row.slug);
    if (!student || !project) continue;

    const steps = project.steps;
    const resp = answers[row.slug] || [];
    const when = new Date(Date.now() - row.daysAgo * 86400000);

    await prisma.projectSubmission.create({
      data: {
        studentId: student.id,
        projectId: project.id,
        status: row.status,
        submittedAt: when,
        grade: row.grade ?? null,
        feedbackMd: row.feedback ?? null,
        reviewedById: null,
        reviewedAt: row.status === "GRADED" || row.status === "RETURNED" ? when : null,
        answers: {
          create: steps.map((s, i) => ({ stepId: s.id, responseMd: resp[i] ?? "", done: true })),
        },
      },
    });
    created++;
  }
  return created;
}

// Seed a few "understanding" feedbacks so the teacher's Retours inbox + the
// dashboard feedback panel have real items to triage and resolve.
async function seedFeedback() {
  const lessons = await prisma.lesson.findMany({ where: { status: "PUBLISHED" }, orderBy: { order: "asc" }, take: 30, select: { id: true } });
  if (lessons.length === 0) return 0;

  const plan: Array<{ name: string; understanding: number; message: string; resolved: boolean }> = [
    { name: "Divine Mapendo", understanding: 25, message: "Je n'ai pas bien compris la différence entre l'opposé et l'inverse d'un nombre.", resolved: false },
    { name: "Josué Mugisho", understanding: 50, message: "La règle des signes pour la multiplication reste floue pour moi.", resolved: false },
    { name: "Esther Nshombo", understanding: 50, message: "Pourquoi soustraire revient à additionner l'opposé ?", resolved: false },
    { name: "Christian Bahati", understanding: 75, message: "Presque clair, j'aimerais juste un exemple de plus sur les contrapositions.", resolved: false },
    { name: "Amani Kabasele", understanding: 25, message: "Je bloque dès qu'il y a une fraction dans l'équation.", resolved: false },
    { name: "Jonathan Kasongo", understanding: 100, message: "Très clair, merci !", resolved: true },
  ];

  let created = 0;
  let li = 0;
  for (const row of plan) {
    const [firstName, ...rest] = row.name.split(" ");
    const lastName = rest.join(" ");
    const student = await prisma.user.findFirst({ where: { role: "STUDENT", firstName, lastName } });
    if (!student) continue;
    const lesson = lessons[li % lessons.length];
    li++;
    try {
      await prisma.lessonFeedback.create({
        data: { studentId: student.id, lessonId: lesson.id, understanding: row.understanding, message: row.message, resolved: row.resolved },
      });
      created++;
    } catch {
      // unique (studentId, lessonId) collision — skip
    }
  }
  return created;
}

async function main() {
  console.log("Seeding Mwalimu…");
  await wipe();

  // ---- Settings ----
  await prisma.setting.createMany({
    data: [
      { key: "school.name", value: "Institut Mwalimu — Bukavu" },
      { key: "school.year", value: "2025-2026" },
      { key: "locale.default", value: "fr" },
      { key: "ollama.model", value: "gemma3n" },
    ],
  });

  // ---- Content ----
  const counts = await seedContent();
  const demoQuizzes = await seedQuizzes();
  const quizCount = counts.quizCount + demoQuizzes;
  const projectCount = await seedProjects();

  // ---- Admin ----
  const admin = await prisma.user.create({
    data: {
      role: "ADMIN",
      firstName: "Super",
      lastName: "Admin",
      email: "admin@mwalimu.school",
      passwordHash: bcrypt.hashSync("admin1234", 10),
      avatarColor: avatarColor("Super Admin"),
      locale: "fr",
    },
  });

  // ---- Révision EXETAT, offered to every 6e section ----
  // The state exam is not a class of its own: it is the finalists' revision material.
  // The manifest lists it under a phantom "examen · Option Sciences" track that no real
  // class belongs to, so fan it out over the 6e sections that actually exist.
  //
  // 6e ONLY. It was briefly fanned out to 5e as well; the EXETAT is sat at the end of 6e,
  // so a 5e section has no business carrying the revision volume.
  const examBook = await prisma.subject.findUnique({ where: { slug: "sciences-1-exetat" } });
  if (examBook) {
    const sections = await prisma.offering.findMany({
      where: { level: "6e" },
      select: { level: true, field: true },
      distinct: ["level", "field"],
    });
    for (const sec of sections) {
      const has = await prisma.offering.findFirst({ where: { level: sec.level, field: sec.field, subjectSlug: examBook.slug } });
      if (!has) await prisma.offering.create({ data: { level: sec.level, field: sec.field, subjectSlug: examBook.slug } });
    }
  }

  // ---- Teachers ----
  const teacherData = [
    // "exetat" is the finalists' revision track. It is deliberately on BOTH teachers:
    // the book's nine modules span Maths, Bio, Physique, Chimie, Civisme, Géo, Histoire,
    // Philo and langues, so it belongs to no single discipline.
    // `gender` drives French agreement only — « Enseignante Mukendi » vs « Enseignant
    // Lwanzo ». Before it existed the shells hard-coded the feminine for everyone.
    { firstName: "Grâce", lastName: "Mukendi", email: "g.mukendi@mwalimu.school", gender: "F", subjects: ["math", "exetat"] },
    // Patrick also teaches the descriptive-geometry book (dessin scientifique) —
    // "geometrie" maps to geometrie-descriptive-6, offered only to 6e Math-Physique.
    { firstName: "Patrick", lastName: "Lwanzo", email: "p.lwanzo@mwalimu.school", gender: "M", subjects: ["physique", "chimie", "geometrie", "exetat"] },
  ];
  const teachers = [];
  for (const t of teacherData) {
    teachers.push(
      await prisma.user.create({
        data: {
          role: "TEACHER",
          firstName: t.firstName,
          lastName: t.lastName,
          email: t.email,
          gender: t.gender,
          disciplines: t.subjects.join(","), // what they teach → drives assignment resolution
          passwordHash: bcrypt.hashSync("teach1234", 10),
          avatarColor: avatarColor(`${t.firstName} ${t.lastName}`),
          locale: "fr",
        },
      }),
    );
  }

  // ---- Classes ----
  // `field` uses the manifest's section labels so Offering rows resolve exactly.
  const classData = [
    // One class per section, so no « A » suffix to disambiguate. "Scientifique" was
    // ambiguous — Math-Physique is a scientific section too — so the class carries the
    // section it actually is. The section labels must match the manifest's exactly or
    // Offering resolution silently finds nothing.
    { name: "5e Bio-Chimie", level: "5e", field: "Scientifique — Biologie-Chimie" },
    { name: "5e Math-Physique", level: "5e", field: "Scientifique — Math-Physique" },
    { name: "5e Littéraire", level: "5e", field: "Littéraire / Pédagogique / Techniques" },
    { name: "6e Bio-Chimie", level: "6e", field: "Scientifique — Biologie-Chimie" },
    // Math-Physique section — the only 6e track whose Offering includes the
    // Géométrie descriptive book (dessin scientifique), plus Physique + Maths 6.
    { name: "6e Math-Physique", level: "6e", field: "Scientifique — Math-Physique" },
    { name: "6e Littéraire", level: "6e", field: "Littéraire / Pédagogique / Techniques" },
  ];
  const classes = [];
  for (const c of classData) {
    classes.push(await prisma.classGroup.create({ data: { ...c, year: 2025 } }));
  }

  // ---- Teacher assignments (teacher ↔ class ↔ subject) ----
  // Resolve the book PER CLASS through Offering (level + field → books), then
  // pick the teacher's discipline among them. A 6e class can only ever get the
  // 6e book — the old `subjectsForIcon(icon)[0]` heuristic gave every class the
  // first-created math book (Maths 5), including 6e Scientifique A.
  for (let ti = 0; ti < teachers.length; ti++) {
    const t = teachers[ti];
    for (const discipline of teacherData[ti].subjects) {
      for (const c of classes) {
        const offered = await prisma.offering.findMany({
          where: { level: c.level, field: c.field ?? "" },
          include: { subject: { select: { family: true } } },
        });
        const match = offered.find((o) => o.subject.family === discipline);
        if (!match) continue; // this class's section doesn't study that discipline
        await prisma.teacherAssignment.create({
          data: { teacherId: t.id, classId: c.id, subjectSlug: match.subjectSlug, isLead: ti === 0 },
        });
      }
    }
  }

  // ---- Students with PIN 1234 (demo) ----
  // Per-class roster with an explicit archetype per student (0 advanced · 1 average
  // · 2 behind · 3 inactive). The first four of each class are the narrative-bearing
  // students referenced by submissions/feedback (kept identical). Extra students give
  // each class a DISTINCT, realistic profile so the dashboard tells a real story:
  //   5e Bio-Chimie → solid · 5e Math-Physique → mid · 6e Bio-Chimie → needs support
  //   5e Littéraire → steady · 6e Littéraire → scattered under exam pressure.
  const CLASS_ROSTER: Record<string, { name: string; arch: number }[]> = {
    "5e Bio-Chimie": [
      { name: "Amani Kabasele", arch: 0 }, { name: "Jonathan Kasongo", arch: 1 },
      { name: "Divine Mapendo", arch: 2 }, { name: "Josué Mugisho", arch: 3 },
      { name: "Gloire Mwanza", arch: 0 }, { name: "Sylvie Kabwe", arch: 0 },
      { name: "Daniel Lwamba", arch: 0 }, { name: "Chantal Byamungu", arch: 1 },
    ],
    "5e Math-Physique": [
      { name: "Grâce Bisimwa", arch: 0 }, { name: "Esther Nshombo", arch: 1 },
      { name: "Christian Bahati", arch: 2 }, { name: "Sarah Wabiwa", arch: 3 },
      { name: "Rachel Maombi", arch: 1 }, { name: "Joseph Ilunga", arch: 0 },
    ],
    "6e Bio-Chimie": [
      { name: "Espoir Mwamba", arch: 0 }, { name: "Patrick Lumière", arch: 1 },
      { name: "Bénédicte Furaha", arch: 2 }, { name: "Emmanuel Cirhuza", arch: 3 },
      { name: "Nadine Shukuru", arch: 2 }, { name: "Olivier Mumba", arch: 3 },
      { name: "Prince Kasereka", arch: 2 },
    ],
    "6e Math-Physique": [
      { name: "Élie Mukendi", arch: 0 }, { name: "Josaphat Kalume", arch: 1 },
      { name: "Merveille Ntumba", arch: 2 }, { name: "Gédéon Salumu", arch: 3 },
    ],
    // The two littéraire sections. Their own profiles, distinct from the three above:
    // 5e steady (mostly 0/1), 6e under exam pressure and more scattered (1/2 heavy).
    "5e Littéraire": [
      { name: "Ange Tshibangu", arch: 0 }, { name: "Deborah Nsimire", arch: 1 },
      { name: "Fiston Bulambo", arch: 1 }, { name: "Naomi Kavira", arch: 2 },
      { name: "Isaac Mbayo", arch: 0 }, { name: "Rebecca Mwavita", arch: 1 },
      { name: "Trésor Kambale", arch: 3 },
    ],
    "6e Littéraire": [
      { name: "Judith Riziki", arch: 0 }, { name: "Alain Mulumba", arch: 1 },
      { name: "Céline Wivine", arch: 2 }, { name: "Samuel Baguma", arch: 1 },
      { name: "Pascaline Ngoy", arch: 2 }, { name: "Éric Muhindo", arch: 3 },
    ],
  };
  const pinHash = bcrypt.hashSync("1234", 10);
  const archByStudent = new Map();
  for (const cls of classes) {
    const roster = CLASS_ROSTER[cls.name] || [];
    for (const r of roster) {
      const [firstName, ...rest] = r.name.split(" ");
      const student = await prisma.user.create({
        data: { role: "STUDENT", firstName, lastName: rest.join(" "), pinHash, avatarColor: avatarColor(r.name), locale: "fr" },
      });
      await prisma.enrollment.create({ data: { studentId: student.id, classId: cls.id } });
      archByStudent.set(student.id, r.arch);
    }
  }

  // ---- Project submissions (so teachers can test the grading flow) ----
  const submissionCount = await seedProjectSubmissions();
  const feedbackCount = await seedFeedback();
  console.log(`Project submissions seeded: ${submissionCount} · feedback: ${feedbackCount}`);

  // ---- Badges ----
  await prisma.badge.createMany({
    data: [
      { slug: "first-module", name: "Premier module", icon: "trophy", rule: "Complete a first module" },
      { slug: "perfect-quiz", name: "Quiz parfait", icon: "target", rule: "Score 100% on a quiz" },
      { slug: "streak-7", name: "Série de 7 jours", icon: "flame", rule: "7-day learning streak" },
      { slug: "projet-applique", name: "Bâtisseur", icon: "layers", rule: "Submit a first applied project" },
    ],
  });

  // ---- Demo activity (progress, quizzes, sessions, copilot) ----
  const act = await seedActivity(archByStudent);

  // ---- Teacher notebook demo (Carnet de bord) ----
  // For Grâce (teachers[0]): mark the first modules of each class she teaches as
  // covered / in-progress, leave a note, and plan one applied project per class.
  const grace = teachers[0];
  let planCount = 0;
  let nbProjectCount = 0;
  const graceTas = await prisma.teacherAssignment.findMany({ where: { teacherId: grace.id } });
  for (const ta of graceTas) {
    const mods = await prisma.module.findMany({ where: { subjectSlug: ta.subjectSlug }, orderBy: { order: "asc" }, take: 6 });
    for (let i = 0; i < mods.length; i++) {
      const status = i < 3 ? "COVERED" : i < 5 ? "IN_PROGRESS" : "PLANNED";
      await prisma.modulePlan.create({
        data: {
          teacherId: grace.id,
          classId: ta.classId,
          moduleId: mods[i].id,
          status,
          coveredAt: status === "COVERED" ? new Date(Date.now() - (6 - i) * 7 * 86400000) : null,
          plannedFor: status === "PLANNED" ? new Date(Date.now() + 7 * 86400000) : null,
          notesMd: i === 0 ? "Bien compris dans l'ensemble — revoir les quantificateurs au prochain cours." : "",
          order: i,
        },
      });
      planCount++;
    }
    if (mods.length) {
      await prisma.notebookProject.create({
        data: {
          teacherId: grace.id,
          classId: ta.classId,
          subjectSlug: ta.subjectSlug,
          moduleId: mods[0].id,
          title: "Mini-enquête statistique de la classe",
          objectivesMd: "Collecter, organiser et interpréter des données réelles de la classe.",
          deliverableMd: "Un rapport d'une page avec un tableau et un graphique commentés.",
          status: "PLANNED",
          dueDate: new Date(Date.now() + 21 * 86400000),
        },
      });
      nbProjectCount++;
    }
  }
  console.log(`Notebook — modulePlans:${planCount} notebookProjects:${nbProjectCount}`);

  // ---- Audit ----
  await prisma.auditLog.create({
    data: { actorId: admin.id, actorName: "Super Admin", action: "SEED", targetType: "system", metaJson: JSON.stringify({ ...counts, ...act }) },
  });

  const students = await prisma.user.count({ where: { role: "STUDENT" } });
  console.log(
    `Seed done — subjects:${counts.subjectCount} modules:${counts.moduleCount} (refined:${counts.refinedCount}) lessons:${counts.lessonCount} quizzes:${quizCount} | admin:1 teachers:${teachers.length} classes:${classes.length} students:${students} projects:${projectCount}`,
  );
  console.log(
    `Activity — progress:${act.progress} quizAttempts:${act.attempts} sessions:${act.sessions} copilotThreads:${act.threads} messages:${act.messages}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
