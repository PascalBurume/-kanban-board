"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { romajiToHiragana } from "@/lib/romaji";
import { formatInterval, Rating, scheduleNext } from "@/lib/srs";
import { gradeCard } from "./actions";

export interface ReviewCard {
  cardId: number;
  surface: string;
  reading: string;
  meaningEn: string;
  level: string;
  ease: number;
  interval: number;
}

interface Props {
  cards: ReviewCard[];
  forecast: { offset: number; count: number }[];
  leeches: { jp: string; en: string; fails: number }[];
  totalCards: number;
  nextDueISO: string | null;
  selectedLevel: string | null;
  levels: string[];
}

const RATINGS: Rating[] = ["again", "hard", "good", "easy"];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const RATING_COLOR: Record<Rating, string> = {
  again: "border-red-300 bg-red-50 text-red-700 hover:bg-red-100",
  hard:  "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100",
  good:  "border-moss/40 bg-moss/10 text-moss hover:bg-moss/20",
  easy:  "border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100",
};

const MC_LABELS = ["A", "B", "C", "D"];

type Mode = "type" | "mc";

interface SessionState {
  queue: ReviewCard[];
  idx: number;
  typed: string;
  revealed: boolean;
  mode: Mode;
  showFurigana: boolean;
  showMeaning: boolean;
  mcAnswered: boolean;
  mcChosen: string | null;
  pending: boolean;
  stats: { correct: number; again: number; done: number };
}

type SessionAction =
  | { type: "TYPE"; value: string }
  | { type: "REVEAL" }
  | { type: "ANSWER_MC"; chosen: string }
  | { type: "RATE_START" }
  | { type: "RATE_FAIL" }
  | { type: "RATE_END"; rating: Rating; card: ReviewCard; wasCorrect: boolean }
  | { type: "SET_MODE"; mode: Mode }
  | { type: "TOGGLE_FURIGANA" }
  | { type: "TOGGLE_MEANING" };

function initSession(cards: ReviewCard[]): SessionState {
  return {
    queue: cards,
    idx: 0,
    typed: "",
    revealed: false,
    mode: "type",
    showFurigana: true,
    showMeaning: true,
    mcAnswered: false,
    mcChosen: null,
    pending: false,
    stats: { correct: 0, again: 0, done: 0 },
  };
}

function sessionReducer(s: SessionState, a: SessionAction): SessionState {
  switch (a.type) {
    case "TYPE":
      return { ...s, typed: a.value };
    case "REVEAL":
      return { ...s, revealed: true };
    case "ANSWER_MC":
      return { ...s, mcChosen: a.chosen, mcAnswered: true, revealed: true };
    case "RATE_START":
      return { ...s, pending: true };
    case "RATE_FAIL":
      return { ...s, pending: false };
    case "RATE_END": {
      const isAgain = a.rating === "again";
      return {
        ...s,
        pending: false,
        queue: isAgain ? [...s.queue, a.card] : s.queue,
        idx: s.idx + 1,
        typed: "",
        revealed: false,
        mcAnswered: false,
        mcChosen: null,
        stats: {
          correct: s.stats.correct + (a.wasCorrect && !isAgain ? 1 : 0),
          again: s.stats.again + (isAgain ? 1 : 0),
          done: s.stats.done + 1,
        },
      };
    }
    case "SET_MODE":
      return { ...s, mode: a.mode };
    case "TOGGLE_FURIGANA":
      return { ...s, showFurigana: !s.showFurigana };
    case "TOGGLE_MEANING":
      return { ...s, showMeaning: !s.showMeaning };
  }
}

