# Mwalimu — Product Requirements Document

| | |
|---|---|
| **Product** | Mwalimu — offline-first secondary-school learning platform for the DRC |
| **Version** | 1.0 |
| **Date** | 8 August 2026 |
| **Status** | Built and running. Pre-pilot. |
| **Author** | Pascal Burume |
| **Codebase** | `mvp-platform` (branch `react-doctor-fixes`) |
| **Companion docs** | [PILOT_SPEC.md](PILOT_SPEC.md) — deployment & hardware · [BUILD_LOG.md](BUILD_LOG.md) — delivery record · [TEACHER_FEATURES.md](TEACHER_FEATURES.md) · [PROJECTS_FEATURE.md](PROJECTS_FEATURE.md) · [SYNC_DESIGN.md](SYNC_DESIGN.md) |

> This document states what Mwalimu **is required to do** and why. Requirements are
> numbered (`FR-`, `NFR-`, `UX-`) so they can be tested, argued with, and cut.
> Everything marked ✅ is built and verified today; ◻ is specified but not built.

---

## 1. Problem

A Congolese secondary-school student has a textbook they may not own, a teacher
covering 60 students, and no reliable internet. A Congolese teacher has a printed
manual, a chalkboard, and no way to see who in the room is lost until the exam.

Three failures compound:

1. **The textbook is not available.** Copies are shared, photocopied, or absent. The
   printed maths and chemistry books that define the MEPST curriculum exist as
   physical objects in short supply.
2. **Feedback arrives too late to matter.** A teacher discovers a misconception weeks
   after it formed, at the interrogation, for the whole class at once.
3. **Every remedy assumes connectivity.** Every ed-tech product built for this problem
   assumes a data plan, a cloud API, and a per-seat subscription in USD. In a school
   with intermittent grid power, that is not a product — it is a demo.

The constraint is not "make it work offline as a feature". The constraint is that
**the building is the internet**. One machine in the school serves everything,
including the AI, and nothing leaves the premises.

---

## 2. Users

| Persona | Who | Device | What they need |
|---|---|---|---|
| **Student** (Amani, 16, 5e Scientifique) | Shares a tablet with two classmates. Reads French fluently, writes maths hesitantly. | Shared Android tablet or a lab laptop | The book, legibly, with the maths typeset; a way to practise; someone to ask at 21h when nobody is awake |
| **Teacher** (Grâce, teaches maths across two classes) | Prepares lessons by hand on paper. Not a markdown user. Has never opened a terminal. | School laptop; sometimes a tablet in class | To write a lesson the way she writes in Word; to see who is behind *before* the test; to give the same feedback once instead of thirty times |
| **Titulaire / Préfet (admin)** | Runs the school. Accountable for the curriculum. | Office desktop | Who teaches what; is the syllabus being covered; is the machine healthy; a backup that exists |

**Explicit non-user:** a parent portal, a ministry dashboard, a multi-school
administrator. Each implies a network between buildings. Out of scope (§5).

---

## 3. Product principles

These are the decisions that shaped everything else. When a requirement below
conflicts with a principle, the principle wins.

| # | Principle | What it forbids |
|---|---|---|
| **P1** | **Offline is the default state, not the failure state.** | Any feature whose unavailable path is an error page. Every AI surface must degrade to a usable non-AI surface. |
| **P2** | **The teacher's text is worth more than any feature.** | Silent data loss. A construct the editor cannot round-trip must open in source mode — never be dropped, never be mangled. |
| **P3** | **A control you cannot use is simply not there.** (`TabletChrome.js:19`) | Disabled buttons that will never enable; Copy/Paste on plain HTTP where `navigator.clipboard` is undefined. |
| **P4** | **The Copilot guides; it never answers.** | Any AI surface that will hand a student the solution to a quiz, exercise or project deliverable. |
| **P5** | **No data leaves the building.** | Telemetry, cloud APIs, crash reporting, CDN fonts, remote analytics. |
| **P6** | **One storage contract.** `Lesson.contentMd` is markdown, shared by the reader, the RAG index, the Copilot, exercises and every seeded book lesson. | Schema migrations to add a formatting feature. A second content format. |
| **P7** | **Say what is true.** Diagnostics name the real cause; refusals name what is missing. | "Something went wrong." Optimistic UI over an unconfirmed write. |

---

## 4. Goals

| # | Goal | Measure |
|---|---|---|
| G1 | A student can read the whole curriculum, typeset, on a shared tablet, with no internet | 9 books, 481 lessons, 0 network calls off-LAN ✅ |
| G2 | A student who is stuck gets help within seconds, at 21h, offline | Local Copilot answers grounded in the current lesson ✅ |
| G3 | A teacher can author a lesson without learning markdown | 95% of book lessons open in a visual word processor ✅ |
| G4 | A teacher sees who is behind before the exam | Class analytics, misconception clusters, feedback inbox ✅ |
| G5 | The school runs it on one machine, on grid power, with no IT staff | Single Next.js process + SQLite + Ollama; admin health panel ✅ |
| G6 | A pilot produces evidence, not anecdotes | §12 metrics, all already instrumented ✅ |

