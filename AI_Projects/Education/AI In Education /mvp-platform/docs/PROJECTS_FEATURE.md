# Mwalimu — Projects ("Projets appliqués") Feature Design

> Capstone, real-world projects that students unlock **after completing several
> related modules**, work through **step by step** with the offline Copilot as a
> coach, then **submit to their teacher** for feedback and a grade. Fully offline
> (Jetson Orin Nano + Ollama gemma3n), French-first, built on the existing
> `Subject → Module → Lesson` model.

Status: design + core implementation. Author: Pascal Burume. Date: 2026-06-23.

---

## 1. Why

The platform today takes a student from *reading a lesson* → *taking a quiz* →
*practising textbook exercises in the Atelier*. What is missing is the final rung
of the learning ladder: **transfer** — applying a cluster of skills to an
authentic, open-ended, real-world situation. A student who has learned
*Statistiques*, *Probabilités* and *Analyse combinatoire* separately should be
asked to act as, say, a health worker in Bukavu who must analyse a small
vaccination dataset and recommend an action. That is what a *Projet appliqué* is.

Projects deliberately differ from quizzes and exercises:

- **Quiz** = checks recall of one lesson, auto-scored.
- **Exercise (Atelier)** = drills one technique, self-checked.
- **Project** = integrates *several modules* into one realistic case, produced
  over multiple guided steps, reviewed by a human teacher.

## 2. Design decisions (confirmed)

1. **Scope** — a project is a **capstone over several modules**. It declares a
   set of *prerequisite modules*; it unlocks for a student only once **all** of
   them are completed.
2. **Assessment** — **guided steps + teacher review**. The student drafts a
   response to each step inside the app, submits the whole project, and the
   teacher reads the submission on their dashboard and returns a grade (0–100)
   plus written feedback.
3. **AI role** — the Copilot is an **active step coach**: for the current step it
   asks guiding questions, reacts to the student's draft, and gives hints, but
   **never writes the deliverable or hands over the final answer** (same guardrail
   as the lesson tutor).
4. **Deliverable of this workstream** — this design document, then the **core
   implementation** (schema + migration + domain logic + student & teacher
   surfaces + Copilot coaching + seeded examples).

## 3. Concepts & vocabulary

| Term | Meaning | UI label (FR) |
|---|---|---|
| Project | A capstone case tied to a subject + class level | *Projet* |
| Prerequisite module | A `Module` that must be completed to unlock the project | *Module requis* |
| Step | One ordered guided milestone of a project | *Étape* |
| Submission | A student's working instance of a project (1 per student/project) | *Rendu* |
| Step answer | The student's draft response for one step | *Réponse d'étape* |
| Assignment | A teacher attaching a project to a class with a due date | *Devoir-projet* |

A project's lifecycle for a student:

```
LOCKED ──(all prereq modules completed)──▶ AVAILABLE
AVAILABLE ──(open & save first step)──▶ IN_PROGRESS
IN_PROGRESS ──(all steps done → submit)──▶ SUBMITTED
SUBMITTED ──(teacher grades)──▶ GRADED
SUBMITTED ──(teacher returns for revision)──▶ RETURNED ──(student edits, resubmit)──▶ SUBMITTED
```

## 4. Data model (Prisma additions)

Six new models. Enum-like fields stay `String` (SQLite has no enums), matching
the existing schema style.

```prisma
model Project {
  id            String   @id @default(cuid())
  subjectSlug   String              // mirrors Subject.slug
  classLevel    String              // "5e" | "6e"
  slug          String   @unique
  title         String
  scenarioMd    String              // the real-world case / context
  objectivesMd  String   @default("")  // skills practised (markdown bullets)
  deliverableMd String   @default("")  // what to hand in
  difficulty    String   @default("INTERMEDIATE") // INTRO | INTERMEDIATE | ADVANCED
  estMinutes    Int      @default(120)
  order         Int      @default(0)
  status        String   @default("PUBLISHED")    // DRAFT | PUBLISHED
  createdAt     DateTime @default(now())
  subject       Subject  @relation(fields: [subjectSlug], references: [slug], onDelete: Cascade)
  prereqs       ProjectPrereq[]
  steps         ProjectStep[]
  submissions   ProjectSubmission[]
  assignments   ProjectAssignment[]
}

model ProjectPrereq {           // which modules gate this project
  id        String  @id @default(cuid())
  projectId String
  moduleId  String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  module    Module  @relation(fields: [moduleId], references: [id], onDelete: Cascade)
  @@unique([projectId, moduleId])
}

model ProjectStep {
  id            String  @id @default(cuid())
  projectId     String
  order         Int     @default(0)
  title         String
  instructionMd String  @default("")  // what to do in this step
  hintMd        String  @default("")  // optional starter hint
  project       Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  answers       ProjectStepAnswer[]
}

model ProjectSubmission {       // one student's instance of a project
  id           String   @id @default(cuid())
  studentId    String
  projectId    String
  status       String   @default("IN_PROGRESS") // IN_PROGRESS|SUBMITTED|RETURNED|GRADED
  submittedAt  DateTime?
  grade        Int?                 // 0-100, teacher-set
  feedbackMd   String?              // teacher feedback
  reviewedById String?              // teacher User id (audit-style, no FK)
  reviewedAt   DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  student      User     @relation(fields: [studentId], references: [id], onDelete: Cascade)
  project      Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  answers      ProjectStepAnswer[]
  @@unique([studentId, projectId])
}

model ProjectStepAnswer {
  id           String   @id @default(cuid())
  submissionId String
  stepId       String
  responseMd   String   @default("")
  done         Boolean  @default(false)
  updatedAt    DateTime @updatedAt
  submission   ProjectSubmission @relation(fields: [submissionId], references: [id], onDelete: Cascade)
  step         ProjectStep       @relation(fields: [stepId], references: [id], onDelete: Cascade)
  @@unique([submissionId, stepId])
}

model ProjectAssignment {       // teacher attaches a project to a class
  id          String   @id @default(cuid())
  classId     String
  projectId   String
  dueDate     DateTime?
  createdById String?
  createdAt   DateTime @default(now())
  class       ClassGroup @relation(fields: [classId], references: [id], onDelete: Cascade)
  project     Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@unique([classId, projectId])
}
```

