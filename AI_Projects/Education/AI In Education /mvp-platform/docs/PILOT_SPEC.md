# Mwalimu — Pilot Specification

**Features, capabilities and hardware requirements**
Version: pilot draft — updated 8 August 2026
Scope: what is built and running today in `mvp-platform`, and what a school needs to run it.

> **Related:** [PRD.md](PRD.md) states what the product is *required* to do, and why.
> [BUILD_LOG.md](BUILD_LOG.md) records what has been built, when, with evidence.
> This document is the deployment view: what a school receives and what it must supply.

---

## 1. What Mwalimu is

An **offline-first secondary-school learning platform for the DRC**. It runs as a single
Next.js server on one machine inside the school, serving students and teachers over the
local network (LAN/Wi-Fi). No internet connection is required at any point during use —
including the AI tutor, which runs on a locally hosted language model via Ollama.

Everything is in **French**, aligned to the MEPST **Approche Par les Situations (APS)**,
and built on transcriptions of real Congolese textbooks.

**Architecture in one line:** Next.js 14 (App Router, Node runtime) → Prisma → SQLite
single file, plus a local Ollama server for the AI features; browsers connect over LAN and
cache the app as a PWA.

---

## 2. Content shipped with the pilot

Content is built from textbook sources at build time and seeded into the database.

| Subject | Modules | Lessons |
|---|---:|---:|
| Mathématiques — 5e (scientifique) | 22 | 169 |
| Chimie — 6e | 8 | 82 |
| Mathématiques — 6e (scientifique) | 17 | 72 |
| Mathématiques (littéraire) — 5e | 11 | 43 |
| Chimie — 5e | 10 | 41 |
| Mathématiques (littéraire) — 6e | 7 | 26 |
| Géométrie descriptive — 6e | 3 | 21 |
| Physique (électricité) | 4 | 18 |
| Révision EXETAT | 9 | 9 |
| **Total** | **91** | **481** |

Alongside the lessons:

- **344 quizzes / 1 025 questions** (auto-graded, LaTeX-capable).
- **276 reconstructed textbook exercises**, linked to the lessons they belong to and
  QA'd by `scripts/check-exercises.mjs` — **0 flagged, 0 incomplete, 0 KaTeX failures**.
- **423 hand-authored SVG figures / épures across 91 lessons**, rendered inline
  (descriptive geometry 62, Maths 5 191, Chimie 6 170) — no image files, so they stay
  crisp at any zoom and cost almost nothing to serve.
- **Full LaTeX/KaTeX maths rendering** throughout lessons, exercises and quizzes,
  audited by `scripts/check-latex.mjs` — currently **0 failures and 0 leaks across all
  nine books**.
- **4 027 RAG chunks** for semantic search and Copilot grounding (built after seeding).
- Content payload: ~13 MB static + ~25 MB seeded database (3.4 MB of lesson markdown).

Four seeded classes for the pilot: 5e Scientifique A, 5e Math-Physique A,
6e Scientifique A, 6e Math-Physique A.

---

## 3. Capabilities by role

### 3.1 Student

- **Login by class + 4-digit PIN** (bcrypt-hashed), designed for shared devices —
  automatic idle logout, 8-hour hard session cap.
- **Dashboard**: personal path, weekly activity chart, streak and badges, "Reprendre"
  which resumes the last lesson actually worked on.
- **Lesson reader**: markdown + LaTeX + inline figures, progress heartbeat, per-lesson
  completion, fullscreen and highlight tools.
- **Atelier tabs** per lesson: *S'exercer* (exercises), *Simuler*, *Illustrer*.
- **Quizzes** with attempts recorded and scored.
- **Practice mode** — spaced exercise practice across a module.
- **Projets appliqués**: multi-step APS capstone projects, individual or **group**
  (a group shares one submission), with step-by-step drafts and teacher feedback.
- **Copilot (AI tutor)**: streaming French tutor grounded in the current lesson,
  aware of which tab and which exercise the student is looking at, and pulling relevant
  passages from other lessons via local RAG. It is explicitly instructed **never to give
  the answer** to a quiz, exercise or project deliverable — it guides step by step.
- **Semantic + keyword search** across the whole textbook corpus.
- **Lesson feedback**: a student can flag "je n'ai pas compris" on any lesson, which is
  routed to the right teacher.
