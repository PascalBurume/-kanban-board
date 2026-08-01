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

// Re-exported so server components keep a single import site. The
// implementation lives in ./fill because client components need it too and
// this file imports next/headers.
export { fill } from "./fill";
