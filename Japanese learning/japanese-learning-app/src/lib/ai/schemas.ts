import { z } from "zod";

export const correctionSchema = z.object({
  corrected: z.string().describe("Fully corrected Japanese text."),
  issues: z
    .array(
      z.object({
        span: z.string(),
        type: z.enum([
          "particle",
          "conjugation",
          "vocabulary",
          "politeness",
          "word_order",
          "kanji",
          "other",
        ]),
        explanation: z.string(),
        suggestion: z.string(),
      }),
    )
    .default([]),
  natural: z.string().optional(),
});

export const exampleSchema = z.object({
  jp: z.string(),
  romaji: z.string(),
  en: z.string(),
  note: z.string().optional(),
});

export const generationSchema = z.object({
  examples: z.array(exampleSchema).min(1).max(10),
});

export const breakdownSchema = z.object({
  tokens: z.array(
    z.object({
      surface: z.string(),
      reading: z.string(),
      pos: z.string(),
      gloss: z.string(),
    }),
  ),
  grammar: z.array(z.string()).default([]),
  translation: z.string(),
  literal: z.string().optional(),
});

export const kanjiExplainerSchema = z.object({
  mnemonic: z
    .string()
    .describe("A vivid, memorable story (1-3 sentences) tying the radicals or shape to the meaning."),
  etymology: z
    .string()
    .describe("Origin or historical evolution of the character in 1-2 sentences. Plain language; no Old-Chinese jargon."),
  compounds: z
    .array(
      z.object({
        kanji: z.string(),
        kana: z.string(),
        en: z.string(),
      }),
    )
    .min(1)
    .max(8),
  examples: z
    .array(
      z.object({
        jp: z
          .string()
          .describe("Short sentence using the kanji. Use furigana on kanji as 漢字(かんじ)."),
        en: z.string(),
      }),
    )
    .min(1)
    .max(4),
});

export const aiDeckCardSchema = z.object({
  kana: z.string(),
  kanji: z
    .string()
    .describe(
      "Kanji surface form. If the word is normally written in kana only, repeat the kana here.",
    ),
  english: z.string(),
  partOfSpeech: z.string().optional(),
  exampleJp: z
    .string()
    .optional()
    .describe("Short example sentence using the word."),
  exampleEn: z.string().optional(),
});

export const aiDeckSchema = z.object({
  cards: z.array(aiDeckCardSchema).min(1).max(20),
});

export type Correction = z.infer<typeof correctionSchema>;
export type Generation = z.infer<typeof generationSchema>;
export type Breakdown = z.infer<typeof breakdownSchema>;
export type KanjiExplainer = z.infer<typeof kanjiExplainerSchema>;
export type AiDeck = z.infer<typeof aiDeckSchema>;
export type AiDeckCard = z.infer<typeof aiDeckCardSchema>;
