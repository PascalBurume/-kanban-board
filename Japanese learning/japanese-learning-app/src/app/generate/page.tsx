"use client";

import { useState } from "react";
import { experimental_useObject as useObject } from "@ai-sdk/react";
import { AiNav } from "@/components/AiNav";
import { Card } from "@/components/ui/Card";
import { Chip, Pill } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { generationSchema } from "@/lib/ai/schemas";
import { JLPT_LEVELS, type JlptLevel } from "@/lib/ai/client";

const SUGGESTIONS = [
  "て-form for sequential actions",
  "the word 楽しい",
  "～ながら (doing two things at once)",
  "passive form",
  "casual versus polite な-adjectives",
];

export default function GeneratePage() {
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<JlptLevel>("N5");
  const [count, setCount] = useState(5);

  const { object, submit, isLoading, error, stop } = useObject({
    api: "/api/generate",
    schema: generationSchema,
  });

  const examples = (object?.examples ?? []).filter(
    (e): e is { jp: string; romaji: string; en: string; note?: string } =>
      !!e && !!e.jp,
  );

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-5xl px-6 pb-20 pt-6 md:px-8">
        <AiNav current="/generate" />

        <header className="mb-8">
          <div className="flex items-baseline gap-3">
            <span className="jp text-2xl text-accent">例文</span>
            <div className="eyebrow">EXAMPLE GENERATOR</div>
          </div>
          <h1 className="mt-1 font-serif text-3xl md:text-[34px]">
            Practice sentences, on demand.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-2">
            Pick a grammar point or vocabulary word, choose your level, and
            generate original example sentences with romaji and English.
          </p>
        </header>

        <Card tone="raised" className="mb-8">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (topic.trim()) submit({ topic, level, count });
            }}
            className="space-y-5"
          >
            <div>
              <label className="eyebrow mb-1.5 block" htmlFor="gen-topic">
                TOPIC
              </label>
              <Input
                id="gen-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. て-form for sequential actions, or the word 楽しい"
                autoFocus
              />
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="mono text-[10px] uppercase text-ink-3">
                  Try:
                </span>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setTopic(s)}
                    className="mono rounded-sm border border-ink-3/40 bg-paper px-2 py-0.5 text-[11px] text-ink-2 hover:border-accent hover:text-accent"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <div>
                <div className="eyebrow mb-1.5">LEVEL</div>
                <div className="flex flex-wrap gap-1">
                  {JLPT_LEVELS.map((l) => {
                    const active = l === level;
                    return (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setLevel(l)}
                        className={`mono rounded-sm border px-2.5 py-1 text-xs transition-colors ${
                          active
                            ? "border-accent bg-accent text-[#fff7ec]"
                            : "border-ink-3/60 bg-paper text-ink-2 hover:border-accent hover:text-accent"
                        }`}
                      >
                        {l}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="eyebrow mb-1.5">COUNT</div>
                <div className="inline-flex items-center rounded-md border border-ink-3/60 bg-paper">
                  <button
                    type="button"
                    aria-label="decrement"
                    onClick={() => setCount((n) => Math.max(1, n - 1))}
                    className="px-2.5 py-1 text-ink-2 hover:text-accent"
                  >
                    −
                  </button>
                  <span className="mono w-8 text-center text-sm tabular-nums">
                    {count}
                  </span>
                  <button
                    type="button"
                    aria-label="increment"
                    onClick={() => setCount((n) => Math.min(10, n + 1))}
                    className="px-2.5 py-1 text-ink-2 hover:text-accent"
                  >
                    +
                  </button>
                </div>
              </div>

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
                <Button type="submit" size="lg" disabled={!topic.trim()}>
                  Generate →
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

        {(examples.length > 0 || isLoading) && (
          <div className="mb-3 flex items-center gap-2">
            <div className="eyebrow">EXAMPLES</div>
            <Chip tone="accent">{level}</Chip>
            {isLoading && (
              <Pill className="mono">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                streaming…
              </Pill>
            )}
            {examples.length > 0 && (
              <span className="mono text-xs text-ink-3">
                {examples.length} sentence{examples.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        )}

        <ol className="space-y-3">
          {examples.map((ex, i) => (
            <li key={i}>
              <Card tone="paper" className="flex gap-4">
                <span className="mono shrink-0 select-none text-[11px] text-ink-3">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="jp text-lg leading-relaxed">{ex.jp}</p>
                  {ex.romaji && (
                    <p className="mono mt-1 text-[12px] text-ink-3">
                      {ex.romaji}
                    </p>
                  )}
                  <p className="mt-1.5 text-sm text-ink-2">{ex.en}</p>
                  {ex.note && (
                    <p className="mt-2 rounded-sm border-l-2 border-gold/60 bg-gold/5 px-3 py-1.5 text-xs italic text-ink-2">
                      {ex.note}
                    </p>
                  )}
                </div>
              </Card>
            </li>
          ))}

          {isLoading &&
            examples.length === 0 &&
            Array.from({ length: Math.min(count, 4) }).map((_, i) => (
              <li
                key={`s-${i}`}
                className="rounded-lg border border-ink-3/20 bg-paper-2 p-4"
              >
                <div className="h-6 w-3/4 animate-pulse rounded bg-ink-3/15" />
                <div className="mt-2 h-4 w-1/3 animate-pulse rounded bg-ink-3/15" />
                <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-ink-3/10" />
              </li>
            ))}
        </ol>

        {!isLoading && examples.length === 0 && !error && (
          <Card tone="panel" className="text-center">
            <div className="jp text-4xl text-ink-3">例</div>
            <p className="mt-2 text-sm text-ink-2">
              Pick a topic above and hit{" "}
              <span className="mono text-accent">Generate</span> to see original
              practice sentences.
            </p>
          </Card>
        )}
      </div>
    </main>
  );
}
