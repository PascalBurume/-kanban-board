import Link from "next/link";
import { NAV_ITEMS, NavKey } from "./nav";

interface Props {
  active?: NavKey;
  user?: { name: string; level: string; day: number };
}

export function LeftRail({
  active,
  user = { name: "Alex M.", level: "N3", day: 47 },
}: Props) {
  return (
    <aside className="hidden md:flex w-[64px] lg:w-[208px] shrink-0 flex-col gap-1 border-r border-ink-3/40 bg-paper-2 p-3">
      <div className="mb-2 flex items-center gap-2 border-b border-dashed border-ink-3/40 px-1 pb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent font-serif text-[13px] font-bold text-[#fff7ec]">
          学
        </div>
        <div className="hidden lg:block text-[17px] font-serif font-medium">
          nihongo<span className="text-accent">.</span>app
        </div>
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
                isActive
                  ? "border border-ink/20 bg-paper text-ink shadow-sm font-medium"
                  : "border border-transparent text-ink-2 hover:bg-paper-3/60 hover:text-ink"
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border text-[13px] jp ${
                  isActive
                    ? "border-accent/60 text-accent"
                    : "border-ink-3/60 text-ink-2"
                }`}
              >
                {item.jp}
              </span>
              <span className="hidden lg:block">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-dotted border-ink-3/40 pt-3">
        <Link
          href="/me"
          className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-paper-3/60"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-ink/70 bg-paper-3 text-[13px]">
            {user.name[0]}
          </div>
          <div className="hidden lg:block">
            <div className="text-[13px] leading-none">{user.name}</div>
            <div className="mono text-[10px] text-ink-3">
              {user.level} · day {user.day}
            </div>
          </div>
        </Link>
      </div>
    </aside>
  );
}
