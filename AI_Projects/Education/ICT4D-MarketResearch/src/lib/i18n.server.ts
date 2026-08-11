import { cookies } from "next/headers";
import { LOCALE_COOKIE, DEFAULT_LOCALE, isLocale, type Locale } from "./i18n";

/** Server-only locale read. Kept apart from i18n.ts so that client components
 *  can import the locale constants without pulling next/headers into the
 *  browser bundle. */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const v = store.get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}