Back-relations added to existing models: `User.projectSubmissions`,
`Subject.projects`, `Module.projectPrereqs`, `ClassGroup.projectAssignments`.

### Why these shapes

- **`ProjectPrereq` as its own table** (not a JSON column) keeps unlock logic a
  simple join and lets the teacher dashboard show *"3 / 4 required modules done"*
  per student without parsing blobs.
- **`ProjectSubmission` is the per-student instance.** It is created lazily the
  first time a student opens an unlocked project (mirrors how `Progress` rows are
  created on demand). The `@@unique([studentId, projectId])` guarantees one.
- **`ProjectStepAnswer` separate from the step** so the same authored step is
  shared by every student while each student keeps a private draft + done flag.
- **No file uploads.** Offline classrooms on shared tablets make binary uploads
  fragile; deliverables are **markdown/text** the student types (tables, math in
  `$…$`, prose). A `FILE`-style step can be added later as a photo-of-notebook
  capture if hardware allows — out of scope for core.

## 5. Unlock logic

A module counts as **completed by a student** when *all* its `PUBLISHED` lessons
have a `Progress.status = COMPLETED` row for that student — the same definition
the dashboard already uses for the per-module ring (`doneCount === lessonCount`).

A project is **AVAILABLE** when *every* `ProjectPrereq.module` is completed. Until
then it is **LOCKED**, and the UI shows progress as *"modules requis : k / n"* so
the student sees exactly what to finish to unlock it. Subject access still honours
`accessibleSubjectSlugs(classId)` (a class only sees projects for subjects it
studies) and the project's `classLevel` must match the class level.

Teacher `ModuleLock` does **not** force-lock a project; it only affects lesson
access. (A locked module simply tends to stay un-completed, which keeps the
project locked anyway.)

## 6. Student experience

**`/projects` — hub.** Same shell as the Atelier: grouped by subject, each
project a card showing difficulty, estimated time, step count, and a status chip
(*Verrouillé k/n · Disponible · En cours p% · Rendu · Noté xx/100*). Locked cards
are non-navigable and explain which modules remain.

**`/projects/[id]` — workspace.** Three zones:

