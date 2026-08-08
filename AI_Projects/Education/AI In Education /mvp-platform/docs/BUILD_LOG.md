# Mwalimu — What we have built

**A delivery record: June → August 2026.**
Companion to [PRD.md](PRD.md) (what the product is required to do) and
[PILOT_SPEC.md](PILOT_SPEC.md) (what a school needs to run it).

Verified on 8 August 2026 against the running application, the seeded database and
the test suite. Every number below is measured, not estimated.

---

## Scoreboard

| | |
|---|---|
| Source | **303 files · ~50 000 lines** |
| Surface | **27 pages · 100 API routes · 42 Prisma models** |
| Content | **9 books · 91 modules · 481 seeded lessons · 346 quizzes / 1 030 questions · 276 reconstructed exercises** |
| Figures | **423 hand-authored inline SVG épures across 91 lessons** |
| RAG | **4 027 chunks**, local `nomic-embed-text` |
| Tests | **1 589 passing across 21 files** · `tsc --noEmit` clean |
| Editor coverage | **457 / 481 book lessons (95.0 %) open in the visual word processor · 0 serialiser drift** |
| Catalogue | **76 / 76 figures converted to editable data**, verified mark for mark |

---

## 1 · Foundations — June 2026

The platform's spine: Next.js 14 App Router (JS pages, TS lib and API), Prisma over a
single SQLite file, custom auth on iron-session + bcryptjs, Tailwind. Fully air-gapped
— a local Ollama is the only AI.

**Shipped**

- Three roles with real middleware: STUDENT (class + 4-digit PIN), TEACHER, ADMIN.
- Self-registration: teacher sign-up → an admin approvals queue; student self-enrol via
  a class invite code.
- Self-service password / PIN change and an offline "forgot" flow — no email server exists.
- The home route became a real entry that redirects to `/login`; the old hub was
  preserved at `/demo` rather than deleted.

**The headline piece — the content refinement pipeline.** `scripts/refine-content.mjs`
turns OCR'd textbook chapters into clean multi-lesson modules (objectives, worked
examples, a generated quiz per lesson), resumable by source hash, with a deterministic
fallback when the model fails. It runs on the *authoring workstation*, never in school.

**Bug fixed along the way:** `path.ts` returned `take: 1` lesson per module, so every
module appeared to contain exactly one lesson.

---

## 2 · Student experience — June–July 2026

**The three-tier flow.** Dashboard (modules grid with progress rings) → `/module/[id]`
detail (hero, lessons list, understanding rating) → the lesson reader (quiz in a modal,
"Dans cette leçon" table of contents).

