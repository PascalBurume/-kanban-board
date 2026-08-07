import type { SessionUser } from "./session";
import { getModulesContentForAI, renderModuleContext } from "./projectCopilot";
import { getViewableLesson } from "./studio";
import {
  ollamaGenerate,
  extractJson,
  parseBlocks,
  parseQuestionBlocks,
  repairLatex,
  lessonAuthorSystemPrompt,
  type LessonAuthorCtx,
  type ChatMessage,
  type StudioMode,
  type RawQuestion,
} from "./ollama";
import { lintLesson } from "./lessonLint";
import { checkLatex, cleanLatex, retryPrompt, blankRetryPrompt, LATEX_INSTRUCTION_MAX } from "./latexCheck";

// Re-exported so server callers keep one import site for the studio contract.
export { LATEX_INSTRUCTION_MAX };

// Teacher "Copilot APS" for the Studio: draft a full lesson from a topic, improve the
// current markdown, generate a quiz from the content, or brainstorm.
//
// Unlike the project-compose stack (src/lib/projectCopilot.ts) these responses are
// asked for as <<<KEY>>> delimited plain text rather than JSON. Lessons are dense in
// LaTeX, and JSON would require the model to double-escape every backslash — a small
// local model does not, so `\text` used to arrive as a tab and reach the teacher as
// "ext{...}". Delimited blocks remove escaping from the problem entirely.

// A line that is nothing but <<<…>>> is always leftover scaffolding — the model
// sometimes wraps its own title in the marker syntax instead of using <<<TITRE>>>.
// It must never reach the lesson body.
const STRAY_MARKER = /^[ \t]*<<<[^\n>]*>>>[ \t]*$\n?/gm;

function clean(v: unknown): string {
  if (typeof v !== "string") return "";
  // Strip gemma's SentencePiece ▁ space-marker, then restore any collapsed LaTeX
  // (only reachable via the JSON fallback below). Runs of spaces are squeezed only
  // mid-line, so markdown list indentation survives.
  return repairLatex(v.replace(/▁/g, " "))
    .replace(STRAY_MARKER, "")
    .replace(/(?<=\S)[ \t]{2,}/g, " ")
    .trim();
}

// …and when that stray marker held the title, use it rather than falling back to
// the first "## " heading, which is how a lesson ended up titled "Mise en situation".
function titleFromStrayMarker(raw: string, keys: string[]): string {
  const known = new Set([...keys, "FIN"].map((k) => k.toUpperCase()));
  for (const m of raw.matchAll(/^[ \t]*<<<[ \t]*([^\n>]{3,120}?)[ \t]*>>>[ \t]*$/gm)) {
    const inner = m[1].trim();
    if (!known.has(inner.toUpperCase())) return inner;
  }
  return "";
}

// Fallback when the studio has no class in scope (admin's "tous les manuels"):
// infer "6e" vs "5e" from the slug. Wrong for books shared across levels, which
// is why callers pass the selected class's real level whenever they have one.
function levelFromSubject(subjectSlug: string): string {
  return /\b6|[-_]6/.test(subjectSlug) ? "6e" : "5e";
}

const SOURCE_CHARS = 4000;

// The book lesson the teacher says their lesson accompanies. Module-level context
// tells the model roughly where it is in the programme; THIS tells it what the
// lesson is actually about, which is the difference between a relevant draft and a
// plausible one about a neighbouring chapter.
async function renderSourceLesson(user: SessionUser, lessonId: string): Promise<string> {
  const lesson = await getViewableLesson(user, lessonId).catch(() => null);
  if (!lesson?.contentMd?.trim()) return "";
  const body = lesson.contentMd.length > SOURCE_CHARS ? lesson.contentMd.slice(0, SOURCE_CHARS) + "\n…(leçon tronquée)" : lesson.contentMd;
  return [
    `L'enseignant écrit un COMPLÉMENT à cette leçon du manuel : « ${lesson.title} ».`,
    "Reste sur CE sujet précis : reprends ses notations et son vocabulaire, et apporte ce qu'elle n'a pas (une situation concrète, un exemple de plus, une explication différente). Ne recopie pas la leçon.",
    "<<<LEÇON DU MANUEL",
    body,
    ">>>",
  ].join("\n");
}

