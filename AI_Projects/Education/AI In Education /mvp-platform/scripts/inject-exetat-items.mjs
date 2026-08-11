// Ingest the "Exemplaire Sciences 1" EXETAT revision manual (Éditions Totus Tuus) into
// the Révision EXETAT subject.
//
// This book is not a course, and it is not organised into chapters: it is a bank of the
// questions actually set in the Examen d'État, session by session, grouped by the school
// subject they belong to — "# I. MATHEMATIQUE.", "# **CHIMIE.**" — in exactly the order
// the nine Révision EXETAT modules already sit in. So the locator matches subject names
// rather than "CHAPITRE <roman>".
//
// The last ~200 pages are a single « GRILLE DES REPONSES » covering every subject at
// once. That block is cut off here rather than swept into Anglais/Français, the subject
// that happens to precede it, and each subject's answers are appended to its own module
// by attachAnswerKeys() below.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { injectBookFigures } from "./inject-book-figures.mjs";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "content/sources/sciences-1-exetat-totus-tuus.md");
const REFINED = path.join(ROOT, "public/content/refined/sciences-1-exetat");

if (!fs.existsSync(SRC) || !fs.existsSync(REFINED)) {
  console.log("inject-exetat: source or refined dir missing — skipping.");
  process.exit(0);
}

// One matcher per module, in module order. Written loosely because the scan's headings
// carry stray bold markers, roman numbers and full stops in every combination.
const SUBJECTS = [
  { key: "mathematique", re: /^#+\s*\**\s*(?:I\s*\.?\s*)?\**\s*MATH[EÉ]MATIQUES?\s*\.?\s*\**\s*$/i },
  { key: "biologie", re: /^#+\s*\**\s*(?:II\s*\.?\s*)?\**\s*BIOLOGIE\s*\.?\s*\**\s*$/i },
  { key: "physique", re: /^#+\s*\**\s*(?:III\s*\.?\s*)?\**\s*PHYSIQUE\s*\.?\s*\**\s*$/i },
  { key: "chimie", re: /^#+\s*\**\s*(?:IV\s*\.?\s*)?\**\s*CHIMIE\s*\.?\s*\**\s*$/i },
  { key: "civisme", re: /^#+\s*\**\s*(?:V\s*\.?\s*)?\**\s*CIVISME\s*\.?\s*\**\s*$/i },
  { key: "geographie", re: /^#+\s*\**\s*(?:VI\s*\.?\s*)?\**\s*G[EÉ]OGRAPHIE\s*\.?\s*\**\s*$/i },
  { key: "histoire", re: /^#+\s*\**\s*(?:VII\s*\.?\s*)?\**\s*HISTOIRE\s*\.?\s*\**\s*$/i },
  { key: "philosophie", re: /^#+\s*\**\s*(?:VIII\s*\.?\s*)?\**\s*PHILOSOPHIE\s*\.?\s*\**\s*$/i },
  { key: "anglais", re: /^#+\s*\**\s*(?:IX\s*\.?\s*)?\**\s*ANGLAIS\s+et\s+FRAN[CÇ]AIS\s*\.?\s*\**\s*$/i },
];

const ANSWER_GRID = /^#+\s*\**\s*GRILLE\s+DES\s+R[EÉ]PONSES/i;

const lines = fs.readFileSync(SRC, "utf8").split("\n");
const gridAt = lines.findIndex((l) => ANSWER_GRID.test(l));

// The FIRST occurrence is the body: unlike the textbooks, this manual has no table of
// contents repeating its subject headings, but the answer grid at the back repeats every
// one of them. Searching before the grid gets the questions, not the answers.
const limit = gridAt > 0 ? gridAt : lines.length;
const locate = (i) => {
  const subject = SUBJECTS[i];
  if (!subject) return -1;
  for (let j = 0; j < limit; j++) if (subject.re.test(lines[j])) return j;
  return -1;
};

injectBookFigures({
  src: SRC,
  refined: REFINED,
  label: "inject-exetat",
  bookTitle: "Exemplaire Sciences 1 — Items de l'Examen d'État",
  book: "sciences-1-exetat",
  locate,
  // A lesson here is a sitting of the exam, so it takes the session's own heading —
  // "Exétat 2019 (Série 1)". The default rule wants a numbered section and would find
  // none, leaving every lesson called "Extrait du manuel (suite 7)".
  headings: ({ major, minor }) =>
    [...major, ...minor].filter((h) => /ex[eé]tat|session/i.test(h)),
  intro:
    "> Questions posées à l'Examen d'État, reproduites du manuel *Exemplaire Sciences 1* "
    + "(Éditions Totus Tuus) — énoncés d'origine, session par session.\n\n",
});

/**
 * Append each subject's answers, lifted from the single grid at the back of the book.
 *
 * A revision item without its answer is half a revision item, and the grid is unusable
 * as one 200-page lesson: split by the same subject headings, each block goes to the
 * module whose questions it answers.
 */
function attachAnswerKeys() {
  if (gridAt < 0) {
    console.log("inject-exetat: no answer grid found — questions ingested without keys.");
    return 0;
  }
  const tail = lines.slice(gridAt + 1);
  const marks = [];
  SUBJECTS.forEach((s, i) => {
    const at = tail.findIndex((l) => s.re.test(l));
    if (at >= 0) marks.push({ i, at });
  });
  marks.sort((a, b) => a.at - b.at);

  const files = fs.readdirSync(REFINED)
    .filter((f) => /^module-\d+-.*\.json$/.test(f))
    .sort((a, b) => Number(a.match(/^module-(\d+)/)[1]) - Number(b.match(/^module-(\d+)/)[1]));

  let attached = 0;
  marks.forEach((m, k) => {
    const end = k + 1 < marks.length ? marks[k + 1].at : tail.length;
    const body = tail.slice(m.at + 1, end).join("\n").trim();
    if (!body || !files[m.i]) return;
    const jsonPath = path.join(REFINED, files[m.i]);
    const mod = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    mod.lessons = mod.lessons.filter((l) => l.slug !== `${files[m.i].replace(/\.json$/, "")}-grille-reponses`);
    const order = mod.lessons.length + 1;
    mod.lessons.push({
      slug: `${files[m.i].replace(/\.json$/, "")}-grille-reponses`,
      title: "Grille des réponses",
      order,
      estMinutes: 10,
      degraded: true,
      contentMd:
        "> Grille officielle des réponses, reproduite du manuel *Exemplaire Sciences 1* "
        + "(Éditions Totus Tuus).\n\n" + body,
      quiz: null,
    });
    fs.writeFileSync(jsonPath, JSON.stringify(mod, null, 2) + "\n");
    attached++;
  });
  return attached;
}

console.log(`inject-exetat: answer keys attached to ${attachAnswerKeys()} subject(s).`);