**Atelier** — a per-chapter workspace with three tabs: *S'exercer* (exercises),
*Simuler* (11 interactive React+SVG simulations routed by a pure keyword matcher shared
between client and server), *Illustrer* (auto-advancing concept cards built from each
lesson's objectives and key notions).

**Module access model changed.** Sequential "finish the previous to unlock" gating was
replaced by: **everything is open by default; only a teacher locks**. A `ModuleLock` row
means locked, no row means unlocked. Enforced in the data layer, so a direct URL cannot
bypass it.

**Dashboard sidebar.** Weekly activity chart from real session buckets; a `streak-7`
badge that had been defined and seeded but **never actually awarded** was wired up; day
bucketing moved to school-local time (`SCHOOL_UTC_OFFSET_MIN`) so streaks stopped being
off by one.

**"Reprendre" was fixed to mean what it says.** It pointed at the first not-done lesson
in book order, so a student deep in a book was thrown back to an earlier untouched
lesson. It now resumes from the student's **last actual activity**: in-progress → that
lesson; completed → the next not-done lesson *after* it; brand new → the first. The same
fix was applied to the module page's "Continuer".

**Lesson feedback.** A student flags « je n'ai pas compris » with a 0–100 understanding
rating, which routes to the right teacher (§4).

---

## 3 · Teacher area — June–July 2026

**A warm "paper" theme** scoped to `.teacher-page` — the teacher's area reads as paper,
the student's as slate, and neither touches the other's tokens.

**A shared shell** (`TeacherShell`) with real nav badges fetched once from
`/api/teacher/badges`. The old hardcoded "14" pill and every "… version démo" toast were
removed — a demo affordance in a product a teacher is trusting is a lie.

**Seed data became narrative.** Students used to be assigned archetypes by `i % 4`
round-robin, which made every class identical at 34 %. A `CLASS_ROSTER` now gives each
student an explicit profile, so the three classes read as genuinely different (solid
~48 %, mid ~41 %, struggling ~25 %) and the dashboard's health bars mean something.

**Analyses Copilot** (`/teacher/insights`) — AI-detected misconception themes ranked by
severity, and a Module → Leçon → real-student-questions drill-down, built from the same
query that already existed (no extra database cost).

**Retours des élèves** (`/teacher/feedback`) with the routing rule the user chose: a
teacher sees feedback for subjects they teach in that student's class; the *titulaire*
sees everything for their class.

**Projects** — the full APS capstone workflow: author (CRUD scoped to the teacher's
subjects, with a live student preview beside the form), assign to a class **or to named
groups** via a drag canvas, and grade. Three AI assistants: compose, readiness advisor,
grading assistant — each with a deterministic fallback when Ollama is down, explicitly
flagged `fallback: true` rather than silently pretending.

**Exercices canvas** — author exercises, bundle book exercises, link them to modules or
lessons with bezier arrows; students see them with a « Prof » badge.

**Agentic Copilot** with visible thinking steps over SSE. A local model is slow; showing
the plan → retrieve → match → verify checklist is the difference between "working" and
"hung".

**Carnet de bord was built, then deliberately removed.** Curriculum progression turned
out to be an oversight concern, not a teacher tool, so it moved to an admin « Pédagogie »
tab. Recorded here because deleting a working feature for the right reason is a decision
worth keeping.

---

## 4 · Content — the books — July 2026

This is where most of the real value sits, and most of the difficult work.

**Grounding.** 19 modules were being *generated from a sub-topic title* — on-topic but
not from the book. A grounding pipeline now maps each module to its real chapter OCR
text (`grounding.json`). Maths chapters are sliced by **PDF page range** because the
chapter headers are OCR-garbled and page anchoring is the only reliable handle (PDF page
= printed page + 10). Grounding needs `gemma3n:e4b`; the 2B default returns thin output
on noisy maths OCR.

**Figures.** Lessons render inline SVG épures embedded directly in the markdown. The
enabling change was adding `rehype-raw` plus a **custom** `sanitizeHast` pass to the
reader — the off-the-shelf sanitiser strips both SVG and KaTeX, which would have erased
every figure and every formula.

| Book | Figures | How |
|---|---:|---|
| Géométrie descriptive — all 3 chapters | 62 | `inject-geo-figures.mjs` |
| Maîtriser les Maths 5 — all 22 chapters | 191 | `inject-maths5-figures.mjs` |
| Notions de Chimie 6 | 170 | `inject-chimie6-figures.mjs` |
| **Total** | **423** | committed, idempotent, wired into `predev` / `prebuild` / `predb:seed` |

Every injector is committed and idempotent and runs before every seed, so figures cannot
be lost to a reseed.

**Problems found and fixed in the content itself:**

- SVGs pretty-printed across blank lines ended the raw-HTML block early and leaked as
  escaped `<pre><code>` — every figure is now flattened to one line.
- Eight "Mantisses" figures were AI traces with **stray OCR text baked into the SVG**
  ("ue le nombre augmente de 1.") — replaced by a purpose-built generator.
- Chapter XII carried 44 lines of hallucinated JSON (`box_2d` blobs) in the source.
- A `![img-15]` placeholder pointed at a figure that does not exist in the printed book.
- Descriptive-geometry notation (`A^H`, `(ABC)_R^V`) sat as bare text — carets displayed
  literally and KaTeX never ran on ~257 tokens.
- Every `viewBox`-only figure inflated to the full column width; now `width: fit-content;
  max-width: min(100%, 520px)`, i.e. textbook size.

**The LaTeX lesson worth keeping.** A regex-based validator reported **0 failures while
the app displayed 29**, because `micromark`/`remark-math` pair `$$` differently than a
naive regex. The fix was to validate with **the renderer's own parser**. Generalised to
all nine books as `fix-content-latex.mjs`, with a read-only auditor
(`check-latex.mjs`) that exits non-zero on any regression. Result: **all 9 books, 0 KaTeX
failures, 0 prose LaTeX leaks.**

---

## 5 · Admin console & RAG — July 2026

- **Contenu** tab: book / module / lesson CRUD with 409 guards where student progress
  exists; chapter import from markdown or PDF with AI splitting, degrading to a "sans IA"
  raw path when Ollama is down.
- **Local RAG**: a `LessonChunk` model (Float32 embedding + content hash for
  incrementality), 1 000-char chunks with 200 overlap, in-process cosine retrieval,
  one-chunk-per-lesson diversity. SVG markup is stripped before embedding so path data
  cannot pollute the vectors.
- **The `Offering` model** fixed a real defect — a 6e class wired to the Maths 5 book.
  `(level, field, subjectSlug)` is now the single source of truth, and student access
  resolves through it, so the admin view and the student view can no longer disagree.
- **Titulaires** with a single-lead rule; **Liaisons**, a Book ↔ Class diagram that warns
  in red when detaching would strip a class of its titulaire.
- **Role-aware shell.** Admins editing content were being dropped into the *teacher*
  navigation. Fixed properly with one shared `AdminSidebar`, and the role is resolved
  **server-side** so the correct sidebar is in the first frame of SSR HTML rather than
  flashing.

---

## 6 · Mobile — July 2026

The app was built desktop-only; almost no `@media` rules existed.

**Root cause found:** the shared header's right cluster was a fixed non-wrapping row
~590 px wide, forcing a 375 px phone to ~787 px — horizontal scroll, everything clipped.

Fixed, CSS-only, on the student dashboard, the lesson reader, the module page and the
teacher shell (which becomes an off-canvas drawer with a scrim ≤ 860 px). A second root
cause surfaced: a CSS grid that sets only `grid-template-rows` gets a `max-content`
implicit column and overflows — `grid-template-columns: minmax(0,1fr)` is now the rule.

**Still desktop-only:** the admin console's dense tables and the teacher pages' data
tables.

---

## 7 · The LaTeX authoring stack — August 2026

The hand-drawn SVG drawing canvas (~2 100 lines) was **deleted**. It was not buggy — it
was structurally wrong: labels were a hand-rolled mini-LaTeX subset, shapes were dragged
rather than constructed, and the renderer degraded silently. For maths and physics, a
figure that is *approximately* right is a false statement.

Replaced by:

- **`LatexPanel`** — a 3-pane editor (Copilot | source | live KaTeX) that edits the
  *existing* `blockMath` node, so lessons stay `$$…$$` markdown. No new block type.
- **`latexCheck.ts`** — the gate. Nothing generated reaches a lesson unchecked; it
  retries once with the KaTeX error fed back, and `liveHints()` gives deterministic
  typing help that works with Ollama offline.
- **The 76-figure catalogue** from « Catalogue des figures scientifiques », searchable
  by code, title and keyword — and then **the figures themselves, drawn**: 76 hand-
  authored inline SVGs in the source's own colour conventions.
- **A plan → write → verify agent** over SSE.

**Deliberate constraint:** KaTeX only, no LaTeX compiler. Ollama already saturates the
school server.

---

## 8 · « Rédiger une leçon » → a real word processor — August 2026

The largest single piece of work. Mwalimu had three overlapping authoring surfaces, and
none of them was a word processor: a teacher who wanted a table, an image, a centred
title or coloured text got dropped into raw markdown.

**The shape:** a Google Docs shell — title bar, menu bar, toolbar, centred page on a
desk, **Copilot docked as a right rail** — with Word-level feature depth.

**The constraint that governed everything:** `Lesson.contentMd` stays plain markdown,
shared by the reader, the RAG index, the Copilot, exercises and 481 book lessons. **No
schema migration.** Word-only formatting is a closed whitelist of inline HTML with
exactly one canonical spelling each — which works with **zero student-renderer changes**.

### Phase 0 — the safety net (no visible change)

Landed *before* any UI that could emit the new constructs, so a defect would show as
"won't open visually" rather than as damage.

- **Fixed a latent bug:** mark wrapping was applied in whatever order TipTap happened to
  store the marks. With one mark that is fine; with bold+italic the output is
  non-deterministic. Without this fix, tables and colours would have produced
  intermittent gate failures that looked random.
- Escaped `<` and bare `&` in text — a teacher typing a literal `<b>` used to produce
  markdown that parsed back as HTML, so the editor silently dropped to source mode
  mid-sentence.
- Exported and hardened `sanitizeHast`; extended the drop list to
  `form/input/button/textarea/select/link/meta/base` (verified 0 hits across the corpus),
  stripped `srcdoc`/`formaction`/`ping`, constrained `<img src>`.
- **New `bookCorpus` test** — runs the gate over every seeded lesson. It is the only test
  that would catch "the examples still round-trip, but a third of the corpus now opens in
  source mode".

### Phase 1 — the shell

The three-column grid, with the **toolbar and status bar portalled** into hosts that span
all three columns while `LessonWriter` keeps owning the editor instance — so every
command keeps its selection and its React context. New: `DocMenuBar`, `ResizeGrip`,
`lessonOutline`, `lessonAudit`, `mdCaret`, and ~21 icons.

### Phase 2 — version churn

Every autosave wrote a `LessonVersion`, an `AuditLog` row **and** fired an Ollama
embedding call. Two demo lessons had 140 and 76 versions from a handful of sittings.
A pure, unit-tested `shouldSnapshot()` now means a version is *a writing session*:
**~1 000 rows per hour → ~7**. A colleague's state is never coalesced away.

### Phase 3 — marks, alignment, lists

Underline, colour, highlight, sub/sup, alignment — each with exactly one canonical
spelling, each mirrored into `TabletChrome` in the same change.

### Phase 4 — tables, find & replace, split view

GFM tables with per-column alignment and `\|` escaping; a ~120-line ProseMirror
find/replace plugin where Replace-all is a **single** undo step; the Atelier's source ⇄
render split view.

### Phase 5 — images and the rawHtml atom

`rawHtml` holds hand-drawn épures **verbatim** by slicing the original source — it is
deliberately not a parsed subtree, because re-serialising 423 hand-authored figures is
exactly the risk we refuse to take.

Images: browser-side shrink to 1600 px before upload, content-addressed storage outside
`public/`, magic-byte sniffing, **SVG rejected outright** (an SVG served by our own route
would bypass the sanitiser), 4 MB / 20 MB / 20-per-5-min limits, authenticated
`immutable` serving.

### Phase 6 — the offline image queue

IndexedDB v1→v2 with a `blobs` store (an additive upgrade never keyed on the old
version), pending images serialised as `mwalimu-pending:<key>`, drained at the head of
each save. **A pending image never blocks the save** — the text is worth more than the
picture. A lesson with pending images cannot be published.

### The épure editor

The catalogue figures were beautiful and completely dead: a teacher could insert one but
could not change a single number, letter or direction. So figures became **data**.

An `EpureSpec` is **named points** with everything anchored to them — move `A` and every
segment, circle, angle and label attached to `A` moves with it. **One scale for both
axes**, because a separate x/y scale turns a circle into an ellipse, and that is a false
statement in a geometry lesson rather than a cosmetic bug.

Then **all 76 catalogue figures were converted** by a script that parses the *rendered*
SVG and re-verifies every conversion mark for mark. It reported 8/76 for a while; the
cause was my own attribute regex `([a-zA-Z-]+)` skipping `x1`/`y1`/`x2`/`y2` — the class
has no digits — **in both the converter and the checker meant to catch it**. Fixed, then
unstroked circles and arrowhead colour matching: **76/76**.

### Result

| | Before | After |
|---|---:|---:|
| Book lessons that open visually | 73 % | **95.0 %** (457/481) |
| SVG-bearing lessons that open visually | 0 | **76 / 91** |
| Serialiser drift | — | **0** |
| Catalogue figures a teacher can edit | 0 | **76 / 76** |
| Tests | 1 230 | **1 579** |

---

## 9 · The corbeille — August 2026

Deleting a lesson was irreversible in the worst possible way. Ten relations cascade off
`Lesson`, and one of them is `LessonVersion` — so the delete destroyed the lesson **and**
the only history that could have restored it. The audit row kept the title and nothing
else. This was found the hard way: a real lesson was deleted during testing and had to be
recovered out of the SQLite file's free pages, because the newest backup was eight weeks
old.

**The design decision was to archive rather than tombstone.** A `deletedAt` flag would
mean ~54 lesson read sites across 13 files remembering a filter forever — and Prisma
query extensions do not intercept nested `include`, which is exactly the shape
`studioTree` uses. One miss puts a deleted lesson in front of students. Instead the row
is still hard-deleted, and everything it would destroy is captured first, in the same
transaction. No read path changes, so that failure mode cannot occur.

Restore is **lossless**: the lesson, every version, the quiz and questions, and the
student rows — progress, attempts, feedback, Copilot threads and messages. Two things the
old delete destroyed silently are now handled explicitly: lessons that cascade through
`companionOfId`, and the `SessionLog` rows that survive orphaned under `SetNull` and are
un-identifiable afterwards, so their pairing is recorded at delete time.

Three details that make it usable rather than merely correct:

- **Undo on the delete toast**, live 10 s, restoring the lesson *exactly* — status
  included. Most accidental deletes are noticed within seconds, so this catches nearly
  all of them without the teacher ever finding the bin.
- **A restore from the bin lands as a draft.** Days later, bringing a lesson back must
  not silently re-expose it to a class. Undo and bin-restore are different acts.
- **The restore toast says what actually happened** — reattached or in the library, as a
  draft, with a new address if a replacement took its slug. A lesson that came back
  different is a different lesson.

`prune-uploads.mjs` now walks the archive as well, for the reason its own header already
warned about: pruning a picture a restorable lesson still references brings back text
with a hole in it.

Verified end to end against the real database — twelve row types counted before, during
and after: **`LOSSLESS: true`**, bin emptied, content byte-identical, companion restored.

---

## 10 · Bugs found and fixed while testing this work

Recorded because each one is a class of defect, not a one-off.

| Symptom | Real cause |
|---|---|
| "Figures: 0" in the document statistics | The counter only knew ```figure fences; 423 hand-drawn `<figure><svg>` épures across 91 lessons read as zero. Newly *visible* only because the rawHtml work made those lessons open at all |
| Symbol palette crashed on open | `LessonWriter` mounted it without the insert callback |
| Symbol buttons did nothing in Markdown mode | Enabled but unimplemented — a silent no-op, the worst kind (P3) |
| Inserting an image **deleted the selected épure** | `insertContent` at a `NodeSelection` *replaces* the node. The guard test written for the fix then found the identical pre-existing bug in symbol insertion |
| `RangeError: Position 1898 outside of fragment` | `doc.nodeAt` **throws** past the end rather than returning null; the `!node` guard never covered it |
| "Maximum call stack size exceeded" | A local `addImage` and an imported one of the same name — the local called itself |
| Épure drag did nothing | `setPointerCapture` threw `NotFoundError` and aborted the handler *before* the move listeners attached |
| Converted figures rendered but would not drag | Segments still referenced raw coordinates after point names were recovered |
| Start screen showed stale data after an edit | `export const dynamic = "force-dynamic"` stops *Next* caching a route but sends **no cache headers**, so the browser heuristically re-serves it on back-navigation |
| Test failed ~2 runs in 3 | Not a flaky test: two images queued in the same millisecond shared a timestamp. Fixed with a monotonic stamp |
| Build broke on `next/headers` | A constant imported from a *server* module pulled `next/headers` into the client bundle |
| Two icons unreadable at menu size | Judged at 56 px: one read as a scribble, another was indistinguishable from its neighbour. Both redrawn |

---

## 11 · Deliberately not done

| | Why |
|---|---|
| Cloud sync between schools | The conflict-resolution design is parked in [SYNC_DESIGN.md](SYNC_DESIGN.md) so it gets chosen, not retrofitted after data loss |
| A real LaTeX compiler (TikZ / PDF) | Ollama already saturates the school server |
| Per-word font family and size | A lesson is read on a phone, printed, and RAG-indexed. Typography is a document setting |
| Cut / Copy / Paste menu items | `navigator.clipboard` is undefined on plain HTTP — the school's actual deployment (P3) |
| Table cell merging, column resizing | GFM has no colspan and no column widths; silently dropping a resize is exactly the loss this codebase refuses |
| Retiring Atelier LaTeX | Planned, then kept — teachers have bookmarks and its split view and agent mode work |
| Task lists (`- [ ]`), format painter | Deferred from Phase 3; `- [ ]` still forces source mode |
| `lazyMath: "offscreen"` | Declared in document settings, still unimplemented — a 60-formula lesson runs KaTeX 60× on load |

---

## 12 · How to verify any of this

```bash
npm test
```

```bash
npx tsc --noEmit
```

```bash
node scripts/check-latex.mjs
```

The dev server runs at `localhost:3000`. Seeded logins: teacher
`g.mukendi@mwalimu.school` / `teach1234`, admin `admin@mwalimu.school` / `admin1234`,
students PIN `1234`.

**Two operational cautions carried forward:**

1. **Never run `npm run build` while `next dev` is running** — it clobbers the dev
   `.next` chunks. Recover with `rm -rf .next` and a restart.
2. **`npm run db:seed` wipes teacher-created exercises and the RAG index**, and the
   running dev server keeps a stale in-memory Prisma client. Reseed → restart → re-index
   → re-login.
