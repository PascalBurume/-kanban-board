// QA audit of the generated lesson quizzes, across every refined book.
//
// The quizzes come out of the refine pass and had never been read back. This walks
// them and prints the questions a pupil cannot answer — identical options, a blank
// prompt, an answer index pointing nowhere. Report-only: always exits 0, so it sits
// in the predev/prebuild/seed chains beside check-exercises without breaking a build
// over content nobody has got to yet.
//
// Run: node scripts/check-quizzes.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditQuiz } from "./quiz-checks.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REFINED = path.join(APP, "public", "content", "refined");

if (!fs.existsSync(REFINED)) {
  console.log("check-quizzes: no refined content — skipping.");
  process.exit(0);
}

let questions = 0, quizzes = 0, flagged = 0;
const byCode = new Map();
const samples = [];

for (const book of fs.readdirSync(REFINED).sort()) {
  const dir = path.join(REFINED, book);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    let mod;
    try { mod = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")); } catch { continue; }
    for (const lesson of mod.lessons ?? []) {
      if (!lesson.quiz?.questions?.length) continue;
      quizzes++;
      questions += lesson.quiz.questions.length;
      for (const bad of auditQuiz(lesson.quiz)) {
        flagged++;
        for (const i of bad.issues) byCode.set(i.code, (byCode.get(i.code) ?? 0) + 1);
        if (samples.length < 25) {
          samples.push({ book, lesson: lesson.title ?? lesson.slug, ...bad });
        }
      }
    }
  }
}

console.log(`check-quizzes: ${questions} questions in ${quizzes} quizzes — ${flagged} unanswerable.`);
if (!flagged) process.exit(0);

for (const [code, n] of [...byCode].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${code}`);
}
console.log("");
for (const s of samples) {
  console.log(`  ${s.book} · ${s.lesson} · Q${s.order}`);
  console.log(`     ${String(s.promptMd).replace(/\s+/g, " ").slice(0, 100) || "(no text)"}`);
  for (const i of s.issues) console.log(`     → ${i.code}: ${i.detail}`);
}
console.log(
  "\n  These are answerability faults only. Whether a marked answer is mathematically"
  + "\n  right is not checked — that needs a reader who knows the subject."
);
