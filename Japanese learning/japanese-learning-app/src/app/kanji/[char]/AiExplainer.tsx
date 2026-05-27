"use client";

import * as React from "react";
import { experimental_useObject as useObject } from "@ai-sdk/react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Chip";
import { RubyText } from "@/components/RubyText";
import { kanjiExplainerSchema } from "@/lib/ai/schemas";
import { JLPT_LEVELS, type JlptLevel } from "@/lib/ai/client";

interface Props {
  character: string;
  meaning: string | null;
  onYomi: string | null;
  kunYomi: string | null;
  radicals: string | null;
  defaultLevel?: JlptLevel;
  kanjiLevel?: JlptLevel | null;
}

// Index in JLPT_LEVELS: N5=0 (easiest) … N1=4 (hardest)
const levelIndex = (l: JlptLevel) =>
  (JLPT_LEVELS as readonly string[]).indexOf(l);

export function AiExplainer({
  character,
  meaning,
  onYomi,
  kunYomi,
  radicals,
  defaultLevel = "N5",
  kanjiLevel = null,
}: Props) {
  const [level, setLevel] = React.useState<JlptLevel>(defaultLevel);
  const { object, submit, isLoading, error, stop } = useObject({
    api: "/api/kanji-explain",
    schema: kanjiExplainerSchema,
  });

  const hasContent = !!object && Object.keys(object).length > 0;

  function run() {
    submit({ character, meaning, onYomi, kunYomi, radicals, level });
  }

  // Hint that tells the user how their picked level compares to the kanji's
  // own level — answers "is this too easy / too hard for this kanji?"
  const levelHint = React.useMemo(() => {
    if (!kanjiLevel) return null;
    const delta = levelIndex(level) - levelIndex(kanjiLevel);
    if (delta === 0) return { tone: "moss" as const, text: "matches kanji" };
    if (delta < 0)
      return { tone: "gold" as const, text: `simpler than ${kanjiLevel}` };
    return { tone: "accent" as const, text: `deeper than ${kanjiLevel}` };
  }, [level, kanjiLevel]);

  return (
    <Card tone="raised">
      <div className="flex items-baseline justify-between gap-2">
        <div className="eyebrow">AI EXPLAINER</div>
        {kanjiLevel && (
          <span className="mono text-[10px] tracking-wider text-ink-3">
            kanji · {kanjiLevel}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="mono text-[10px] tracking-wider text-ink-3">
            EXPLAIN AT LEVEL
          </span>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as JlptLevel)}
            disabled={isLoading}
            className="mono min-w-[5rem] rounded-md border border-ink-3/40 bg-paper px-2 py-1 text-xs text-ink-2 focus:border-accent focus:outline-none"
          >
            {JLPT_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {isLoading ? (
          <Button size="sm" variant="secondary" onClick={() => stop()}>
            stop
          </Button>
        ) : (
          <Button size="sm" variant="primary" onClick={run}>
            {hasContent ? "regenerate" : "explain →"}
          </Button>
        )}
        {levelHint && (
          <Pill tone={levelHint.tone} className="ml-auto">
            {levelHint.text}
          </Pill>
        )}
      </div>

      {error && (
        <p className="mt-2 text-xs text-accent">{error.message}</p>
      )}

      {!hasContent && !isLoading && !error && (
        <p className="mt-3 text-xs leading-relaxed text-ink-3">
          Get an AI-written mnemonic, etymology, and example sentences for{" "}
          <span className="jp">{character}</span> tuned to{" "}
          <span className="mono text-ink-2">{level}</span>.
        </p>
      )}

      {object?.mnemonic && (
        <div className="mt-3">
          <SectionHeader label="MNEMONIC" />
          <p className="mt-1 text-sm leading-relaxed text-ink-2">
            {object.mnemonic}
          </p>
        </div>
      )}

      {object?.etymology && (
        <div className="mt-3">
          <SectionHeader label="ETYMOLOGY" />
          <p className="mt-1 text-sm leading-relaxed text-ink-2">
            {object.etymology}
          </p>
        </div>
      )}

      {object?.compounds && object.compounds.length > 0 && (
        <div className="mt-3">
          <SectionHeader label="COMPOUNDS" />
          <ul className="mt-1 divide-y divide-ink-3/20">
            {object.compounds
              .filter(
                (c): c is { kanji: string; kana: string; en: string } =>
                  !!c && !!c.kanji,
              )
              .map((c, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 py-1"
                >
                  <span className="jp min-w-0 text-sm">
                    {c.kanji}
                    {c.kana && (
                      <span className="mono ml-1 text-[10px] text-ink-3">
                        {c.kana}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-ink-3">{c.en}</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {object?.examples && object.examples.length > 0 && (
        <div className="mt-3">
          <SectionHeader label="EXAMPLES" />
          <ul className="mt-1 space-y-2">
            {object.examples
              .filter(
                (e): e is { jp: string; en: string } => !!e && !!e.jp,
              )
              .map((e, i) => (
                <li key={i} className="rounded-sm bg-paper-2 px-2 py-1.5">
                  <p className="jp text-sm">
                    <RubyText text={e.jp} />
                  </p>
                  {e.en && (
                    <p className="mt-0.5 text-xs text-ink-3">{e.en}</p>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}

      {isLoading && !hasContent && (
        <Pill className="mt-3 mono">streaming…</Pill>
      )}
    </Card>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="mono text-[10px] tracking-wider text-ink-3">
        {label}
      </span>
      <span aria-hidden className="h-px flex-1 bg-ink-3/20" />
    </div>
  );
}