export function SRSReview({ cards, forecast, leeches, totalCards, nextDueISO, selectedLevel, levels }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, dispatch] = React.useReducer(sessionReducer, cards, initSession);
  const { queue, idx, typed, revealed, mode, showFurigana, showMeaning, mcAnswered, mcChosen, pending, stats } = state;
  const inputRef = React.useRef<HTMLInputElement>(null);

  // sessionStart on the client only — avoids hydration mismatch on Date.now()
  const sessionStartRef = React.useRef(0);
  React.useEffect(() => {
    sessionStartRef.current = Date.now();
  }, []);

  function setLevel(next: string | null) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (next) params.set("level", next);
    else params.delete("level");
    const q = params.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  }

  const total = cards.length;
  const c: ReviewCard | undefined = queue[idx];
  const hiragana = romajiToHiragana(typed);
  const typingCorrect = c ? hiragana === c.reading : false;
  const mcCorrect = mcChosen === c?.meaningEn;
  const isCorrect = mode === "type" ? typingCorrect : mcCorrect;

  const previews = React.useMemo(() => {
    if (!c) return null;
    const out: Record<Rating, string> = {} as Record<Rating, string>;
    for (const r of RATINGS) out[r] = formatInterval(scheduleNext({ ease: c.ease, interval: c.interval }, r).interval);
    return out;
  }, [c]);

  const mcOptions = React.useMemo(() => {
    if (!c) return [] as string[];
    const others = cards.reduce<string[]>((acc, x) => {
      if (x.cardId !== c.cardId) acc.push(x.meaningEn);
      return acc;
    }, []);
    return [c.meaningEn, ...others.toSorted(() => Math.random() - 0.5).slice(0, 3)].toSorted(() => Math.random() - 0.5);
  }, [c, cards]);

  async function rate(r: Rating) {
    if (!c || pending) return;
    dispatch({ type: "RATE_START" });
    try {
      await gradeCard(c.cardId, r);
    } catch {
      dispatch({ type: "RATE_FAIL" });
      return;
    }
    dispatch({ type: "RATE_END", rating: r, card: c, wasCorrect: isCorrect });
  }

  function answerMC(opt: string) {
    if (!c || mcAnswered) return;
    dispatch({ type: "ANSWER_MC", chosen: opt });
  }

  // Focus the type input whenever a fresh card appears (idx advances, or mode switch).
  React.useEffect(() => {
    if (mode === "type" && !revealed && c) inputRef.current?.focus();
  }, [c?.cardId, mode, revealed, c]);

  // Keyboard shortcuts. Use a ref to hold the latest handlers + state so the
  // listener is attached once and always sees fresh values without re-binding.
  const keyboardRef = React.useRef({ rate, answerMC, revealed, pending, mode, mcAnswered, mcOptions, hasCard: !!c });
  React.useEffect(() => {
    keyboardRef.current = { rate, answerMC, revealed, pending, mode, mcAnswered, mcOptions, hasCard: !!c };
  });
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keyboardRef.current;
      if (!k.hasCard) return;
      const inInput = e.target instanceof HTMLInputElement;
      if (e.key === " " && !k.revealed && !inInput) {
        e.preventDefault();
        dispatch({ type: "REVEAL" });
        return;
      }
      if (k.revealed && !k.pending) {
        if (e.key === "1") void k.rate("again");
        if (e.key === "2") void k.rate("hard");
        if (e.key === "3") void k.rate("good");
        if (e.key === "4") void k.rate("easy");
      }
      if (!k.revealed && k.mode === "mc" && !k.mcAnswered) {
        const i = ["a", "b", "c", "d"].indexOf(e.key.toLowerCase());
        if (i >= 0 && k.mcOptions[i]) k.answerMC(k.mcOptions[i]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── empty / done ──────────────────────────────────────────────────────
  if (total === 0) {
    return (
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_300px]">
        <main className="flex flex-col items-center px-4 py-6 md:py-10">
          <div className="mb-4 w-full max-w-lg">
            <div className="inline-flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">JLPT</span>
              <div className="inline-flex overflow-hidden rounded-md border border-ink-3/30">
                <button type="button"
                  onClick={() => setLevel(null)}
                  className={`px-2.5 py-1 text-[11px] font-medium transition ${
                    selectedLevel === null ? "bg-ink text-paper" : "bg-paper text-ink-2 hover:bg-paper-2"
                  }`}
                >
                  All
                </button>
                {levels.map((lv) => (
                  <button type="button"
                    key={lv}
                    onClick={() => setLevel(lv)}
                    className={`border-l border-ink-3/30 px-2.5 py-1 font-mono text-[11px] font-medium transition ${
                      selectedLevel === lv ? "bg-ink text-paper" : "bg-paper text-ink-2 hover:bg-paper-2"
                    }`}
                  >
                    {lv}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <EmptyState totalCards={totalCards} nextDueISO={nextDueISO} selectedLevel={selectedLevel} />
        </main>
      </div>
    );
  }
  if (idx >= queue.length) {
    const elapsedMs = sessionStartRef.current === 0 ? 0 : Date.now() - sessionStartRef.current;
    return <SessionDone stats={stats} total={total} elapsedMs={elapsedMs} />;
  }

  const progressPct = Math.round((stats.done / total) * 100);

  return (
    <div className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_300px]">
      {/* ── main ── */}
      <main className="flex flex-col items-center justify-start gap-0 overflow-y-auto px-4 py-6 md:py-10">

        {/* level + furigana controls */}
        <div className="mb-4 w-full max-w-lg">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">JLPT</span>
              <div className="inline-flex overflow-hidden rounded-md border border-ink-3/30">
                <button type="button"
                  onClick={() => setLevel(null)}
                  className={`px-2.5 py-1 text-[11px] font-medium transition ${
                    selectedLevel === null
                      ? "bg-ink text-paper"
                      : "bg-paper text-ink-2 hover:bg-paper-2"
                  }`}
                >
                  All
                </button>
                {levels.map((lv) => (
                  <button type="button"
                    key={lv}
                    onClick={() => setLevel(lv)}
                    className={`border-l border-ink-3/30 px-2.5 py-1 font-mono text-[11px] font-medium transition ${
                      selectedLevel === lv
                        ? "bg-ink text-paper"
                        : "bg-paper text-ink-2 hover:bg-paper-2"
                    }`}
                  >
                    {lv}
                  </button>
                ))}
              </div>
            </div>
            <div className="inline-flex items-center gap-4">
              <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] font-medium text-ink-2">
                <input
                  type="checkbox"
                  checked={showFurigana}
                  onChange={() => dispatch({ type: "TOGGLE_FURIGANA" })}
                  className="size-3.5 accent-accent"
                />
                <span>Show furigana <span className="jp text-ink-3">（ふりがな）</span></span>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] font-medium text-ink-2">
                <input
                  type="checkbox"
                  checked={showMeaning}
                  onChange={() => dispatch({ type: "TOGGLE_MEANING" })}
                  className="size-3.5 accent-accent"
                />
                <span>Show meaning</span>
              </label>
            </div>
          </div>
        </div>

        {/* progress bar + header */}
        <div className="w-full max-w-lg">
          <div className="mb-3 flex items-center justify-between text-xs">
            <span className="font-medium text-ink-2">
              {stats.done}/{total} reviewed
              {queue.length > total && (
                <span className="ml-1.5 rounded-full bg-accent/10 px-1.5 py-0.5 text-accent">
                  +{queue.length - total} re-queued
                </span>
              )}
            </span>
            {/* mode toggle — minimal text tabs */}
            <div className="inline-flex items-center gap-3">
              {(["type", "mc"] as const).map((m, idx) => (
                <React.Fragment key={m}>
                  {idx > 0 && (
                    <span className="text-ink-3/40 select-none">·</span>
                  )}
                  <button type="button"
                    onClick={() => dispatch({ type: "SET_MODE", mode: m })}
                    title={m === "type" ? "Write the answer from memory" : "Pick from multiple choices"}
                    className={`relative inline-flex items-center gap-1 text-[11px] font-medium leading-none transition-colors duration-150 ${
                      mode === m ? "text-ink" : "text-ink-3 hover:text-ink-2"
                    }`}
                  >
                    <span aria-hidden className="text-[10px]">
                      {m === "type" ? "✏" : "⊙"}
                    </span>
                    <span>{m === "type" ? "Recall" : "Choose"}</span>
                    {mode === m && (
                      <span className="absolute -bottom-1 left-0 h-px w-full rounded-full bg-accent" />
                    )}
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* progress bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-3/20">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* card */}
        <div className="mt-6 w-full max-w-lg rounded-xl border border-ink-3/25 bg-paper shadow-sm">
          {/* card header */}
          <div className="flex items-center justify-between border-b border-ink-3/15 px-5 py-3">
            <span className="rounded-sm border border-ink-3/40 px-2 py-0.5 font-mono text-[11px] text-ink-2">
              {c.level}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-3">
              Vocabulary
            </span>
          </div>

          {/* kanji + meaning */}
          <div className="flex flex-col items-center px-6 py-8">
            {showFurigana && (
              <span className="jp mb-2 text-base leading-none tracking-wide text-ink-3 md:text-lg">
                {c.reading}
              </span>
            )}
            <span className="jp text-[80px] leading-none tracking-tight text-ink md:text-[96px]">
              {c.surface}
            </span>
            {showMeaning && (
              <span className="mt-4 text-sm font-medium text-ink-2">{c.meaningEn}</span>
            )}
          </div>

          {/* answer zone */}
          <div className="border-t border-ink-3/15 px-5 pb-5 pt-4">
            {mode === "type" ? (
              <>
                <input
                  ref={inputRef}
                  value={typed}
                  onChange={(e) => dispatch({ type: "TYPE", value: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") dispatch({ type: "REVEAL" }); }}
                  placeholder="Type the reading in romaji…"
                  disabled={revealed}
                  className="w-full rounded-lg border border-ink-3/40 bg-paper-2 px-4 py-3 text-center text-base outline-none transition placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
                />
                <div className="mt-2 flex items-center justify-between px-1">
                  <span className={`jp text-lg font-medium transition ${hiragana ? "text-ink" : "text-ink-3"}`}>
                    {hiragana || "—"}
                  </span>
                  {!revealed && (
                    <span className="text-[11px] text-ink-3">
                      <kbd className="rounded border border-ink-3/40 px-1 py-0.5 font-mono text-[10px]">Enter</kbd>{" "}
                      check &nbsp;·&nbsp;{" "}
                      <kbd className="rounded border border-ink-3/40 px-1 py-0.5 font-mono text-[10px]">Space</kbd>{" "}
                      reveal
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {mcOptions.map((opt, i) => {
                  const chosen = mcAnswered && mcChosen === opt;
                  const correctOpt = mcAnswered && opt === c.meaningEn;
                  const wrongChosen = mcAnswered && chosen && !correctOpt;
                  return (
                    <button type="button"
                      key={i}
                      disabled={mcAnswered}
                      onClick={() => answerMC(opt)}
                      className={`group flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition ${
                        correctOpt
                          ? "border-moss/50 bg-moss/10 text-moss"
                          : wrongChosen
                          ? "border-red-300 bg-red-50 text-red-600"
                          : mcAnswered
                          ? "border-ink-3/25 bg-paper text-ink-3 opacity-60"
                          : "border-ink-3/35 bg-paper text-ink hover:border-accent hover:bg-accent/5"
                      }`}
                    >
                      <span className={`flex size-7 shrink-0 items-center justify-center rounded-md border font-mono text-[12px] font-bold leading-none ${
                        correctOpt ? "border-moss/50 bg-moss/20 text-moss"
                          : wrongChosen ? "border-red-300 bg-red-100 text-red-600"
                          : "border-ink-3/40 bg-paper-2 text-ink-2 group-hover:border-accent/60 group-hover:text-accent"
                      }`}>
                        {MC_LABELS[i]}
                      </span>
                      <span className="flex-1">{opt}</span>
                      {correctOpt && <span className="text-moss">✓</span>}
                      {wrongChosen && <span className="text-red-500">✗</span>}
                    </button>
                  );
                })}
                {!mcAnswered && (
                  <p className="mt-2 flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-ink-3">
                    <span>Press</span>
                    <span className="inline-flex items-center gap-1">
                      {MC_LABELS.map((k) => (
                        <kbd
                          key={k}
                          className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-ink-3/30 bg-paper-2 px-1.5 font-mono text-[10px] font-medium leading-none text-ink-2 shadow-sm"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                    <span>or click to answer</span>
                  </p>
                )}
              </div>
            )}

            {/* reveal panel */}
            {revealed && (
              <div className={`mt-4 flex items-center justify-between rounded-lg border px-4 py-3 ${
                isCorrect ? "border-moss/40 bg-moss/8" : "border-red-200 bg-red-50/60"
              }`}>
                <div>
                  <span className="jp text-2xl font-medium text-ink">{c.reading}</span>
                  <span className="ml-3 text-xs text-ink-3">{c.meaningEn}</span>
                </div>
                <span className={`text-sm font-semibold ${isCorrect ? "text-moss" : "text-red-500"}`}>
                  {isCorrect ? "✓ Correct" : "✗ Miss"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* action row */}
        <div className="mt-4 w-full max-w-lg">
          {revealed ? (
            <div className="grid grid-cols-4 gap-2">
              {RATINGS.map((r, i) => (
                <button type="button"
                  key={r}
                  disabled={pending}
                  onClick={() => rate(r)}
                  className={`flex flex-col items-center rounded-lg border px-2 py-3 text-sm font-medium transition disabled:opacity-50 ${RATING_COLOR[r]}`}
                >
                  <span className="capitalize">{r}</span>
                  <span className="mt-0.5 font-mono text-[10px] opacity-70">
                    {previews?.[r]}
                  </span>
                  <span className="mt-0.5 font-mono text-[9px] opacity-40">
                    key {i + 1}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex gap-2">
              {mode === "type" && (
                <button type="button"
                  onClick={() => dispatch({ type: "REVEAL" })}
                  className="flex-1 rounded-lg bg-ink px-4 py-3 text-sm font-medium text-paper transition hover:bg-ink/80"
                >
                  Check answer
                </button>
              )}
              <button type="button"
                onClick={() => dispatch({ type: "REVEAL" })}
                className="flex-1 rounded-lg border border-ink-3/35 bg-paper px-4 py-3 text-sm text-ink-2 transition hover:bg-paper-2"
              >
                Reveal answer
              </button>
            </div>
          )}
        </div>
      </main>

      {/* ── right rail ── */}
      <aside className="hidden flex-col gap-4 border-l border-ink-3/20 bg-paper-2 p-5 lg:flex">
        {/* session stats */}
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-ink-3">This Session</p>
          <div className="grid grid-cols-3 gap-2">
            <StatBox n={stats.correct} label="correct" color="text-moss" />
            <StatBox n={stats.again} label="again" color="text-red-500" />
            <StatBox n={Math.max(0, queue.length - idx)} label="left" color="text-ink-2" />
          </div>
        </div>

        {/* forecast */}
        <ForecastChart forecast={forecast} />

        {/* leeches */}
        <LeechesPanel leeches={leeches} />
      </aside>
    </div>
  );
}

// ── sub-components ─────────────────────────────────────────────────────

function StatBox({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div className="rounded-lg border border-ink-3/20 bg-paper p-2 text-center">
      <div className={`font-serif text-2xl font-bold ${color}`}>{n}</div>
      <div className="mt-0.5 font-mono text-[10px] text-ink-3">{label}</div>
    </div>
  );
}

function ForecastChart({ forecast }: { forecast: { offset: number; count: number }[] }) {
  const today = new Date();
  const max = Math.max(1, ...forecast.map((f) => f.count));
  return (
    <div>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-ink-3">5-Day Forecast</p>
      <div className="flex items-end gap-1.5">
        {forecast.map((f) => {
          const date = new Date(today.getTime() + f.offset * 86400000);
          const day = f.offset === 0 ? "Today" : DAY_LABELS[date.getDay() === 0 ? 6 : date.getDay() - 1];
          const h = Math.max(4, Math.round((f.count / max) * 72));
          return (
            <div key={f.offset} className="flex flex-1 flex-col items-center gap-1" title={`${f.count} due`}>
              <span className="font-mono text-[10px] text-ink-3">{f.count || ""}</span>
              <div className="w-full rounded-sm bg-accent/70" style={{ height: h }} />
              <span className="font-mono text-[9px] text-ink-3">{day}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeechesPanel({ leeches }: { leeches: { jp: string; en: string; fails: number }[] }) {
  return (
    <div className="rounded-lg border border-ink-3/20 bg-paper p-3">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-ink-3">Leeches</p>
      {leeches.length === 0 ? (
        <p className="text-xs text-ink-3">Items you fail repeatedly will surface here.</p>
      ) : (
        <ul className="space-y-2">
          {leeches.map((l) => (
            <li key={l.jp} className="flex items-center justify-between border-b border-ink-3/15 pb-2 last:border-0 last:pb-0">
              <span className="jp text-base text-ink">{l.jp}</span>
              <span className="text-xs text-ink-3">{l.en}</span>
              <span className="rounded-full bg-red-100 px-1.5 py-0.5 font-mono text-[10px] text-red-600">
                ×{l.fails}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({
  totalCards,
  nextDueISO,
  selectedLevel,
}: {
  totalCards: number;
  nextDueISO: string | null;
  selectedLevel?: string | null;
}) {
  const next = nextDueISO ? new Date(nextDueISO) : null;
  const hours = next ? Math.max(0, Math.round((next.getTime() - Date.now()) / 3600000)) : null;
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm rounded-xl border border-ink-3/25 bg-paper p-8 text-center shadow-sm">
        <div className="mb-4 text-5xl">🌸</div>
        <h2 className="font-serif text-2xl text-ink">No reviews due</h2>
        {totalCards === 0 ? (
          <p className="mt-3 text-sm text-ink-2">Your deck is empty. Visit a lesson to start adding words.</p>
        ) : selectedLevel ? (
          <p className="mt-3 text-sm text-ink-2">
            No <span className="font-mono font-semibold text-ink">{selectedLevel}</span> cards are due. Pick another level above.
          </p>
        ) : next ? (
          <p className="mt-3 text-sm text-ink-2">
            {totalCards} cards in your deck. Next review in{" "}
            <span className="font-semibold text-ink">
              {hours! < 24 ? `${hours}h` : `${Math.round(hours! / 24)}d`}
            </span>.
          </p>
        ) : (
          <p className="mt-3 text-sm text-ink-2">All {totalCards} cards reviewed. Come back tomorrow.</p>
        )}
      </div>
    </div>
  );
}

function SessionDone({ stats, total, elapsedMs }: { stats: { correct: number; again: number; done: number }; total: number; elapsedMs: number }) {
  const mins = Math.max(1, Math.round(elapsedMs / 60000));
  const acc = stats.done > 0 ? Math.round((stats.correct / stats.done) * 100) : 0;
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm rounded-xl border border-ink-3/25 bg-paper p-8 text-center shadow-sm">
        <div className="mb-4 text-5xl">🎉</div>
        <h2 className="font-serif text-2xl text-ink">Session complete</h2>
        <p className="mt-1 text-sm text-ink-3">{stats.done} cards · {mins} min</p>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <StatBox n={stats.correct} label="correct" color="text-moss" />
          <StatBox n={stats.again} label="again" color="text-red-500" />
          <StatBox n={acc} label="% acc" color="text-ink-2" />
        </div>
        <p className="mt-4 text-xs text-ink-3">Refresh to pull more due cards.</p>
      </div>
    </div>
  );
}