async function lessonBase(
  user: SessionUser,
  input: { subjectSlug: string; moduleId?: string | null; classLevel?: string; sourceLessonId?: string | null },
  mode: StudioMode = "lesson",
): Promise<string> {
  const mc = await getModulesContentForAI(user, input.moduleId ? [input.moduleId] : []);
  const ctx: LessonAuthorCtx = {
    subject: input.subjectSlug,
    classLevel: input.classLevel || levelFromSubject(input.subjectSlug),
    moduleContext: renderModuleContext(mc),
  };
  const base = lessonAuthorSystemPrompt(ctx, mode);
  const source = input.sourceLessonId ? await renderSourceLesson(user, input.sourceLessonId) : "";
  return source ? `${base}\n\n${source}` : base;
}

// Which persona shape each action needs — a quiz request must not inherit
// "you write complete lessons", or the model writes a lesson instead.
const ACTION_MODE: Record<StudioAction, StudioMode> = {
  lesson_full: "lesson",
  improve: "lesson",
  quiz: "quiz",
  quiz_fix: "quiz",
  exercise: "exercise",
  latex: "latex",
};

export type StudioAction = "lesson_full" | "improve" | "quiz" | "quiz_fix" | "exercise" | "latex";


export interface StudioComposeInput {
  action: StudioAction;
  subjectSlug: string;
  moduleId?: string | null;
  classLevel?: string; // level of the class the studio is scoped to
  sourceLessonId?: string | null; // book lesson this one complements — grounds Copilot
  topic?: string;
  contentMd?: string;
  instruction?: string;
  tex?: string; // the formula the LaTeX editor is currently showing
  // quiz_fix — the single question to repair, and the auditor's complaint about it.
  question?: { type: string; q: string; opts: string[]; correct: number; expl?: string };
  problem?: string;
}

export type StudioQuestion =
  | { type: "MCQ"; promptMd: string; options: string[]; answer: number; explanationMd?: string }
  | { type: "TF"; promptMd: string; answer: boolean; explanationMd?: string }
  | { type: "SHORT"; promptMd: string; answer: string[]; explanationMd?: string };

export type StudioComposeResult =
  | { action: "lesson_full"; title: string; contentMd: string; warnings: string[] }
  | { action: "improve"; contentMd: string; warnings: string[] }
  | { action: "quiz"; questions: StudioQuestion[] }
  | { action: "quiz_fix"; questions: StudioQuestion[] }
  | { action: "exercise"; title: string; statementMd: string; solutionMd: string; warnings: string[] }
  | { action: "latex"; tex: string; note: string; warnings: string[] };

// Reminder appended to every task: the model must emit ONLY the delimited blocks.
// Note the wording: an earlier version said "écris chaque marqueur SEUL sur sa
// ligne" and the model dutifully printed the word "SEUL" above every block. Keep
// instructions describing the shape, never containing a word it might echo.
const BLOCK_RULES =
  "FORMAT DE RÉPONSE — respecte-le à la lettre :\n" +
  "- Chaque marqueur occupe une ligne entière, en majuscules, sans rien d'autre sur cette ligne.\n" +
  "- Entre les marqueurs, écris du markdown NORMAL : pas de JSON, pas de guillemets autour du texte, pas d'échappement. Écris les formules telles quelles : $\\Delta = b^2 - 4ac$.\n" +
  "- Remplace chaque texte entre parenthèses par ton contenu ; ne recopie jamais les parenthèses ni les exemples.\n" +
  "- N'ajoute aucun texte avant le premier marqueur ni après <<<FIN>>>.";

