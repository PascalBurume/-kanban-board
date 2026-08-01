"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { setLocale } from "@/app/actions/locale";
import { LOCALES, LOCALE_LABEL, type Locale } from "@/lib/i18n";
import type { Copy } from "@/lib/copy";
import RejistaMark from "./RejistaMark";

// All four are real pages. The landing page carries a short version of the
// first two and links down to these for the full case, rather than the pages
// repeating the landing sections verbatim.
export default function SiteHeader({
  locale,
  nav,
}: {
  locale: Locale;
  nav: Copy["nav"];
}) {
  const NAV = [
    { href: "/how-it-works", label: nav.howItWorks },
    { href: "/why-register", label: nav.whyRegister },
    { href: "/services", label: nav.services },
    { href: "/faq", label: nav.questions },
  ];
  // Site language. The contact language (which of five we will reach you in)
  // is a different question and lives in the registration form. Conflating the
  // two is what made the old header switcher look broken.
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  // `locale` only changes after the server action writes the cookie and the
  // tree re-renders. Binding the <select> straight to it meant that for the
  // whole round-trip the control snapped back to the language you just moved
  // away from — on a slow connection it reads as "the switcher is broken", and
  // people gave up before it ever landed. useOptimistic shows the chosen value
  // immediately and yields to the server value once it arrives.
  const [shownLocale, setShownLocale] = useOptimistic(locale);

  return (
    <header
      className="rj-noprint"
      style={{
        background: "var(--rj-white)",
        borderBottom: "1px solid var(--rj-line)",
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}
    >
      <div
        className="rj-wrap"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--s4)",
          minHeight: 68,
        }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
            color: "var(--rj-ink)",
          }}
        >
          <RejistaMark size={30} />
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 21,
              letterSpacing: "-0.02em",
            }}
          >
            Rejista
          </span>
        </Link>

        <nav
          aria-label="Main"
          style={{ marginLeft: "auto", display: "flex", gap: 4 }}
          className="rj-nav-desktop"
        >
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              style={{
                color: "var(--rj-ink)",
                textDecoration: "none",
                fontSize: 15,
                fontWeight: 500,
                padding: "10px 10px",
                borderRadius: 8,
                whiteSpace: "nowrap",
              }}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        {/* Site language. Changing it writes a cookie and revalidates, so
            the ~18 server components re-render from the other copy bundle.
            Only English and Pidgin appear here: those are the two locales the
            site actually ships in (spec §3). The five-way contact-language
            picker is a different control and lives in the registration form. */}
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            className="rj-sr-label"
            style={{ fontSize: 13, color: "var(--rj-grey)", whiteSpace: "nowrap" }}
          >
            {nav.siteLangLabel}
          </span>
          <select
            value={shownLocale}
            onChange={(e) => {
              const next = e.target.value;
              startTransition(() => {
                setShownLocale(next as Locale);
                setLocale(next);
              });
            }}
            aria-label={nav.siteLangAria}
            style={{
              minHeight: 44,
              fontSize: 15,
              border: "1.5px solid var(--rj-line)",
              borderRadius: 999,
              padding: "0 12px",
              background: "var(--rj-white)",
              fontFamily: "var(--font-body)",
              // Stays interactive while the change is in flight. A disabled,
              // half-faded control during a multi-second round-trip is what
              // made this look dead on a slow connection.
              opacity: pending ? 0.85 : 1,
              cursor: pending ? "progress" : "pointer",
            }}
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_LABEL[l]}
              </option>
            ))}
          </select>
        </label>

        <Link
          href="/register"
          className="rj-btn rj-btn--primary rj-cta-desktop"
          style={{ minHeight: 46, fontSize: 15, padding: "0 20px" }}
        >
          {nav.register}
        </Link>

        <button
          type="button"
          className="rj-burger"
          aria-expanded={open}
          aria-label="Menu"
          onClick={() => setOpen((v) => !v)}
          style={{
            display: "none",
            minWidth: 48,
            minHeight: 48,
            border: "1.5px solid var(--rj-line)",
            borderRadius: 8,
            background: "var(--rj-white)",
            fontSize: 20,
            cursor: "pointer",
          }}
        >
          ≡
        </button>
      </div>

      {open && (
        <div
          className="rj-wrap"
          style={{ paddingBottom: "var(--s4)", display: "grid", gap: 4 }}
        >
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              style={{
                padding: "12px 8px",
                textDecoration: "none",
                color: "var(--rj-ink)",
                fontWeight: 500,
                borderBottom: "1px solid var(--rj-line)",
              }}
            >
              {n.label}
            </Link>
          ))}
          <Link
            href="/register"
            className="rj-btn rj-btn--primary"
            style={{ marginTop: 8 }}
            onClick={() => setOpen(false)}
          >
            {nav.register}
          </Link>
        </div>
      )}

      <style>{`
        @media (max-width: 900px) {
          .rj-nav-desktop, .rj-cta-desktop { display: none !important; }
          .rj-burger { display: inline-flex !important; align-items: center; justify-content: center; margin-left: auto; }
        }
        @media (max-width: 560px) {
          .rj-sr-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
        }
      `}</style>
    </header>
  );
}
