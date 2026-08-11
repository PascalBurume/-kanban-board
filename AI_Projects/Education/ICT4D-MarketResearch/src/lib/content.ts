// Locale-INVARIANT data only: prices, contact details, the language list, the
// service type shapes and the analytics event names.
//
// All prose moved to src/lib/copy/{en,pcm}.ts when the site was translated
// (spec §3.4). If you are looking for the steps, benefits, FAQs, services,
// figures or glossary, they are there — one file per language, same shape.
// Adding a customer-facing string to THIS file is almost always a mistake,
// because it will not translate.

export const BRAND = {
  name: "Rejista",
  fee: "₦7,500",
  agentRange: "₦15,000–₦30,000",
  minutes: "10",
  // SPEC §10 OPEN ITEM: this is the placeholder from the spec. It must be
  // replaced with the live WhatsApp Business number before ANY QR, flyer or
  // poster is printed. Surfaced in the UI as a visible demo notice.
  whatsapp: "2348000000000",
  team: "Pascal, Omar, Bello, Olu and Shamin",
  // SPEC §10 OPEN ITEM: domain not yet secured.
  domain: "rejista.ng",
  // Where the demonstration actually lives today. Every QR code on this site
  // and on any printed material is generated from this one value, so securing
  // rejista.ng later is a one-line change here rather than a hunt through
  // components. Until then, printed QR codes carry the vercel.app host and
  // will need regenerating — that is the cost of printing before the domain
  // exists, and it is why this is marked as an open item rather than settled.
  liveUrl: "https://rejista-ten.vercel.app",
  phone: "+234 800 000 0000",
  address: "Yaba, Lagos, Nigeria",
};

/**
 * The CONTACT-language list — which language we will reach you in.
 *
 * This is NOT the same thing as the site's locale. The site itself ships in
 * English and Pidgin only (spec §3, and see src/lib/i18n.ts). All five are
 * offered here because recording that someone wants to be contacted in Igbo
 * costs nothing and is useful to Olu; it does not require the site to be
 * translated into Igbo.
 *
 * Labels and greetings are each written in their own language, so they are
 * invariant across locales and stay here rather than in the copy bundles.
 */
export const LANGUAGES = [
  { code: "en", label: "English", greeting: "Welcome" },
  // Pidgin sits first after English deliberately (spec §3.4): it is the trade
  // language of Nigerian markets, and its position is a signal of who this is for.
  { code: "pcm", label: "Pidgin", greeting: "How far" },
  { code: "yo", label: "Yorùbá", greeting: "Ẹ kú iṣẹ́" },
  { code: "ha", label: "Hausa", greeting: "Sannu da aiki" },
  { code: "ig", label: "Igbo", greeting: "Ị bọọla chi" },
] as const;

export type LangCode = (typeof LANGUAGES)[number]["code"];

export type ServiceStatus = "live" | "soon" | "partner";

export interface Service {
  name: string;
  provider: string;
  price: string;
  body: string;
  status: ServiceStatus;
}

/** Funnel event names. §11's entire go/no-go rests on these, so they must stay
 *  stable across the pilot — renaming one mid-flight silently breaks the
 *  funnel. Locale-invariant by design: an event fired by a Pidgin user and one
 *  fired by an English user are the same event. */
export const EVENTS = [
  "session_started",
  "language_selected",
  "consent_given",
  "details_completed",
  "payment_started",
  "payment_success",
  "filed",
  "approved",
  "delivered",
  "referred",
] as const;
