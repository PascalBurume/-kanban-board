import type { Metadata } from "next";
import { getCopy } from "@/lib/copy";
import Link from "next/link";
import { BRAND } from "@/lib/content";

// Titles and descriptions are what a browser tab, a search result and a
// WhatsApp link preview show, so they follow the locale like everything else.
// generateMetadata (not a static export) because reading the cookie is async.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getCopy();
  return { title: t.meta.about.title, description: t.meta.about.description };
}

/* An about page for a product at pilot stage. The temptation is to write it as
   if the company already exists in the form it hopes to. It does not, so this
   page says what is actually true: a team, a practicum, a pilot, and two open
   questions that could end it. */

const TEAM = [
  { name: "Pascal", role: "Partnerships and the go/no-go call" },
  { name: "Omar", role: "Product and the build" },
  { name: "Olu", role: "Operations, the field agent, and filing" },
  { name: "Bello", role: "Budget and unit economics" },
  { name: "Shamin", role: "Compliance, consent and data protection" },
];

const OPEN_QUESTIONS = [
  {
    q: "Can we file on your behalf at all?",
    a: "Filing a registration for someone else has to be permissible through an accredited channel. Confirming that is the first thing we are doing, before we build anything further. If the answer is no, Rejista does not happen, and we would rather find that out in week one than week twenty.",
  },
  {
    q: "Does registration actually help?",
    a: "The case for registering assumes a registered trader can then reach credit, contracts and grants. Research on formalisation is mixed on whether that follows. We are going to ask everyone we register, sixty days later, whether it got them anything real — and publish what we find, including if the answer is no.",
  },
];

export default async function AboutPage() {
  const t = await getCopy();
  return (
    <div className="rj-wrap rj-narrow" style={{ paddingBlock: "var(--s12)" }}>
      <p className="rj-eyebrow">About Rejista</p>
      <h1 style={{ fontSize: "clamp(30px,4.6vw,44px)", marginTop: "var(--s3)" }}>
        Five people trying to find out whether this works.
      </h1>
      <p className="rj-lede" style={{ marginTop: "var(--s4)" }}>
        Rejista helps a Nigerian business get registered with the {t.gloss.CAC} for
        a flat {BRAND.fee}, in the language you actually speak. That is the idea.
        This page is about how far along it really is.
      </p>

      <div className="rj-flag" style={{ marginTop: "var(--s6)" }}>
        <strong>Stage: pilot, not company.</strong> Rejista has registered
        nobody. It is a demonstration build and a plan for a small pilot in one
        Lagos market. Everything below describes intent, not track record.
      </div>

      <h2 style={{ fontSize: 24, marginTop: "var(--s12)" }}>Why we started</h2>
      <p style={{ color: "var(--rj-grey)", marginTop: "var(--s3)" }}>
        Most small Nigerian businesses are not registered, which makes them
        invisible to banks, to government, and to the big buyers who will only
        deal with a company that has papers. The usual way in is an agent who
        charges what they feel like, takes as long as they take, and stops
        answering the phone. We think the fix is not a cheaper agent. It is
        knowing the price up front, being able to check your own case, and
        getting your money back if it fails.
      </p>

      <h2 style={{ fontSize: 24, marginTop: "var(--s12)" }}>Who is building it</h2>
      <p style={{ color: "var(--rj-grey)", marginTop: "var(--s3)" }}>
        {BRAND.team}, as an e-Governance Practicum (ICT4D) project.
      </p>
      <dl style={{ marginTop: "var(--s5)", display: "grid", gap: "var(--s3)" }}>
        {TEAM.map((t) => (
          <div
            key={t.name}
            className="rj-card"
            style={{ padding: "var(--s4)", display: "flex", justifyContent: "space-between", gap: "var(--s4)" }}
          >
            <dt style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>{t.name}</dt>
            <dd style={{ margin: 0, color: "var(--rj-grey)", textAlign: "right" }}>{t.role}</dd>
          </div>
        ))}
      </dl>

      <h2 style={{ fontSize: 24, marginTop: "var(--s12)" }}>What we do not know yet</h2>
      <p style={{ color: "var(--rj-grey)", marginTop: "var(--s3)" }}>
        Two questions could end this, and neither is answered. Putting them on
        the about page rather than burying them is the whole posture of the
        product.
      </p>
      <div style={{ marginTop: "var(--s5)", display: "grid", gap: "var(--s4)" }}>
        {OPEN_QUESTIONS.map((o) => (
          <div key={o.q} className="rj-card" style={{ padding: "var(--s5)" }}>
            <h3 style={{ fontSize: 18 }}>{o.q}</h3>
            <p style={{ color: "var(--rj-grey)", marginTop: 8 }}>{o.a}</p>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 24, marginTop: "var(--s12)" }}>What we are not</h2>
      <p style={{ color: "var(--rj-grey)", marginTop: "var(--s3)" }}>
        We are not the government. Rejista is a filing agent. The certificate is
        issued by the Corporate Affairs Commission, and you could go and get it
        yourself — we are selling the part where you do not have to.
      </p>

      <p style={{ marginTop: "var(--s10)", color: "var(--rj-grey)" }}>
        {BRAND.address} · {BRAND.phone}{" "}
        <span className="rj-note">(placeholder contact details)</span>
      </p>

      <div style={{ display: "flex", gap: "var(--s3)", marginTop: "var(--s8)", flexWrap: "wrap" }}>
        <Link href="/register" className="rj-btn rj-btn--primary">
          Register my business
        </Link>
        <Link href="/partners" className="rj-btn rj-btn--outline">
          For banks &amp; partners
        </Link>
      </div>
    </div>
  );
}
