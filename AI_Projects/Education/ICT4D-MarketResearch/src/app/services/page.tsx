import type { Metadata } from "next";
import { getCopy, fill } from "@/lib/copy";
import Link from "next/link";
import { type ServiceStatus } from "@/lib/content";

// Titles and descriptions are what a browser tab, a search result and a
// WhatsApp link preview show, so they follow the locale like everything else.
// generateMetadata (not a static export) because reading the cookie is async.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getCopy();
  return { title: t.meta.services.title, description: t.meta.services.description };
}

/** Same vocabulary the rest of the site uses. Nothing is described as
 *  available when it is not: "soon" means built but not shipped, "partner"
 *  means we have not signed anyone yet and will not pretend otherwise. */
const BADGE: Record<ServiceStatus, { cls: string; text: string }> = {
  live: { cls: "rj-badge--live", text: "" },
  soon: { cls: "rj-badge--soon", text: "Coming" },
  partner: { cls: "rj-badge--partner", text: "Partner needed" },
};

export default async function ServicesPage() {
  const t = await getCopy();
  const all = t.serviceGroups.flatMap((g) => g.items);
  const count = (s: ServiceStatus) => all.filter((i) => i.status === s).length;

  return (
    <div className="rj-wrap" style={{ paddingBlock: "var(--s12)" }}>
      <div className="rj-narrow" style={{ margin: 0 }}>
        <p className="rj-eyebrow">{t.services.eyebrow}</p>
        <h1 style={{ fontSize: "clamp(30px,4.6vw,44px)", marginTop: "var(--s3)" }}>
          {t.services.title}
        </h1>
        <p className="rj-lede" style={{ marginTop: "var(--s4)" }}>
          {t.services.lede}
        </p>

        <div className="rj-flag" style={{ marginTop: "var(--s6)" }}>
          <strong>{t.services.badgesLabel}</strong>{" "}
          {fill(t.services.badges, { total: all.length, live: count("live"), soon: count("soon"), partner: count("partner") })}
        </div>
      </div>

      <div style={{ marginTop: "var(--s12)", display: "grid", gap: "var(--s12)" }}>
        {t.serviceGroups.map((g) => (
          <section key={g.group}>
            <h2 style={{ fontSize: 26 }}>{g.group}</h2>
            <p style={{ color: "var(--rj-grey)", marginTop: 6, maxWidth: "60ch" }}>{g.blurb}</p>

            <div className="rj-grid rj-grid--3" style={{ marginTop: "var(--s6)" }}>
              {g.items.map((s) => (
                <div key={s.name} className="rj-card">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "flex-start",
                    }}
                  >
                    <h3 style={{ fontSize: 18 }}>{s.name}</h3>
                    <span className={`rj-badge ${BADGE[s.status].cls} rj-badge--dot`}>
                      {BADGE[s.status].text}
                    </span>
                  </div>
                  <p style={{ color: "var(--rj-grey)", marginTop: "var(--s3)" }}>{s.body}</p>
                  <dl
                    style={{
                      marginTop: "var(--s4)",
                      paddingTop: "var(--s3)",
                      borderTop: "1px solid var(--rj-line)",
                      display: "grid",
                      gap: 4,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <dt className="rj-note">{t.services.provider}</dt>
                      <dd style={{ margin: 0, fontWeight: 600, textAlign: "right" }}>{s.provider}</dd>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <dt className="rj-note">{t.services.price}</dt>
                      <dd
                        style={{ margin: 0, fontWeight: 600, textAlign: "right" }}
                        className="rj-tabular"
                      >
                        {s.price}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p style={{ marginTop: "var(--s16)" }}>
        <Link href="/register" className="rj-btn rj-btn--primary">
          {t.services.cta}
        </Link>
      </p>
    </div>
  );
}
