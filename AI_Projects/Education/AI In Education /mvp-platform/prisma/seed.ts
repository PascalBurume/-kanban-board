// Seed: subjects/modules/lessons from the content bundle (manifest.json),
// plus 1 admin, 2 teachers, 3 classes, 12 students (bcrypt PINs), assignments,
// settings and badges. Idempotent: wipes domain tables then re-creates.
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
  await prisma.progress.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.lessonVersion.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.module.deleteMany();
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

  for (const cls of manifest.classes) {
    const classLevel = levelFromClassId(String(cls.id));
    for (const field of cls.fields || []) {
      for (const subj of field.subjects || []) {
        const slug: string = subj.book || subj.id;
        // A subject maps to one book. Books are aliased across several fields in
        // the manifest, so only create the subject + its modules the first time.
        if (seenSubject.has(slug)) continue;
        const style = subjectStyle(subj.label, subj.id);
        await prisma.subject.create({
          data: { slug, name: subj.label, color: style.color, icon: style.icon, order: order++ },
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
  return { subjectCount, moduleCount, lessonCount, quizCount, refinedCount };
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
// 4 archetypes cycled by roster index: advanced / average / behind / inactive.
async function seedActivity() {
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
      const arch = i % 4;
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

  // ---- Teachers ----
  const teacherData = [
    { firstName: "Grâce", lastName: "Mukendi", email: "g.mukendi@mwalimu.school", subjects: ["math"] },
    { firstName: "Patrick", lastName: "Lwanzo", email: "p.lwanzo@mwalimu.school", subjects: ["physique", "chimie"] },
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
          passwordHash: bcrypt.hashSync("teach1234", 10),
          avatarColor: avatarColor(`${t.firstName} ${t.lastName}`),
          locale: "fr",
        },
      }),
    );
  }

  // ---- Classes ----
  const classData = [
    { name: "5e Scientifique A", level: "5e", field: "Scientifique" },
    { name: "5e Math-Physique A", level: "5e", field: "Math-Physique" },
    { name: "6e Scientifique A", level: "6e", field: "Scientifique" },
  ];
  const classes = [];
  for (const c of classData) {
    classes.push(await prisma.classGroup.create({ data: { ...c, year: 2025 } }));
  }

  // ---- Teacher assignments (teacher ↔ class ↔ subject) ----
  // Map our icon-style subject keys to real subject slugs by matching icon.
  const allSubjects = await prisma.subject.findMany();
  function subjectsForIcon(icon: string) {
    return allSubjects.filter((s) => s.icon === icon).map((s) => s.slug);
  }
  for (let ti = 0; ti < teachers.length; ti++) {
    const t = teachers[ti];
    for (const icon of teacherData[ti].subjects) {
      const slugs = subjectsForIcon(icon).slice(0, 3); // cap for seed
      for (const c of classes) {
        const slug = slugs[0];
        if (!slug) continue;
        await prisma.teacherAssignment.create({
          data: { teacherId: t.id, classId: c.id, subjectSlug: slug, isLead: ti === 0 },
        });
      }
    }
  }

  // ---- Students (12) with PIN 1234 (demo) ----
  const studentNames = [
    "Amani Kabasele", "Grâce Bisimwa", "Espoir Mwamba", "Jonathan Kasongo",
    "Esther Nshombo", "Patrick Lumière", "Divine Mapendo", "Christian Bahati",
    "Bénédicte Furaha", "Josué Mugisho", "Sarah Wabiwa", "Emmanuel Cirhuza",
  ];
  const pinHash = bcrypt.hashSync("1234", 10);
  for (let i = 0; i < studentNames.length; i++) {
    const [firstName, ...rest] = studentNames[i].split(" ");
    const lastName = rest.join(" ");
    const cls = classes[i % classes.length];
    const student = await prisma.user.create({
      data: {
        role: "STUDENT",
        firstName,
        lastName,
        pinHash,
        avatarColor: avatarColor(studentNames[i]),
        locale: "fr",
      },
    });
    await prisma.enrollment.create({ data: { studentId: student.id, classId: cls.id } });
  }

  // ---- Badges ----
  await prisma.badge.createMany({
    data: [
      { slug: "first-module", name: "Premier module", icon: "trophy", rule: "Complete a first module" },
      { slug: "perfect-quiz", name: "Quiz parfait", icon: "target", rule: "Score 100% on a quiz" },
      { slug: "streak-7", name: "Série de 7 jours", icon: "flame", rule: "7-day learning streak" },
    ],
  });

  // ---- Demo activity (progress, quizzes, sessions, copilot) ----
  const act = await seedActivity();

  // ---- Audit ----
  await prisma.auditLog.create({
    data: { actorId: admin.id, actorName: "Super Admin", action: "SEED", targetType: "system", metaJson: JSON.stringify({ ...counts, ...act }) },
  });

  const students = await prisma.user.count({ where: { role: "STUDENT" } });
  console.log(
    `Seed done — subjects:${counts.subjectCount} modules:${counts.moduleCount} (refined:${counts.refinedCount}) lessons:${counts.lessonCount} quizzes:${quizCount} | admin:1 teachers:${teachers.length} classes:${classes.length} students:${students}`,
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