1. **Brief** — the real-world scenario, the objectives (what you'll practise),
   the final deliverable, and the list of required modules (all green when here).
2. **Stepper** — ordered steps down the side; the active step shows its
   instruction, an optional hint (revealed on demand), and a **textarea** for the
   student's `responseMd`. *Save* persists the draft; *Mark step done* flips the
   `done` flag. Autosave on blur so nothing is lost if the idle-logout fires.
3. **Copilot coach** — a side panel scoped to the **current step**. It receives
   the step instruction and the student's current draft and coaches Socratically.

When every step is `done`, a **Soumettre le projet** button appears →
`status = SUBMITTED`, `submittedAt = now`. After submission the workspace is
read-only and shows the teacher's grade + feedback once returned. If the teacher
sets `RETURNED`, the student can edit and resubmit.

## 7. Teacher experience

**`/teacher/projects`.** Two tabs:

- **Rendus à corriger** — submissions across the teacher's classes/subjects,
  newest first, filterable by class and status. Each row → a review drawer
  showing every step's instruction and the student's answer, with a grade field
  (0–100) and a feedback textarea. Submitting writes `grade`, `feedbackMd`,
  `reviewedById`, `reviewedAt`, sets `status = GRADED` (or `RETURNED`), and writes
  an `AuditLog` entry. Copilot policy and analytics are untouched.
- **Assigner** — attach a published project to a class with an optional due date
  (`ProjectAssignment`). Assignment is **advisory** (a due date + a nudge on the
  student hub); it does not override the prerequisite unlock.

Authoring of project *content* (scenario, steps) is **seed/bundle-driven** for
core, consistent with how lessons are authored by the content pipeline rather
than hand-typed in the Studio. A Studio authoring screen is a future increment
(§11).

## 8. Copilot coaching

Reuses the offline Ollama (`gemma3n:e4b`) stack. Two additions:

- `projectCoachSystemPrompt(project, step, draft)` in `src/lib/ollama.ts` — same
  bienveillant FR tutor persona, but framed around the **current step** of the
  project, given the scenario, the step instruction, and the student's current
  draft, with the hard rule *never write the deliverable; guide with questions
  and hints, one step at a time.*
- `POST /api/copilot/project` — mirrors `/api/copilot/message`: enforces the
  per-class/per-student **Copilot policy kill-switch**, the per-student rate
  limit, and `ollamaOnline()` fast-fail, then streams SSE deltas. For core the
  thread is **ephemeral** (history passed from the client) so the existing
  lesson-thread schema is untouched; persisting project threads is a documented
  follow-up.

The student lesson Copilot route is left exactly as-is.

## 9. Gamification

- **XP** — a **GRADED** project adds `grade` (0–100) to XP, plus a flat **150 XP**
  completion bonus on first submission. (Lesson XP stays 50/lesson; quiz XP stays
  best-score.) Computed in `buildStudentPath` so the dashboard ring/level already
  reflect it.
- **Badge** — new `projet-applique` badge ("Bâtisseur" / icon `hammer` or
  `rocket`) awarded on first project submission via the existing idempotent
  `awardBadge()`.

## 10. Offline / safety / privacy

- All new tables live in the same single-file SQLite DB; nothing leaves the
  device. Backups already cover the DB file.
- Copilot coaching is gated by the existing kill-switch and rate limiter; if the
  local model is down the panel degrades gracefully (same `OLLAMA_OFFLINE` path).
- Student answers are visible only to the student and the teachers assigned to
  that student's class + subject (enforced server-side via
  `accessibleSubjectSlugs` / teacher assignment checks).
- Idle-logout: autosave-on-blur + per-step save means a 15-min logout never loses
  more than the current keystrokes.

## 11. Out of scope for core (future increments)

1. **Studio authoring** of projects/steps by teachers (CRUD UI + `LessonVersion`
   style history).
2. **Persisted project Copilot threads** + surfacing project questions in teacher
   insights/topics.
3. **Peer / group projects** (multiple students on one submission).
4. **Photo-of-notebook** step type for handwritten work.
5. **Rubric-based scoring** (criteria breakdown) on top of the single 0–100 grade.
6. **Content-pipeline generation** of projects from modules (auto-draft scenario
   + steps with the refine scripts).

## 12. Rollout / commands

The Prisma engine bundled in `node_modules` is platform-specific, so run these on
the machine that hosts the platform (your Mac / the Jetson), not in a remote
sandbox:

```bash
cd mvp-platform
npx prisma migrate dev --name add_projects_feature   # creates + applies migration, regenerates client
npm run db:seed                                       # re-seeds incl. example projects  (or: npm run db:reset)
npm run dev                                           # predev regenerates client + content
```

Then sign in as a student in a class whose required modules are complete to see a
project unlock, and as `g.mukendi@mwalimu.school` (teacher) to review the rendu.

## 13. File map (what core adds)

```
prisma/schema.prisma                      (+6 models, +4 back-relations)
prisma/seed.ts                            (+ seedProjects(), + badge, + wipe entries)
src/lib/projects.ts                       (NEW — unlock, list, detail, save, submit, teacher review)
src/lib/ollama.ts                         (+ projectCoachSystemPrompt, + buildProjectMessages)
src/app/api/student/projects/route.ts     (NEW — list)
src/app/api/student/projects/[id]/route.ts(NEW — detail / open)
src/app/api/student/projects/[id]/step/route.ts   (NEW — save step answer)
src/app/api/student/projects/[id]/submit/route.ts (NEW — submit)
src/app/api/copilot/project/route.ts      (NEW — step coaching stream)
src/app/api/teacher/projects/route.ts     (NEW — submissions list)
src/app/api/teacher/projects/[id]/route.ts(NEW — get one + grade/return)
src/app/api/teacher/projects/assign/route.ts (NEW — assign to class)
src/app/projects/page.js                  (NEW — student hub)
src/app/projects/[id]/page.js             (NEW — workspace + coach)
src/app/projects/projects.css             (NEW)
src/app/teacher/projects/page.js          (NEW — review)
src/app/teacher/projects/projects.css     (NEW)
+ nav entry points on /student, /practice, /teacher
```
