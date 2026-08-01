/**
 * Locale handling for Rejista.
 *
 * WHY A COOKIE AND NOT A ROUTE SEGMENT
 * The usual App Router answer is a `[lang]` segment (/en/register,
 * /pcm/register). We deliberately do NOT do that, because the QR codes on the
 * printed flyer and booth poster encode
 *
 *     https://rejista-ten.vercel.app/register?src=booth-01
 *
 * Moving to route segments would change that URL and turn every printed sheet
 * into dead paper. A cookie keeps every path byte-identical to what is already
 * printed, which is worth more than the SEO benefit of localised URLs for a
 * pilot serving one market.
 *
 * SCOPE (plan §3)
 * The MVP ships English and Pidgin only. Yorùbá, Hausa and Igbo are offered in
 * the contact-language picker — that records how we will reach you, which does
 * not require the site itself to be translated — but they are not site locales.
 */

export const LOCALES = ["en", "pcm"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_COOKIE = "rj_locale";

/** Pidgin, not English. Spec §3.4 puts Pidgin first: it is the trade language
 *  of Nigerian markets, and defaulting to it is a signal of who this is for.
 *  This matches EMPTY.lang in registration.ts — the two used to disagree. */
export const DEFAULT_LOCALE: Locale = "pcm";

/* NOTE: no next/headers import here on purpose. SiteHeader is a client
   component and imports LOCALES/LOCALE_LABEL from this file; pulling
   cookies() in would drag server-only code into the browser bundle and the
   build fails. The cookie read lives in i18n.server.ts. */

export function isLocale(v: string | undefined): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}

export const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  pcm: "Pidgin",
};
