"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { experimental_useObject as useObject } from "@ai-sdk/react";
import { AiNav } from "@/components/AiNav";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip, Pill } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { aiDeckSchema, type AiDeckCard } from "@/lib/ai/schemas";
import { JLPT_LEVELS, type JlptLevel } from "@/lib/ai/client";
import { commitAiDeck } from "./actions";

type CommitState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "done"; created: number }
  | { kind: "error"; message: string };

const SUGGESTIONS = [
  "food at a restaurant",
  "transitive / intransitive verb pairs",
  "weather and seasons",
  "office and work vocabulary",
  "travel & directions",
];

export default function DeckBuilderPage() {
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<JlptLevel>("N5");
  const [count, setCount] = useState(10);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [commit, setCommit] = useState<CommitState>({ kind: "idle" });

  const { object, submit, isLoading, error, stop } = useObject({
    api: "/api/generate-deck",
    schema: aiDeckSchema,
  });

  const candidates = useMemo<AiDeckCard[]>(() => {
    if (!object?.cards) return [];
    return object.cards.filter(
      (c): c is AiDeckCard =>
        !!c &&
        typeof c.kana === "string" &&
        c.kana.length > 0 &&
        typeof c.kanji === "string" &&
        c.kanji.length > 0 &&
        typeof c.english === "string" &&
        c.english.length > 0,
    );
  }, [object]);

  const selectedCount = candidates.length - excluded.size;

  async function onCommit() {
    if (selectedCount === 0) return;
    setCommit({ kind: "saving" });
    try {
      const res = await commitAiDeck(
        candidates.filter((_, i) => !excluded.has(i)),
        level,
      );
      setCommit({ kind: "done", created: res.created });
    } catch (e: any) {
      setCommit({ kind: "error", message: e?.message ?? "Failed to save" });
    }
  }

  function startGenerate(t: string) {
    setExcluded(new Set());
    setCommit({ kind: "idle" });
    submit({ topic: t, level, count });
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-5xl px-6 pb-20 pt-6 md:px-8">
        <AiNav current="/deck-builder" />

        {/* Header */}
        <header className="mb-8">
          <div className="flex items-baseline gap-3">
            <span className="jp text-2xl text-accent">単語帳</span>
            <div className="eyebrow">AI DECK BUILDER</div>
          </div>
          <h1 className="mt-1 font-serif text-3xl md:text-[34px]">
            Build a deck for anything.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-2">
            Describe a topic, choose your level, and let the AI propose vocabulary
            cards. Pick the ones you like — they go straight into your spaced-
            repetition queue.
          </p>
        </header>

        {/* Generation panel */}
        <Card tone="raised" className="mb-8">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (topic.trim()) startGenerate(topic);
            }}
            className="space-y-5"
          >
            <div>
              <label className="eyebrow mb-1.5 block" htmlFor="topic-input">
                TOPIC
              </label>
              <Input
                id="topic-input"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. food at a restaurant, or transitive/intransitive verb pairs"
                autoFocus
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
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
                    onClick={() => setCount((n) => Math.min(20, n + 1))}
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
                <Button
                  type="submit"
                  size="lg"
                  disabled={!topic.trim()}
                >
                  Generate →
                </Button>
              )}
            </div>
          </form>
        </Card>

        {error && (
          <Card tone="paper" className="mb-6 border-accent">
            <p className="text-sm text-accent">{error.message}</p>
          </Card>
        )}

        {/* Results */}
        {(candidates.length > 0 || isLoading) && (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="eyebrow">RESULTS</div>
                <Chip tone="accent">{level}</Chip>
                {isLoading && (
                  <Pill className="mono">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                    streaming…
                  </Pill>
                )}
                {candidates.length > 0 && (
                  <span className="mono text-xs text-ink-3">
                    {selectedCount} of {candidates.length} selected
                  </span>
                )}
              </div>

              {candidates.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setExcluded(new Set())}
                    className="mono text-[11px] text-ink-3 hover:text-accent"
                  >
                    select all
                  </button>
                  <span className="text-ink-3">·</span>
                  <button
                    type="button"
                    onClick={() =>
                      setExcluded(
                        new Set(candidates.map((_, i) => i)),
                      )
                    }
                    className="mono text-[11px] text-ink-3 hover:text-accent"
                  >
                    select none
                  </button>
                  <Button
                    onClick={onCommit}
                    disabled={
                      selectedCount === 0 ||
                      commit.kind === "saving" ||
                      commit.kind === "done"
                    }
                  >
                    {commit.kind === "saving"
                      ? "Saving…"
                      : commit.kind === "done"
                        ? `✓ Saved ${commit.created}`
                        : `Add ${selectedCount} to SRS →`}
                  </Button>
                </div>
              )}
            </div>

            {commit.kind === "done" && (
              <Card tone="raised" className="mb-4 border-moss/50">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm">
                    {commit.created > 0 ? (
                      <>
                        Added <strong>{commit.created}</strong> new card
                        {commit.created === 1 ? "" : "s"} to your deck.
                      </>
                    ) : (
                      <>
                        These cards already exist in your deck — nothing new to
                        add.
                      </>
                    )}
                  </p>
                  <Link
                    href="/srs"
                    className="mono shrink-0 rounded-sm border border-moss/50 bg-moss/10 px-2.5 py-1 text-xs text-moss hover:bg-moss/20"
                  >
                    start a review →
                  </Link>
                </div>
              </Card>
            )}

            {commit.kind === "error" && (
              <Card tone="paper" className="mb-4 border-accent">
                <p className="text-sm text-accent">{commit.message}</p>
              </Card>
            )}

            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {candidates.map((c, i) => {
                const included = !excluded.has(i);
                const kanjiSame = c.kana === c.kanji;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      disabled={commit.kind === "saving"}
                      onClick={() =>
                        setExcluded((prev) => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return next;
                        })
                      }
                      className={`group block w-full rounded-lg border p-4 text-left transition-all ${
                        included
                          ? "border-accent/60 bg-accent-soft/40 shadow-sm hover:shadow-md"
                          : "border-ink-3/30 bg-paper opacity-60 hover:opacity-90"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="jp text-2xl leading-tight">
                            {c.kanji}
                            {!kanjiSame && (
                              <span className="mono ml-2 align-middle text-[11px] text-ink-3">
                                {c.kana}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 font-serif text-base text-ink-2">
                            {c.english}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {c.partOfSpeech && (
                            <Chip tone="neutral" className="capitalize">
                              {c.partOfSpeech}
                            </Chip>
                          )}
                          <span
                            className={`mono text-[10px] ${
                              included ? "text-accent" : "text-ink-3"
                            }`}
                          >
                            {included ? "✓ included" : "− skipped"}
                          </span>
                        </div>
                      </div>

                      {c.exampleJp && (
                        <div className="mt-3 rounded-sm border-l-2 border-ink-3/40 bg-paper/60 px-3 py-2">
                          <p className="jp text-sm leading-relaxed">
                            {c.exampleJp}
                          </p>
                          {c.exampleEn && (
                            <p className="mt-0.5 text-xs italic text-ink-3">
                              {c.exampleEn}
                            </p>
                          )}
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}

              {/* Skeleton tiles while streaming and nothing yet */}
              {isLoading &&
                candidates.length === 0 &&
                Array.from({ length: Math.min(count, 6) }).map((_, i) => (
                  <li
                    key={`skel-${i}`}
                    className="rounded-lg border border-ink-3/20 bg-paper-2 p-4"
                  >
                    <div className="h-6 w-24 animate-pulse rounded bg-ink-3/20" />
                    <div className="mt-2 h-4 w-32 animate-pulse rounded bg-ink-3/15" />
                    <div className="mt-3 h-10 w-full animate-pulse rounded bg-ink-3/10" />
                  </li>
                ))}
            </ul>
          </>
        )}

        {!isLoading && candidates.length === 0 && !error && (
          <Card tone="panel" className="text-center">
            <div className="jp text-4xl text-ink-3">単</div>
            <p className="mt-2 text-sm text-ink-2">
              No cards yet — describe a topic above and hit{" "}
              <span className="mono text-accent">Generate</span>.
            </p>
          </Card>
        )}
      </div>
    </main>
  );
}
