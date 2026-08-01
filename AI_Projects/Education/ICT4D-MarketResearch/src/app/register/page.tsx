import type { Metadata } from "next";
import RegisterFlow from "@/components/RegisterFlow";
import { getCopy } from "@/lib/copy";

// Titles and descriptions are what a browser tab, a search result and a
// WhatsApp link preview show, so they follow the locale like everything else.
// generateMetadata (not a static export) because reading the cookie is async.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getCopy();
  return { title: t.meta.register.title, description: t.meta.register.description };
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; src?: string }>;
}) {
  // The QR codes in the field carry a source parameter (?src=poster-balogun-01)
  // so we learn which posters and markets actually produce registrations
  // (spec §8). It is read here and would be attached to the case on submit.
  const { lang } = await searchParams;
  const t = await getCopy();
  return (
    <RegisterFlow
      initialLang={lang}
      copy={t.register}
      trades={t.trades}
      stages={t.filingStages}
    />
  );
}
