"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, isLocale, DEFAULT_LOCALE } from "@/lib/i18n";

/**
 * Set the site language.
 *
 * A server action rather than a client-side state swap, because the locale is
 * read by ~18 server components via cookies(). Writing the cookie and
 * revalidating re-renders them on the server with the other bundle — no
 * provider, no prop drilling, and no converting the whole tree to client
 * components just to change a language.
 */
export async function setLocale(value: string) {
  const locale = isLocale(value) ? value : DEFAULT_LOCALE;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    // Readable by JS is fine — this is a display preference, not a credential.
    httpOnly: false,
  });
  revalidatePath("/", "layout");
}