function composeTask(input: StudioComposeInput): { task: string; num_predict: number } {
  switch (input.action) {
    case "lesson_full":
      return {
        num_predict: 2000,
        task:
          `Rédige une leçon complète et autonome sur le thème : « ${(input.topic || "").slice(0, 300) || "(à toi de proposer un thème pertinent du niveau)"} ».\n` +
          "Suis l'APS : mise en situation réelle de RDC avec données chiffrées, puis notions pas à pas, un exemple résolu, et un résumé « ## À retenir ». Vise 350 à 600 mots.\n\n" +
          BLOCK_RULES +
          "\n\n<<<TITRE>>>\n(le titre de la leçon, une seule ligne)\n<<<CONTENU>>>\n(la leçon en markdown : sous-titres ##, $LaTeX$, **gras**, listes -)\n<<<FIN>>>",
      };
    case "improve": {
      const cur = (input.contentMd || "").slice(0, 6000);
      const instr = (input.instruction || "").trim().slice(0, 300) || "rends-la plus claire, mieux structurée et plus engageante";
      return {
        num_predict: 1600,
        task:
          `Améliore la leçon ci-dessous selon la consigne de l'enseignant : « ${instr} ».\n` +
          "Garde le sens et la structure générale, conserve le markdown (sous-titres ##, $LaTeX$, **gras**). Ne la raccourcis pas exagérément.\n" +
          `Leçon actuelle :\n<<<LEÇON ACTUELLE\n${cur}\n>>>\n\n` +
          BLOCK_RULES +
          "\n\n<<<CONTENU>>>\n(la leçon améliorée, en markdown)\n<<<FIN>>>",
      };
    }
    case "exercise":
      return {
        num_predict: 1200,
        task:
          `Rédige UN exercice d'entraînement original sur : « ${(input.topic || "").slice(0, 300) || "(une notion clé du module ci-dessus)"} ».\n` +
          "Ancre l'énoncé dans une situation concrète de RDC avec des données chiffrées réalistes. " +
          "Puis rédige la solution complète, étape par étape, comme un corrigé modèle (calculs en $LaTeX$, étapes numérotées).\n\n" +
          BLOCK_RULES +
          "\n\n<<<TITRE>>>\n(titre court, une ligne)\n<<<ENONCE>>>\n(l'énoncé en markdown)\n<<<SOLUTION>>>\n(le corrigé, étapes numérotées)\n<<<FIN>>>",
      };
    case "latex": {
      const cur = (input.tex || "").trim().slice(0, 2000);
      // Cut ONCE, at the limit the client also enforces. It used to be sliced to 1000
      // in the route and again to 500 here, so a teacher who pasted a lesson had the
      // actual question silently removed and the model was handed a page of headings
      // to "solve".
      const instr = (input.instruction || "").trim().slice(0, LATEX_INSTRUCTION_MAX);
      return {
        // Raised from 900: a step-by-step derivation plus an existing formula to
        // rewrite ran past it and came back cut off mid-expression, which KaTeX then
        // refused — a failure the teacher could do nothing with.
        num_predict: 1400,
        task:
          (cur
            ? `L'enseignant travaille sur cette formule :\n<<<FORMULE ACTUELLE\n${cur}\n>>>\n\nSa consigne : « ${instr} ».\n`
            : `L'enseignant part de zéro. Sa consigne : « ${instr} ».\n`) +
          "Écris la formule demandée en LaTeX affichable par KaTeX.\n\n" +
          BLOCK_RULES +
          "\n\n<<<LATEX>>>\n(la formule seule, sans $ autour, sans préambule)\n<<<NOTE>>>\n(une phrase en français expliquant ce que tu as changé — pas de LaTeX ici)\n<<<FIN>>>",
      };
    }
    case "quiz_fix": {
      const q = input.question;
      // Options as plain lines, not "1. …": numbering them invites the model to echo
      // the numbering back inside the OPTION values, which then shows up in the quiz.
      const opts = (q?.opts ?? []).map((o) => `OPTION: ${o || "(vide)"}`).join("\n");
      return {
        // gemma4:e2b likes to preface its answer; 500 tokens ran out before <<<FIN>>>
        // and the block parser got a truncated document.
        num_predict: 900,
        task:
          "Corrige la question de quiz défectueuse ci-dessous, en gardant le sujet et le niveau.\n" +
          `Défaut signalé : ${input.problem || "question invalide"}\n\n` +
          "Question actuelle :\n" +
          `TYPE: ${q?.type ?? "QCM"}\nENONCE: ${q?.q ?? "(vide)"}\n${opts}\n` +
          `REPONSE: ${(q?.correct ?? 0) + 1}\nEXPLICATION: ${q?.expl || "(aucune)"}\n\n` +
          "Règles : si deux propositions sont identiques, remplace UNE seule par un distracteur plausible et faux. " +
          "Si une proposition est vide, remplis-la. Si l'énoncé est vide, écris-en un cohérent avec les propositions. " +
          "Une seule bonne réponse. Termine par une explication d'une phrase.\n\n" +
          BLOCK_RULES +
          "\n\nRéponds UNIQUEMENT avec ce bloc, rien avant, rien après :\n" +
          "<<<QUESTION>>>\n" +
          "TYPE: (QCM, VF ou COURTE)\n" +
          "ENONCE: (la question)\n" +
          "OPTION: (une proposition ; répète cette ligne pour chaque proposition)\n" +
          "REPONSE: (le numéro de la bonne option ; pour COURTE, les réponses séparées par une barre verticale)\n" +
          "EXPLICATION: (une phrase)\n" +
          "<<<FIN>>>",
      };
    }
    case "quiz": {
      const cur = (input.contentMd || "").slice(0, 6000);
      return {
        num_predict: 1300,
        task:
          "À partir de la leçon ci-dessous, propose 4 à 6 questions de quiz variées qui vérifient la compréhension des notions clés.\n" +
          `Leçon :\n<<<LEÇON\n${cur}\n>>>\n\n` +
          BLOCK_RULES +
          "\n\nRépète le bloc ci-dessous une fois par question :\n" +
          "<<<QUESTION>>>\n" +
          "TYPE: (un seul mot, au choix : QCM, VF ou COURTE)\n" +
          "ENONCE: (la question)\n" +
          "OPTION: (une proposition ; répète cette ligne 3 à 4 fois, pour un QCM seulement)\n" +
          "REPONSE: (pour un QCM, le numéro de la bonne option ; pour VF, vrai ou faux ; pour COURTE, les réponses acceptées séparées par une barre verticale)\n" +
          "EXPLICATION: (une phrase)\n" +
          "<<<FIN>>>",
      };
    }
  }
}