## 5. Non-goals (this release)

- **Cloud sync between schools.** Deliberate: the conflict-resolution design is
  parked in [SYNC_DESIGN.md](SYNC_DESIGN.md) so it is chosen rather than retrofitted.
- **A real LaTeX compiler (TikZ/PDF).** KaTeX only. Ollama already saturates the
  school server; a Tectonic path was scoped and cut.
- **Per-word font family and size.** A lesson is read on a phone, printed as a
  handout, and RAG-indexed. None of those care what the teacher composed in.
  Typography is a per-teacher document setting, not an inline mark.
- **A parent or ministry portal.** Implies a network between buildings.
- **Native mobile apps.** The PWA installs; an app store does not exist offline.

---

## 6. Functional requirements — Student

### 6.1 Access and identity

| # | Requirement | Status |
|---|---|---|
| FR-S1 | Login is **class + 4-digit PIN** (bcrypt-hashed) — designed for a device shared by three students, where an email address is a barrier | ✅ |
| FR-S2 | Only classes that have a *titulaire* appear in the login picker; unassigned classes stay admin-only | ✅ |
| FR-S3 | Idle auto-logout (15 min) and an 8-hour hard session cap, because the device is shared | ✅ |
| FR-S4 | A student may self-enrol with a class invite code; the account is real, not a demo | ✅ |
| FR-S5 | PIN reset without email: an offline "forgot" flow routed to staff | ✅ |

### 6.2 Reading

| # | Requirement | Status |
|---|---|---|
| FR-S10 | Lessons render markdown + **KaTeX maths** + **inline SVG figures**, light theme, print-clean | ✅ |
| FR-S11 | Figures are inline SVG, not images — crisp at any zoom, ~2 KB each, no HTTP round-trip | ✅ 423 figures |
| FR-S12 | Reading progress is recorded by heartbeat; a lesson can be marked complete | ✅ |
| FR-S13 | **"Reprendre"** resumes the lesson the student was *last actually working on* — not the first positional gap | ✅ |
| FR-S14 | Highlighting and fullscreen for reading on a small screen | ✅ |
| FR-S15 | A student can flag **« je n'ai pas compris »** with a 0–100 understanding rating; it routes to the right teacher | ✅ |

### 6.3 Practising

| # | Requirement | Status |
|---|---|---|
| FR-S20 | Auto-graded quizzes, LaTeX-capable in prompt, options and explanation | ✅ 346 / 1 030 questions |
| FR-S21 | **Atelier** per chapter: *S'exercer* (exercises) · *Simuler* (interactive sims) · *Illustrer* (concept cards) | ✅ 11 sims |
| FR-S22 | Textbook exercises reconstructed from the scanned manual, linked to the lesson they belong to | ✅ 276 |
| FR-S23 | Teacher-authored exercises appear alongside book ones with a « Prof » badge | ✅ |
| FR-S24 | **Projets appliqués** — multi-step APS capstones, individual **or group** (one shared submission per group), submitted to the teacher | ✅ |

### 6.4 The Copilot (student)

| # | Requirement | Status |
|---|---|---|
| FR-S30 | A streaming French tutor, grounded in the current lesson, running entirely on the school server | ✅ |
| FR-S31 | It knows **which tab and which exercise** the student is looking at | ✅ |
| FR-S32 | It retrieves relevant passages from other lessons via local RAG | ✅ 4 027 chunks |
| FR-S33 | **It never gives the answer** to a quiz, exercise or project deliverable — it guides step by step (P4) | ✅ |
| FR-S34 | A teacher can disable it per class (`CopilotPolicy`) | ✅ |
| FR-S35 | With Ollama stopped, the student sees a French "tutor offline" message and **everything else keeps working** (P1) | ✅ |
| FR-S36 | Semantic + keyword search across the whole corpus | ✅ |

---

## 7. Functional requirements — Teacher

### 7.1 Seeing the class

| # | Requirement | Status |
|---|---|---|
| FR-T1 | Dashboard: class cards with average progress, quiz average, Copilot usage, and an on-track / behind / inactive distribution bar | ✅ |
| FR-T2 | Class detail: per-student progress, last activity, completion | ✅ |
| FR-T3 | **Analyses Copilot**: AI-detected misconception themes ranked by severity, plus a Module → Leçon → real student questions drill-down | ✅ |
| FR-T4 | **Retours des élèves**: a feedback inbox grouped by lesson, filtered by class and subject, with an understanding meter | ✅ |
| FR-T5 | **Routing rule** — a teacher sees feedback only for subjects they teach in that student's class; the *titulaire* sees everything for their class | ✅ |
| FR-T6 | **Module locks** — modules are open by default; a teacher locks/unlocks per class to pace the year. Enforced even by direct URL | ✅ |

### 7.2 Authoring — « Rédiger une leçon »

