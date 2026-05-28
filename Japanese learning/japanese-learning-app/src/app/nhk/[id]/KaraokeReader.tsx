"use client";

import * as React from "react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";

interface Props {
  sentences: string[];
  timings: number[];
  clipId: number;
  titleEn: string;
  summaryEn: string | null;
  audioUrl: string | null;
  bodyJpWithFuri: string | null;
}

export function KaraokeReader({
  sentences,
  timings,
  clipId,
  titleEn,
  summaryEn,
  audioUrl,
  bodyJpWithFuri,
}: Props) {
  const [i, setI] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [loop, setLoop] = React.useState(false);
  const [speed, setSpeed] = React.useState(1);
  const [saved, setSaved] = React.useState<{ word: string }[]>([]);
  const [popWord, setPopWord] = React.useState<string | null>(null);
  const [showSummary, setShowSummary] = React.useState(false);

  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const total = sentences.length;
  const totalSec = timings.reduce((a, b) => a + b, 0);
  const elapsed = timings.slice(0, i).reduce((a, b) => a + b, 0);

  React.useEffect(() => {
    if (!playing) return;
    const ms = (timings[i] * 1000) / speed;
    const t = setTimeout(() => {
      if (loop) return;
      if (i + 1 < total) setI((cur) => cur + 1);
      else setPlaying(false);
    }, ms);
    return () => clearTimeout(t);
  }, [playing, i, total, loop, speed, timings]);

  React.useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.playbackRate = speed;
    if (playing) a.play().catch(() => {});
    else a.pause();
  }, [playing, speed]);

  function clickWord(w: string) {
    setPopWord(w === popWord ? null : w);
  }

  function saveCurrentWord() {
    if (popWord) {
      setSaved((s) => [...s, { word: popWord }]);
      setPopWord(null);
    }
  }

  function fmtTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  const currentRubyHtml = React.useMemo(() => {
    if (!bodyJpWithFuri) return null;
    const chunks = bodyJpWithFuri
      .replace(/\r\n/g, "\n")
      .split(/(?<=。)|\n+/)
      .flatMap((s) => { const t = s.trim(); return t ? [t] : []; });
    return chunks[i] ?? null;
  }, [bodyJpWithFuri, i]);

  return (
    <div className="flex flex-1 flex-col">
      {/* top chips */}
      <div className="flex flex-wrap items-center gap-2 border-b border-dashed border-ink-3/40 px-6 py-3 md:px-8">
        <Pill className="mono">
          <button type="button" onClick={() => setSpeed(speed === 1 ? 0.75 : speed === 0.75 ? 0.5 : 1)}>
            speed {speed}×
          </button>
        </Pill>
        <Pill tone={loop ? "accent" : "neutral"} className="mono">
          <button type="button" onClick={() => setLoop((l) => !l)}>
            loop sentence {loop ? "ON" : "OFF"}
          </button>
        </Pill>
        <Pill className="mono">auto-scroll</Pill>
        {summaryEn && (
          <Pill
            tone={showSummary ? "accent" : "neutral"}
            className="mono"
          >
            <button type="button" onClick={() => setShowSummary((s) => !s)}>
              summary {showSummary ? "ON" : "OFF"}
            </button>
          </Pill>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm italic text-ink-3">{titleEn}</span>
          <Button
            size="sm"
            onClick={() => alert(`Saved ${saved.length} word(s) → SRS`)}
            disabled={saved.length === 0}
          >
            save {saved.length || ""} → SRS
          </Button>
        </div>
      </div>

      {showSummary && summaryEn && (
        <div className="border-b border-dashed border-ink-3/30 bg-paper-2/60 px-6 py-3 md:px-8">
          <div className="eyebrow mb-1">SUMMARY · EN</div>
          <p className="max-w-3xl text-sm text-ink-2">{summaryEn}</p>
        </div>
      )}

      {/* center transcript */}
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8">
        {i > 1 && (
          <p className="jp text-lg text-ink-3/70">{sentences[i - 2]}</p>
        )}
        {i > 0 && (
          <p className="jp text-xl text-ink-3">{sentences[i - 1]}</p>
        )}
        <Card
          tone="paper"
          className="max-w-3xl border-2 border-accent shadow-md"
        >
          {currentRubyHtml ? (
            <p
              className="jp text-center text-[26px] leading-relaxed md:text-[32px]"
              // bodyJpWithFuri is seeded ruby/furigana HTML from the DB (author-controlled), safe to render
              dangerouslySetInnerHTML={{ __html: currentRubyHtml }}
            />
          ) : (
            <p className="jp text-center text-[26px] leading-relaxed md:text-[32px]">
              {sentences[i].split("").map((ch, k) => (
                <span
                  key={`k-${k}`}
                  onClick={() =>
                    /[一-鿿]/.test(ch) ? clickWord(ch) : undefined
                  }
                  className={
                    /[一-鿿]/.test(ch)
                      ? "cursor-pointer hover:text-accent"
                      : ""
                  }
                >
                  {ch}
                </span>
              ))}
            </p>
          )}
          {popWord && (
            <div className="mt-3 rounded-md border border-accent/50 bg-accent-soft/50 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="jp text-2xl">{popWord}</span>
                  <span className="mono ml-2 text-xs text-ink-3">
                    (reading TBD)
                  </span>
                </div>
                <Button size="sm" onClick={saveCurrentWord}>
                  + SRS
                </Button>
              </div>
              <p className="mt-1 text-xs text-ink-2">
                dictionary lookup will land here once JMdict is wired
              </p>
            </div>
          )}
        </Card>
        {i + 1 < total && (
          <p className="jp text-lg text-ink-3/70">{sentences[i + 1]}</p>
        )}
      </div>

      {/* waveform + controls */}
      <footer className="border-t border-ink-3/30 bg-paper-2 px-6 py-3 md:px-8">
        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            preload="metadata"
            onEnded={() => setPlaying(false)}
            className="mb-2 w-full"
            controls
          />
        )}
        <Waveform progress={elapsed / totalSec} bars={120} />
        <div className="mt-2 flex items-center justify-between">
          <span className="mono text-xs text-ink-3">
            {fmtTime(elapsed)} / {fmtTime(totalSec)}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setI(Math.max(0, i - 1))}
            >
              ↺ prev
            </Button>
            <Button onClick={() => setPlaying((p) => !p)}>
              {playing ? "❚❚ pause" : "▶ play"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setI(Math.min(total - 1, i + 1))}
            >
              next ↻
            </Button>
          </div>
          <span className="mono text-xs text-ink-3">
            sentence {i + 1} / {total}
          </span>
        </div>
      </footer>
    </div>
  );
}

function Waveform({ progress, bars }: { progress: number; bars: number }) {
  const arr = React.useMemo(
    () =>
      Array.from(
        { length: bars },
        (_, i) => 10 + Math.abs(Math.sin(i * 1.7)) * 24 + (i % 7) * 1.5
      ),
    [bars]
  );
  return (
    <div className="relative flex h-10 items-end gap-[2px]">
      {arr.map((h, i) => {
        const passed = i / bars < progress;
        return (
          <div
            key={`cell-${i}`}
            className={`w-[2px] rounded-sm ${
              passed ? "bg-accent" : "bg-ink-3/40"
            }`}
            style={{ height: h }}
          />
        );
      })}
      <div
        className="absolute top-0 h-full w-px bg-accent"
        style={{ left: `${Math.min(100, progress * 100)}%` }}
      />
    </div>
  );
}
