"use client";

import * as React from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip, Pill } from "@/components/ui/Chip";
import { recordJlptAttempt, type RecordedAnswer } from "./actions";

export interface PracticeQuestion {
  id: number;
  character: string;
  onYomi: string | null;
  kunYomi: string | null;
  correct: string;
  choices: string[];
}

interface Props {
  level: string;
  section: string;
  sectionEn: string;
  sectionJp: string;
  mode: "practice" | "mock";
  timeMin: number | null;
  questions: PracticeQuestion[];
}

const MC_LABELS = ["A", "B", "C", "D"];

export function SectionPractice({
  level,
  section,
  sectionEn,
  sectionJp,
  mode,
  timeMin,
  questions,
}: Props) {
  const [idx, setIdx] = React.useState(0);
  const [answers, setAnswers] = React.useState<RecordedAnswer[]>([]);
  const [picked, setPicked] = React.useState<string | null>(null);
  const [revealed, setRevealed] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<{
    correct: number;
    total: number;
    scorePct: number;
  } | null>(null);
  const startedAtRef = React.useRef<string>(new Date().toISOString());

  // Mock timer (seconds remaining).
  const totalSeconds = timeMin ? timeMin * 60 : null;
  const [secondsLeft, setSecondsLeft] = React.useState<number | null>(totalSeconds);

  React.useEffect(() => {
    if (totalSeconds == null || done) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s == null) return s;
        if (s <= 1) {
          clearInterval(id);
          setDone(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [totalSeconds, done]);

  const q = questions[idx];
  const total = questions.length;

  function choose(c: string) {
    if (revealed) return;
    setPicked(c);
    setRevealed(true);
    setAnswers((prev) => [
      ...prev,
      { itemId: q.id, picked: c, correct: c === q.correct },
    ]);
  }

  function next() {
    if (idx + 1 >= total) {
      setDone(true);
    } else {
      setIdx((i) => i + 1);
      setPicked(null);
      setRevealed(false);
    }
  }

  React.useEffect(() => {
    if (!done || result || submitting) return;
    setSubmitting(true);
    recordJlptAttempt({
      level,
      section,
      mode,
      answers,
      startedAtISO: startedAtRef.current,
    })
      .then((r) => setResult(r))
      .catch(() => setResult({ correct: 0, total: 0, scorePct: 0 }))
      .finally(() => setSubmitting(false));
  }, [done, result, submitting, level, section, mode, answers]);

  if (done) {
    const correctCount = result?.correct ?? answers.filter((a) => a.correct).length;
    const score =
      result?.scorePct ??
      (answers.length === 0 ? 0 : (correctCount / answers.length) * 100);
    const passed = score >= (60 / 1); // sectional pass is ~32% (19/60); show as visual cue
    return (
      <div className="p-6 md:p-8">
        <Card tone="raised" className="max-w-2xl">
          <div className="eyebrow">RESULT · {level} · {sectionEn}</div>
          <div className="mt-2 flex items-baseline gap-3">
            <div className="font-serif text-[44px]">{Math.round(score)}%</div>
            <div className="mono text-sm text-ink-3">
              {correctCount} / {answers.length || total} correct
            </div>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-sm bg-paper-3">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${Math.min(100, score)}%` }}
            />
          </div>
          <div className="mt-3 text-sm text-ink-2">
            {score >= 80
              ? "Strong round — keep these in rotation and stretch into the next level."
              : score >= 50
                ? "Solid base. Re-take this section in a day or two; the gaps are real but closeable."
                : "Below threshold — fold the wrong items into your SRS deck and re-attempt after a session of review."}
          </div>

          <div className="mt-5 grid gap-2">
            {answers.map((a, i) => {
              const qq = questions[i];
              if (!qq) return null;
              return (
                <div
                  key={qq.id ?? i}
                  className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm ${
                    a.correct
                      ? "border-moss/40 bg-moss/5"
                      : "border-accent/40 bg-accent-soft/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="jp text-2xl">{qq.character}</span>
                    <span className="text-ink-2">{qq.correct}</span>
                  </div>
                  <div className="mono text-[11px] text-ink-3">
                    {a.correct ? "✓" : `✗ picked: ${a.picked}`}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/jlpt/practice/${section}?level=${level}&mode=${mode}`}>
              <Button>retry round →</Button>
            </Link>
            <Link href={`/jlpt?level=${level}`}>
              <Button variant="ghost">back to JLPT prep</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <>
      <header className="flex flex-wrap items-baseline justify-between gap-4 border-b border-ink-3/40 px-6 py-5 md:px-8">
        <div>
          <div className="eyebrow">
            {mode === "mock" ? "TIMED MOCK" : "PRACTICE"} · KANJI MEANING
          </div>
          <h1 className="font-serif text-2xl md:text-[28px]">
            <span className="jp">{sectionJp}</span>{" "}
            <span className="text-ink-3 text-base">· {sectionEn} · {level}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Chip>{level}</Chip>
          <Pill tone="neutral" className="mono">
            {idx + 1} / {total}
          </Pill>
          {secondsLeft != null && (
            <Pill tone={secondsLeft < 30 ? "accent" : "moss"} className="mono">
              ⏱ {formatTime(secondsLeft)}
            </Pill>
          )}
        </div>
      </header>

      <div className="p-6 md:p-8">
        <Card tone="paper" className="mx-auto max-w-2xl">
          <div className="mono text-[11px] uppercase tracking-wider text-ink-3">
            Q{idx + 1} · pick the English meaning
          </div>
          <div className="mt-4 flex flex-col items-center gap-2 py-4">
            <div className="jp text-[120px] leading-none">{q.character}</div>
            <div className="mono text-[11px] text-ink-3">
              {q.onYomi && <span>on: {q.onYomi}</span>}
              {q.onYomi && q.kunYomi && <span className="mx-2">·</span>}
              {q.kunYomi && <span>kun: {q.kunYomi}</span>}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {q.choices.map((c, i) => {
              const isCorrect = revealed && c === q.correct;
              const isWrongPick = revealed && picked === c && c !== q.correct;
              return (
                <button type="button"
                  key={c + i}
                  onClick={() => choose(c)}
                  disabled={revealed}
                  className={`flex items-center gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${
                    isCorrect
                      ? "border-moss bg-moss/10 text-moss"
                      : isWrongPick
                        ? "border-accent bg-accent-soft text-accent"
                        : revealed
                          ? "border-ink-3/30 text-ink-3"
                          : "border-ink-3/40 hover:bg-paper-2"
                  }`}
                >
                  <span className="mono w-5 text-[11px] text-ink-3">
                    {MC_LABELS[i]}
                  </span>
                  <span className="flex-1">{c}</span>
                  {isCorrect && <span className="mono text-[11px]">✓</span>}
                  {isWrongPick && <span className="mono text-[11px]">✗</span>}
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex items-center justify-between">
            <div className="text-xs text-ink-3">
              {revealed
                ? picked === q.correct
                  ? "Nice — correct."
                  : `Correct: ${q.correct}`
                : "Click a choice."}
            </div>
            <Button
              size="sm"
              onClick={next}
              disabled={!revealed}
              variant={revealed ? "primary" : "ghost"}
            >
              {idx + 1 >= total ? "finish →" : "next →"}
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