- **Offline PWA**: installable, service worker with network-first navigation and
  cache-first static assets, so a device that loses the Wi-Fi keeps working on what it
  already loaded.

### 3.2 Teacher

- **Dashboard** with class overview, teacher badges, and a warm dedicated theme.
- **Class detail**: per-student progress, last activity, completion.
- **Insights**: class-level analytics (progress distribution, weak modules, engagement).
- **Module locks**: modules are open by default; a teacher locks/unlocks per class to
  pace the year.
- **Carnet / Notebook**: module planner and project planner.
- **Feedback inbox**, scoped to the subject teacher plus the class *titulaire*.
- **« Rédiger une leçon » — a real word processor** (`/teacher/studio/rediger`). A
  Google Docs shell (title bar, menu bar, toolbar, centred page, **Copilot docked as a
  right rail**) with Word-level depth, so a teacher never has to see markdown:
  - bold, italic, underline, strikethrough, subscript, superscript, text colour,
    highlight, alignment, lists, indent, blockquote, case conversion, clear formatting;
  - **tables** by grid picker, with maths inside cells and per-column alignment;
  - **maths**: inline and display formulas, a symbol palette, and a 3-pane LaTeX editor
    with live KaTeX — nothing unrenderable can reach a lesson;
  - **figures**: 12 chart types and 8 geometry templates inserted as *editable data*
    (drag a point and the whole construction follows), plus a **76-figure catalogue**
    from « Catalogue des figures scientifiques », all 76 of them editable;
  - **images**: photo or scanned schema, shrunk in the browser before upload, resizable,
    and **queued offline** so a picture never blocks a save;
  - find & replace, document outline, print/PDF, and three modes —
    **Visuel · Markdown (source) · Côte à côte**;
  - every command is also reachable by touch on a 1024×768 tablet.

  **The safety property that matters:** before a lesson opens visually, the platform
  proves the round trip (markdown → document → markdown) is lossless *for that lesson*.
  If it cannot, the teacher keeps a source view — text is never silently mangled.
  Today **457 of the 481 seeded book lessons (95 %) open in the visual editor**; the
  remaining 24 are 15 malformed OCR tables and 9 fragments of unsupported HTML.
- **Studio de contenu** with subject tabs for multi-subject teachers:
  - autosave, version history and restore, device preview toggle;
  - a **personal library** (lessons that belong to the teacher, not a module) and
    **compléments** attached to a book lesson for the teacher's own students;
  - build quizzes, including LaTeX questions;
  - **Copilot APS** co-authoring: draft a lesson or a project from a real Congolese
    situation, grounded strictly in the prerequisite modules the teacher selects;
  - drag-to-connect module canvas.
- **Exercices canvas**: author exercises, bundle textbook exercises, link them to lessons.
- **Projects**: compose with AI, assign to a class or to groups, get an **AI readiness
  advisor** (is the class ready? suggested deadline based on prerequisite completion), and
  an **AI grading assistant** that returns per-step "what's good / what's missing /
  misconception", a grade range and a draft feedback note — the teacher always decides.
- **Agentic teacher Copilot** with streamed thinking steps (SSE).
- **Copilot policy**: per-class toggle to enable/disable the student AI tutor.

### 3.3 Administrator

- **Users**: create/import students (bulk import), reset PINs, manage teachers,
  assign disciplines, approvals, appoint class *titulaires* (single-lead rule).
- **Classes**: create, archive, invite codes, assignments.
- **Content administration**: book CRUD, markdown/PDF import with AI-assisted chapter
  splitting, subject/module/lesson tree, offerings (level + field → books), duplicate
  detection, and **RAG re-indexing**.
- **Pedagogy settings**, platform settings, **audit log** of every sensitive action.
- **System health**: Ollama online status and loaded models, database size, disk usage,
  last backup.
- **One-click database backup** to a local `backups/` folder.

---

## 4. The AI layer (all local)

| Function | Model (default) | Where it runs |
|---|---|---|
| Student Copilot tutor, project coach, teacher Copilot APS | `gemma4:e2b` (`OLLAMA_MODEL`) | School server, at runtime |
| RAG embeddings, semantic search | `nomic-embed-text` (`OLLAMA_EMBED_MODEL`) | School server, at runtime |
| Content refinement pipeline (textbook → clean lessons) | `gemma3n:e4b` | **Authoring workstation, before deployment** — not needed in school |

Notes that matter for sizing and for expectations:

