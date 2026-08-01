import type { Metadata } from "next";
import { Outfit, Inter } from "next/font/google";
import "./globals.css";
import { LATTICE_INK } from "@/lib/motif";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import DemoBanner from "@/components/DemoBanner";
import { getLocale } from "@/lib/i18n.server";
import { getCopy } from "@/lib/copy";

// Self-hosted at build time by next/font — no runtime CDN call, which matters
// for the 3G budget (spec §3.5). latin-ext carries the Yoruba and Igbo
// diacritics (ẹ ọ ṣ ń ị ụ) that a Latin-only subset silently drops; a missing
// diacritic in "Ẹ kú iṣẹ́" reads as carelessness to a Yoruba speaker.
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  display: "swap",
});

// Titles and descriptions are what a browser tab, a search result and a
// WhatsApp link preview show, so they follow the locale like everything else.
// generateMetadata (not a static export) because reading the cookie is async.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getCopy();
  return { title: t.meta.home.title, description: t.meta.home.description };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const t = await getCopy();
  return (
    // lang reflects the locale actually being served. Pidgin's BCP-47 tag is
    // "pcm", which screen readers and translation tools understand — hard-
    // coding "en" here would make assistive tech mispronounce every page.
    <html lang={locale} className={`${outfit.variable} ${inter.variable}`}>
      <body style={{ "--rj-lattice-img": LATTICE_INK } as React.CSSProperties}>
        <DemoBanner text={t.demoBanner} />
        <SiteHeader locale={locale} nav={t.nav} />
        <main id="main">{children}</main>
        <SiteFooter copy={t.footer} services={t.serviceGroups} nav={t.nav} />
      </body>
    </html>
  );
}
