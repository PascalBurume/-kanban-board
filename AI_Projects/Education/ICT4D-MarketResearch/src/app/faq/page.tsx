import type { Metadata } from "next";
import { getCopy, fill } from "@/lib/copy";
import Link from "next/link";
import { BRAND } from "@/lib/content";

// Titles and descriptions are what a browser tab, a search result and a
// WhatsApp link preview show, so they follow the locale like everything else.
// generateMetadata (not a static export) because reading the cookie is async.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getCopy();
  return { title: t.meta.faq.title, description: t.meta.faq.description };
}

export default async function FaqPage() {
  const t = await getCopy();
  return (
    <div className="rj-wrap rj-narrow" style={{ paddingBlock: "var(--s12)" }}>
      <p className="rj-eyebrow">{t.faq.eyebrow}</p>
      <h1 style={{ fontSize: "clamp(30px,4.6vw,44px)", marginTop: "var(--s3)" }}>
        {t.faq.title}
      </h1>
      <p className="rj-lede" style={{ marginTop: "var(--s4)" }}>
        {fill(t.faq.lede, { phone: BRAND.phone })}
      </p>

      {/* <details> rather than a JS accordion: it works with no JavaScript, it
          is keyboard operable for free, and it is findable by the browser's own
          in-page search. On a slow connection the answers are already there. */}
      <div style={{ marginTop: "var(--s10)", display: "grid", gap: "var(--s3)" }}>
        {t.faqs.map((f) => (
          <details key={f.q} className="rj-card" style={{ padding: "var(--s5)" }}>
            <summary
              style={{
                cursor: "pointer",
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 18,
                lineHeight: 1.3,
              }}
            >
              {f.q}
            </summary>
            <p style={{ marginTop: "var(--s4)", color: "var(--rj-grey)" }}>{f.a}</p>
          </details>
        ))}
      </div>

      <h2 style={{ fontSize: 24, marginTop: "var(--s16)" }}>{t.faq.glossTitle}</h2>
      <dl style={{ marginTop: "var(--s5)", display: "grid", gap: "var(--s4)" }}>
        {Object.entries(t.gloss).map(([term, meaning]) => (
          <div key={term}>
            <dt style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>{term}</dt>
            <dd style={{ margin: 0, color: "var(--rj-grey)" }}>{meaning}</dd>
          </div>
        ))}
      </dl>

      <div className="rj-flag" style={{ marginTop: "var(--s12)" }}>
        <strong>{t.faq.demoLabel}</strong> {t.faq.demo}
      </div>

      <p style={{ marginTop: "var(--s10)" }}>
        <Link href="/register" className="rj-btn rj-btn--primary">
          {t.faq.cta}
        </Link>
      </p>
    </div>
  );
}
