"use client";

import * as React from "react";
import Link from "next/link";
import {
  LEVELS,
  PLACEMENT_QUESTIONS,
  PlacementAnswer,
  scorePlacement,
} from "@/lib/placement";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const OPTIONS: { mark: string; title: string; sub: string; value: PlacementAnswer }[] =
  [
    { mark: "✓", title: "Yes, fully", sub: "I read both kana and the kanji", value: 2 },
    { mark: "~", title: "Some kana, no kanji", sub: "I sound it out slowly", value: 1 },
    { mark: "✗", title: "Nothing yet", sub: "It looks like decoration to me", value: 0 },
  ];

export function OnboardingFlow() {
  const [step, setStep] = React.useState(0);
  const [answers, setAnswers] = React.useState<Record<string, PlacementAnswer>>(
    {}
  );
  const [done, setDone] = React.useState(false);

  const q = PLACEMENT_QUESTIONS[step];
  const total = PLACEMENT_QUESTIONS.length;
  const result = scorePlacement(answers);

  // Keyboard 1/2/3 to pick an answer
  React.useEffect(() => {
    if (done) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "1") choose(2);
      if (e.key === "2") choose(1);
      if (e.key === "3") choose(0);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  function choose(v: PlacementAnswer) {
    const next = { ...answers, [q.id]: v };
    setAnswers(next);
    if (step + 1 < total) setStep((s) => s + 1);
    else setDone(true);
  }

  if (done) {
    return <Result level={result.level} confidence={result.confidence} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      {/* slim topbar */}
      <div className="flex items-center justify-between border-b border-ink-3/40 bg-paper-2 px-6 py-3 md:px-10">
        <div className="flex items-center gap-3">
          <div className="flex size-7 items-center justify-center rounded-md bg-accent font-serif text-[13px] font-bold text-[#fff7ec]">
            学
          </div>
          <div className="font-serif text-[15px] md:text-base">
            welcome <span className="text-ink-3">· placement test</span>
          </div>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={`cell-${i}`}
              className={`h-1.5 w-6 rounded-sm border border-ink/60 transition-colors ${
                i <= step ? "bg-accent" : "bg-transparent"
              }`}
            />
          ))}
        </div>
        <span className="mono hidden text-xs text-ink-3 md:block">
          Q {step + 1} of {total} ·{" "}
          <button type="button"
            className="underline hover:text-ink"
            onClick={() => setDone(true)}
          >
            skip
          </button>
        </span>
      </div>

      <div className="flex flex-1 flex-col lg:flex-row">
        {/* Sensei chat */}
        <div className="flex flex-1 flex-col gap-5 overflow-auto border-r border-dashed border-ink-3/40 p-6 md:p-10">
          <div className="flex items-end gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-ink/70 bg-paper-3 font-serif text-[17px]">
              先
            </div>
            <Card tone="raised" className="max-w-[460px] p-4">
              <div className="text-base text-ink">{q.promptEn}</div>
              <div className="jp mt-3 text-[28px] leading-tight md:text-[32px]">
                {q.jp}
              </div>
              <div className="mono mt-1 text-xs text-ink-3">{q.romaji}</div>
              <div className="mt-2 text-sm text-ink-2">{q.en}</div>
            </Card>
          </div>

          <div className="flex max-w-[480px] flex-col gap-2">
            {OPTIONS.map((o, i) => (
              <button type="button"
                key={o.value}
                onClick={() => choose(o.value)}
                className="flex items-center gap-3 rounded-md border border-ink/40 bg-paper p-3 text-left transition-colors hover:border-accent hover:bg-accent-soft/40 focus:outline-none focus:ring-2 focus:ring-accent/50"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-ink-2/60 jp text-base text-ink-2">
                  {o.mark}
                </span>
                <div className="flex-1">
                  <div className="font-serif text-[15px] text-ink">{o.title}</div>
                  <div className="text-xs text-ink-3">{o.sub}</div>
                </div>
                <span className="mono text-[10px] text-ink-3">{i + 1}</span>
              </button>
            ))}
          </div>

          <div className="mt-auto flex items-center justify-between text-xs text-ink-3">
            <span className="mono">
              auto-saves · keyboard: 1 · 2 · 3
            </span>
            <Button variant="ghost" size="sm" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
              ← previous
            </Button>
          </div>
        </div>

        {/* Right rail — live level map */}
        <aside className="hidden w-[340px] flex-col gap-3 bg-paper-3 p-7 lg:flex">
          <div className="mono text-[10px] text-ink-3">
            ★ BASED ON YOUR ANSWERS
          </div>
          <div className="font-serif text-xl">
            You&apos;re around{" "}
            <span className="text-accent">{result.level}</span>
          </div>
          <p className="text-xs text-ink-3">
            we&apos;ll keep adjusting as you study · self-correct anytime
          </p>

          <Card tone="paper" className="mt-2 p-3">
            {LEVELS.map((lvl, i) => {
              const on = lvl.code === result.level;
              return (
                <div
                  key={lvl.code}
                  className={`flex items-center gap-3 p-1.5 ${
                    i < LEVELS.length - 1
                      ? "border-b border-dotted border-ink-3/40"
                      : ""
                  } ${on ? "bg-accent/10" : ""}`}
                >
                  <div
                    className={`flex size-8 items-center justify-center rounded-sm border text-xs ${
                      on
                        ? "border-accent bg-accent text-[#fff7ec]"
                        : "border-ink-3/60 bg-paper text-ink-2"
                    } jp`}
                  >
                    {lvl.kanji}
                  </div>
                  <div className="flex-1">
                    <div className="font-serif text-[14px]">{lvl.title}</div>
                    <div className="text-[11px] text-ink-3">{lvl.subtitle}</div>
                  </div>
                  {on && (
                    <span className="rounded-full border border-accent/60 bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">
                      you
                    </span>
                  )}
                </div>
              );
            })}
          </Card>

          <div className="mono mt-auto text-[10px] text-ink-3">
            ↳ {Math.max(0, total - step - 1)} more questions to refine
          </div>
        </aside>
      </div>
    </div>
  );
}

function Result({ level, confidence }: { level: string; confidence: number }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16">
      <div className="mono text-[10px] text-ink-3">PLACEMENT COMPLETE</div>
      <h1 className="mt-2 font-serif text-3xl md:text-[44px]">
        You&apos;re around <span className="text-accent">{level}</span>
      </h1>
      <p className="mt-3 max-w-md text-center text-base text-ink-2">
        Confidence: {confidence}%. We&apos;ll tune your plan as you study;
        you can adjust anytime in settings.
      </p>

      <Card tone="raised" className="mt-8 w-full max-w-md">
        <div className="eyebrow">YOUR FIRST DAY</div>
        <ul className="mt-2 space-y-2 text-sm text-ink-2">
          <li>1 quick lesson · ~6 min</li>
          <li>10 due SRS cards · ~4 min</li>
          <li>3 kanji to trace · ~5 min</li>
          <li>1 short NHK clip · ~3 min</li>
        </ul>
      </Card>

      <div className="mt-8 flex gap-3">
        <Link href="/home">
          <Button size="lg">Start studying →</Button>
        </Link>
        <Link href="/">
          <Button variant="ghost" size="lg">
            back to home
          </Button>
        </Link>
      </div>
    </div>
  );
}
