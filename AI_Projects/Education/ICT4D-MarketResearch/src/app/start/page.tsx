import type { Metadata } from "next";
import { getCopy } from "@/lib/copy";
import Link from "next/link";
import QrCode from "@/components/QrCode";
import { BRAND } from "@/lib/content";
import { FEE_SERVICE, FEE_GOVERNMENT, naira } from "@/lib/registration";

// Titles and descriptions are what a browser tab, a search result and a
// WhatsApp link preview show, so they follow the locale like everything else.
// generateMetadata (not a static export) because reading the cookie is async.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getCopy();
  return { title: t.meta.start.title, description: t.meta.start.description };
}

/* The booth page. Two readers, one screen, in this order:
   a trader who wants to scan and start, then an investor reading over their
   shoulder who wants the model and the numbers. The trader's half is above the
   fold and needs no scrolling; everything below is for the second reader.

   It is also the print artefact — @media print in globals.css strips the
   chrome, so this doubles as the flyer rather than a fourth PDF to keep in
   sync with the site. */

const PILOT = [
  { k: "Where", v: "One Lagos market" },
  { k: "How many", v: "100–200 registrations" },
  { k: "How long", v: "8 weeks" },
  { k: "Filed by", v: "A person, by hand" },
];

const METRICS = [
  { k: "Complete the form", v: "≥ 40%" },
  { k: "Then pay", v: "≥ 50%" },
  { k: "CAC approves", v: "≥ 90%" },
  { k: "Certificate delivered", v: "≤ 3 days" },
  { k: "Would refer a friend", v: "≥ 70%" },
];

const OPEN = [
  {
    q: "Can we file on someone's behalf at all?",
    a: "There is no public CAC filing API. The route is an accredited channel, and confirming it is week one — before another line of code. If the answer is no, this stops.",
  },
  {
    q: "Does being registered actually help?",
    a: "The whole case assumes a registered trader can then reach credit and contracts. The research on formalisation is mixed. We ask every applicant at 60 days whether it got them anything real, and we publish the answer either way.",
  },
];

