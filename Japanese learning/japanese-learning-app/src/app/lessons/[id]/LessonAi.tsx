"use client";

import * as React from "react";
import { experimental_useObject as useObject } from "@ai-sdk/react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip, Pill } from "@/components/ui/Chip";
import {
  generationSchema,
  correctionSchema,
} from "@/lib/ai/schemas";
import type { JlptLevel } from "@/lib/ai/client";

interface Props {
  pointId: number;
  pointTitle: string;
  pattern: string | null;
  level: JlptLevel;
}

export function LessonAi({ pointId, pointTitle, pattern, level }: Props) {
  return (
    <>
      <AiExamplesCard
        // re-mount when the grammar point changes so state resets cleanly
        key={`ex-${pointId}`}
        pointTitle={pointTitle}
        pattern={pattern}
        level={level}
      />
      <AiPracticeCard
        key={`prac-${pointId}`}
        pointTitle={pointTitle}
        pattern={pattern}
      />
    </>
  );
}

function AiExamplesCard({
  pointTitle,
  pattern,
  level,
}: {
  pointTitle: string;
  pattern: string | null;
  level: JlptLevel;
}) {
  const { object, submit, isLoading, error, stop } = useObject({
    api: "/api/generate",
    schema: generationSchema,
  });

  const topic = pattern ? `${pointTitle} (pattern: ${pattern})` : pointTitle;

  const examples = (object?.examples ?? []).filter(
    (e): e is { jp: string; romaji: string; en: string; note?: string } =>
      !!e && !!e.jp,
  );

  return (
    <Card tone="raised">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="eyebrow">AI · MORE EXAMPLES</div>
          <Chip tone="accent">{level}</Chip>
        </div>
        {isLoading ? (
          <Button size="sm" variant="secondary" onClick={() => stop()}>
            stop
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => submit({ topic, level, count: 3 })}
          >
            {examples.length > 0 ? "regenerate" : "generate →"}
          </Button>
        )}
      </div>

      {error && (
        <p className="mt-2 text-xs text-accent">{error.message}</p>
      )}

      {!isLoading && examples.length === 0 && !error && (
        <p className="mt-2 text-xs text-ink-3">
          Get 3 fresh AI-generated example sentences for this grammar point at
          your level.
        </p>
      )}

      {isLoading && examples.length === 0 && (
        <Pill className="mono mt-3">
          <span className="inline-block size-1.5 animate-pulse rounded-full bg-accent" />
          streaming…
        </Pill>
      )}

      {examples.length > 0 && (
        <ol className="mt-3 space-y-2">
          {examples.map((ex, i) => (
            <li
              key={i}
              className="rounded-md border border-ink-3/30 bg-paper p-3"
            >
              <div className="jp text-[16px] leading-relaxed">{ex.jp}</div>
              {ex.romaji && (
                <div className="mono text-[11px] text-ink-3">{ex.romaji}</div>
              )}
              {ex.en && (
                <div className="mt-0.5 text-sm text-ink-2">{ex.en}</div>
              )}
              {ex.note && (
                <div className="mt-1.5 rounded-sm bg-gold/10 p-2 text-[11px] italic text-ink-2">
                  {ex.note}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function AiPracticeCard({
  pointTitle,
  pattern,
}: {
  pointTitle: string;
  pattern: string | null;
}) {
  const [text, setText] = React.useState("");
  const { object, submit, isLoading, error, stop } = useObject({
    api: "/api/correct",
    schema: correctionSchema,
  });

  const issues = (object?.issues ?? []).filter(
    (i): i is { span: string; type: string; explanation: string; suggestion: string } =>
      !!i && !!i.span,
  );

  return (
    <Card tone="raised">
      <div className="flex items-center justify-between">
        <div className="eyebrow">AI · TRY WRITING ONE</div>
        {isLoading && (
          <Pill className="mono">
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-accent" />
            checking…
          </Pill>
        )}
      </div>

      <p className="mt-1.5 text-xs text-ink-3">
        Write a Japanese sentence using{" "}
        <span className="mono text-accent">{pattern ?? pointTitle}</span>. AI
        will check it for issues.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="日本語で書いてみよう..."
        rows={3}
        disabled={isLoading}
        className="jp mt-2 w-full rounded-md border border-ink-3/50 bg-paper px-3 py-2 text-[15px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
      />

      <div className="mt-2 flex justify-end gap-2">
        {isLoading ? (
          <Button size="sm" variant="secondary" onClick={() => stop()}>
            stop
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={!text.trim()}
            onClick={() => submit({ text })}
          >
            Check →
          </Button>
        )}
      </div>

      {error && (
        <p className="mt-2 text-xs text-accent">{error.message}</p>
      )}

      {object?.corrected && (
        <div className="mt-3 rounded-md border border-moss/50 bg-moss/10 p-3">
          <div className="eyebrow text-moss">CORRECTED</div>
          <p className="jp mt-1 text-[15px] leading-relaxed">
            {object.corrected}
          </p>
        </div>
      )}

      {object?.natural && (
        <div className="mt-2 rounded-md border border-indigo/50 bg-indigo/10 p-3">
          <div className="eyebrow text-indigo">NATIVE-SOUNDING</div>
          <p className="jp mt-1 text-[15px] leading-relaxed">{object.natural}</p>
        </div>
      )}

      {issues.length > 0 && (
        <ul className="mt-3 space-y-2">
          {issues.map((iss, i) => (
            <li
              key={i}
              className="rounded-md border border-ink-3/30 bg-paper p-2.5 text-xs"
            >
              <div className="mb-1 flex items-center gap-1.5">
                <Chip tone="accent" className="capitalize">
                  {iss.type.replace("_", " ")}
                </Chip>
              </div>
              <p className="jp text-sm">
                <span className="line-through decoration-accent/60">
                  {iss.span}
                </span>
                <span className="mx-1.5 text-ink-3">→</span>
                <strong className="text-moss">{iss.suggestion}</strong>
              </p>
              <p className="mt-1 text-[12px] text-ink-2">{iss.explanation}</p>
            </li>
          ))}
        </ul>
      )}

      {object?.corrected && issues.length === 0 && !isLoading && (
        <div className="mt-3 rounded-md border border-moss/40 bg-moss/10 p-3 text-center">
          <span className="jp text-base text-moss">完璧</span>
          <p className="mt-0.5 text-xs text-ink-2">
            No issues found. Nicely written.
          </p>
        </div>
      )}
    </Card>
  );
}
