import type { Metadata } from "next";
import { getCopy } from "@/lib/copy";
import Link from "next/link";
import { BRAND } from "@/lib/content";
import { FILING_STAGES, FEE_SERVICE, FEE_GOVERNMENT, naira } from "@/lib/registration";

// Titles and descriptions are what a browser tab, a search result and a
// WhatsApp link preview show, so they follow the locale like everything else.
// generateMetadata (not a static export) because reading the cookie is async.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getCopy();
  return { title: t.meta.howItWorks.title, description: t.meta.howItWorks.description };
}

export default async function HowItWorksPage() {
  const t = await getCopy();
  return (
    <div className="rj-wrap rj-narrow" style={{ paddingBlock: "var(--s12)" }}>
      <p className="rj-eyebrow">{t.howItWorks.eyebrow}</p>
      <h1 style={{ fontSize: "clamp(30px,4.6vw,44px)", marginTop: "var(--s3)" }}>
        {t.howItWorks.title}
      </h1>
      <p className="rj-lede" style={{ marginTop: "var(--s4)" }}>
        Your part takes about {BRAND.minutes} minutes. The government&apos;s part
        takes as long as it takes, and we tell you where it has got to rather
        than showing you a spinner.
      </p>

      <h2 style={{ fontSize: 24, marginTop: "var(--s12)" }}>{t.howItWorks.yourSteps}</h2>
      <ol style={{ marginTop: "var(--s5)", display: "grid", gap: "var(--s4)", listStyle: "none", padding: 0 }}>
        {t.steps.map((s) => (
          <li key={s.n} className="rj-card" style={{ display: "flex", gap: "var(--s4)" }}>
            <span
              aria-hidden="true"
              style={{
                width: 38,
                height: 38,
                flexShrink: 0,
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--rj-gold)",
                color: "#3d2a06",
                fontFamily: "var(--font-display)",
                fontWeight: 700,
              }}
            >
              {s.n}
            </span>
            <span>
              <strong style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>{s.verb}</strong>
              <span style={{ display: "block", color: "var(--rj-grey)", marginTop: 4 }}>{s.body}</span>
            </span>
          </li>
        ))}
      </ol>

      <h2 style={{ fontSize: 24, marginTop: "var(--s12)" }}>{t.howItWorks.ourStages}</h2>
      <p style={{ color: "var(--rj-grey)", marginTop: "var(--s3)" }}>
        Once you have sent your details, this is what actually happens. You can
        check which stage your case is at any time, without calling anyone.
      </p>
      <ol style={{ marginTop: "var(--s5)", display: "grid", gap: "var(--s3)", listStyle: "none", padding: 0 }}>
        {FILING_STAGES.map((s, i) => (
          <li key={s.key} className="rj-card" style={{ display: "flex", gap: "var(--s4)" }}>
            <span
              aria-hidden="true"
              style={{
                width: 30,
                height: 30,
                flexShrink: 0,
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--rj-line)",
                color: "var(--rj-grey)",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {i + 1}
            </span>
            <span>
              <strong style={{ fontFamily: "var(--font-display)" }}>{s.label}</strong>
              <span style={{ display: "block", color: "var(--rj-grey)", fontSize: 15, marginTop: 2 }}>
                {s.detail}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <h2 style={{ fontSize: 24, marginTop: "var(--s12)" }}>{t.howItWorks.costTitle}</h2>
      <div className="rj-card" style={{ marginTop: "var(--s5)", padding: "var(--s5)" }}>
        <Row k="Rejista service fee" v={naira(FEE_SERVICE)} />
        <Row k="Government (CAC) fee" v={naira(FEE_GOVERNMENT)} note="Paid to the government, not to us" />
        <div style={{ borderTop: "1px solid var(--rj-line)", marginTop: "var(--s3)", paddingTop: "var(--s3)" }}>
          <Row k="Total" v={naira(FEE_SERVICE + FEE_GOVERNMENT)} strong />
        </div>
      </div>
      <div className="rj-flag" style={{ marginTop: "var(--s4)" }}>
        <strong>The government fee is not final.</strong> CAC sets it, not us,
        and it is confirmed before you pay anything. We show it separately so you
        can always see which part of the price is ours and which part is the
        government&apos;s.
      </div>

      <h2 style={{ fontSize: 24, marginTop: "var(--s12)" }}>{t.howItWorks.timeTitle}</h2>
      <p style={{ color: "var(--rj-grey)", marginTop: "var(--s3)" }}>
        Your part is about {BRAND.minutes} minutes of questions. The
        government&apos;s part varies and is outside our control — often a few
        days. We message you when it moves, and you can look it up yourself in
        the meantime.
      </p>

      <h2 style={{ fontSize: 24, marginTop: "var(--s12)" }}>{t.howItWorks.trustTitle}</h2>
      <ul style={{ marginTop: "var(--s4)", display: "grid", gap: "var(--s2)", paddingLeft: "1.1em" }}>
        {t.trust.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>

      <div className="rj-flag" style={{ marginTop: "var(--s12)" }}>
        <strong>Still a demonstration.</strong> This build files nothing and
        takes no payment. The stages above are what the real service is designed
        to do.
      </div>

      <div style={{ display: "flex", gap: "var(--s3)", marginTop: "var(--s10)", flexWrap: "wrap" }}>
        <Link href="/register" className="rj-btn rj-btn--primary">
          {t.howItWorks.cta}
        </Link>
        <Link href="/app" className="rj-btn rj-btn--outline">
          {t.howItWorks.ctaAlt}
        </Link>
      </div>
    </div>
  );
}

function Row({ k, v, note, strong }: { k: string; v: string; note?: string; strong?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "var(--s4)",
        alignItems: "baseline",
        paddingBlock: 6,
      }}
    >
      <span>
        {k}
        {note && <span className="rj-note" style={{ display: "block" }}>{note}</span>}
      </span>
      <span
        className="rj-tabular"
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: strong ? 700 : 600,
          fontSize: strong ? 20 : 16,
        }}
      >
        {v}
      </span>
    </div>
  );
}
