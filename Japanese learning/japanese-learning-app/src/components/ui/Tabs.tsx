"use client";

import * as React from "react";

export interface TabsProps {
  items: { key: string; label: React.ReactNode }[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({ items, value, onChange, className = "" }: TabsProps) {
  return (
    <div
      role="tablist"
      className={`inline-flex gap-1 rounded-md border border-ink-3/40 bg-paper-2 p-1 ${className}`}
    >
      {items.map((it) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.key)}
            className={`rounded-sm px-3 py-1 text-sm transition-colors ${
              active
                ? "bg-paper text-ink shadow-sm"
                : "text-ink-2 hover:text-ink"
            }`}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
