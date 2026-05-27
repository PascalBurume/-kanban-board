import * as React from "react";

type Tone = "paper" | "raised" | "panel" | "outline";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
  padded?: boolean;
}

const tones: Record<Tone, string> = {
  paper: "bg-paper border border-ink-3/40",
  raised: "bg-paper-2 border border-ink-3/30",
  panel: "bg-paper-3 border border-ink-2/40",
  outline: "bg-transparent border border-ink/80",
};

export function Card({
  tone = "paper",
  padded = true,
  className = "",
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={`rounded-lg ${tones[tone]} ${padded ? "p-4" : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