- Generation is **capped at 2 concurrent requests** in-process (`MAX_CONCURRENT = 2` in
  `src/lib/ollama.ts`); further requests queue. This is the single most important
  performance parameter of the pilot.
- Every AI feature **degrades gracefully** when Ollama is absent: the platform stays fully
  usable (lessons, exercises, quizzes, projects, analytics) with the tutor simply offline.
- RAG chunks are 1 000 characters with 200 overlap; in-process cosine retrieval is fine to
  roughly 50 000 chunks — comfortably above the current corpus.
- No data leaves the building. There is no telemetry, no cloud API, no student data
  transmitted anywhere.

---

## 5. Hardware requirements

### 5.1 School server — the one machine that matters

The non-AI platform is extremely light (SQLite + a Next.js server). **All the hardware
demand comes from the language model.** Two viable pilot configurations:

**Tier A — single classroom, CPU-only (minimum viable)**

| | |
|---|---|
| CPU | 4 cores, modern x86-64 (Intel i5 / Ryzen 5, 2020 or later) with AVX2 |
| RAM | 16 GB (8 GB works without AI; the 2B model + Node + SQLite wants 16) |
| Storage | 256 GB SSD (NVMe or SATA — **not** an HDD) |
| GPU | none |
| OS | Ubuntu Server 22.04/24.04 LTS, or Windows 11 with Node + Ollama |
| Power | UPS strongly recommended (see §5.4) |

Suitable for ~30–45 students on one class at a time. Lessons, quizzes, exercises and
analytics are instant. The AI tutor will feel *slow but usable* — expect a first token in a
few seconds and a paragraph in tens of seconds, with two students served at a time and the
rest queued. **This must be measured on the actual pilot machine before promising a
classroom experience** (see §7).

**Tier B — school-wide, GPU-accelerated (recommended)**

| | |
|---|---|
| CPU | 8 cores (i7 / Ryzen 7 or Xeon equivalent) |
| RAM | 32 GB |
| Storage | 512 GB NVMe SSD |
| GPU | NVIDIA with ≥ 8 GB VRAM (RTX 3060 12 GB / RTX 4060 / A2000) |
| OS | Ubuntu Server 22.04/24.04 LTS + NVIDIA driver + CUDA runtime |

Suitable for 150–300 enrolled students, several classes concurrently, and comfortable
concurrent Copilot use. The GPU turns the tutor from "slow but usable" into conversational,
and is what makes it worth raising `MAX_CONCURRENT` above 2.

An Apple Silicon Mac mini (M2/M4, 16–24 GB unified memory) is a strong middle option:
Ollama uses the GPU natively, power draw is low, and it is silent and fanless-quiet — but
it is harder to service locally in-country.

**Disk budget** (per server):

| Item | Size |
|---|---|
| OS | 10–20 GB |
| Application + dependencies + build | ~0.6 GB |
| Seeded content + database | ~35 MB (grows with usage) |
| Ollama models (`gemma4:e2b` + `nomic-embed-text`) | ~2.5–3 GB |
| Backups, growth headroom, logs | 20 GB+ |
| **Practical minimum** | **128 GB — 256 GB recommended** |

### 5.2 Student and teacher devices

Anything with a modern browser. No installation, no app store.

- **Minimum**: Android 8+ tablet or phone, 2 GB RAM, Chrome 90+ — or any Windows/Linux
  laptop from the last decade, or a Chromebook.
- **Recommended**: 10" tablet or a low-cost laptop, 4 GB RAM, 1280×720 or better. The
  interface is responsive; the student dashboard is phone-friendly, and remaining pages
  are being made so.
- Devices are **shared-friendly by design**: PIN login, idle auto-logout, no personal data
  stored on the device beyond the offline cache.
- Storage on device: a few tens of MB for the PWA cache.

### 5.3 Network

- A **local Wi-Fi network only** — no internet uplink required.
- One decent dual-band access point (Wi-Fi 5/6) per classroom; a single AP handles ~30–40
  concurrent students on this workload (mostly small HTML/JSON, plus token streams).
- Server on a **static LAN IP**, reachable at `http://<server-ip>:3000` (or port 80 behind
  a reverse proxy).
- Because LAN deployments run over plain HTTP, set `SESSION_SECURE=0` — otherwise the
  session cookie is never stored and login silently fails.
- `SESSION_PASSWORD` **must** be a unique 32+ character secret; a production build refuses
  to boot with the development fallback.

