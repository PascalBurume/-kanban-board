import type { Metadata } from "next";
import { getCopy } from "@/lib/copy";
import Link from "next/link";
import { BRAND } from "@/lib/content";

// Titles and descriptions are what a browser tab, a search result and a
// WhatsApp link preview show, so they follow the locale like everything else.
// generateMetadata (not a static export) because reading the cookie is async.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getCopy();
  return { title: t.meta.partners.title, description: t.meta.partners.description };
}

/* The pitch page. Its credibility depends entirely on not overstating the
   position, because the people reading it can check. The "Partner needed"
   services elsewhere on the site are the actual ask, so they are pulled
   straight from the same data rather than restated. */

const WHAT_WE_BRING = [
  {
    title: "A verified business, at the moment it becomes one",
    body: "We meet an owner at registration — the point where they first need a bank account, and before anyone else has reached them. That is a better moment than a cold branch visit.",
  },
  {
    title: "Structured detail, collected with consent",
    body: "Name, trade, state, market, and a registration reference, gathered under explicit consent that is logged with its wording and timestamp. Nothing is shared with you unless the owner separately agrees to it.",
  },
  {
    title: "A distribution channel into the informal economy",
    body: "Field agents in markets, and a planned USSD path for people with no smartphone. Reaching this segment is the hard part, and it is the part we are building.",
  },
];

export default async function PartnersPage() {
  const t = await getCopy();
  const needed = t.serviceGroups.flatMap((g) =>
    g.items.filter((i) => i.status === "partner").map((i) => ({ ...i, group: g.group })),
  );

  return (
    <div className="rj-wrap rj-narrow" style={{ paddingBlock: "var(--s12)" }}>
      <p className="rj-eyebrow">For banks &amp; partners</p>
      <h1 style={{ fontSize: "clamp(30px,4.6vw,44px)", marginTop: "var(--s3)" }}>
        We reach the businesses you cannot.
      </h1>
      <p className="rj-lede" style={{ marginTop: "var(--s4)" }}>
        Rejista registers informal Nigerian businesses. At the moment a trader
        becomes registered, they need things you sell — an account, a card
        machine, working capital, cover. We are looking for the partners who
        provide them.
      </p>

      <div className="rj-flag" style={{ marginTop: "var(--s6)" }}>
        <strong>Where we actually are.</strong> Rejista has registered nobody
        yet. There is a demonstration build, a plan for a pilot of 100 to 200
        registrations in one Lagos market, and no signed partners. If you need a
        track record, we do not have one. If you want to shape the thing before
        it sets, this is the moment.
      </div>

      <h2 style={{ fontSize: 24, marginTop: "var(--s12)" }}>What we bring</h2>
      <div style={{ marginTop: "var(--s5)", display: "grid", gap: "var(--s5)" }}>
        {WHAT_WE_BRING.map((w) => (
          <div key={w.title}>
            <h3 style={{ fontSize: 19 }}>{w.title}</h3>
            <p style={{ color: "var(--rj-grey)", marginTop: 6 }}>{w.body}</p>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 24, marginTop: "var(--s12)" }}>
        What we need a partner for
      </h2>
      <p style={{ color: "var(--rj-grey)", marginTop: "var(--s3)" }}>
        {needed.length} services on our roadmap cannot exist without one. These
        are the open slots, exactly as they appear on our own services page.
      </p>
      <div style={{ marginTop: "var(--s5)", display: "grid", gap: "var(--s3)" }}>
        {needed.map((s) => (
          <div key={s.name} className="rj-card" style={{ padding: "var(--s5)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <h3 style={{ fontSize: 17 }}>{s.name}</h3>
              <span className="rj-badge rj-badge--partner rj-badge--dot">{s.group}</span>
            </div>
            <p style={{ color: "var(--rj-grey)", marginTop: 8 }}>{s.body}</p>
            <p className="rj-note" style={{ marginTop: 6 }}>Indicative price to the owner: {s.price}</p>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 24, marginTop: "var(--s12)" }}>How data would work</h2>
      <p style={{ color: "var(--rj-grey)", marginTop: "var(--s3)" }}>
        Nothing is shared by default. An owner&apos;s details reach a partner
        only if that owner separately agrees, in a consent that is recorded with
        its exact wording. We do not sell data, and declining a partner offer
        never affects someone&apos;s registration. If that model does not work
        for you, we are probably not a fit.
      </p>
      <p style={{ marginTop: "var(--s4)" }}>
        <Link href="/privacy" style={{ fontWeight: 600 }}>
          How we use applicant data →
        </Link>
      </p>

      <h2 style={{ fontSize: 24, marginTop: "var(--s12)" }}>Talk to us</h2>
      <p style={{ color: "var(--rj-grey)", marginTop: "var(--s3)" }}>
        {BRAND.address}. Phone {BRAND.phone}.{" "}
        <span className="rj-note">
          (Placeholder contact details — to be replaced before launch.)
        </span>
      </p>

      <div style={{ display: "flex", gap: "var(--s3)", marginTop: "var(--s10)", flexWrap: "wrap" }}>
        <Link href="/services" className="rj-btn rj-btn--primary">
          See the full service roadmap
        </Link>
        <Link href="/about" className="rj-btn rj-btn--outline">
          Who we are
        </Link>
      </div>
    </div>
  );
}