// Coerce one parsed `<<<QUESTION>>>` block into a valid StudioQuestion, or drop it.
// REPONSE is 1-based for the model (natural to write); StudioQuestion.answer is a
// 0-based index, matching what the quiz builder expects.
function questionFromBlock(r: RawQuestion): StudioQuestion | null {
  const promptMd = clean(r.prompt).trim();
  if (!promptMd) return null;
  const explanationMd = clean(r.explanation).trim() || undefined;
  const type = r.type.toUpperCase();
  const ans = r.answer.trim();

  if (/^(VF|TF|VRAI)/.test(type)) {
    return { type: "TF", promptMd, answer: /^(vrai|true|v)\b/i.test(ans), explanationMd };
  }
  if (/^(COURTE|SHORT)/.test(type)) {
    const answer = ans.split("|").map((a) => clean(a).trim()).filter(Boolean);
    if (answer.length === 0) return null;
    return { type: "SHORT", promptMd, answer, explanationMd };
  }
  // The model habitually labels its own options ("A) …", "1. …") even though the
  // format does not ask for it. Strip the label, or it shows up in the quiz UI and
  // breaks matching the answer back to an option.
  const options = r.options.map((o) => clean(o).trim().replace(/^([A-Fa-f]|\d{1,2})\s*[).:-]\s+/, "")).filter(Boolean);
  if (options.length < 2) return null;

  // …and having labelled them, it answers with the LETTER. Accept "B", "b)",
  // "Option B", a 1-based number, or the option text itself.
  let answer = -1;
  const letter = ans.match(/^\s*(?:option\s*)?([A-Fa-f])\s*[).:-]?\s*$/);
  if (letter) answer = letter[1].toUpperCase().charCodeAt(0) - 65;
  else {
    const n = parseInt(ans.replace(/[^0-9]/g, ""), 10);
    if (Number.isInteger(n)) answer = n - 1;
  }
  if (answer < 0 || answer >= options.length) {
    const stripped = ans.replace(/^([A-Fa-f]|\d{1,2})\s*[).:-]\s+/, "").trim().toLowerCase();
    const byText = options.findIndex((o) => o.toLowerCase() === stripped);
    answer = byText >= 0 ? byText : 0;
  }

  // A small model regularly repeats an option verbatim, which makes the question
  // unanswerable. Collapse duplicates, keeping the correct answer pointing at the
  // surviving copy.
  const seen = new Map<string, number>();
  const unique: string[] = [];
  let uniqueAnswer = 0;
  options.forEach((o, i) => {
    const key = o.toLowerCase();
    const at = seen.get(key);
    if (at !== undefined) {
      if (i === answer) uniqueAnswer = at;
      return;
    }
    seen.set(key, unique.length);
    if (i === answer) uniqueAnswer = unique.length;
    unique.push(o);
  });
  if (unique.length < 2) return null;
  return { type: "MCQ", promptMd, options: unique, answer: uniqueAnswer, explanationMd };
}

