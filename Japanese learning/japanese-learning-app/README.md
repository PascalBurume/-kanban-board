# Japanese Learning App

A Genki-aligned study app: grammar, vocabulary, kanji, verb conjugation, and
spaced-repetition review. Built with **Next.js (App Router) + TypeScript + Prisma**.

The content base is original and openly-licensed material — not textbook text.
See `scripts/open-data-pipeline.md` for how vocab/kanji are sourced.

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Set up the environment (SQLite, zero config)
cp .env.example .env

# 3. Create the database from the Prisma schema
npm run db:push

# 4. Seed it with the verb data + original grammar notes
npm run db:seed

# 5. Run the dev server
npm run dev
# open http://localhost:3000
```

Useful scripts:

| Script | What it does |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npm run db:push` | Sync the schema to the database (no migration files) |
| `npm run db:seed` | Populate courses, lessons, grammar (L1-3), and 66 verbs |
| `npm run db:studio` | Open Prisma Studio to browse the data |
| `npm run db:reset` | Wipe + re-create + re-seed the database |

## What's seeded

- **Courses:** Genki I (Lessons 1–12) and Genki II (Lessons 13–23)
- **Lessons:** 23 lesson shells (L1–5 have English labels; the rest are generic)
- **Grammar:** 17 original grammar points for Lessons 1–3, with example sentences
- **Verbs:** 66 verbs (33 Godan, 22 Ichidan, 11 irregular) with て-form,
  present-continuous, and request forms, plus conjugation rules
- **Demo user** for testing progress/SRS features

## Project structure

```
japanese-learning-app/
├── prisma/
│   ├── schema.prisma     # 20-model content schema (3 layers)
│   └── seed.ts           # idempotent seeding from src/data/*.json
├── src/
│   ├── app/              # Next.js App Router (landing page reads the DB)
│   ├── lib/db.ts         # Prisma client singleton
│   └── data/
│       ├── verbs.json    # 66 verbs (from the verb guide)
│       └── grammar.json  # original L1-3 grammar notes
└── scripts/
    └── open-data-pipeline.md   # JMdict / KANJIDIC2 import plan
```

## Schema layers

1. **Curriculum** — Course → Lesson → GrammarPoint / Vocabulary / Kanji /
   Dialogue / CultureNote / UsefulExpression / Exercise / ReadingPassage
2. **Verb engine** — Verb → VerbForm, plus ConjugationRule (grouped Godan /
   Ichidan / Irregular)
3. **Learner** — User, LessonProgress, SRSCard → ReviewLog, QuizResult

## Continuing in Claude Code

From a terminal:

```bash
cd "japanese-learning-app"
claude
```

Good first prompts to try:

- "Run the app, then build a `/lessons/[number]` page that lists a lesson's grammar points."
- "Implement an SM-2 spaced-repetition scheduler over the `SRSCard` model and add a `/review` page."
- "Write `scripts/import-jmdict.ts` following `scripts/open-data-pipeline.md` and wire it into an `npm run import:vocab` script."
- "Add the remaining grammar points for Lessons 4–23 in the same JSON format as `src/data/grammar.json`."

## AI features (OpenAI)

Four AI-powered pages, all using OpenAI via the Vercel AI SDK with streaming
output. Default model is `gpt-4o-mini` (overridable via `OPENAI_MODEL`).

| Route | Purpose |
|---|---|
| `/tutor` | Conversational practice; replies adapt to the JLPT level you pick (N5–N1). |
| `/write` | Paste Japanese text; get a corrected version plus issue-by-issue feedback. |
| `/generate` | Generate original example sentences for any grammar point or vocab item, at your level. |
| `/breakdown` | Paste a sentence; get word-by-word gloss, grammar notes, and translation. |

Setup:

```bash
# 1. Add your key to .env
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-4o-mini"   # optional

# 2. Run the app and visit any of the four routes above
npm run dev
```

Code layout:

```
src/
├── lib/ai/
│   ├── client.ts      # model factory + JLPT level type
│   ├── prompts.ts     # system prompts per feature
│   └── schemas.ts     # zod schemas for structured outputs
├── app/api/
│   ├── tutor/         # streamText  (chat)
│   ├── correct/       # streamObject (corrections)
│   ├── generate/      # streamObject (example sentences)
│   └── breakdown/     # streamObject (token analysis)
├── app/{tutor,write,generate,breakdown}/page.tsx
└── components/
    ├── AiNav.tsx      # shared top nav for the AI pages
    └── RubyText.tsx   # renders 漢字(かんじ) syntax as <ruby> furigana
```

## Switching to PostgreSQL for production

In `prisma/schema.prisma` change the datasource `provider` from `"sqlite"` to
`"postgresql"`, point `DATABASE_URL` at your Postgres instance, then run
`npm run db:push` (or set up real migrations with `prisma migrate dev`).
