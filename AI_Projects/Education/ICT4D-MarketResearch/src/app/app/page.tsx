import type { Metadata } from "next";
import { getCopy } from "@/lib/copy";
import Link from "next/link";
import { BRAND } from "@/lib/content";

// Titles and descriptions are what a browser tab, a search result and a
// WhatsApp link preview show, so they follow the locale like everything else.
// generateMetadata (not a static export) because reading the cookie is async.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getCopy();
  return { title: t.meta.otherWays.title, description: t.meta.otherWays.description };
}

/* This route used to be linked as "See the phone app". There is no phone app,
   and there is no plan to build one before the pilot. Rather than invent a
   product or quietly delete the route, the page answers the question the
   button was really standing in for: what do I do if I do not have a
   smartphone? That question is asked directly in the FAQ, and the honest
   answer is that the website is one of three doors. */


export default async function OtherWaysPage() {
  const t = await getCopy();
  return (
    <div className="rj-wrap rj-narrow" style={{ paddingBlock: "var(--s12)" }}>
      <p className="rj-eyebrow">{t.otherWays.eyebrow}</p>
      <h1 style={{ fontSize: "clamp(30px,4.6vw,44px)", marginTop: "var(--s3)" }}>
        {t.otherWays.title}
      </h1>
      <p className="rj-lede" style={{ marginTop: "var(--s4)" }}>
        {t.otherWays.lede}
      </p>

      <div style={{ marginTop: "var(--s10)", display: "grid", gap: "var(--s4)" }}>
        {t.otherWays.doors.map((d, i) => (
          <div key={d.title} className="rj-card" style={{ padding: "var(--s5)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <h2 style={{ fontSize: 20 }}>
                {i + 1}. {d.title}
              </h2>
              {/* Only the first door is open; the other two are labelled
                  honestly rather than hidden. */}
              <span
                className={`rj-badge rj-badge--dot ${i === 0 ? "rj-badge--live" : "rj-badge--soon"}`}
              >
                {d.status}
              </span>
            </div>
            <p style={{ color: "var(--rj-grey)", marginTop: "var(--s3)" }}>{d.body}</p>
            {"action" in d && d.action && (
              <p style={{ marginTop: "var(--s4)" }}>
                <Link href="/register" className="rj-btn rj-btn--primary">
                  {d.action}
                </Link>
              </p>
            )}
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 24, marginTop: "var(--s12)" }}>{t.otherWays.whyNoAppTitle}</h2>
      <p style={{ color: "var(--rj-grey)", marginTop: "var(--s3)" }}>
        {t.otherWays.whyNoApp}
      </p>

      <div className="rj-flag" style={{ marginTop: "var(--s10)" }}>
        <strong>{t.otherWays.warnLabel}</strong> {t.otherWays.warn}
      </div>

      <p className="rj-note" style={{ marginTop: "var(--s8)" }}>
        {t.otherWays.stuck} {BRAND.phone}.
      </p>
    </div>
  );
}