// Same coercion for the JSON fallback shape (a model that ignored the block format).
function cleanQuestion(raw: unknown): StudioQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const promptMd = clean(o.promptMd).trim();
  if (!promptMd) return null;
  const type = String(o.type || "").toUpperCase();
  const explanationMd = clean(o.explanationMd).trim() || undefined;
  if (type === "TF") {
    return { type: "TF", promptMd, answer: o.answer === true || o.answer === "true", explanationMd };
  }
  if (type === "SHORT") {
    const arr = Array.isArray(o.answer) ? o.answer : typeof o.answer === "string" ? [o.answer] : [];
    const answer = arr.map((a) => clean(a).trim()).filter(Boolean);
    if (answer.length === 0) return null;
    return { type: "SHORT", promptMd, answer, explanationMd };
  }
  // default MCQ
  const options = (Array.isArray(o.options) ? o.options : []).map((x) => clean(x).trim()).filter(Boolean);
  if (options.length < 2) return null;
  let answer = Number(o.answer);
  if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) answer = 0;
  return { type: "MCQ", promptMd, options, answer, explanationMd };
}

// Small models shout ("LES ÉQUATIONS DU SECOND DEGRÉ"); the lesson tree and the
// rendered page show that verbatim, so soften all-caps back to sentence case.
function sentenceCase(s: string): string {
  return s && s === s.toLocaleUpperCase("fr") && /\p{Lu}{4,}/u.test(s) ? s.charAt(0) + s.slice(1).toLocaleLowerCase("fr") : s;
}

