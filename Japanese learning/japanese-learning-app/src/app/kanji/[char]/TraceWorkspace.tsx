"use client";

import * as React from "react";
import { Card } from "@/components/ui/Card";
import { Chip, Pill } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import {
  bbox,
  Point,
  sampleSvgPath,
  scoreStroke,
  ScoredStroke,
} from "@/lib/strokes";
import type { JlptLevel } from "@/lib/ai/client";
import { RADICAL_GLYPHS } from "@/lib/radicalGlyphs";
import { AiExplainer } from "./AiExplainer";

interface Props {
  character: string;
  strokes: { paths: string[]; viewBox: string } | null;
  meaning: string | null;
  onYomi: string | null;
  kunYomi: string | null;
  radicals: string | null;
  mnemonic: string | null;
  userLevel: JlptLevel;
  kanjiLevel: JlptLevel | null;
  compounds: { surface: string; reading: string; en: string }[];
}

const SIZE = 320; // square trace canvas (px)
const KANJIVG_VIEW = 109; // KanjiVG default viewBox is 109×109

function SessionRing({
  done,
  total,
  size = 48,
}: {
  done: number;
  total: number;
  size?: number;
}) {
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, done / total);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--ink-3)"
        strokeOpacity={0.3}
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="mono"
        fontSize={size * 0.32}
        fill="var(--ink)"
        fontWeight="600"
      >
        {done}/{total}
      </text>
    </svg>
  );
}

