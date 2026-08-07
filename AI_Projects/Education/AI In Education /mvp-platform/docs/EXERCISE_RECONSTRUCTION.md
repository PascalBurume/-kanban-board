# Spec — Grounded, verified rebuild of book exercises

> **Status: spec, not yet built.** This proposes fixing how scanned-manual
> exercises are reconstructed so they stop drifting from the printed book.

## Problem

94% of book exercises (284 / 303) are `quality: "ocr"` — too garbled to use
raw — and [`scripts/refine-exercises.mjs`](../scripts/refine-exercises.mjs)
rebuilds them with a local LLM, always inventing a full worked solution too. The
model sees **only the garbled OCR snippet** (≤2500 chars) and **no book text**,
so it drifts. Documented failures found while reviewing real data:

| Ex | Book / chapter | Drift | Mode |
|----|----------------|-------|------|
| 31 | maths-5-sci · induction sum | Reconstructed a **completely different, false** identity; its own solution then says "il y a une erreur dans le texte original" | Hallucinated statement |
| 24 | chimie-6 · radioactivité | OCR truncated at q2 → **invented** a U-235 fission question with 2 near-identical options | Truncation → fabrication |
| 23 | chimie-6 · analyse quant. | q3 cut off → **completed the MCQ options**; **dropped the book's answer keys** | Truncation + lost answers |
| 21 | chimie-6 · tampon | `HCOONH₄` silently changed to `HCOONa`; volume "100 mL" possibly read "400 mL" | Silent substance/number change |
| 22 | chimie-6 · redox | "tétrathionate" (correct) → "tétrathioorate" (typo introduced) | Terminology regression |

Chemistry fares far better than maths (coherent statements), but ~2 of 4 chimie-6
exercises still contain fabricated content.

## Root causes (both fixable)

1. **Truncation.** [`build-exercises.mjs`](../scripts/build-exercises.mjs) caps
   each OCR block at ~13 lines / 1200 chars, cutting questions mid-way — the LLM
   then invents the rest (Ex 24, 23).
2. **No grounding.** `refine-exercises.mjs` never consults the real book text,
   even though [`grounding.json`](../public/content/grounding.json) already holds
   transcribed chapter text — used by the Copilot, not by exercise refinement.

## Coverage reality (drives sequencing)

Grounding only exists for some books; the biggest exercise pile has none:

| Book | OCR exercises | Grounding? |
|------|--------------:|:----------:|
| maths-6-scientifique | 153 | ❌ |
| maths-5-scientifique | 85 | ✅ (11 mod) |
| chimie-5 | 20 | ✅ (3 mod) |
| maths-6-litteraire | 16 | ❌ |
| physique-electricite | 19 | ✅ (1 mod) |
| maths-5-litteraire | 6 | ❌ |
| chimie-6 | 4 | ✅ (8 mod) |

So: the **truncation fix + guards** help *every* book; **grounding** helps only
the ✅ rows until more books are transcribed. The 153 maths-6-sci exercises need a
transcription before grounding can touch them.

## Proposed changes

### A. Un-truncate extraction — `build-exercises.mjs`
Capture the whole exercise block, not the first ~13 lines. Instead of a fixed
line/char cap, read from the "Exercices" cue to the next heading (`##`) or a
sane max (e.g. 6000 chars). Preserve answer-key markers (`Rép:`, `Réponse`).
Emit a `truncated: boolean` hint when the block hit the max.

### B. Ground the reconstruction — `refine-exercises.mjs`
For each exercise, look up its chapter text in `grounding.json` by
`book/module-<order>-<slug>` and inject a bounded excerpt into the prompt as
**reference book text**. Instruct the model to repair against it and to **prefer
the book's own numbers/terminology/answers** over guesses. When no grounding
exists for that module, fall back to today's behaviour but mark lower confidence
(see D). Reuse the retrieval approach the Copilot already uses over grounding
(see [`src/lib/ollama.ts`](../src/lib/ollama.ts) / the copilot message route).

### C. Fabrication & contradiction guards (post-generation, in `refine-exercises.mjs`)
Reject/flag before caching when the output:
- contains self-contradiction phrases ("il y a une erreur", "n'est pas vraie",
  "l'énoncé correct est") — the model admitting the statement is wrong (Ex 31);
- was built from a `truncated` block **and** added question parts absent from the
  OCR (likely fabrication — Ex 24/23);
- drops answer-key markers that were present in the raw OCR (Ex 23).
The existing `mathBalanced()` truncation guard stays.

### D. Fidelity score + provenance
Compute a cheap similarity between the reconstruction and (a) the raw OCR tokens
and (b) the grounding excerpt; bucket into `high | medium | low` confidence and
store it alongside `statement/solution` in `exercises-clean.json`. Surface it in
the drawer: today there is a single **"Reconstruit par l'IA"** banner
([`exercises/page.js`](../src/app/teacher/exercises/page.js)); upgrade it to
reflect confidence (e.g. low-confidence → stronger "à vérifier" styling), and
keep the `reconstructed` flag ([`src/lib/practice.ts`](../src/lib/practice.ts)).

### E. Solutions the book never had
The prompt forces a full solution even when the book had none. Options to decide:
keep auto-solving but label AI-authored solutions distinctly from book answers,
**or** only clean the statement and leave solutions to teachers (ties into
Exercise "Option B" — teacher-editable book exercises). Recommend: keep solving,
but never present an AI solution as the book's answer key, and drop it to
`medium` confidence by default.

## Non-goals
Re-transcribing maths-6-scientifique (needed before grounding helps its 153
exercises) — that's a separate content task. No schema change required:
`exercises-clean.json` gains `confidence`/`grounded` fields; the DB is untouched.

## Verification
1. **Targeted re-run** on the 5 documented failures (`REFINE_EX_BOOKS=chimie-6`
   plus maths-5-sci Ex 31) → confirm: Ex 31 no longer invents a different problem;
   Ex 24/23 no longer fabricate truncated parts (or are flagged `low`); Ex 21
   keeps `HCOONH₄`; Ex 22 keeps "tétrathionate".
2. **No regressions** on the 19 `clean` (structured) exercises — they must not be
   touched.
3. **Guard unit checks** for the contradiction/answer-key/truncation detectors.
4. **UI** — confidence styling renders in the teacher drawer; `npm run dev`,
   open a low-confidence exercise, confirm the stronger warning.
5. **Coverage log** — the run prints how many exercises were grounded vs
   fell back, so silent under-coverage is visible.

## Suggested order
B+A on grounded books first (chimie-5/6, maths-5-sci, physique) — highest fidelity
gain — then C+D guards/scoring across all books, then D's UI. E is a product call.
