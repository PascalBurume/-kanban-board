import type { Metadata } from "next";
import { getCopy } from "@/lib/copy";
import Link from "next/link";

// Titles and descriptions are what a browser tab, a search result and a
// WhatsApp link preview show, so they follow the locale like everything else.
// generateMetadata (not a static export) because reading the cookie is async.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getCopy();
  return { title: t.meta.whyRegister.title, description: t.meta.whyRegister.description };
}


/* The landing page makes the short case. This page makes the whole one,
   including the part a sales page would leave out: registration creates
   obligations as well as rights. Those live in the copy bundle now
   (t.whyRegister.obligations) so they translate. */

export default async function WhyRegisterPage() {
  const t = await getCopy();
  return (
    <div className="rj-wrap rj-narrow" style={{ paddingBlock: "var(--s12)" }}>
      <p className="rj-eyebrow">{t.whyRegister.eyebrow}</p>
      <h1 style={{ fontSize: "clamp(30px,4.6vw,44px)", marginTop: "var(--s3)" }}>
        {t.whyRegister.title}
      </h1>
      <p className="rj-lede" style={{ marginTop: "var(--s4)" }}>
        {t.whyRegister.lede}
      </p>

      <h2 style={{ fontSize: 24, marginTop: "var(--s12)" }}>{t.whyRegister.figuresTitle}</h2>
      <div style={{ marginTop: "var(--s5)", display: "grid", gap: "var(--s4)" }}>
        {t.figures.map((f) => (
          <div key={f.label} className="rj-card" style={{ padding: "var(--s5)" }}>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 30,
                color: "var(--rj-indigo)",
              }}
            >
              {f.value}
            </div>
            <p style={{ marginTop: 4 }}>{f.label}</p>
            {/* The source sits with the number, never in a footnote below the
                fold. An unverified figure on a trust page is a liability. */}
            <p className="rj-note" style={{ marginTop: 6 }}>{f.source}</p>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 24, marginTop: "var(--s12)" }}>{t.whyRegister.buysTitle}</h2>
      <div style={{ marginTop: "var(--s5)", display: "grid", gap: "var(--s5)" }}>
        {t.benefits.map((b) => (
          <div key={b.title}>
            <h3 style={{ fontSize: 19 }}>{b.title}</h3>
            <p style={{ color: "var(--rj-grey)", marginTop: 6 }}>{b.body}</p>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 24, marginTop: "var(--s12)" }}>{t.whyRegister.walkTitle}</h2>
      <div style={{ marginTop: "var(--s5)", display: "grid", gap: "var(--s3)" }}>
        {t.outcomes.map((o) => (
          <div key={o.title} className="rj-card" style={{ padding: "var(--s5)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
              <h3 style={{ fontSize: 17 }}>{o.title}</h3>
              <span
                className={`rj-badge rj-badge--dot ${
                  o.status === "live" ? "rj-badge--live" : "rj-badge--partner"
                }`}
              >
                {o.status === "live" ? "Issued" : "Partner needed"}
              </span>
            </div>
            <p style={{ color: "var(--rj-grey)", marginTop: 8 }}>{o.body}</p>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 24, marginTop: "var(--s12)" }}>{t.whyRegister.asksTitle}</h2>
      <p style={{ color: "var(--rj-grey)", marginTop: "var(--s3)" }}>
        Registration is not free of consequences. These are the three that
        matter, stated plainly.
      </p>
      <div style={{ marginTop: "var(--s5)", display: "grid", gap: "var(--s5)" }}>
        {t.whyRegister.obligations.map((o) => (
          <div key={o.title}>
            <h3 style={{ fontSize: 19 }}>{o.title}</h3>
            <p style={{ color: "var(--rj-grey)", marginTop: 6 }}>{o.body}</p>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 24, marginTop: "var(--s12)" }}>{t.whyRegister.waitTitle}</h2>
      <p style={{ color: "var(--rj-grey)", marginTop: "var(--s3)" }}>
        If you are not selling yet, not looking for credit, and not trying to
        supply anyone who asks for papers, registration can wait. It is worth
        money when it unlocks something. We would rather you registered when it
        helps than because a website told you to.
      </p>

      <div style={{ display: "flex", gap: "var(--s3)", marginTop: "var(--s12)", flexWrap: "wrap" }}>
        <Link href="/register" className="rj-btn rj-btn--primary">
          {t.whyRegister.cta}
        </Link>
        <Link href="/faq" className="rj-btn rj-btn--outline">
          {t.whyRegister.ctaAlt}
        </Link>
      </div>
    </div>
  );
}
