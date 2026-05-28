"use client";

import { useState } from "react";
import { experimental_useObject as useObject } from "@ai-sdk/react";
import { AiNav } from "@/components/AiNav";
import { Card } from "@/components/ui/Card";
import { Chip, Pill } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { breakdownSchema } from "@/lib/ai/schemas";

const POS_TONE: Record<string, "accent" | "gold" | "indigo" | "moss" | "neutral"> = {
  noun: "indigo",
  verb: "accent",
  particle: "gold",
  adjective: "moss",
  adverb: "moss",
  pronoun: "indigo",
  conjunction: "neutral",
  auxiliary: "gold",
};

const SAMPLES = [
  "私は毎朝、コーヒーを飲みながら新聞を読みます。",
  "彼女は学校に行く前に朝ご飯を食べます。",
  "明日、雨が降るかもしれません。",
];

function posTone(pos: string | undefined | null) {
  if (!pos) return "neutral";
  const key = pos.toLowerCase().split(/[\s-]/)[0];
  return POS_TONE[key] ?? "neutral";
}

export function BreakdownClient() {
  const [sentence, setSentence] = useState("");
  const { object, submit, isLoading, error, stop } = useObject({
    api: "/api/breakdown",
    schema: breakdownSchema,
  });

  const tokens = (object?.tokens ?? [])
    .filter((t): t is NonNullable<typeof t> => !!t && !!t.surface)
    .map((t) => ({
      surface: t.surface as string,
      reading: t.reading ?? "",
      pos: t.pos ?? "",
      gloss: t.gloss ?? "",
    }));
  const grammar = (object?.grammar ?? []).filter(
    (g): g is string => typeof g === "string" && g.length > 0,
  );

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-5xl px-6 pb-20 pt-6 md:px-8">
        <AiNav current="/breakdown" />

        <header className="mb-8">
          <div className="flex items-baseline gap-3">
            <span className="jp text-2xl text-accent">分解</span>
            <div className="eyebrow">SENTENCE BREAKDOWN</div>
          </div>
          <h1 className="mt-1 font-serif text-3xl md:text-[34px]">
            Take any sentence apart.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-2">
            Paste a Japanese sentence and get a word-by-word gloss, the grammar
            patterns it uses, and a natural translation.
          </p>
        </header>

        <Card tone="raised" className="mb-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (sentence.trim()) submit({ sentence });
            }}
            className="space-y-4"
          >
            <div>
              <label className="eyebrow mb-1.5 block" htmlFor="bd-input">
                SENTENCE
              </label>
              <Input
                id="bd-input"
                value={sentence}
                onChange={(e) => setSentence(e.target.value)}
                placeholder="日本語の文を入力してください"
                className="jp"
                autoFocus
              />
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="mono text-[10px] uppercase text-ink-3">
                  Try:
                </span>
                {SAMPLES.map((s) => (
                  <button type="button"
                    key={s}
                    onClick={() => setSentence(s)}
                    className="jp rounded-sm border border-ink-3/40 bg-paper px-2 py-0.5 text-[11px] text-ink-2 hover:border-accent hover:text-accent"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              {isLoading ? (
                <Button
                  type="button"
                  size="lg"
                  variant="secondary"
                  onClick={() => stop()}
                >
                  ■ stop
                </Button>
              ) : (
                <Button type="submit" size="lg" disabled={!sentence.trim()}>
                  Break it down →
                </Button>
              )}
            </div>
          </form>
        </Card>

        {error && (
          <Card tone="paper" className="mb-4 border-accent">
            <p className="text-sm text-accent">{error.message}</p>
          </Card>
        )}

        {isLoading && tokens.length === 0 && (
          <Pill className="mono mb-4">
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-accent" />
            analyzing…
          </Pill>
        )}

        {object?.translation && (
          <Card tone="raised" className="mb-4 border-moss/50">
            <div className="eyebrow text-moss">TRANSLATION</div>
            <p className="mt-1 text-lg leading-relaxed">{object.translation}</p>
            {object.literal && (
              <p className="mt-1 text-xs italic text-ink-3">
                Literal: {object.literal}
              </p>
            )}
          </Card>
        )}

        {tokens.length > 0 && (
          <>
            <div className="mb-3 mt-6 flex items-center gap-2">
              <div className="eyebrow">TOKENS</div>
              <Chip tone="accent">{tokens.length}</Chip>
            </div>

            <Card tone="paper" padded={false} className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-paper-2">
                    <tr className="text-left">
                      <th className="eyebrow px-4 py-2 font-normal">SURFACE</th>
                      <th className="eyebrow px-4 py-2 font-normal">READING</th>
                      <th className="eyebrow px-4 py-2 font-normal">POS</th>
                      <th className="eyebrow px-4 py-2 font-normal">GLOSS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tokens.map((t, i) => (
                      <tr
                        key={i}
                        className="border-t border-ink-3/20 align-top"
                      >
                        <td className="jp px-4 py-2 text-[17px]">{t.surface}</td>
                        <td className="jp px-4 py-2 text-ink-2">{t.reading}</td>
                        <td className="px-4 py-2">
                          <Chip tone={posTone(t.pos)} className="capitalize">
                            {t.pos}
                          </Chip>
                        </td>
                        <td className="px-4 py-2 text-ink-2">{t.gloss}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {grammar.length > 0 && (
          <>
            <div className="mb-3 mt-6 flex items-center gap-2">
              <div className="eyebrow">GRAMMAR NOTES</div>
              <Chip tone="indigo">{grammar.length}</Chip>
            </div>
            <Card tone="raised">
              <ul className="space-y-2">
                {grammar.map((g, i) => (
                  <li key={i} className="flex gap-3 text-sm text-ink-2">
                    <span className="mono shrink-0 text-[11px] text-ink-3">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}

        {!isLoading && tokens.length === 0 && !error && (
          <Card tone="panel" className="text-center">
            <div className="jp text-4xl text-ink-3">分</div>
            <p className="mt-2 text-sm text-ink-2">
              Paste a sentence above and hit{" "}
              <span className="mono text-accent">Break it down</span>.
            </p>
          </Card>
        )}
      </div>
    </main>
  );
}