function tidyTitle(t: string): string {
  return sentenceCase(t.trim().replace(/^["'«»\s]+|["'«»\s]+$/g, ""));
}

// Same treatment for "## MISE EN SITUATION" headings inside the lesson body.
function tidyHeadings(md: string): string {
  return md.replace(/^(#{1,6})[ \t]+(.+)$/gm, (_, hashes, text) => `${hashes} ${sentenceCase(text.trim())}`);
}

// The APS section names are not lesson titles. When the model omits <<<TITRE>>>,
// falling back to the first heading produced lessons called "Mise en situation".
const SECTION_HEADINGS = /^(mise en situation|situation|introduction|objectifs?|notions? cl[ée]s?|d[ée]finitions?|exemples?( r[ée]solus?)?|exercices?|à retenir|a retenir|r[ée]sum[ée]|conclusion)$/i;

// Turn one raw model response into a result, or null so the caller retries.
// Reads the named sections first; if the model ignored the format entirely it may
// still have produced JSON, so we fall back to the old shape rather than lose the
// work — and for single-section actions, to treating the whole reply as the content.
function buildResult(action: StudioAction, raw: string, input: StudioComposeInput): StudioComposeResult | null {
  const KEYS: Record<StudioAction, string[]> = {
    lesson_full: ["TITRE", "CONTENU"],
    improve: ["CONTENU"],
    exercise: ["TITRE", "ENONCE", "SOLUTION"],
    quiz: ["QUESTION"],
    quiz_fix: ["QUESTION"],
    latex: ["LATEX", "NOTE"],
  };
  const blocks = parseBlocks(raw, KEYS[action]);
  const json = (Object.keys(blocks).length === 0 ? extractJson(raw) : null) as Record<string, unknown> | null;
  const field = (block: string, jsonKey: string) => clean(blocks[block] ?? (json ? json[jsonKey] : ""));

  switch (action) {
    case "lesson_full": {
      // No CONTENU marker at all → the reply IS the lesson (minus a title line).
      const contentMd = tidyHeadings(field("CONTENU", "contentMd") || (json ? "" : clean(raw).replace(/^#\s.*\n+/, "")));
      if (!contentMd.trim()) return null;
      // The teacher's own topic beats a guess from the body — it is what they asked for.
      const heading = (contentMd.match(/^#{1,2}\s+(.+)$/m) || [, ""])[1] || "";
      const title =
        tidyTitle(field("TITRE", "title")) ||
        tidyTitle(titleFromStrayMarker(raw, KEYS[action])) ||
        tidyTitle(input.topic || "") ||
        (SECTION_HEADINGS.test(heading.trim()) ? "" : tidyTitle(heading));
      return { action, title: title.slice(0, 160) || "Nouvelle leçon", contentMd, warnings: lintLesson(contentMd) };
    }
    case "improve": {
      const contentMd = tidyHeadings(field("CONTENU", "contentMd") || (json ? "" : clean(raw)));
      if (!contentMd.trim()) return null;
      return { action, contentMd, warnings: lintLesson(contentMd) };
    }
    case "exercise": {
      const statementMd = field("ENONCE", "statement");
      if (!statementMd.trim()) return null;
      const solutionMd = field("SOLUTION", "solution");
      return {
        action,
        title: tidyTitle(field("TITRE", "title")).slice(0, 120) || "Exercice",
        statementMd,
        solutionMd,
        warnings: lintLesson(statementMd + "\n\n" + solutionMd).filter((w) => !w.startsWith("Pas de section")),
      };
    }
    case "latex": {
      // No CONTENU-style fallback to "the whole reply": for every other action a stray
      // sentence of French is cosmetic, but here it would be pasted into a formula and
      // KaTeX would reject the lot. A missing marker means retry, which costs one call
      // and leaves the teacher's own formula untouched.
      //
      // clean() strips stray <<<…>>> markers and gemma's ▁ marker, and runs repairLatex
      // — which is what unmangles a "\times" that arrived as "imes". cleanLatex then
      // removes the preamble the model adds when it thinks it is writing a .tex file.
      // Whether the result RENDERS is decided by studioCompose, which can retry with
      // the KaTeX error in hand.
      const tex = cleanLatex(clean(blocks.LATEX ?? "")).tex;
      if (!tex.trim()) return null;
      return { action, tex, note: clean(blocks.NOTE ?? ""), warnings: [] };
    }
    case "quiz_fix":
    case "quiz": {
      const fromBlocks = parseQuestionBlocks(raw).map(questionFromBlock).filter(Boolean) as StudioQuestion[];
      const questions = fromBlocks.length
        ? fromBlocks
        : ((Array.isArray(json?.questions) ? json!.questions : []).map(cleanQuestion).filter(Boolean) as StudioQuestion[]);
      return questions.length ? { action, questions } : null;
    }
  }
}

export async function studioCompose(user: SessionUser, input: StudioComposeInput): Promise<StudioComposeResult | { error: string }> {
  // A formula rewrite does not need the module's lessons: knowing the subject is what
  // decides \mathrm{H_2O} versus $h$ for a height, and the rest is several thousand
  // tokens of context that slow every call down on a school server already running the
  // model on CPU. lessonBase also hits the database, which this path can skip entirely.
  const base =
    input.action === "latex"
      ? lessonAuthorSystemPrompt(
          { subject: input.subjectSlug || "mathématiques", classLevel: input.classLevel || levelFromSubject(input.subjectSlug), moduleContext: "" },
          "latex",
        )
      : await lessonBase(user, input, ACTION_MODE[input.action]);
  const { task, num_predict } = composeTask(input);
  const prompt = `${base}\n\n---\nTÂCHE :\n${task}`;
  // Set when a latex attempt parsed but would not render; the next attempt is told
  // exactly what KaTeX refused, because a model asked to "fix the error" without being
  // shown its own output tends to answer with a different formula instead.
  let correction = "";
  // Which kind of failure the last attempt hit.
  //
  // These used to collapse into one message — "le modèle n'a pas répondu" — which was
  // simply false for most of them: the model HAD replied and been cut off mid-formula,
  // or replied something KaTeX refused. A teacher told the model said nothing has no
  // reason to suspect their prompt was too long, which is the actual fix.
  let latexFailure: "empty" | "truncated" | "unparsable" | "invalid" | "blank" | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    // Deliberately NOT { json: true }: these responses carry LaTeX, and JSON string
    // escaping is what used to destroy it (see repairLatex in ./ollama).
    const raw = await ollamaGenerate(correction ? `${prompt}\n\n---\n${correction}` : prompt, { num_predict });
    const built = buildResult(input.action, raw, input);
    if (built && built.action === "latex") {
      // The one place a "successful" generation can still be refused. A formula that
      // does not render must never reach the editor — that silent half-right output is
      // exactly what the drawing canvas did and why it was removed.
      const v = checkLatex(built.tex, true);
      if (v.ok && !v.blank) return { ...built, tex: v.tex, warnings: v.suspect ? [v.suspect] : [] };
      // "Renders to nothing" is its own failure. Asked for a 5×10 table, the model
      // answers with an empty \begin{array} — valid LaTeX, zero visible output, and a
      // teacher who reports that the button did nothing.
      if (v.blank) {
        console.warn(`[studio] latex: reply renders blank: ${JSON.stringify(built.tex.slice(0, 200))}`);
        latexFailure = "blank";
        correction = blankRetryPrompt(built.tex);
        continue;
      }
      console.warn(`[studio] latex: KaTeX refused the reply (${v.error}): ${JSON.stringify(built.tex.slice(0, 200))}`);
      latexFailure = "invalid";
      correction = retryPrompt(built.tex, v.error || "formule invalide");
      continue;
    }
    if (built) return built;

    // Name the failure while the raw reply is still in hand. A reply that never
    // reached its <<<FIN>>> marker was cut off by the token budget, not malformed —
    // and the cure for that is a shorter request, which is worth saying out loud.
    if (input.action === "latex") {
      const closed = /^\s*<<<\s*FIN\s*>>>\s*$/im.test(raw);
      latexFailure = !raw.trim() ? "empty" : !closed ? "truncated" : "unparsable";
      console.warn(`[studio] latex: ${latexFailure} reply (attempt ${attempt + 1}, ${raw.length} chars): ${JSON.stringify(raw.slice(0, 300))}`);
      continue;
    }
    // The school server is offline and has no error reporting; when the model
    // answers in a shape we cannot use, the head of the reply is the only clue.
    console.warn(`[studio] ${input.action}: unparsable reply (attempt ${attempt + 1}, ${raw.length} chars): ${JSON.stringify(raw.slice(0, 400))}`);
  }
  // Distinguish "the model would not produce renderable maths" from "the model did not
  // answer at all": the editor tells the teacher a different thing in each case.
  if (latexFailure) return { error: `LATEX_${latexFailure.toUpperCase()}` };
  return { error: "GEN_FAILED" };
}

// ───────────────────────────── Brainstorm chat ──────────────────────────────
export async function studioChatMessages(
  user: SessionUser,
  input: { subjectSlug: string; moduleId?: string | null; classLevel?: string; sourceLessonId?: string | null; message: string; history?: { role: string; content: string }[] },
): Promise<ChatMessage[]> {
  const base = await lessonBase(user, input);

  // Let the conversation reach the REST of the platform, not just the lesson in front
  // of the teacher. The student Copilot has always retrieved across the indexed corpus;
  // the teacher's chat grounded only on the current module, so it could not answer
  // "what have the pupils already seen about this?" — the question a teacher actually
  // asks while planning. Scoped to their own subject and class level, and it degrades
  // to silence rather than failing when Ollama or the index is unavailable.
  let recalled = "";
  try {
    const { retrieveChunks } = await import("./rag");
    const hits = await retrieveChunks(input.message, {
      k: 4,
      subjectSlugs: input.subjectSlug ? [input.subjectSlug] : undefined,
      classLevel: input.classLevel,
      excludeLessonId: input.sourceLessonId ?? undefined,
    });
    const useful = hits.filter((h) => h.score > 0.45);
    if (useful.length) {
      recalled =
        "\n\n---\nCE QUE LE MANUEL ET LES AUTRES LEÇONS DISENT DÉJÀ (cite-les si c'est utile, ne les recopie pas) :\n" +
        useful.map((h) => `• ${h.text.slice(0, 400)}`).join("\n");
    }
  } catch {
    /* index or model unavailable — the chat still works, just without recall */
  }

  const system =
    base +
    recalled +
    "\n\n---\nTu discutes avec l'enseignant pour faire émerger une leçon : angles d'approche, situation réelle de RDC, exemples, plan. Sois concret et bref. Tu peux proposer un plan ou un paragraphe que l'enseignant pourra insérer.";
  const msgs: ChatMessage[] = [{ role: "system", content: system }];
  for (const h of (input.history || []).slice(-6)) {
    msgs.push({ role: h.role === "assistant" ? "assistant" : "user", content: h.content });
  }
  msgs.push({ role: "user", content: input.message });
  return msgs;
}