export function TraceWorkspace({
  character,
  strokes,
  meaning,
  onYomi,
  kunYomi,
  radicals,
  mnemonic,
  userLevel,
  kanjiLevel,
  compounds,
}: Props) {
  const [userStrokes, setUserStrokes] = React.useState<Point[][]>([]);
  const [current, setCurrent] = React.useState<Point[]>([]);
  const [scores, setScores] = React.useState<ScoredStroke[]>([]);
  const [showAll, setShowAll] = React.useState(false);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  const grounds = React.useMemo(() => {
    if (!strokes) return [];
    return strokes.paths.map((d) => sampleSvgPath(d));
  }, [strokes]);
  const groundBoxes = React.useMemo(
    () => grounds.map((g) => bbox(g)),
    [grounds]
  );

  const expectedCount = strokes?.paths.length ?? 0;
  const completed = scores.filter((s) => s.score !== "again").length;

  // Convert raw canvas points to KanjiVG viewBox space for scoring
  const toViewSpace = (p: Point): Point => ({
    x: (p.x / SIZE) * KANJIVG_VIEW,
    y: (p.y / SIZE) * KANJIVG_VIEW,
  });

  // Pointer coords come in CSS pixels; the canvas pixel buffer is fixed at
  // SIZE×SIZE while the rendered element may be smaller on narrow screens.
  // Scale so drawing/scoring stay in buffer space.
  function pointerToBuffer(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scale = SIZE / rect.width;
    return {
      x: (e.clientX - rect.left) * scale,
      y: (e.clientY - rect.top) * scale,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const p = pointerToBuffer(e);
    setCurrent([p]);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (current.length === 0) return;
    const p = pointerToBuffer(e);
    setCurrent((c) => [...c, p]);
    drawTo(p);
  }
  function onPointerUp() {
    if (current.length < 2) {
      setCurrent([]);
      return;
    }
    // commit + score against next expected stroke
    const idx = userStrokes.length;
    const ground = grounds[idx];
    let scored: ScoredStroke = { score: "again", cosine: 0, iou: 0 };
    if (ground) {
      const userInView = current.map(toViewSpace);
      scored = scoreStroke(userInView, ground, groundBoxes[idx]);
    }
    setUserStrokes((s) => [...s, current]);
    setScores((s) => [...s, scored]);
    setCurrent([]);
  }

  function drawTo(p: Point) {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const prev = current[current.length - 1];
    ctx.strokeStyle = "#1c1714";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function clear() {
    setUserStrokes([]);
    setScores([]);
    setCurrent([]);
    const c = canvasRef.current;
    if (c) c.getContext("2d")!.clearRect(0, 0, SIZE, SIZE);
  }

  const overall =
    expectedCount === 0
      ? null
      : completed === expectedCount
      ? "great"
      : completed > expectedCount * 0.6
      ? "okay"
      : null;

  return (
    <div className="grid flex-1 grid-cols-1 gap-0 lg:grid-cols-[minmax(340px,400px)_minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)_320px]">
      {/* trace canvas */}
      <section className="border-b border-dashed border-ink-3/30 p-4 sm:p-6 md:p-8 lg:border-b-0 lg:border-r">
        <div
          className="relative mx-auto"
          style={{
            width: "min(100%, " + SIZE + "px)",
            aspectRatio: "1 / 1",
          }}
        >
          {/* grid lines */}
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="absolute inset-0 pointer-events-none"
          >
            <rect
              x="0.5"
              y="0.5"
              width={SIZE - 1}
              height={SIZE - 1}
              fill="none"
              stroke="var(--ink-3)"
              strokeWidth="1"
              strokeOpacity="0.5"
            />
            <line
              x1={SIZE / 2}
              y1="8"
              x2={SIZE / 2}
              y2={SIZE - 8}
              stroke="var(--ink-3)"
              strokeOpacity="0.4"
              strokeDasharray="4 4"
            />
            <line
              x1="8"
              y1={SIZE / 2}
              x2={SIZE - 8}
              y2={SIZE / 2}
              stroke="var(--ink-3)"
              strokeOpacity="0.4"
              strokeDasharray="4 4"
            />
          </svg>

          {/* ghost target — full kanji light grey */}
          {strokes && (
            <svg
              viewBox={strokes.viewBox}
              className="absolute inset-0 pointer-events-none"
            >
              {strokes.paths.map((d, i) => (
                <path
                  key={`stroke-${i}`}
                  d={d}
                  fill="none"
                  stroke="var(--ink-3)"
                  strokeWidth={3}
                  strokeOpacity={
                    showAll || i < userStrokes.length + 1 ? 0.4 : 0.12
                  }
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {/* numbered start dot for next expected stroke */}
              {(() => {
                const idx = userStrokes.length;
                const g = grounds[idx];
                if (!g || g.length === 0) return null;
                return (
                  <g>
                    <circle
                      cx={g[0].x}
                      cy={g[0].y}
                      r={4}
                      fill="var(--accent)"
                    />
                    <text
                      x={g[0].x + 5}
                      y={g[0].y - 5}
                      fontSize={6}
                      fill="var(--accent)"
                      className="mono"
                    >
                      {idx + 1}
                    </text>
                  </g>
                );
              })()}
            </svg>
          )}

          <canvas
            ref={canvasRef}
            width={SIZE}
            height={SIZE}
            className="relative h-full w-full cursor-crosshair touch-none rounded-md bg-transparent"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={clear}>
            ↺ clear
          </Button>
          <Button
            size="sm"
            variant={showAll ? "primary" : "ghost"}
            onClick={() => setShowAll((s) => !s)}
          >
            show all strokes
          </Button>
          <Pill className="mono">
            {userStrokes.length} / {expectedCount || "?"}
          </Pill>
          {overall === "great" && (
            <Pill tone="moss">✓ great</Pill>
          )}
          {overall === "okay" && <Pill tone="gold">~ okay</Pill>}
        </div>

        {strokes && strokes.paths.length > 0 && (
          <div
            className="mx-auto mt-6"
            style={{ width: "min(100%, " + SIZE + "px)" }}
          >
            <div className="flex items-baseline justify-between border-b border-ink-3/30 pb-1">
              <div className="eyebrow">STROKE ORDER</div>
              <span className="mono text-[10px] text-ink-3">
                tap to focus
              </span>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-5">
              {strokes.paths.map((_, i) => {
                const nextIdx = userStrokes.length;
                const isDone = i < nextIdx;
                const isNext = i === nextIdx;
                const score = scores[i];
                const stateClass = isDone
                  ? score?.score === "great"
                    ? "border-moss/60 bg-moss/5"
                    : score?.score === "okay"
                    ? "border-gold/60 bg-gold/5"
                    : "border-accent/60 bg-accent-soft/30"
                  : isNext
                  ? "border-accent bg-accent-soft/40"
                  : "border-ink-3/30 bg-paper";
                const highlightColor = isDone
                  ? score?.score === "great"
                    ? "var(--moss)"
                    : score?.score === "okay"
                    ? "var(--gold)"
                    : "var(--accent)"
                  : isNext
                  ? "var(--accent)"
                  : "var(--ink)";
                return (
                  <div
                    key={`cell-${i}`}
                    className={`relative aspect-square rounded-sm border ${stateClass} p-1`}
                    title={`stroke ${i + 1}${
                      isDone ? ` · ${score?.score ?? "done"}` : ""
                    }`}
                  >
                    <span className="mono absolute left-1 top-0.5 text-[9px] font-semibold tabular-nums text-ink-3">
                      {i + 1}
                    </span>
                    <svg
                      viewBox={strokes.viewBox}
                      className="absolute inset-1"
                    >
                      {strokes.paths.map((d, j) => (
                        <path
                          key={j}
                          d={d}
                          fill="none"
                          stroke={
                            j === i ? highlightColor : "var(--ink-3)"
                          }
                          strokeWidth={j === i ? 5 : 2.5}
                          strokeOpacity={j === i ? 0.95 : 0.18}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ))}
                    </svg>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* meta + radicals + compounds.
          xl layout: short cards (RADICAL + STUDY TIPS) pair on row 1;
          taller cards (MEMORY HOOK, AI EXPLAINER, COMPOUNDS) span both
          columns so streaming content doesn't leave a big empty cell. */}
      <section className="space-y-4 p-4 sm:p-6 md:p-8 xl:grid xl:grid-cols-2 xl:items-start xl:gap-4 xl:space-y-0">
        {(meaning || onYomi || kunYomi) && (
          <div className="xl:col-span-2">
            <MeaningsAndReadings
              meaning={meaning}
              onYomi={onYomi}
              kunYomi={kunYomi}
            />
          </div>
        )}

        {radicals && (
          <Card tone="panel">
            <div className="eyebrow">RADICAL COMPONENTS</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {radicals
                .split(",")
                .map((r) => r.trim())
                .filter(Boolean)
                .map((r, i) => {
                  const glyph = RADICAL_GLYPHS[r];
                  return (
                    <span
                      key={`${r}-${i}`}
                      className="inline-flex items-baseline gap-1.5 rounded border border-ink-3/40 bg-paper px-2 py-0.5"
                    >
                      {glyph && (
                        <span className="jp text-base leading-none text-ink">
                          {glyph}
                        </span>
                      )}
                      <span className="mono text-xs text-ink-2">{r}</span>
                    </span>
                  );
                })}
            </div>
            <p className="mt-2 text-xs text-ink-3">
              Recognising these building blocks helps you remember and look up the character.
            </p>
          </Card>
        )}

        {/* Stroke-count study tip — kept beside RADICAL on row 1 */}
        <Card tone="panel">
          <div className="eyebrow">STUDY TIPS</div>
          <ul className="mt-2 space-y-1.5 text-xs text-ink-2">
            <li>
              <span className="mono text-ink-3 mr-1">①</span>
              Trace the ghost outline slowly without lifting, counting strokes aloud.
            </li>
            <li>
              <span className="mono text-ink-3 mr-1">②</span>
              Stroke order follows <strong>top → bottom</strong>, <strong>left → right</strong>. Horizontal before vertical when they cross.
            </li>
            <li>
              <span className="mono text-ink-3 mr-1">③</span>
              After tracing correctly 3 times, cover the ghost and write from memory.
            </li>
          </ul>
        </Card>

        {mnemonic && (
          <div className="xl:col-span-2">
            <Card tone="raised">
              <div className="eyebrow">MEMORY HOOK</div>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{mnemonic}</p>
            </Card>
          </div>
        )}

        <div className="xl:col-span-2">
          <AiExplainer
            character={character}
            meaning={meaning}
            onYomi={onYomi}
            kunYomi={kunYomi}
            radicals={radicals}
            defaultLevel={userLevel}
            kanjiLevel={kanjiLevel}
          />
        </div>

        {compounds.length > 0 && (
          <div className="xl:col-span-2">
          <Card tone="raised">
            <div className="eyebrow">EXAMPLE COMPOUNDS</div>
            <ul className="mt-2 divide-y divide-ink-3/20">
              {compounds.map((c, i) => (
                <li
                  key={`${c.surface}-${i}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5"
                >
                  <span className="jp min-w-0 text-base">
                    {c.surface}
                    <span className="mono ml-1 text-[10px] text-ink-3">
                      {c.reading}
                    </span>
                  </span>
                  <span className="text-xs text-ink-3">{c.en}</span>
                </li>
              ))}
            </ul>
          </Card>
          </div>
        )}
      </section>

      {/* right rail: session + history + actions */}
      <aside className="hidden flex-col gap-5 border-l border-ink-3/30 bg-paper-2 p-6 xl:flex">
        {/* Today's session progress ring */}
        <div>
          <div className="flex items-baseline justify-between">
            <div className="eyebrow">SESSION</div>
            <span className="mono text-[10px] tabular-nums text-ink-3">
              {completed}/{expectedCount || "?"} ok
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <SessionRing
              done={completed}
              total={expectedCount || 1}
              size={56}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug text-ink">
                {expectedCount === 0
                  ? "Stroke data unavailable"
                  : completed === 0
                  ? "Trace the ghost outline to begin."
                  : completed === expectedCount
                  ? "All strokes scored. Try writing from memory next."
                  : `${expectedCount - completed} stroke${
                      expectedCount - completed === 1 ? "" : "s"
                    } left to score.`}
              </p>
            </div>
          </div>
        </div>

        {/* 12-day review chart with baseline + labels */}
        <div>
          <div className="flex items-baseline justify-between">
            <div className="eyebrow">LAST 12 REVIEWS</div>
            <span className="mono text-[10px] text-ink-3">accuracy</span>
          </div>
          <div className="mt-2">
            <div className="relative flex h-20 items-end gap-1 border-b border-ink-3/30">
              <span className="mono absolute -left-1 top-0 text-[8px] text-ink-3/70">
                100
              </span>
              <span className="mono absolute -left-1 top-1/2 -translate-y-1/2 text-[8px] text-ink-3/70">
                50
              </span>
              <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-ink-3/20" />
              {Array.from({ length: 12 }).map((_, i) => {
                const pct = 22 + ((i * 17) % 70);
                const tone =
                  pct > 75 ? "bg-moss" : pct > 50 ? "bg-gold" : "bg-accent/60";
                return (
                  <div
                    key={`bar-${i}`}
                    className={`w-full rounded-t-sm ${tone}`}
                    style={{ height: `${pct}%` }}
                    title={`day -${12 - i} · ${pct}%`}
                  />
                );
              })}
            </div>
            <div className="mono mt-1 flex justify-between text-[9px] text-ink-3">
              <span>−12d</span>
              <span>−6d</span>
              <span>today</span>
            </div>
          </div>
        </div>

        {/* Next review */}
        <div className="flex items-baseline justify-between border-t border-dashed border-ink-3/30 pt-3">
          <div>
            <div className="eyebrow">NEXT REVIEW</div>
            <p className="mt-1 text-sm text-ink">in 4 days</p>
          </div>
          <span className="mono text-[10px] text-moss">interval ↑</span>
        </div>

        {/* Stroke feedback with rich empty state */}
        <Card tone="paper" className="!p-3">
          <div className="flex items-baseline justify-between">
            <div className="eyebrow">STROKE FEEDBACK</div>
            {scores.length > 0 && (
              <span className="mono text-[10px] tabular-nums text-ink-3">
                {scores.length} scored
              </span>
            )}
          </div>
          {scores.length === 0 ? (
            <div className="mt-2 rounded-sm border border-dashed border-ink-3/40 p-3 text-center">
              <div className="jp text-2xl leading-none text-ink-3/60">筆</div>
              <p className="mt-1 text-[11px] text-ink-3">
                Draw a stroke on the canvas. Order, direction, and
                bounding-box are scored against KanjiVG.
              </p>
            </div>
          ) : (
            <ul className="mt-2 space-y-1 text-xs">
              {scores.map((s, i) => {
                const label =
                  s.score === "great"
                    ? "great"
                    : s.score === "okay"
                    ? "okay"
                    : "retry";
                const tone =
                  s.score === "great"
                    ? "text-moss"
                    : s.score === "okay"
                    ? "text-gold"
                    : "text-accent";
                const mark = s.score === "great" ? "✓" : s.score === "okay" ? "~" : "×";
                return (
                  <li
                    key={`${s.score}-${i}`}
                    className="flex items-center justify-between gap-2 rounded-sm border border-ink-3/30 bg-paper-2 px-2 py-1"
                  >
                    <span className="mono tabular-nums text-ink-3">
                      #{i + 1}
                    </span>
                    <span className="mono tabular-nums text-[10px] text-ink-3">
                      cos {(s.cosine * 100).toFixed(0)} · iou{" "}
                      {(s.iou * 100).toFixed(0)}
                    </span>
                    <span className={`mono ${tone}`}>
                      {mark} {label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Button onClick={clear} variant="primary" className="mt-auto">
          I wrote it ✓ · next →
        </Button>
      </aside>
    </div>
  );
}

function MeaningsAndReadings({
  meaning,
  onYomi,
  kunYomi,
}: {
  meaning: string | null;
  onYomi: string | null;
  kunYomi: string | null;
}) {
  const meanings = (meaning ?? "")
    .split(/[,;]/)
    .map((m) => m.trim())
    .filter(Boolean);
  // Japanese reading lists may use Western commas, ideographic 、 or spaces.
  const splitReadings = (s: string) =>
    s
      .split(/[,、\s/]+/)
      .map((r) => r.trim())
      .filter(Boolean);
  const on = onYomi ? splitReadings(onYomi) : [];
  const kun = kunYomi ? splitReadings(kunYomi) : [];

  return (
    <Card tone="panel">
      <div className="eyebrow">MEANINGS &amp; READINGS</div>
      <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_1fr]">
        {meanings.length > 0 && (
          <div className="min-w-0">
            <div className="mono text-[10px] tracking-wider text-ink-3">
              ENGLISH · all meanings
            </div>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {meanings.map((m, i) => (
                <li
                  key={`${m}-${i}`}
                  className="rounded-full border border-ink-3/40 bg-paper px-2.5 py-0.5 text-xs text-ink-2"
                >
                  {m}
                </li>
              ))}
            </ul>
          </div>
        )}

        {(on.length > 0 || kun.length > 0) && (
          <div className="min-w-0 space-y-2.5">
            {on.length > 0 && (
              <div>
                <div className="mono flex items-baseline gap-1.5 text-[10px] tracking-wider text-ink-3">
                  <span className="jp text-sm text-ink-2">音</span>
                  <span>ON · sino-japanese (often in compounds)</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {on.map((r, i) => (
                    <span
                      key={`on-${r}-${i}`}
                      className="jp rounded border border-ink-3/40 bg-paper px-2 py-0.5 text-sm text-ink"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {kun.length > 0 && (
              <div>
                <div className="mono flex items-baseline gap-1.5 text-[10px] tracking-wider text-ink-3">
                  <span className="jp text-sm text-ink-2">訓</span>
                  <span>KUN · native japanese (often standalone)</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {kun.map((r, i) => (
                    <span
                      key={`kun-${r}-${i}`}
                      className="jp rounded border border-ink-3/40 bg-paper px-2 py-0.5 text-sm text-ink"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
