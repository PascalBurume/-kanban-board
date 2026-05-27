import * as React from "react";

type Tone = "neutral" | "accent" | "moss" | "gold" | "indigo";

const tones: Record<Tone, string> = {
  neutral: "bg-paper-2 text-ink-2 border-ink-3/50",
  accent: "bg-accent-soft text-accent border-accent/50",
  moss: "bg-moss/15 text-moss border-moss/40",
  gold: "bg-gold/15 text-gold border-gold/40",
  indigo: "bg-indigo/15 text-indigo border-indigo/40",
};

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Chip({
  tone = "neutral",
  className = "",
  children,
  ...rest
}: ChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs ${tones[tone]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}

export function Pill({
  tone = "neutral",
  className = "",
  children,
  ...rest
}: ChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}
