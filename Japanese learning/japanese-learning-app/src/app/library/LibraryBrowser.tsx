"use client";

import * as React from "react";
import { Card } from "@/components/ui/Card";
import { Chip, Pill } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";

interface Resource {
  id: number;
  type: string;
  source: string;
  title: string;
  subtitle: string | null;
  url: string | null;
  level: string | null;
}

const TYPES = [
  "textbook",
  "podcast",
  "news",
  "manga",
  "video",
  "grammar-site",
];
const LEVELS = ["N5", "N4", "N3", "N2", "N1"];

const TYPE_COLORS: Record<string, string> = {
  textbook: "bg-indigo/15 border-indigo/40 text-indigo",
  podcast: "bg-gold/15 border-gold/40 text-gold",
  news: "bg-accent-soft border-accent/40 text-accent",
  manga: "bg-moss/15 border-moss/40 text-moss",
  video: "bg-paper-3 border-ink-3/40 text-ink-2",
  "grammar-site": "bg-ink/10 border-ink/30 text-ink",
};

export function LibraryBrowser({ items }: { items: Resource[] }) {
  const [types, setTypes] = React.useState<Set<string>>(new Set());
  const [levels, setLevels] = React.useState<Set<string>>(new Set());
  const [sources, setSources] = React.useState<Set<string>>(new Set());
  const [query, setQuery] = React.useState("");
  const [shelf, setShelf] = React.useState<Set<number>>(new Set());

  const allSources = Array.from(new Set(items.map((i) => i.source))).sort();

  const filtered = items.filter((r) => {
    if (types.size && !types.has(r.type)) return false;
    if (levels.size && (!r.level || !levels.has(r.level))) return false;
    if (sources.size && !sources.has(r.source)) return false;
    if (query) {
      const q = query.toLowerCase();
      const hay = `${r.title} ${r.subtitle ?? ""} ${r.source}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr]">
      <aside className="border-r border-dashed border-ink-3/40 bg-paper-2 p-5 md:p-6">
        <FilterGroup
          title="Type"
          items={TYPES}
          selected={types}
          onToggle={(t) => toggle(types, setTypes, t)}
          format={(t) => t.replace("-", " ")}
        />
        <FilterGroup
          title="JLPT level"
          items={LEVELS}
          selected={levels}
          onToggle={(t) => toggle(levels, setLevels, t)}
          asChips
        />
        <FilterGroup
          title="Source"
          items={allSources}
          selected={sources}
          onToggle={(t) => toggle(sources, setSources, t)}
        />
      </aside>

      <section className="p-5 md:p-7">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search by title, source, …"
            className="flex-1 rounded-md border border-ink-3/50 bg-paper px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
          <span className="mono text-xs text-ink-3">
            {filtered.length} of {items.length}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => (
            <Card key={r.id} tone="paper" padded={false}>
              <div
                className={`flex items-center justify-between border-b px-4 py-2 ${
                  TYPE_COLORS[r.type] ?? "bg-paper-3"
                }`}
              >
                <span className="mono text-[10px] uppercase tracking-wider">
                  {r.type.replace("-", " ")}
                </span>
                {r.level && <span className="mono text-[10px]">{r.level}</span>}
              </div>
              <div className="p-4">
                <h3 className="font-serif text-base">{r.title}</h3>
                {r.subtitle && (
                  <p className="mt-1 text-xs text-ink-3">{r.subtitle}</p>
                )}
                <div className="mt-2 text-[11px] text-ink-2">
                  source · {r.source}
                </div>
                <div className="mt-4 flex gap-2">
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex-1">
                      <Button size="sm" className="w-full">
                        open ↗
                      </Button>
                    </a>
                  ) : (
                    <Button size="sm" className="flex-1" disabled>
                      open
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={shelf.has(r.id) ? "primary" : "ghost"}
                    onClick={() => toggle(shelf, setShelf, r.id)}
                  >
                    {shelf.has(r.id) ? "★ shelved" : "+ shelf"}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

function toggle<T>(
  set: Set<T>,
  setter: React.Dispatch<React.SetStateAction<Set<T>>>,
  v: T
) {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  setter(next);
}

function FilterGroup<T extends string | number>({
  title,
  items,
  selected,
  onToggle,
  format,
  asChips,
}: {
  title: string;
  items: T[];
  selected: Set<T>;
  onToggle: (t: T) => void;
  format?: (t: T) => string;
  asChips?: boolean;
}) {
  return (
    <div className="mb-5">
      <div className="eyebrow mb-2">{title}</div>
      {asChips ? (
        <div className="flex flex-wrap gap-1">
          {items.map((it) => (
            <button type="button"
              key={String(it)}
              onClick={() => onToggle(it)}
              className={`mono rounded-sm border px-2 py-0.5 text-[11px] ${
                selected.has(it)
                  ? "border-accent bg-accent text-[#fff7ec]"
                  : "border-ink-3/50 bg-paper text-ink-2 hover:border-accent"
              }`}
            >
              {String(it)}
            </button>
          ))}
        </div>
      ) : (
        <ul className="space-y-1 text-sm">
          {items.map((it) => (
            <li key={String(it)}>
              <label className="flex cursor-pointer items-center gap-2 text-ink-2 hover:text-ink">
                <input
                  type="checkbox"
                  checked={selected.has(it)}
                  onChange={() => onToggle(it)}
                  className="accent-accent"
                />
                <span>{format ? format(it) : String(it)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