export default async function StartPage() {
  const t = await getCopy();
  const registerLink = `${BRAND.liveUrl}/register?src=booth-01`;
  const partnerCount = t.serviceGroups.flatMap((g) => g.items).filter(
    (i) => i.status === "partner",
  ).length;

  return (
    <>
      {/* ============ FOR THE TRADER: scan and go ============ */}
      <section
        style={{
          background: "var(--rj-indigo)",
          color: "#fff",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          className="rj-wrap"
          style={{ position: "relative", paddingBlock: "var(--s16)" }}
        >
          <p
            className="rj-eyebrow"
            style={{ color: "var(--rj-gold)" }}
          >
            Register your business
          </p>

          <div className="rj-start-hero" style={{ marginTop: "var(--s6)" }}>
            <div>
              <h1
                style={{
                  color: "#fff",
                  fontSize: "clamp(36px, 6vw, 62px)",
                  lineHeight: 1.03,
                }}
              >
                Point your camera here.
              </h1>
              <p
                style={{
                  color: "rgba(255,255,255,0.92)",
                  fontSize: "clamp(17px, 2vw, 21px)",
                  marginTop: "var(--s5)",
                  maxWidth: "34ch",
                }}
              >
                About {BRAND.minutes} minutes, in your own language. Flat{" "}
                {BRAND.fee}{" "}plus the government&apos;s own fee, shown
                separately before you pay anything.
              </p>

              <ol
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: "var(--s8) 0 0",
                  display: "grid",
                  gap: "var(--s4)",
                }}
              >
                {t.steps.map((s) => (
                  <li key={s.n} style={{ display: "flex", gap: "var(--s4)", alignItems: "flex-start" }}>
                    <span
                      aria-hidden="true"
                      style={{
                        width: 40,
                        height: 40,
                        flexShrink: 0,
                        borderRadius: "50%",
                        background: "var(--rj-gold)",
                        color: "#3d2a06",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: "var(--font-display)",
                        fontWeight: 700,
                        fontSize: 19,
                      }}
                    >
                      {s.n}
                    </span>
                    <span>
                      <strong
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: 19,
                          color: "#fff",
                        }}
                      >
                        {s.verb}
                      </strong>
                      <span
                        style={{
                          display: "block",
                          color: "rgba(255,255,255,0.82)",
                          fontSize: 16,
                          marginTop: 2,
                          maxWidth: "40ch",
                        }}
                      >
                        {s.body}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>

              <div style={{ display: "flex", gap: "var(--s3)", marginTop: "var(--s8)", flexWrap: "wrap" }}>
                <Link
                  href="/register"
                  className="rj-btn"
                  style={{ background: "#fff", color: "var(--rj-indigo)" }}
                >
                  Or tap to start here
                </Link>
                <Link href="/app" className="rj-btn rj-btn--ghost">
                  No smartphone?
                </Link>
              </div>
            </div>

            {/* The QR is the point of this page, so it is large enough to scan
                from a metre away across a booth table. */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--s4)" }}>
              <div
                style={{
                  background: "#fff",
                  padding: "var(--s5)",
                  borderRadius: "var(--rj-r-lg)",
                  boxShadow: "var(--rj-shadow-3)",
                }}
              >
                <QrCode value={registerLink} size={260} />
              </div>
              <p
                style={{
                  color: "rgba(255,255,255,0.85)",
                  fontSize: 14.5,
                  textAlign: "center",
                  maxWidth: "28ch",
                }}
              >
                Opens the form on your phone. Nothing to download.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div
        style={{
          background: "#202124",
          color: "#fff",
          fontSize: 13.5,
          padding: "10px 20px",
          textAlign: "center",
        }}
      >
        <strong style={{ fontFamily: "var(--font-display)" }}>Demonstration build</strong>
        {" — "}no payment is taken and nothing is filed with the government yet.
      </div>

      {/* ============ FOR THE INVESTOR: the case ============ */}
      <section className="rj-section rj-section--sand">
        <div className="rj-wrap">
          <p className="rj-eyebrow">The problem</p>
          <h2 className="rj-h2">Most Nigerian businesses have no papers.</h2>
          {/* Deliberately only the two market figures. t.figures[2] compares an
              agent's all-in price against our service fee alone, which does not
              survive adding the government fee to both sides — and the model
              section below states the honest position. Two claims about price
              that disagree, on one page, in front of an investor, is worse than
              one fewer number. Fixing the shared copy is task C3. */}
          <div className="rj-grid rj-grid--2" style={{ marginTop: "var(--s8)" }}>
            {t.figures.slice(0, 2).map((f) => (
              <div key={f.label}>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    fontSize: "clamp(30px,3.6vw,40px)",
                    color: "var(--rj-indigo)",
                    lineHeight: 1.05,
                  }}
                >
                  {f.value}
                </div>
                <p style={{ marginTop: 8 }}>{f.label}</p>
                <p className="rj-note" style={{ marginTop: 6 }}>{f.source}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rj-section rj-section--white">
        <div className="rj-wrap">
          <p className="rj-eyebrow">The model</p>
          <h2 className="rj-h2">A flat fee, then a share of what registration unlocks.</h2>

          <div className="rj-grid rj-grid--2" style={{ marginTop: "var(--s8)" }}>
            <div className="rj-card">
              <h3 style={{ fontSize: 19 }}>What the customer pays</h3>
              <div style={{ marginTop: "var(--s4)" }}>
                <Line k="Rejista service fee" v={naira(FEE_SERVICE)} />
                <Line k="Government (CAC) fee" v={naira(FEE_GOVERNMENT)} note="Paid to CAC, not to us" />
                <div style={{ borderTop: "1px solid var(--rj-line)", marginTop: 8, paddingTop: 8 }}>
                  <Line k="Total" v={naira(FEE_SERVICE + FEE_GOVERNMENT)} strong />
                </div>
              </div>
              {/* The honest version of the competitive claim. An agent's
                  all-in for a business name overlaps this range, so price is
                  not the wedge and this page does not pretend it is. */}
              <p className="rj-note" style={{ marginTop: "var(--s4)" }}>
                An agent charges a comparable all-in. We do not compete on
                price. We compete on knowing the price up front, being able to
                check your own case, and getting your fee back if we fail.
              </p>
            </div>

            <div className="rj-card">
              <h3 style={{ fontSize: 19 }}>Where it goes from there</h3>
              <p style={{ color: "var(--rj-grey)", marginTop: "var(--s3)" }}>
                Registration is the wedge, not the business. A registered trader
                needs an account, a card machine, working capital and cover.
                We take a share when they take one up, never a cut of their
                sales.
              </p>
              <p style={{ marginTop: "var(--s4)" }}>
                <strong style={{ fontFamily: "var(--font-display)", fontSize: 30, color: "var(--rj-clay)" }}>
                  {partnerCount}
                </strong>{" "}
                services on the roadmap need a partner we have not signed.
              </p>
              <p style={{ marginTop: "var(--s3)" }}>
                <Link href="/partners" style={{ fontWeight: 600 }}>
                  What we need from a partner →
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rj-section">
        <div className="rj-wrap">
          <p className="rj-eyebrow">The pilot</p>
          <h2 className="rj-h2">Prove it small, by hand, before automating anything.</h2>
          <p className="rj-lede" style={{ marginTop: "var(--s4)", maxWidth: "60ch" }}>
            The customer experience is real. The filing is done by a person, not
            an API. We only automate what we have proven people want.
          </p>

          <div className="rj-grid rj-grid--4" style={{ marginTop: "var(--s8)" }}>
            {PILOT.map((p) => (
              <div key={p.k} className="rj-card">
                <p className="rj-note">{p.k}</p>
                <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 19, marginTop: 4 }}>
                  {p.v}
                </p>
              </div>
            ))}
          </div>

          <h3 style={{ fontSize: 20, marginTop: "var(--s12)" }}>What has to be true to continue</h3>
          <div style={{ marginTop: "var(--s5)", display: "grid", gap: 0 }}>
            {METRICS.map((m) => (
              <div
                key={m.k}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "var(--s4)",
                  padding: "var(--s3) 0",
                  borderBottom: "1px solid var(--rj-line)",
                }}
              >
                <span>{m.k}</span>
                <span className="rj-tabular" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
                  {m.v}
                </span>
              </div>
            ))}
          </div>
          <p className="rj-note" style={{ marginTop: "var(--s4)" }}>
            Miss these and we do not raise. We learned it for a few thousand
            dollars instead of several hundred thousand.
          </p>
        </div>
      </section>

      {/* The section a pitch deck would not have. It is the reason to believe
          the rest of the numbers on this page. */}
      <section className="rj-section rj-section--sand">
        <div className="rj-wrap">
          <p className="rj-eyebrow">What we do not know</p>
          <h2 className="rj-h2">Two questions could end this.</h2>
          <div className="rj-grid rj-grid--2" style={{ marginTop: "var(--s8)" }}>
            {OPEN.map((o) => (
              <div key={o.q} className="rj-card">
                <h3 style={{ fontSize: 18 }}>{o.q}</h3>
                <p style={{ color: "var(--rj-grey)", marginTop: "var(--s3)" }}>{o.a}</p>
              </div>
            ))}
          </div>
          <p style={{ marginTop: "var(--s8)" }}>
            <Link href="/about" style={{ fontWeight: 600 }}>
              Who is building this, and what stage it is really at →
            </Link>
          </p>
        </div>
      </section>

      <section style={{ background: "var(--rj-clay)", color: "#fff" }}>
        <div className="rj-wrap" style={{ paddingBlock: "var(--s12)", textAlign: "center" }}>
          <h2 style={{ color: "#fff", fontSize: "clamp(24px,3.4vw,34px)" }}>
            {BRAND.team}.
          </h2>
          <p style={{ color: "rgba(255,255,255,0.9)", marginTop: "var(--s3)" }}>
            e-Governance Practicum (ICT4D) · {BRAND.address} · {BRAND.phone}
          </p>
          <div style={{ display: "flex", gap: "var(--s3)", marginTop: "var(--s6)", justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/register" className="rj-btn" style={{ background: "#fff", color: "var(--rj-clay)" }}>
              Register my business
            </Link>
            <Link href="/partners" className="rj-btn rj-btn--ghost">
              For banks &amp; partners
            </Link>
          </div>
        </div>
      </section>

      <style>{`
        .rj-start-hero { display: grid; gap: var(--s10); }
        @media (min-width: 900px) {
          .rj-start-hero {
            grid-template-columns: 1.15fr 0.85fr;
            align-items: center;
          }
        }
      `}</style>
    </>
  );
}

function Line({ k, v, note, strong }: { k: string; v: string; note?: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s4)", alignItems: "baseline", paddingBlock: 5 }}>
      <span>
        {k}
        {note && <span className="rj-note" style={{ display: "block" }}>{note}</span>}
      </span>
      <span
        className="rj-tabular"
        style={{ fontFamily: "var(--font-display)", fontWeight: strong ? 700 : 600, fontSize: strong ? 21 : 16 }}
      >
        {v}
      </span>
    </div>
  );
}