> This is the largest single surface in the product and the one that decides whether
> teachers adopt it. Full specification in §8.

| # | Requirement | Status |
|---|---|---|
| FR-T10 | A teacher writes a lesson **without seeing markdown**, in a document that looks like the page the student will read | ✅ |
| FR-T11 | Word-level formatting: bold, italic, underline, strikethrough, subscript, superscript, colour, highlight, alignment, lists, indent, blockquote, case conversion, clear formatting | ✅ |
| FR-T12 | **Tables** — insert by grid picker, add/remove rows and columns, per-column alignment, with maths inside cells | ✅ |
| FR-T13 | **Maths** — inline and display formulas, a symbol palette, a 3-pane LaTeX editor with live KaTeX and Copilot, and a validation gate so nothing unrenderable reaches a lesson | ✅ |
| FR-T14 | **Figures** — 12 chart types and 8 geometry templates, each inserted as *editable data*, plus a 76-figure catalogue from the printed « Catalogue des figures scientifiques » | ✅ |
| FR-T15 | **Images** — insert a photo or scanned schema; shrunk in the browser before upload; resizable | ✅ |
| FR-T16 | **Find & replace** with a single undo step for Replace-all | ✅ |
| FR-T17 | Three modes: **Visuel · Markdown (source) · Côte à côte** | ✅ |
| FR-T18 | **Document outline** built from headings, click-to-scroll, toggleable from the title bar | ✅ |
| FR-T19 | **Problèmes du document** — an audit naming the real cause of each defect, not a generic warning (P7) | ✅ |
| FR-T20 | Autosave, offline draft recovery, version history, restore, publish / unpublish, « Vue élève » | ✅ |
| FR-T21 | Print / PDF with all chrome hidden | ✅ |
| FR-T22 | **Every command reachable on a 1024×768 tablet**, not only with a mouse | ✅ |
| FR-T23 | ◻ Task lists (`- [ ]`) still force source mode | ◻ deferred |
| FR-T24 | ◻ Format painter | ◻ deferred |

### 7.3 Authoring — Copilot APS

| # | Requirement | Status |
|---|---|---|
| FR-T30 | Draft a full APS lesson from a topic, grounded **strictly** in prerequisite modules the teacher selects | ✅ |
| FR-T31 | Improve a passage; generate a quiz from the lesson; propose an exercise | ✅ |
| FR-T32 | Streaming chat about the lesson being written | ✅ |
| FR-T33 | **Agent mode** with visible thinking steps (plan → write → verify) over SSE | ✅ |
| FR-T34 | Insertion happens **at the caret**, and never replaces a selected figure | ✅ |
| FR-T35 | The teacher always decides: nothing the AI produces is saved without an explicit action | ✅ |

### 7.4 Content organisation

| # | Requirement | Status |
|---|---|---|
| FR-T40 | **Personal library** — lessons that belong to the teacher, not yet attached to a module | ✅ |
| FR-T41 | **Connecteur canvas** — drag a library card onto a module to attach it, choosing the insertion position | ✅ |
| FR-T42 | Book content is **read-only** to teachers (`authorId == null` ⇒ admin-only); teachers add quizzes and *compléments* instead | ✅ |
| FR-T43 | **Compléments du prof** — a teacher's own lesson attached to a book lesson, shown to their students beneath the book content | ✅ |
| FR-T44 | **Exercices canvas** — author exercises, bundle textbook exercises, link them to modules or lessons | ✅ |
| FR-T45 | Subject tabs when a teacher holds several books in one class | ✅ |

### 7.5 Projects

