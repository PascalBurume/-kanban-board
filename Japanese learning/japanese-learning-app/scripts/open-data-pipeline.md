# Open-data content pipeline

This app's content is built from **openly-licensed** sources plus your own original
material — never from copyrighted textbook text. This keeps the product shippable.

## Sources

| Content | Source | License | Use |
|---|---|---|---|
| Vocabulary | **JMdict** (jmdict-simplified releases as JSON) | Creative Commons BY-SA (EDRDG) | Populate `Vocabulary` (kana, kanji, english, partOfSpeech) |
| Kanji | **KANJIDIC2** | CC BY-SA (EDRDG) | Populate `Kanji` (character, onYomi, kunYomi, meaning, strokes) |
| Verbs | Your verb guide (already seeded) | Your material | `Verb` + `VerbForm` |
| Grammar | Your original notes (already seeded) | Your material | `GrammarPoint` + `ExampleSentence` |
| Lesson mapping | Community Genki word/kanji lists (CSV/Anki) | varies — check each | Tag each vocab/kanji row with its `lessonId` |

> Always keep the EDRDG attribution required by the JMdict/KANJIDIC2 licenses
> somewhere user-visible (e.g. an "About / Credits" screen).

## Suggested importer flow (build in Claude Code)

1. Download `jmdict-simplified` (English) and `kanjidic2` JSON.
2. Write `scripts/import-jmdict.ts` that streams entries and upserts `Vocabulary`
   rows (dedupe on kana+kanji). Tag `partOfSpeech` from the JMdict sense data.
3. Write `scripts/import-kanjidic.ts` to upsert `Kanji` rows.
4. Apply a **lesson map**: a small CSV `lesson,word` (or `lesson,kanji`) that
   assigns each entry to a Genki lesson number; set `lessonId` accordingly.
5. For verbs, link `Verb.vocabId` to the matching `Vocabulary` row by dictionary form.

## Why not the textbook PDFs?

Genki I & II are in-print commercial textbooks; reproducing their text (even
reformatted or reworded) isn't permissible and would be a liability in a shipped
product. The structure (lesson numbers, grammar-point topics) is factual and is
already encoded in the schema; the *content* should come from open data + your
own writing, which is exactly what this pipeline does.
