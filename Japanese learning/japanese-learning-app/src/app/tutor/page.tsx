"use client";

import { useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { useState } from "react";
import { AiNav } from "@/components/AiNav";
import { RubyText } from "@/components/RubyText";
import { Card } from "@/components/ui/Card";
import { Chip, Pill } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { JLPT_LEVELS, type JlptLevel } from "@/lib/ai/client";

const STARTERS = [
  "こんにちは。じこしょうかいをしてください。",
  "今日の天気について話しましょう。",
  "好きな食べ物は何ですか？",
];

function TutorInner() {
  const [level, setLevel] = useState<JlptLevel>("N5");
  const searchParams = useSearchParams();
  const prefillQ = searchParams?.get("q");
  const prefillSent = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    append,
    setInput,
  } = useChat({ api: "/api/tutor", body: { level } });

  useEffect(() => {
    if (prefillQ && !prefillSent.current && messages.length === 0) {
      prefillSent.current = true;
      append({ role: "user", content: prefillQ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-5xl px-6 pb-20 pt-6 md:px-8">
        <AiNav current="/tutor" />

        <header className="mb-8">
          <div className="flex items-baseline gap-3">
            <span className="jp text-2xl text-accent">先生</span>
            <div className="eyebrow">AI TUTOR</div>
          </div>
          <h1 className="mt-1 font-serif text-3xl md:text-[34px]">
            Have a real conversation.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-2">
            Chat in Japanese with a patient tutor. Replies adapt to the JLPT
            level you pick — every kanji comes with furigana, and a one-line
            English gloss follows.
          </p>
        </header>

        {/* Level selector */}
        <Card tone="raised" className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="eyebrow">LEVEL</div>
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
            <span className="mono text-[11px] text-ink-3">
              {messages.length} messages
            </span>
          </div>
        </Card>

        {/* Conversation */}
        <Card tone="paper" className="mb-4 !p-0">
          <div
            ref={scrollRef}
            className="max-h-[60vh] min-h-[280px] space-y-4 overflow-y-auto p-5"
          >
            {messages.length === 0 && (
              <div>
                <p className="mb-3 text-sm text-ink-3">
                  Start the conversation, or try one of these openers:
                </p>
                <div className="flex flex-col gap-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setInput(s)}
                      className="jp rounded-md border border-ink-3/40 bg-paper-2 px-3 py-2 text-left text-sm hover:border-accent hover:text-accent"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => {
              const isUser = m.role === "user";
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`mono mb-1 text-[10px] uppercase ${
                      isUser ? "text-ink-3" : "text-accent"
                    }`}
                  >
                    {isUser ? "You" : "Tutor"}
                  </div>
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2.5 text-[15px] leading-relaxed ${
                      isUser
                        ? "border border-ink-3/40 bg-paper-2"
                        : "border border-accent/40 bg-accent-soft/40"
                    }`}
                  >
                    <div className="jp whitespace-pre-wrap">
                      <RubyText text={m.content} />
                    </div>
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex items-start">
                <Pill className="mono">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                  thinking…
                </Pill>
              </div>
            )}
          </div>
        </Card>

        {error && (
          <Card tone="paper" className="mb-4 border-accent">
            <p className="text-sm text-accent">{error.message}</p>
          </Card>
        )}

        {/* Composer */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <Input
            value={input}
            onChange={handleInputChange}
            placeholder="日本語で書いてください..."
            disabled={isLoading}
            className="flex-1 jp"
          />
          <Button
            type="submit"
            size="lg"
            disabled={isLoading || !input.trim()}
          >
            {isLoading ? "Sending…" : "Send →"}
          </Button>
        </form>
      </div>
    </main>
  );
}

export default function TutorPage() {
  return (
    <Suspense fallback={null}>
      <TutorInner />
    </Suspense>
  );
}
