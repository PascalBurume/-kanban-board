import { PrismaClient } from "@prisma/client";
import verbs from "../src/data/verbs.json";
import grammar from "../src/data/grammar.json";

const prisma = new PrismaClient();

// Known English lesson labels (factual identifiers). Lessons without a label
// are seeded as generic shells you can fill in later.
const LESSON_TITLES: Record<number, string> = {
  1: "New Friends",
  2: "Shopping",
  3: "Making a Date",
  4: "The First Date",
  5: "A Trip to Okinawa",
};

async function clearAll() {
  // Delete in dependency order so foreign keys are satisfied.
  await prisma.reviewLog.deleteMany();
  await prisma.sRSCard.deleteMany();
  await prisma.quizResult.deleteMany();
  await prisma.lessonProgress.deleteMany();
  await prisma.verbForm.deleteMany();
  await prisma.verb.deleteMany();
  await prisma.conjugationRule.deleteMany();
  await prisma.exampleSentence.deleteMany();
  await prisma.exercise.deleteMany();
  await prisma.dialogueLine.deleteMany();
  await prisma.dialogue.deleteMany();
  await prisma.readingPassage.deleteMany();
  await prisma.cultureNote.deleteMany();
  await prisma.usefulExpression.deleteMany();
  await prisma.kanji.deleteMany();
  await prisma.vocabulary.deleteMany();
  await prisma.grammarPoint.deleteMany();
  await prisma.user.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.course.deleteMany();
}

async function seedCoursesAndLessons() {
  const genki1 = await prisma.course.create({
    data: { title: "Genki I", level: "N5", lessonStart: 1, lessonEnd: 12 },
  });
  const genki2 = await prisma.course.create({
    data: { title: "Genki II", level: "N5-N4", lessonStart: 13, lessonEnd: 23 },
  });

  const lessonByNumber: Record<number, number> = {};
  for (let n = 1; n <= 23; n++) {
    const course = n <= 12 ? genki1 : genki2;
    const lesson = await prisma.lesson.create({
      data: {
        courseId: course.id,
        number: n,
        titleEn: LESSON_TITLES[n] ?? `Lesson ${n}`,
        section: "Conversation & Grammar",
      },
    });
    lessonByNumber[n] = lesson.id;
  }
  return lessonByNumber;
}

async function seedGrammar(lessonByNumber: Record<number, number>) {
  for (const g of grammar) {
    const lessonId = lessonByNumber[g.lesson];
    if (!lessonId) continue;
    await prisma.grammarPoint.create({
      data: {
        lessonId,
        order: g.order,
        title: g.title,
        pattern: g.pattern,
        explanation: g.explanation,
        examples: {
          create: (g.examples ?? []).map((e) => ({
            jp: e.jp,
            romaji: e.romaji,
            en: e.en,
          })),
        },
      },
    });
  }
}

async function seedVerbs() {
  for (const v of verbs) {
    const forms = v.forms as Record<string, string>;
    const verbForms: { formType: string; valueKana: string; example?: string }[] = [];

    if (forms.PRESENT)
      verbForms.push({
        formType: "PRESENT",
        valueKana: forms.PRESENT,
        example: forms.EXAMPLE || undefined,
      });
    if (forms.TE) verbForms.push({ formType: "TE", valueKana: forms.TE });
    if (forms.PRESENT_CONTINUOUS)
      verbForms.push({
        formType: "PRESENT_CONTINUOUS",
        valueKana: forms.PRESENT_CONTINUOUS,
      });
    if (forms.TE_REQUEST)
      verbForms.push({ formType: "TE_REQUEST", valueKana: forms.TE_REQUEST });

    await prisma.verb.create({
      data: {
        dictionaryForm: v.dictionaryForm,
        masuForm: v.masuForm,
        romaji: v.romaji,
        english: v.english,
        group: v.group,
        forms: { create: verbForms },
      },
    });
  }
}

async function seedConjugationRules() {
  const rules = [
    { group: "GODAN", endingPattern: "き / ぎ", rule: "き → いて, ぎ → いで", example: "かきます → かいて" },
    { group: "GODAN", endingPattern: "み / び / ぬ", rule: "み → んで, び → んで", example: "のみます → のんで" },
    { group: "GODAN", endingPattern: "い / ち / り", rule: "→ って", example: "かいます → かって" },
    { group: "GODAN", endingPattern: "し", rule: "し → して", example: "はなします → はなして" },
    { group: "ICHIDAN", endingPattern: "all -ます", rule: "replace ます with て", example: "たべます → たべて" },
    { group: "IRREGULAR", endingPattern: "する / くる", rule: "する → して, くる → きて", example: "します → して" },
  ];
  await prisma.conjugationRule.createMany({ data: rules });
}

async function seedDemoUser(lessonByNumber: Record<number, number>) {
  await prisma.user.create({
    data: {
      name: "Demo Learner",
      email: "demo@example.com",
      level: "N5",
      currentLessonId: lessonByNumber[1],
    },
  });
}

async function main() {
  console.log("Clearing existing data...");
  await clearAll();

  console.log("Seeding courses and lessons...");
  const lessonByNumber = await seedCoursesAndLessons();

  console.log("Seeding grammar points (Lessons 1-3)...");
  await seedGrammar(lessonByNumber);

  console.log(`Seeding ${verbs.length} verbs...`);
  await seedVerbs();

  console.log("Seeding conjugation rules...");
  await seedConjugationRules();

  console.log("Seeding demo user...");
  await seedDemoUser(lessonByNumber);

  const counts = {
    courses: await prisma.course.count(),
    lessons: await prisma.lesson.count(),
    grammarPoints: await prisma.grammarPoint.count(),
    examples: await prisma.exampleSentence.count(),
    verbs: await prisma.verb.count(),
    verbForms: await prisma.verbForm.count(),
    conjugationRules: await prisma.conjugationRule.count(),
  };
  console.log("Done. Row counts:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
