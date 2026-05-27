"use client";

import { useState } from "react";
import { experimental_useObject as useObject } from "@ai-sdk/react";
import { AiNav } from "@/components/AiNav";
import { Card } from "@/components/ui/Card";
import { Chip, Pill } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { correctionSchema } from "@/lib/ai/schemas";

const ISSUE_TONE: Record<string, "accent" | "gold" | "indigo" | "moss" | "neutral"> = {
  particle: "accent",
  conjugation: "gold",
  vocabulary: "indigo",
  politeness: "moss",
  word_order: "accent",
  kanji: "indigo",
  other: "neutral",
};

const SAMPLES = [
  "きのう、ともだちと映画見ました。",
  "私は学校に行きました。",
  "コーヒーが好きです。毎朝飲むです。",
];

export default function WritePage() {
  const [text, setText] = useState("");
  const { object, submit, isLoading, error, stop } = useObject({
    api: "/api/correct",
    schema: correctionSchema,
  });

  const issues = (object?.issues ?? []).filter(
    (i): i is { span: string; type: string; explanation: string; suggestion: string } =>
      !!i && !!i.span,
  );

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-5xl px-6 pb-20 pt-6 md:px-8">
        <AiNav current="/write" />

        <header className="mb-8">
          <div className="flex items-baseline gap-3">
            <span className="jp text-2xl text-accent">添削</span>
            <div className="eyebrow">WRITING CORRECTION</div>
          </div>
          <h1 className="mt-1 font-serif text-3xl md:text-[34px]">
            Polish your Japanese.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-2">
            Paste anything you&apos;ve written — a sentence, a journal entry, a
            chat message. You&apos;ll get a corrected version, a native-sounding
            alternative, and an issue-by-issue breakdown.
          </p>
        </header>

        <Card tone="raised" className="mb-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) submit({ text });
            }}
          >
            <label className="eyebrow mb-1.5 block" htmlFor="text-input">
              YOUR JAPANESE
            </label>
            <textarea
              id="text-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder="例: 私は学校に行きました。きのう、ともだちと映画見ました。"
              className="jp w-full rounded-md border border-ink-3/60 bg-paper px-3 py-2 text-[15px] text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-accent/50"
            />

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="mono text-[10px] uppercase text-ink-3">Try:</span>
              {SAMPLES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setText(s)}
                  className="jp rounded-sm border border-ink-3/40 bg-paper px-2 py-0.5 text-[11px] text-ink-2 hover:border-accent hover:text-accent"
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="mt-4 flex justify-end">
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
                <Button type="submit" size="lg" disabled={!text.trim()}>
                  Check writing →
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

        {isLoading && !object?.corrected && (
          <Pill className="mono mb-4">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            analyzing…
          </Pill>
        )}

        {object?.corrected && (
          <Card tone="raised" className="mb-4 border-moss/50">
            <div className="eyebrow text-moss">CORRECTED</div>
            <p className="jp mt-1 text-lg leading-relaxed">{object.corrected}</p>
          </Card>
        )}

        {object?.natural && (
          <Card tone="raised" className="mb-4 border-indigo/50">
            <div className="eyebrow text-indigo">NATIVE-SOUNDING ALTERNATIVE</div>
            <p className="jp mt-1 text-lg leading-relaxed">{object.natural}</p>
          </Card>
        )}

        {issues.length > 0 && (
          <>
            <div className="mb-3 mt-6 flex items-center gap-2">
              <div className="eyebrow">ISSUES</div>
              <Chip tone="accent">{issues.length}</Chip>
            </div>

            <div className="space-y-3">
              {issues.map((iss, i) => (
                <Card key={i} tone="paper">
                  <div className="mb-2 flex items-center gap-2">
                    <Chip tone={ISSUE_TONE[iss.type] ?? "neutral"} className="capitalize">
                      {iss.type.replace("_", " ")}
                    </Chip>
                  </div>
                  <p className="jp text-base">
                    <span className="line-through decoration-accent/60">
                      {iss.span}
                    </span>
                    <span className="mx-2 text-ink-3">→</span>
                    <strong className="text-moss">{iss.suggestion}</strong>
                  </p>
                  <p className="mt-1.5 text-sm text-ink-2">{iss.explanation}</p>
                </Card>
              ))}
            </div>
          </>
        )}

        {object?.corrected && issues.length === 0 && !isLoading && (
          <Card tone="panel" className="text-center">
            <div className="jp text-2xl text-moss">完璧</div>
            <p className="mt-1 text-sm text-ink-2">
              No issues found — your writing looks clean.
            </p>
          </Card>
        )}

        {!isLoading && !object?.corrected && !error && (
          <Card tone="panel" className="text-center">
            <div className="jp text-4xl text-ink-3">添</div>
            <p className="mt-2 text-sm text-ink-2">
              Paste some Japanese above and hit{" "}
              <span className="mono text-accent">Check writing</span>.
            </p>
          </Card>
        )}
      </div>
    </main>
  );
}