### 5.4 Power and environment

- **UPS (≥ 650 VA)** on the server: SQLite plus an abrupt power cut is the most plausible
  way to lose pilot data. This is the single cheapest reliability investment.
- Solar/battery backup for the AP if grid power is intermittent.
- Keep the server ventilated and dust-protected; a GPU machine under sustained inference
  runs hot.

### 5.5 Indicative bill of materials, one pilot school

| Item | Qty | Note |
|---|---:|---|
| Server (Tier A mini-PC or Tier B tower) | 1 | The decision that sets AI responsiveness |
| UPS | 1 | Non-negotiable |
| Wi-Fi access point | 1 per classroom | Dual-band |
| Student devices | per class | Tablets or laptops, BYOD acceptable |
| External backup drive | 1 | Rotate the `backups/` folder off-machine |

---

## 6. Operating model

- **Deployment**: build the content pipeline and the app on an authoring workstation, seed
  the database, pull the two Ollama models, copy to the school server, run `next start`
  under a service manager (systemd) so it restarts on boot.
- **Content updates** are delivered as a new build + reseed — note that **reseeding wipes
  teacher-created exercises and the RAG index**, so a pilot content update needs a
  planned migration, not a blind reseed, and the RAG index must be rebuilt from the admin
  panel afterwards.
- **Backups**: admin-triggered database snapshot to `backups/`; copy that folder to an
  external drive on a schedule (weekly at minimum during the pilot).
- **Support**: the admin panel's health view (Ollama status, DB size, disk free, last
  backup) is the first-line diagnostic and needs no terminal access.

---

## 7. Known limits to state honestly in the pilot

1. **No cloud sync.** Each school runs an independent server; there is no multi-site
   synchronisation. The conflict-resolution design exists as a deliberate placeholder
   (`docs/SYNC_DESIGN.md`) but is not built. Anything edited on two devices at once is
   out of scope for the pilot.
2. **AI throughput is unmeasured on target hardware.** The 2-concurrent-generation cap and
   CPU-only inference are the binding constraints. Before committing to a classroom
   experience, benchmark on the real machine: measure time-to-first-token and tokens/second
   for `gemma4:e2b` with 1, 2 and 5 simultaneous students, then set expectations (or buy a
   GPU) from the measurement rather than from this document.
3. **The RAG index must be built after seeding.** It is empty in a fresh database; semantic
   search and Copilot grounding stay degraded until an admin runs the re-index.
4. **Content coverage is uneven.** Maths 5e is deep (169 lessons); Physique (18) and the
   EXETAT revision track (9) are thin. Chimie 6e grounding is pending a full-book
   transcription — only chapters I–IV are covered by the source PDF.
5. **Mobile responsiveness is partial.** Phone-ready: the student dashboard, the lesson
   reader, the module page and the teacher shell (its sidebar becomes a drawer). Still
   desktop-width: the admin console's dense tables and the teacher pages' data tables.
6. **Single point of failure.** One server, one SQLite file. UPS + tested backups are the
   mitigation; there is no failover.
7. **24 book lessons (5 %) open in the source view rather than the visual editor** — 15
   carry pipe tables the OCR left malformed, 9 carry HTML outside the supported dialect.
   Nothing is lost or unreadable; those teachers edit markdown for those lessons. Both
   causes are fixable in the content, not in the code.
8. **A content update is a migration, not a reseed.** `db:seed` rebuilds the demo dataset
   and cascade-deletes teacher-created exercises and the whole RAG index. There is no
   incremental content-update path yet, so any pilot content refresh must be planned and
   followed by a re-index from the admin panel.

---

## 8. What to measure during the pilot

| Question | Signal already collected |
|---|---|
| Do students come back? | `SessionLog`, streaks, weekly activity |
| Do they finish lessons? | `Progress`, completion rate per module |
| Does the tutor help or replace thinking? | `CopilotMessage` volume vs. quiz scores |
| Which lessons are unclear? | `LessonFeedback` ("je n'ai pas compris") per lesson |
| Do teachers author content? | Studio lessons/quizzes/exercises created |
| Do they stay in the visual editor? | Time in `visual` vs `source` mode; how often the round-trip gate refuses a lesson |
| Is the hardware adequate? | Admin health: Ollama latency, disk, DB growth |
| Does APS project work land? | `ProjectSubmission` grades and teacher feedback |
