# Mwalimu — Teacher-Side Features

A detailed breakdown of the teacher experience: the shell navigation, each page,
its API routes, and the data/AI libraries behind them.

---

## The teacher shell

Every teacher page renders through `TeacherShell`
(`src/components/ui/TeacherShell.js`) — a collapsible sidebar (off-canvas drawer
on phones), a sticky topbar with breadcrumb, a "Serveur local connecté" offline
pill, a language toggle, and a notification bell.

Two nav items carry **live count badges** pulled from `/api/teacher/badges`:

- **Retours** — open student feedback
- **Projets** — submissions to grade

Identity/role in the footer ("Mme Grâce Mukendi · Enseignante · [subject]") also
comes from that endpoint.

The seven sections:

---

## 1. Tableau de bord (Dashboard) — `/teacher`

Backed by `teacherOverview()` in `src/lib/teacher.ts`. It aggregates across every
class the teacher is assigned to:

- **KPI strip**: # classes, # students, average progress, students inactive 7+
  days, Copilot questions in the last 7 days.
- **"À faire aujourd'hui" queue**: students to re-engage, feedback to handle,
  submissions to grade.
- **Per-class cards**: progression %, average quiz, active-this-week count,
  Copilot volume, plus a health bar splitting students into
  **on-track / behind / inactive** with a colored alert (danger if anyone's
  inactive, warning if anyone's behind).
- **Watchlist**: the 6 most at-risk students with a human-readable reason
  ("Inactif 4 j", "Quiz moyen 48%", "Progression 22%").
- **Top Copilot themes** (by lesson) and a **7-day activity chart** (lessons
  completed, minutes, quiz attempts per day).

The student-risk logic is one function — `statusFor()`:

- **inactive** if no activity or > 7 days
- **behind** if progress < 30% or avg quiz < 55%
- **ok** otherwise

---

## 2. Mes classes (Class detail) — `/teacher/class`

Backed by `classDetail()`. Per class:

- **Student roster** with per-student metrics: progress %, lessons done, avg
  quiz, time spent, Copilot count, last-active, status.
- **Student drawer** (`studentDrawer()`) — a deep profile: per-subject progress
  breakdown, a timeline of recent lesson completions, their most-asked Copilot
  topics, and the understanding-feedback they've left.
- **Module locks**: teachers lock/unlock individual modules per class
  (`setModuleLock`). Default is unlocked — a lock is a row, unlock deletes it.
  Scoped so a teacher can only gate modules in the subjects they actually teach.
- **Copilot policy control**: a per-class master switch plus per-student
  overrides for the AI tutor (`setCopilotPolicy`). Flipping the class master
  clears per-student overrides. Every change is written to the audit log.

---

## 3. Retours (Feedback inbox) — `/teacher/feedback`

`teacherFeedbackInbox()` collects the "did you understand this lesson?" feedback
students leave. Sorting floats unresolved + low-understanding items to the top.

**Routing rule**: a subject teacher sees feedback only for lessons in the subject
they teach; the class *titulaire* (`isLead`) sees everything for that class.
Teachers mark items resolved (`resolveFeedback`), and the unresolved count is the
badge on the nav.

---

## 4. Analyses Copilot (Insights) — `/teacher/insights`

A fully **offline TF-IDF analysis** of every student Copilot question
(`src/lib/insights.ts`) — no LLM involved:

- **Misconception clusters**: tokenizes questions (French stopword list,
  diacritic-stripping), computes IDF over the corpus, assigns each question to
  its top TF-IDF term, and groups into themes with a representative label,
  keywords, question count, and affected-student count.
- **Top verbatim questions**.
- **Per-lesson confusion heatmap** (which lessons generate the most questions).
- **Module → lesson → question drill-down** so you can read exactly what
  students asked.
- **Usage-by-hour** histogram with peak hour.

---

## 5. Studio de contenu — `/teacher/studio`

The lesson authoring environment (`src/app/teacher/studio/StudioClient.js`):

- **Markdown editor** with **debounced autosave** (~2.5s after typing stops),
  versioning (toasts "Enregistré · v3"), and a **desktop/mobile preview toggle**.
- **Quiz builder** — editable on your own lessons *and* on book lessons (a
  `canQuiz` flag from the API), with LaTeX support via `QuizMathInput`.
- **Companion lessons** — author a lesson that complements an existing book
  lesson (`companionOfId`).
- **Copilot authoring (APS)** — an AI panel that generates lesson content,
  titles, and quiz questions, which you apply into the editor (replace or append
  modes). Backed by `/api/studio/ai` and the lesson companion/quiz routes.
- **Drag-to-connect module canvas** (`/api/studio/tree`, `/api/studio/connect`)
  and a **personal library** of lessons not tied to a module.

---

## 6. Exercices — `/teacher/exercises`

A canvas of exercises, mixing custom exercises and book exercises. Includes an
**AI "exercise advisor"** (`runExerciseAdvisor` in `src/lib/exerciseCopilot.ts`)
that takes a typed reference (custom vs. book exercise) and produces teaching
advice. The API validates the ref shape strictly before the agent ever sees it.

---

## 7. Projets — `/teacher/projects`

Project-based assignment and grading (`src/app/teacher/projects/page.js`):

- **Create/edit projects** with a markdown-toolbar description and ordered steps,
  assisted by a **Copilot compose panel**.
- **Assign** to a whole class (each student individually) or via **groups** on a
  shared canvas (one submission per group).
- **Review & grade** submissions — return for revision or grade, with a
  **Copilot-suggested grade range** you can one-click apply.

---

## The AI/agent layer (cross-cutting)

Three teacher **agents** run as SSE streams with visible "thinking" steps
(`/api/teacher/agent`, `src/lib/teacherAgent.ts`), rate-limited to 4/min:

- **Group composer** — builds balanced groups; deterministic fallback is a
  serpentine draft by progress so each group mixes strong and struggling
  students.
- **Grading agent** — assists scoring project submissions.
- **At-risk agent** — flags students needing intervention.

A key design principle throughout: **every agent degrades gracefully**. Unlike
the chat routes, the agents don't fail when Ollama (the local LLM) is offline —
they fall back to deterministic heuristics and flag the result as
`fallback: true`. This is what keeps the platform usable in an offline DRC-school
context.

---

## Key files reference

| Area | Files |
|------|-------|
| Shell / nav | `src/components/ui/TeacherShell.js` |
| Dashboard | `src/app/teacher/page.js`, `src/lib/teacher.ts` (`teacherOverview`) |
| Classes | `src/app/teacher/class/page.js`, `src/lib/teacher.ts` (`classDetail`, `studentDrawer`, `setModuleLock`, `setCopilotPolicy`) |
| Feedback | `src/app/teacher/feedback/page.js`, `src/lib/teacher.ts` (`teacherFeedbackInbox`, `resolveFeedback`) |
| Insights | `src/app/teacher/insights/page.js`, `src/lib/insights.ts` |
| Studio | `src/app/teacher/studio/StudioClient.js`, `src/lib/studio.ts`, `src/app/api/studio/*` |
| Exercises | `src/app/teacher/exercises/page.js`, `src/lib/exerciseCopilot.ts` |
| Projects | `src/app/teacher/projects/page.js`, `src/app/api/teacher/projects/*` |
| Agents | `src/app/api/teacher/agent/route.ts`, `src/lib/teacherAgent.ts` |
