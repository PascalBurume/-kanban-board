import Link from "next/link";
import { NAV_ITEMS, NavKey } from "./nav";

// Mobile bottom nav — primary 5 destinations only, per handoff
const MOBILE_KEYS: NavKey[] = ["home", "lessons", "kanji", "srs", "progress"];

export function BottomNav({ active }: { active?: NavKey }) {
  const items = NAV_ITEMS.filter((i) => MOBILE_KEYS.includes(i.key));
  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-30 border-t border-ink-3/40 bg-paper-2/95 backdrop-blur supports-[backdrop-filter]:bg-paper-2/80"
      aria-label="Primary"
    >
      <ul className="grid grid-cols-5">
        {items.map((it) => {
          const isActive = it.key === active;
          return (
            <li key={it.key} className="contents">
              <Link
                href={it.href}
                className={`flex h-14 flex-col items-center justify-center gap-0.5 ${
                  isActive ? "text-accent" : "text-ink-2"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="jp text-[15px]">{it.jp}</span>
                <span
                  className={`text-[11px] ${
                    isActive ? "font-semibold" : "font-normal"
                  }`}
                >
                  {it.label.split(" ")[0]}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
