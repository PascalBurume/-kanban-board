import Link from "next/link";
import { BRAND } from "@/lib/content";
import type { Copy } from "@/lib/copy";
import RejistaMark from "./RejistaMark";

// Every href here must resolve to a real page. Check that before adding one:
// a footer link to a page that does not exist costs more trust than a shorter
// footer does. Labels come from the copy bundle so they translate.
export default function SiteFooter({
  copy,
  services,
  nav,
}: {
  copy: Copy["footer"];
  services: Copy["serviceGroups"];
  nav: Copy["nav"];
}) {
  const COLS = [
    {
      head: copy.colRegister,
      links: [
        { href: "/register", label: nav.register },
        { href: "/start", label: copy.scanToRegister },
        { href: "/how-it-works", label: nav.howItWorks },
        { href: "/why-register", label: nav.whyRegister },
        { href: "/app", label: copy.otherWays },
        { href: "/faq", label: nav.questions },
      ],
    },
    {
      head: copy.colProject,
      links: [
        { href: "/about", label: copy.about },
        { href: "/partners", label: copy.partners },
        { href: "/privacy", label: copy.privacy },
        { href: "/terms", label: copy.terms },
      ],
    },
  ];
  return (
    <footer
      className="rj-noprint"
      style={{
        background: "var(--rj-indigo)",
        color: "#fff",
        position: "relative",
        overflow: "hidden",
        marginTop: "var(--s16)",
      }}
    >
      <div className="rj-lattice rj-lattice--divider" aria-hidden="true" />
      <div
        className="rj-wrap"
        style={{ position: "relative", paddingBlock: "var(--s16) var(--s8)" }}
      >
        <div
          style={{
            display: "grid",
            gap: "var(--s8)",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <RejistaMark size={34} />
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 22,
                }}
              >
                Rejista
              </span>
            </div>
            <p
              style={{
                color: "rgba(255,255,255,0.75)",
                fontSize: 14.5,
                marginTop: 12,
                maxWidth: "34ch",
              }}
            >
              {copy.blurb} {BRAND.fee}.
            </p>
          </div>

          {COLS.map((c) => (
            <nav key={c.head} aria-label={c.head}>
              <h3
                style={{
                  color: "var(--rj-gold)",
                  fontSize: 12,
                  letterSpacing: "0.13em",
                  textTransform: "uppercase",
                  marginBottom: 12,
                }}
              >
                {c.head}
              </h3>
              <ul style={{ listStyle: "none", display: "grid", gap: 9 }}>
                {c.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      style={{
                        color: "rgba(255,255,255,0.88)",
                        textDecoration: "none",
                        fontSize: 14.5,
                      }}
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <nav aria-label={copy.colServices}>
            <h3
              style={{
                color: "var(--rj-gold)",
                fontSize: 12,
                letterSpacing: "0.13em",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              {copy.colServices}
            </h3>
            <ul style={{ listStyle: "none", display: "grid", gap: 9 }}>
              {services.map((g) => (
                <li key={g.group}>
                  <Link
                    href="/services"
                    style={{
                      color: "rgba(255,255,255,0.88)",
                      textDecoration: "none",
                      fontSize: 14.5,
                    }}
                  >
                    {g.group}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h3
              style={{
                color: "var(--rj-gold)",
                fontSize: 12,
                letterSpacing: "0.13em",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              {copy.colTalk}
            </h3>
            <p style={{ fontSize: 14.5, color: "rgba(255,255,255,0.88)" }}>
              {BRAND.phone}
              <br />
              {BRAND.address}
            </p>
            <p className="rj-note" style={{ color: "rgba(255,255,255,0.5)", marginTop: 8 }}>
              {copy.placeholder}
            </p>
          </div>
        </div>

        {/* Naming the humans is a Nigerian trust cue that "© Rejista Ltd" is
            not (spec §5.1). */}
        <p
          style={{
            marginTop: "var(--s10)",
            paddingTop: "var(--s5)",
            borderTop: "1px solid rgba(255,255,255,0.18)",
            fontSize: 14.5,
            color: "rgba(255,255,255,0.85)",
          }}
        >
          {copy.builtBy} {BRAND.team}.
        </p>
        <p className="rj-note" style={{ color: "rgba(255,255,255,0.55)", marginTop: 6 }}>
          {copy.disclaimer}
        </p>
      </div>
    </footer>
  );
}
