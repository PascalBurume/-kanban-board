import { type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n.server";
import { en, type Copy } from "./en";
import { pcm } from "./pcm";

export type { Copy };

const BUNDLES: Record<Locale, Copy> = { en, pcm };

/** Synchronous lookup, for client components that already know the locale
 *  (they receive it as a prop from a server component). */
export function copyFor(locale: Locale): Copy {
  return BUNDLES[locale];
}

/** The normal path. Any server component can call this with no props threaded
 *  through the tree, because the locale lives in a cookie. */
export async function getCopy(): Promise<Copy> {
  return BUNDLES[await getLocale()];
}

/** Fill {placeholders}. Deliberately tiny — the alternative is pulling in an
 *  ICU message formatter for what is, across the whole site, a handful of
 *  interpolations (fee, minutes, phone, service counts). */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) =>
    k in vars ? String(vars[k]) : m,
  );
}
