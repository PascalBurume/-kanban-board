"use client";

import * as React from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Chip, Pill } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import type { JlptLevel } from "@/lib/ai/client";
import { LessonAi } from "./LessonAi";

interface Example {
  jp: string;
  romaji: string;
  en: string;
}
interface Point {
  id: number;
  title: string;
  pattern: string | null;
  explanation: string | null;
  explanationJp?: string | null;
  examples: Example[];
}

interface CultureNote {
  titleJp: string;
  titleEn: string | null;
  body: string | null;
  bodyEn: string | null;
}

interface Props {
  points: Point[];
  vocab: { kana: string; kanji: string | null; english: string }[];
  kanji: { character: string; meaning: string | null }[];
  cultureNotes?: CultureNote[];
  userLevel: JlptLevel;
}

export function LessonPlayer({
  points,
  vocab,
  kanji,
  cultureNotes = [],
  userLevel,
}: Props) {
  const [idx, setIdx] = React.useState(0);
  if (points.length === 0) {
    return (
      <div className="p-8">
        <Card tone="raised">
          <p>This lesson doesn&apos;t have grammar points seeded yet.</p>
        </Card>
      </div>
    );
  }

  const p = points[idx];
  const total = points.length;
  const pct = Math.round(((idx + 1) / total) * 100);

  return (
    <div className="flex flex-1 flex-col">
      {/* progress */}
      <div className="flex items-center gap-4 border-b border-dashed border-ink-3/30 px-6 py-3 md:px-8">
        <div className="h-1.5 flex-1 overflow-hidden rounded-sm border border-ink-2/40 bg-paper-3">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="mono text-xs text-ink-3">
          {idx + 1}/{total}
        </span>
      </div>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-2">
        {/* explainer */}
        <section className="space-y-5 overflow-auto border-r border-dashed border-ink-3/30 p-6 md:p-8">
          <div>
            <div className="mono text-[10px] text-ink-3">
              GRAMMAR · POINT {idx + 1}
            </div>
            <h2 className="mt-1 font-serif text-2xl">{p.title}</h2>
          </div>

          {p.examples[0] && (
            <Card tone="raised">
              <div className="eyebrow">KEY EXAMPLE</div>
              <p className="jp mt-2 text-[22px] leading-relaxed text-ink">
                {p.examples[0].jp}
              </p>
              <p className="mono mt-1 text-xs text-ink-3">
                {p.examples[0].romaji}
              </p>
              <p className="mt-1 text-sm text-ink-2">{p.examples[0].en}</p>
            </Card>
          )}

          {p.pattern && (
            <Card tone="panel" className="mono">
              <div className="eyebrow text-ink-2">PATTERN</div>
              <p className="mt-1 text-sm">{p.pattern}</p>
            </Card>
          )}

          {p.explanation && (
            <div>
              <div className="eyebrow">EXPLANATION</div>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">
                {p.explanation}
              </p>
            </div>
          )}

          {p.explanationJp && (
            <details className="rounded-md border border-ink-3/30 bg-paper-2/60 p-3">
              <summary className="cursor-pointer text-xs text-ink-3 mono">
                日本語の説明を見る
              </summary>
              <p className="jp mt-2 text-sm leading-relaxed text-ink">
                {p.explanationJp}
              </p>
            </details>
          )}

          {p.examples.length > 1 && (
            <div>
              <div className="eyebrow">MORE EXAMPLES</div>
              <ul className="mt-2 space-y-2">
                {p.examples.slice(1).map((ex) => (
                  <li
                    key={ex.jp}
                    className="rounded-md border border-ink-3/30 bg-paper p-3"
                  >
                    <div className="jp text-[17px]">{ex.jp}</div>
                    <div className="mono text-[11px] text-ink-3">
                      {ex.romaji}
                    </div>
                    <div className="mt-0.5 text-sm text-ink-2">{ex.en}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* workbook */}
        <section className="space-y-4 overflow-auto p-6 md:p-8">
          <DragBuilder pattern={p.pattern ?? p.title} />
          <FillBlank example={p.examples[0]} />

          <LessonAi
            pointId={p.id}
            pointTitle={p.title}
            pattern={p.pattern}
            level={userLevel}
          />

          <Card tone="raised">
            <div className="eyebrow">VOCAB IN THIS LESSON</div>
            <ul className="mt-2 grid grid-cols-2 gap-1 text-sm">
              {vocab.slice(0, 8).map((v) => (
                <li key={`${v.kanji ?? ""}|${v.kana}`} className="flex justify-between gap-2 py-0.5">
                  <span className="jp">
                    {v.kanji ?? v.kana}{" "}
                    {v.kanji && (
                      <span className="mono text-[10px] text-ink-3">
                        {v.kana}
                      </span>
                    )}
                  </span>
                  <span className="text-ink-3 text-xs">{v.english}</span>
                </li>
              ))}
            </ul>
          </Card>

          {kanji.length > 0 && (
            <Card tone="raised">
              <div className="eyebrow">KANJI</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {kanji.map((k) => (
                  <Link
                    key={k.character}
                    href={`/kanji/${encodeURIComponent(k.character)}`}
                    className="jp flex size-12 items-center justify-center rounded-md border border-ink-3/40 bg-paper text-[26px] hover:border-accent hover:text-accent"
                    title={k.meaning ?? ""}
                  >
                    {k.character}
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {cultureNotes.length > 0 && (
            <Card tone="raised">
              <div className="eyebrow">CULTURE TIPS</div>
              <div className="mt-2 space-y-3">
                {cultureNotes.map((cn) => (
                  <details
                    key={cn.titleJp}
                    className="rounded-md border border-ink-3/30 bg-paper p-3"
                  >
                    <summary className="cursor-pointer">
                      <span className="jp text-sm font-medium">{cn.titleJp}</span>
                      {cn.titleEn && (
                        <span className="ml-2 text-xs italic text-ink-3">
                          {cn.titleEn}
                        </span>
                      )}
                    </summary>
                    {cn.bodyEn && (
                      <p className="mt-2 text-sm text-ink-2 leading-relaxed">
                        {cn.bodyEn}
                      </p>
                    )}
                    {cn.body && (
                      <p className="jp mt-2 text-sm leading-relaxed">
                        {cn.body}
                      </p>
                    )}
                  </details>
                ))}
              </div>
            </Card>
          )}
        </section>
      </div>

      {/* footer */}
      <footer className="flex items-center justify-between border-t border-ink-3/30 bg-paper-2 px-6 py-3 md:px-8">
        <Button
          variant="ghost"
          size="sm"
          disabled={idx === 0}
          onClick={() => setIdx(Math.max(0, idx - 1))}
        >
          ← previous
        </Button>
        <span className="mono text-xs text-ink-3">
          {p.title}
        </span>
        <Button
          size="sm"
          onClick={() => setIdx(Math.min(total - 1, idx + 1))}
          disabled={idx === total - 1}
        >
          check →
        </Button>
      </footer>
    </div>
  );
}

function DragBuilder({ pattern }: { pattern: string }) {
  // Splits the pattern by [brackets] and arrows to build chips
  const pieces = React.useMemo(() => {
    const s = pattern.replace(/[\[\]]/g, "").replace(/\s+/g, " ").trim();
    return s.split(/\s+/).slice(0, 6);
  }, [pattern]);
  const [order, setOrder] = React.useState<string[]>([]);
  const remaining = pieces.filter((p) => !order.includes(p));

  return (
    <Card tone="paper">
      <div className="eyebrow">TRY IT · build the pattern</div>
      <div className="mt-3 flex min-h-[44px] flex-wrap items-center gap-1.5 rounded-md border-2 border-dashed border-ink-3/50 bg-paper-2/40 p-2">
        {order.length === 0 && (
          <span className="text-xs text-ink-3">
            tap pieces below in order →
          </span>
        )}
        {order.map((piece, i) => (
          <button type="button"
            key={`${piece}-${i}`}
            onClick={() => setOrder(order.filter((_, j) => j !== i))}
            className="mono rounded-sm border border-ink/60 bg-paper-3 px-2 py-1 text-xs hover:bg-accent-soft"
          >
            {piece}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {remaining.map((p, i) => (
          <button type="button"
            key={`${p}-${i}`}
            onClick={() => setOrder([...order, p])}
            className="mono rounded-sm border border-ink-3/60 bg-paper px-2 py-1 text-xs hover:border-accent hover:text-accent"
          >
            {p}
          </button>
        ))}
      </div>
    </Card>
  );
}

function FillBlank({ example }: { example?: Example }) {
  const [val, setVal] = React.useState("");
  if (!example) return null;
  const blanked = example.jp.replace(/.{1,3}$/, "（　　）");
  return (
    <Card tone="paper">
      <div className="eyebrow">FILL THE BLANK</div>
      <p className="jp mt-2 text-[18px]">{blanked}</p>
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="type your answer"
        className="mt-3 w-full rounded-md border border-ink-3/50 bg-paper px-3 py-2 text-sm focus:border-accent focus:outline-none"
      />
      <p className="mt-2 text-[11px] text-ink-3">
        hint:{" "}
        <span className="mono">{example.romaji.slice(0, 12)}…</span>
      </p>
    </Card>
  );
}
