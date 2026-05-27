import Link from "next/link";

const links = [
  { href: "/home", label: "← Home" },
  { href: "/tutor", label: "Tutor" },
  { href: "/write", label: "Correct" },
  { href: "/generate", label: "Examples" },
  { href: "/breakdown", label: "Breakdown" },
  { href: "/deck-builder", label: "Deck Builder" },
];

export function AiNav({ current }: { current: string }) {
  return (
    <nav className="mb-7 flex flex-wrap gap-1 border-b border-ink-3/40 pb-4">
      {links.map((l) => {
        const active = l.href === current;
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              active
                ? "border border-ink-3/40 bg-paper-2 text-accent"
                : "text-ink-2 hover:bg-paper-2 hover:text-ink"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