| # | Requirement | Status |
|---|---|---|
| FR-T50 | Author and manage APS projects (full CRUD, scoped to the teacher's subjects) | ✅ |
| FR-T51 | Compose with AI from a real Congolese situation; live student-preview beside the form | ✅ |
| FR-T52 | Assign to a class, or to **named groups** via a drag canvas | ✅ |
| FR-T53 | **Readiness advisor** — is the class ready, and what deadline does prerequisite completion suggest | ✅ |
| FR-T54 | **Grading assistant** — per-step *réussi / manque / misconception*, a grade range, and a draft feedback note the teacher edits | ✅ |
| FR-T55 | Every agent has a **deterministic fallback** when Ollama is down, flagged `fallback: true` (P1) | ✅ |

---

## 8. Functional requirements — Administrator

| # | Requirement | Status |
|---|---|---|
| FR-A1 | Students: create, **bulk import**, reset PIN, archive | ✅ |
| FR-A2 | Teachers: create, approve (teacher self-signup → approvals queue), set **disciplines** | ✅ |
| FR-A3 | Classes: create, archive, invite codes | ✅ |
| FR-A4 | **Affectations** matrix (teacher × class) and a teacher-centric assignment editor over the same rows | ✅ |
| FR-A5 | **Titulaires** — exactly one lead per class, enforced (assigning demotes the previous lead, who keeps teaching) | ✅ |
| FR-A6 | **Contenu** — book / module / lesson CRUD with 409 guards where student progress exists | ✅ |
| FR-A7 | **Chapter import** — markdown or PDF, split into lessons by AI, with a degraded "sans IA" raw path when Ollama is down | ✅ |
| FR-A8 | **Liaisons** — the Book ↔ Class diagram (`Offering`), with a red warning when detaching would strip a class of its titulaire | ✅ |
| FR-A9 | **RAG re-index** with live progress | ✅ |
| FR-A10 | **Pédagogie** — teacher progression, per-module coverage, projects by teacher | ✅ |
| FR-A11 | **Audit log** of every sensitive action | ✅ |
| FR-A12 | **Santé** — Ollama status and loaded models, database size, disk free, last backup | ✅ |
| FR-A13 | One-click database backup to a local folder | ✅ |
| FR-A14 | An admin editing content keeps the **admin** shell — never gets dropped into the teacher navigation | ✅ |

---

## 9. The authoring system — detailed specification

The word processor is the part of the product with the most ways to silently destroy
work, so its requirements are stated as invariants rather than features.

### 9.1 The storage contract

**`Lesson.contentMd` is a plain markdown string.** It is read by the student renderer,
the RAG chunker, the Copilot's context builder, the exercise matcher, the search index,
and 481 seeded book lessons. It has **no schema version**, and adding a formatting
feature must never require a migration (P6).

### 9.2 The round-trip gate — the single most important invariant

| # | Requirement |
|---|---|
| **INV-1** | Before a lesson opens in the visual editor, `canEditVisually()` converts it **md → doc → md → doc** and compares. If the two documents differ, the visual editor **stays shut** and the teacher keeps a source textarea. |
| **INV-2** | The gate is never loosened to make a feature fit. It is only *taught* new constructs. |
| **INV-3** | A construct the editor cannot express means **"this lesson opens in source mode"** — never lost text (P2). |
| **INV-4** | Re-serialising must reach a **fixed point after one pass**, or autosave would rewrite the file forever and churn version history. |
| **INV-5** | A lesson may be refused only for a **named unsupported construct**. Refusal caused by serialiser drift is a defect, and the count must stay at **zero**. |

**Measured today, over the whole seeded corpus:**

| | |
|---|---|
| Lessons checked | 481 |
| Open in the visual editor | **457 (95.0 %)** |
| Serialiser drift | **0** |
| Reach a fixed point after one pass | **all** |
| Refused — malformed OCR pipe table | 15 |
| Refused — HTML outside the dialect | 9 |
| SVG-bearing lessons editable | 76 / 91 |

### 9.3 The dialect

Markdown for everything it can express; HTML only for what it cannot, from a **closed
whitelist, in exactly one canonical spelling**. Anything else is reported `unsupported`
and the lesson opens in source mode.

| Feature | Canonical form in `contentMd` |
|---|---|
| Table | GFM pipe table, header mandatory, alignment via `:--` / `:-:` / `--:`, `\|` escaped in cells |
| Image | `![alt](/api/uploads/…)`; resized → `<img src="…" alt="…" width="480">` on its own line |
| Underline | `<u>…</u>` |
| Colour | `<span style="color:#4f46e5">…</span>` — lowercase 6-digit hex, no spaces |
| Highlight | `<mark>` or `<mark style="background-color:#fef08a">` |
| Sub / sup | `<sub>` / `<sup>` |
| Alignment | `<div style="text-align:center">` · blank line · markdown · blank line · `</div>` |
| Figure / épure | preserved **verbatim** as a `rawHtml` atom |

Two decisions inside this table carry weight:

- **`<div>` and not `<p>` for alignment.** `<p style="…">Texte $x^2$</p>` on one line is a
  CommonMark *HTML block* — its content is not parsed as markdown, so the maths would
  render literally for the student. The `<div>` + blank-line form is the standard remark
  idiom and avoids invalid `<p><p>` nesting.
- **Mark serialisation order is fixed** (`link → span[color] → mark → u → sub|sup → ** →
  * → ~~ → code`). Applying marks in whatever order TipTap happened to store them makes
  bold+italic serialise non-deterministically, which surfaces as *intermittent, random-
  looking* gate failures.

This works with **zero student-renderer changes**, because `Markdown.js` already runs
`rehypeRaw` → `sanitizeHast` → `rehypeKatex`.

### 9.4 Épures as data

| # | Requirement |
|---|---|
| **INV-10** | A geometric figure is stored as an `EpureSpec` — **named points**, with every segment, circle, angle, arrow and label anchored *to those names*. Moving `A` moves everything attached to `A`. |
| **INV-11** | **One scale for both axes.** A separate x/y scale would turn a circle into an ellipse — a false statement in a geometry lesson, not a cosmetic bug. |
| **INV-12** | Rendering is pure: `EpureSpec → SVG string`, the same function on the server and in the editor. |
| **INV-13** | All **76 catalogue figures** are editable specs, verified **mark for mark** against the original hand-drawn SVG by a check that runs in CI. |

### 9.5 Images

| # | Requirement |
|---|---|
| FR-I1 | Shrink in the browser **before upload** — 1600 px long edge, JPEG q0.82, PNG kept on alpha. A 12 MP phone photo becomes ~250 KB before it touches the LAN. Without this, thirty teachers uploading classroom photos make the server unusable. |
| FR-I2 | Store on the filesystem **outside `public/`**, content-addressed: `uploads/lessons/<lessonId>/<sha256[0..16]>.<ext>`. Re-inserting the same picture costs one file; the URL caches forever. |
| FR-I3 | **Magic-byte sniffing**, not the declared MIME type. **`image/svg+xml` rejected outright** — an SVG served by our own route would bypass `sanitizeHast` entirely. |
| FR-I4 | 4 MB per file, 20 MB per lesson, 20 uploads per 5 minutes per user. Every refusal carries a French message naming the actual limit (P7). |
| FR-I5 | Serving requires an authenticated session (students must see images), with `path.normalize` containment, `immutable` caching and `nosniff`. |
| FR-I6 | **Offline**: the image is queued in IndexedDB and the node serialises as `![alt](mwalimu-pending:<key>)`. The queue drains at the head of the next save. |
| FR-I7 | **A pending image never blocks the save.** The teacher's text is worth more than the picture (P2). |
| FR-I8 | A lesson with pending images cannot be published. |

### 9.6 Version history

Every autosave used to write a `LessonVersion`, an `AuditLog` row **and** fire an Ollama
embedding call. Two lessons in the demo database had 140 and 76 versions from a handful
of sittings, and history churned out of usefulness within a minute of typing.

| # | Requirement |
|---|---|
| FR-V1 | A version means **a writing session**, not a keystroke: snapshot only if content changed, and then only on an explicit save/publish/restore, the first edit, a *different* editor than last time, or after 10 minutes |
| FR-V2 | A colleague's state is **never** coalesced away — a different editor always snapshots |
| FR-V3 | The audit row and the RAG re-index are gated on the same condition; publishing always re-indexes |
| FR-V4 | History keeps the newest 50 plus version 1 (the original book text) |

Effect: a one-hour writing session goes from **~1 000 rows to ~7**.

### 9.7 Deleting a lesson is reversible

Deleting used to be irreversible in the worst way: **ten relations cascade off `Lesson`**,
and one of them is `LessonVersion` — so the delete destroyed the lesson *and* the only
history that could have brought it back.

| # | Requirement | Status |
|---|---|---|
| FR-D1 | Everything the delete would destroy is captured into an archive **first, in the same transaction**. If the capture fails, the lesson stays — the only acceptable direction for this to fail in | ✅ |
| FR-D2 | The archive is **lossless**: the lesson, every version, the quiz and its questions, and the student rows — progress, quiz attempts, feedback, Copilot threads and messages | ✅ |
| FR-D3 | Lessons that would **cascade** through `companionOfId` are captured and restored with it. That silent second deletion was invisible before | ✅ |
| FR-D4 | `SessionLog` is `onDelete: SetNull`, so those rows survive orphaned and un-identifiable. The pairing is recorded at delete time and re-pointed on restore | ✅ |
| FR-D5 | **Undo on the delete toast**, live 10 s, restores the lesson *exactly* — status included. Most accidental deletes are noticed in seconds; this catches them without the teacher ever finding the bin | ✅ |
| FR-D6 | A **« Corbeille »** in the studio tree — collapsed, but its count is always visible, because a bin nobody knows exists is the same as no bin | ✅ |
| FR-D7 | A restore **from the bin** lands as a draft. Bringing an old lesson back must never silently re-expose it to a class | ✅ |
| FR-D8 | A restore says what actually happened — reattached or in the library, as a draft, with a new address — because a lesson that came back different is a different lesson | ✅ |
| FR-D9 | The archive is kept **forever**. Purging is a separate, explicit act, and the only irreversible step in the flow | ✅ |
| FR-D10 | `prune-uploads` walks the archive too. A binned lesson is restorable, so pruning its pictures would restore text with holes in it | ✅ |

**Why an archive and not a `deletedAt` tombstone:** there are ~54 lesson read sites
across 13 files, and Prisma query extensions do not intercept nested `include` — which
is exactly the shape `studioTree` uses. A tombstone would mean every one of those sites,
forever, remembering a filter, with a missed one putting a deleted lesson in front of
students. The row is still hard-deleted, so that failure mode does not exist: nothing
reaches a student because the row genuinely is not there. Structural, not disciplined —
the same property the round-trip gate relies on.

---

## 10. AI layer

| Function | Model (default) | Where it runs |
|---|---|---|
| Student Copilot, project coach, teacher Copilot APS, agents | `gemma4:e2b` (`OLLAMA_MODEL`) | School server, at runtime |
| RAG embeddings, semantic search | `nomic-embed-text` (`OLLAMA_EMBED_MODEL`) | School server, at runtime |
| Content refinement (textbook → clean lessons) | `gemma3n:e4b` | **Authoring workstation, before deployment** — never needed in school |

| # | Requirement | Status |
|---|---|---|
| NFR-AI1 | Generation is capped at **2 concurrent requests** in-process; further requests queue. This is the single most important performance parameter of the pilot | ✅ |
| NFR-AI2 | **Every** AI surface degrades gracefully: French 503, deterministic fallback, or a plain non-AI path. The platform stays fully usable with Ollama stopped (P1) | ✅ |
| NFR-AI3 | RAG chunks 1 000 chars / 200 overlap, in-process cosine, comfortable to ~50 000 chunks (corpus: 4 027) | ✅ |
| NFR-AI4 | SVG figure markup is stripped before embedding — path data must not pollute the vectors, and figcaption text is kept | ✅ |
| NFR-AI5 | Nothing generated reaches a lesson unchecked: the LaTeX gate re-validates with KaTeX and retries once with the error fed back | ✅ |
| NFR-AI6 | Agents stream **visible thinking steps** — a slow local model must show it is working, not appear hung | ✅ |

---

## 11. UI specification

### 11.1 Design system

| Token group | Rule |
|---|---|
| **Student surfaces** | Cool slate palette, indigo accent |
| **Teacher surfaces** | Warm "paper" theme scoped to `.teacher-page` — `--bg #f7f6f2`, sidebar `#f1efe8`, borders `#e7e4dc`. Keeps indigo and the semantic colours. **Never edit global `:root` to reskin the teacher area** |
| **Reader** | Light-only. Figures sit on white; `.prose-reader figure.ai-figure` is `width: fit-content; max-width: min(100%, 520px)` — a `viewBox`-only SVG otherwise inflates to the full column |
| **Type** | Lexend for chrome; the reading column is a document, not an app surface |
| **Icons** | One inline SVG set (`src/lib/icons.js`), `currentColor`, stroke 2 — geometry icons at 1.6 because they carry more lines in the same 24 px |

### 11.2 « Rédiger une leçon » — the Docs shell

```
.rd-page.teacher-page          fixed inset:0; flex column
├── header.rd-titlebar   56px  back · title · subject · status · offline pill ·
│                              save state · Historique · Vue élève · Publier · Copilot
├── nav.rd-menubar       32px  Fichier · Édition · Affichage · Insertion · Formule ·
│                              Format · Outils
└── div.rd-body          grid  columns: outline 240 | doc minmax(0,1fr) | rail 340
                               areas:  "tool    tool tool"
                                       "outline doc  rail"
                                       "status  status status"
```

| # | Requirement |
|---|---|
| UX-1 | The **toolbar and status bar span all three columns** via `createPortal` into hosts in the grid, while `LessonWriter` keeps owning the editor instance — so every command keeps its selection and its React context |
| UX-2 | The **right rail is Copilot** — the whole reason for the Docs layout rather than a centred single column. Resizable 280–560 px, collapsible, persisted. Tabs: Copilot · Problèmes · Quiz |
| UX-3 | The **left outline** is « Plan du document » from headings, with a `<details>` « Contexte » below holding the manual link, Copilot context and lint warnings. Toggleable from the title bar — because the close button was reachable and the reopen was not |
| UX-4 | **No Couper / Copier / Coller.** The school runs plain `http://`, so `navigator.clipboard` is undefined (P3) |
| UX-5 | **Zoom writes the document font size**, never a CSS `transform` — a transform breaks caret hit-testing on `contenteditable` in WebKit |
| UX-6 | Menus are fully keyboard-operable: arrows between and within, Home/End, first-letter jump, `Esc` returns focus to the document |
| UX-7 | Every insert menu entry carries **its own icon** — at menu size, two adjacent entries that look alike defeat the purpose of having icons at all |
| UX-8 | Modal pickers (symbols, figure catalogue) are **viewport-centred dialogs of the same size** — switching between them must not resize the window |

### 11.3 Responsive

| Width | Behaviour |
|---|---|
| ≥ 1440 | Outline 260, rail 360 |
| ≤ 1100 | Outline becomes a drawer |
| **≤ 1024 or `pointer: coarse`** | Both panes drawer; menu bar → one ☰ sheet; the editor switches to **`TabletChrome`** — a touch keyboard bar with ≥ 42 px rows, 44 px swatches, no drag handles |
| ≤ 900 | The page loses its desk margins |
| ≤ 820 / ≤ 600 | Shared header: language toggle hidden, offline pill collapses to a status dot, navigation goes icon-only |
| ≤ 860 (teacher/admin) | Sidebar becomes an off-canvas drawer with a scrim |
| print | All chrome hidden |

| # | Requirement |
|---|---|
| UX-10 | **Every command added to the ribbon must land in `TabletChrome` in the same change** — otherwise tablet users get a second-class editor, and the tablet is the device teachers actually carry into class |
| UX-11 | A CSS grid that sets only `grid-template-rows` gets a `max-content` implicit column and overflows a phone. Always set `grid-template-columns: minmax(0,1fr)` |
| UX-12 | A `@media` block must come **last** in its stylesheet, or later base rules silently override it |
| UX-13 | A full-viewport shell must be `position: fixed; inset: 0` — `height: 100vh` lets a clipped grid still inflate the page's scroll extent |

### 11.4 Writing and tone

- **French throughout**, including every error message, empty state and diagnostic.
- Diagnostics name the cause: « Une formule a été insérée à l'intérieur du bloc… »,
  not "Invalid content".
- Refusals name the limit: « Image trop lourde (4 Mo maximum). Réduisez-la avant de
  l'envoyer. »
- Empty states offer the next action, never just an illustration.

---

## 12. Non-functional requirements

### 12.1 Offline & resilience

| # | Requirement | Status |
|---|---|---|
| NFR-1 | No internet connection is required at any point during use, including AI | ✅ |
| NFR-2 | Installable PWA: network-first navigation, cache-first static assets | ✅ |
| NFR-3 | The editor writes to **IndexedDB every 1.5 s**; the network `PUT` is debounced 5 s with a 30 s cap on steady typing, flushed on `visibilitychange` (hidden), `pagehide` and explicit save | ✅ |
| NFR-4 | Server unreachable → amber banner, typing continues, retry restores; an unsent draft **offers** restoration and never auto-applies | ✅ |
| NFR-5 | `crypto.randomUUID()` is secure-context-only and the school is plain `http://` — key generation must not depend on it | ✅ |

### 12.2 Performance

| # | Requirement | Status |
|---|---|---|
| NFR-10 | The non-AI platform is instant on a 4-core CPU-only machine: SQLite + one Next.js process | ✅ |
| NFR-11 | Uploaded images shrink client-side; figures are inline SVG (~2 KB, no request) | ✅ |
| NFR-12 | Version snapshots and RAG re-indexing are gated, not per-keystroke (§9.6) | ✅ |
| NFR-13 | `next/dynamic({ ssr: false })` for the editor; exactly **one** copy of `@tiptap/core` — two copies is the classic breakage where schema identity checks fail and nodes silently vanish | ✅ |
| NFR-14 | ◻ `settings.lazyMath === "offscreen"` is declared but unimplemented — a 60-formula lesson runs KaTeX 60× on load | ◻ |

### 12.3 Security & privacy

| # | Requirement | Status |
|---|---|---|
| NFR-20 | **No telemetry, no cloud API, no student data transmitted anywhere** (P5) | ✅ |
| NFR-21 | Role middleware on every protected prefix; write paths return **404 rather than 403** when a teacher lacks rights, to avoid the client's logout-on-403 | ✅ |
| NFR-22 | Now that an editor writes HTML into student-visible content, `sanitizeHast` drops `script/style/iframe/object/embed/foreignObject/form/input/button/textarea/select/link/meta/base`, every `on*` handler, `srcdoc`/`formaction`/`ping`, and `javascript:` URLs | ✅ |
| NFR-23 | **Do not introduce `rehype-sanitize`** — its default schema strips both SVG and KaTeX output, which would erase all 423 figures and every formula | ✅ |
| NFR-24 | `<img src>` constrained to `/api/uploads/…`, `/content/…` or `data:image/*` | ✅ |
| NFR-25 | `SESSION_PASSWORD` must be a unique 32+ char secret; a production build refuses to boot with the development fallback | ✅ |
| NFR-26 | On a LAN over plain HTTP, `SESSION_SECURE=0` — otherwise the session cookie is never stored and login silently fails | ✅ |
| NFR-27 | Rate limits on every AI and upload route, with French 429 messages | ✅ |

### 12.4 Quality gates

| # | Requirement | Status |
|---|---|---|
| NFR-30 | **1 589 tests across 21 files**, all passing; `tsc --noEmit` clean | ✅ |
| NFR-31 | The **book-corpus test** runs the round-trip gate over every seeded lesson with a checked-in baseline — the only test that would catch "the editor still round-trips the examples, but a third of the corpus now opens in source mode" | ✅ |
| NFR-32 | A **property test** over the legal grammar asserts `docToMd(mdToDoc(md)) === md` and `canEditVisually(md).ok` | ✅ |
| NFR-33 | The 76 catalogue conversions are **re-verified mark for mark** on every run | ✅ |
| NFR-34 | `scripts/check-latex.mjs` audits every book with the renderer's own parser and **exits non-zero if anything regresses** | ✅ |

---

## 13. Content system

Content is built from textbook transcriptions at build time and seeded into the database.

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

Alongside: **346 quizzes / 1 030 questions**, **276 reconstructed textbook exercises**
(0 flagged, 0 incomplete, 0 KaTeX failures), **423 hand-authored inline SVG figures
across 91 lessons**, **4 027 RAG chunks**. Payload: ~13 MB static + ~25 MB seeded
database.

| # | Requirement | Status |
|---|---|---|
| FR-C1 | Lessons are **grounded in the real chapter text**, not generated from a title (`grounding.json`, PDF page = printed page + 10 for Maths 5) | ✅ |
| FR-C2 | Injection scripts are **committed and idempotent**, wired into `predev`/`prebuild`/`predb:seed` so figures survive every reseed | ✅ |
| FR-C3 | LaTeX is validated with **the renderer's own parser** (`remark-math` + KaTeX), not a regex — a regex validator reported 0 failures while the app showed 29 | ✅ |
| FR-C4 | Unrepairable maths degrades to readable Unicode (→, ₃, ²⁺) — never a red KaTeX error, never a raw `\macro` | ✅ |
| FR-C5 | **Never re-run content refinement over geometry** — it regenerates from OCR and strips the figures | ⚠ operational |
| FR-C6 | `Offering (level, field, subjectSlug)` is the single source of truth for which books a class studies. Student access resolves through it, so the admin view and the student view can never disagree | ✅ |

---

## 14. Success metrics for the pilot

| Question | Signal already collected |
|---|---|
| Do students come back? | `SessionLog`, streaks, weekly activity |
| Do they finish lessons? | `Progress`, completion rate per module |
| Does the tutor help or replace thinking? | `CopilotMessage` volume vs. quiz scores |
| Which lessons are unclear? | `LessonFeedback` per lesson |
| **Do teachers author content?** | Studio lessons / quizzes / exercises created — the adoption test for §9 |
| **Do they stay in the visual editor?** | Time in `visual` vs `source` mode; how often the gate refuses |
| Is the hardware adequate? | Admin health: Ollama latency, disk, DB growth |
| Does APS project work land? | `ProjectSubmission` grades and teacher feedback |

---

## 15. Risks & open questions

| # | Risk | Mitigation | Status |
|---|---|---|---|
| R1 | **Breaking the round-trip gate** damages teacher work silently | Serialiser changes land *before* the UI that emits them, so a defect shows as "won't open visually", never as damage; property test; book-corpus test | Held — 0 drift |
| R2 | **Breaking the 423 inline-SVG figures** | Never add `rehype-sanitize`; keep plugin order; grep the corpus before extending `DROP_TAGS`; snapshot-test figure-bearing lessons | Held |
| R3 | **AI throughput is unmeasured on target hardware** — the 2-concurrent cap and CPU-only inference are the binding constraints | **Benchmark before promising a classroom experience**: time-to-first-token and tokens/s for 1, 2 and 5 simultaneous students | ⚠ **Open** |
| R4 | **Tablet usability** — a menu bar is a mouse idiom, and the tablet is the device teachers carry | Every command mirrored in `TabletChrome`; ☰ sheet; 42 px rows | Needs real-device testing |
| R5 | **Single point of failure** — one server, one SQLite file | UPS + tested backups; there is no failover | Accepted for pilot |
| R6 | **Reseeding wipes teacher-created exercises and the RAG index** | A pilot content update needs a planned migration, not a blind reseed | ⚠ **Operational gap** |
| R7 | Chimie 6e grounding covers chapters I–IV of the source PDF only | Pending a full-book transcription | Open |
| R8 | 24 lessons (5 %) still open in source mode | 15 malformed OCR pipe tables, 9 HTML outside the dialect — both fixable in content, not in code | Known |

**Open questions**

1. What is the real time-to-first-token on the pilot machine? Everything about the
   classroom AI experience follows from this number, and it is the one number we do
   not have.
2. Does a teacher who has never used markdown actually finish a lesson in the visual
   editor without dropping to source? Instrument mode-switching in the pilot.
3. Is 10 minutes the right version-snapshot window for how teachers really write?

---

## Appendix A — System shape

```
Browser (PWA, LAN)
   │  http://<server-ip>:3000
   ▼
Next.js 14 App Router — 27 pages, 99 API routes, Node runtime
   ├── Prisma 5.22 → SQLite (single file, 42 models)
   ├── Ollama (localhost:11434) — generation + embeddings
   └── uploads/  (content-addressed images)   backups/  (admin snapshots)
```

**Stack:** Next.js 14.2.5 · React 18.3.1 · Prisma 5.22 / SQLite · iron-session +
bcryptjs · Tailwind 3.4 · TipTap 3.29 · KaTeX 0.16 · react-markdown 9 · remark-gfm /
remark-math / rehype-raw / rehype-katex · Vitest 4.

**Size:** 303 source files, ~50 000 lines, 22 build/content scripts.

## Appendix B — Glossary

| Term | Meaning |
|---|---|
| **APS** | *Approche Par les Situations* — the MEPST pedagogy: every lesson opens on a real situation |
| **Épure** | A geometric construction drawing (descriptive geometry) |
| **Titulaire** | The class's lead teacher, accountable for the whole class |
| **Atelier** | The per-chapter practice workspace: *S'exercer · Simuler · Illustrer* |
| **Manuel illustré** | Lessons generated directly from the scanned textbook, with its figures |
| **Complément** | A teacher's own lesson attached to a book lesson |
| **The gate** | `canEditVisually()` — the round-trip proof that decides visual vs source mode |
