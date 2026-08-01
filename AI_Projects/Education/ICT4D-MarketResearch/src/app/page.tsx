import { getCopy, fill } from "@/lib/copy";
import Link from "next/link";
import NigeriaMap from "@/components/NigeriaMap";
import QrCode from "@/components/QrCode";
import { LATTICE_GOLD } from "@/lib/motif";
import { BRAND } from "@/lib/content";

export default async function Home() {
  const t = await getCopy();
  // The QR used to point at a placeholder WhatsApp number that nobody owns.
  // It now opens the registration form directly, which is the thing we
  // actually want a scan to do. ?src= is read by /register and would be
  // attached to the case, so a poster's real-world performance is measurable
  // (spec §8).
  const registerLink = `${BRAND.liveUrl}/register?src=poster-balogun-01`;

  return (
    <>
      {/* ---------------- Hero: one headline, one sub-line, one button ------- */}
      <section
        style={{
          background: "var(--rj-indigo)",
          color: "#fff",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          className="rj-lattice"
          style={{ "--rj-lattice-img": LATTICE_GOLD, opacity: 0.03 } as React.CSSProperties}
          aria-hidden="true"
        />
        <div className="rj-wrap" style={{ position: "relative", paddingBlock: "var(--s16)" }}>
          <div className="rj-hero-grid" style={{ display: "grid", gap: "var(--s12)", alignItems: "center" }}>
            <div>
              <h1 style={{ color: "#fff", fontSize: "clamp(34px, 5.4vw, 58px)", lineHeight: 1.05 }}>
                {t.home.heroTitle}
              </h1>
              <p
                style={{
                  color: "rgba(255,255,255,0.86)",
                  fontSize: 18,
                  marginTop: "var(--s5)",
                  maxWidth: "48ch",
                }}
              >
                {fill(t.home.heroLede, { minutes: BRAND.minutes, fee: BRAND.fee })}
              </p>

              <div style={{ display: "flex", gap: "var(--s3)", marginTop: "var(--s8)", flexWrap: "wrap" }}>
                <Link href="/register" className="rj-btn rj-btn--primary">
                  {t.home.heroCtaPrimary}
                </Link>
                <Link href="/how-it-works" className="rj-btn rj-btn--ghost">
                  {t.home.heroCtaSecondary}
                </Link>
              </div>

              <p
                style={{
                  marginTop: "var(--s6)",
                  fontSize: 14.5,
                  color: "rgba(255,255,255,0.7)",
                  maxWidth: "52ch",
                }}
              >
                {t.home.heroFoot}
              </p>
            </div>

            <div>
              <NigeriaMap />
            </div>
          </div>
        </div>

        {/* Trust strip, immediately under the hero */}
        <div style={{ background: "rgba(0,0,0,0.22)", position: "relative" }}>
          <ul
            className="rj-wrap"
            style={{
              listStyle: "none",
              display: "grid",
              gap: "var(--s3)",
              gridTemplateColumns: "repeat(auto-fit, minmax(215px, 1fr))",
              paddingBlock: "var(--s4)",
            }}
          >
            {t.trust.map((t) => (
              <li
                key={t}
                style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 14.5, color: "rgba(255,255,255,0.92)" }}
              >
                <span aria-hidden="true" style={{ color: "#5FBF8B", fontWeight: 700 }}>
                  ✓
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------- The problem, in three numbers ---------------------- */}
      <section className="rj-section rj-section--sand">
        <div className="rj-wrap">
          <p className="rj-eyebrow">{t.home.problemEyebrow}</p>
          <h2 className="rj-h2">{t.home.problemTitle}</h2>
          <div className="rj-grid rj-grid--3" style={{ marginTop: "var(--s8)" }}>
            {t.figures.map((f) => (
              <div key={f.label}>
                <p
                  className="rj-tabular"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    fontSize: "clamp(34px, 4.6vw, 46px)",
                    color: "var(--rj-indigo)",
                    lineHeight: 1.1,
                  }}
                >
                  {f.value}
                </p>
                <p style={{ fontSize: 16, marginTop: 6 }}>{f.label}</p>
                <p className="rj-note" style={{ marginTop: 8 }}>
                  Source: {f.source}
                </p>
              </div>
            ))}
          </div>
          <div className="rj-flag" style={{ marginTop: "var(--s8)" }}>
            {t.home.figuresWarning}
          </div>
        </div>
      </section>

      {/* ---------------- How it works ---------------------------------------- */}
      {/* id is the nav target. "How it works" scrolls here rather than routing
          to a page that would only repeat this section. */}
      <section id="how-it-works" className="rj-section rj-section--white">
        <div className="rj-wrap">
          <p className="rj-eyebrow">{t.home.howEyebrow}</p>
          <h2 className="rj-h2">{t.home.howTitle}</h2>
          <div className="rj-grid rj-grid--3" style={{ marginTop: "var(--s8)" }}>
            {t.steps.map((s) => (
              <div key={s.n} className="rj-card">
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: "var(--rj-gold)",
                    color: "#3d2a06",
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    fontSize: 19,
                  }}
                >
                  {s.n}
                </span>
                <h3 style={{ fontSize: 22, marginTop: "var(--s4)" }}>{s.verb}</h3>
                <p style={{ color: "var(--rj-grey)", marginTop: 8 }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- What you walk away with ---------------------------- */}
      <section className="rj-section">
        <div className="rj-wrap">
          <p className="rj-eyebrow">{t.home.outcomesEyebrow}</p>
          <h2 className="rj-h2">{t.home.outcomesTitle}</h2>
          <div className="rj-grid rj-grid--3" style={{ marginTop: "var(--s8)" }}>
            {t.outcomes.map((o) => (
              <div key={o.title} className="rj-card">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <h3 style={{ fontSize: 19 }}>{o.title}</h3>
                  {o.status === "live" ? (
                    <span className="rj-badge rj-badge--live rj-badge--dot">Issued</span>
                  ) : (
                    <span className="rj-badge rj-badge--partner rj-badge--dot">Partner needed</span>
                  )}
                </div>
                <p style={{ color: "var(--rj-grey)", marginTop: 10 }}>{o.body}</p>
                {o.status === "partner" && (
                  <p className="rj-note" style={{ marginTop: 10 }}>
                    No bank partner is signed yet, so we do not promise account
                    opening. Your certificate and tax number are already enough
                    to open one yourself.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Why it's worth it ---------------------------------- */}
      <section id="why-register" className="rj-section rj-section--white">
        <div className="rj-wrap">
          <p className="rj-eyebrow">{t.home.benefitsEyebrow}</p>
          <h2 className="rj-h2">{t.home.benefitsTitle}</h2>
          <div className="rj-grid rj-grid--2" style={{ marginTop: "var(--s8)" }}>
            {t.benefits.map((b) => (
              <div key={b.title} style={{ borderLeft: "3px solid var(--rj-clay)", paddingLeft: "var(--s5)" }}>
                <h3 style={{ fontSize: 20 }}>{b.title}</h3>
                <p style={{ color: "var(--rj-grey)", marginTop: 8 }}>{b.body}</p>
              </div>
            ))}
          </div>
          {/* The full case, including the obligations side. This section is the
              short version; /why-register carries the tax and annual-return
              consequences that a sales page would leave out. */}
          <p style={{ marginTop: "var(--s8)" }}>
            <Link href="/why-register" style={{ fontWeight: 600 }}>
              {t.home.benefitsLink}
            </Link>
          </p>
        </div>
      </section>

      {/*
        PROOF SECTION DELIBERATELY OMITTED.
        Spec §5.1: until the pilot produces real quotes from real users, this
        section is omitted entirely. A fabricated testimonial on a trust-critical
        page is an integrity failure, not a placeholder. Restore it only with
        consented quotes carrying first name, trade and market.
      */}

      {/* ---------------- Closing call to action ----------------------------- */}
      <section style={{ background: "var(--rj-clay)", color: "#fff", position: "relative", overflow: "hidden" }}>
        <div
          className="rj-lattice"
          style={{ "--rj-lattice-img": LATTICE_GOLD, opacity: 0.05 } as React.CSSProperties}
          aria-hidden="true"
        />
        <div
          className="rj-wrap rj-cta-grid"
          style={{ position: "relative", paddingBlock: "var(--s16)", display: "grid", gap: "var(--s10)", alignItems: "center" }}
        >
          <div>
            <h2 style={{ color: "#fff", fontSize: "clamp(28px, 4vw, 40px)" }}>
              {t.home.ctaTitle}
            </h2>
            <p style={{ color: "rgba(255,255,255,0.9)", fontSize: 17, marginTop: "var(--s4)", maxWidth: "46ch" }}>
              {t.home.ctaLede}
            </p>
            <div style={{ display: "flex", gap: "var(--s3)", marginTop: "var(--s6)", flexWrap: "wrap" }}>
              <Link href="/register" className="rj-btn" style={{ background: "#fff", color: "var(--rj-clay)" }}>
                {t.home.heroCtaPrimary}
              </Link>
              {/* Was "See the phone app". There is no phone app, so /app now
                  answers the question that button was standing in for: how do
                  I register without a smartphone. */}
              <Link href="/app" className="rj-btn rj-btn--ghost">
                {t.home.ctaSecondary}
              </Link>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
            <div style={{ background: "#fff", padding: "var(--s4)", borderRadius: "var(--rj-r-md)", boxShadow: "var(--rj-shadow-2)" }}>
              <QrCode value={registerLink} size={190} />
            </div>
            <p className="rj-note" style={{ color: "rgba(255,255,255,0.85)", maxWidth: "34ch" }}>
              {t.home.qrNote}
            </p>
          </div>
        </div>
      </section>

      <style>{`
        @media (min-width: 1000px) {
          .rj-hero-grid { grid-template-columns: 0.92fr 1.08fr; }
          .rj-cta-grid { grid-template-columns: 1.2fr 0.8fr; }
        }
      `}</style>
    </>
  );
}
