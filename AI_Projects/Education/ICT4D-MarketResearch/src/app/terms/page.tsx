import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/content";
import { FEE_SERVICE, naira } from "@/lib/registration";

export const metadata: Metadata = {
  title: "Terms — Rejista",
  description:
    "What Rejista promises, what it charges, when you get your money back, and what it is not responsible for.",
};

/* ENGLISH ONLY, DELIBERATELY.
   This page is not translated and should not be. It is a compliance document,
   Nigerian law operates in English, and shipping a refund or consent clause
   drafted in a language none of us speaks natively is a legal risk rather than
   a copy improvement (see the translation scope decision, plan §3/§7).
   The rest of the site is available in Pidgin. */

/* SPEC §10 OPEN ITEM: this is NOT a finished terms of service. Every clause
   below restates a promise the site already makes elsewhere (the FAQ, the
   pricing card, the consent step) so that nothing here is newly invented. The
   gaps are marked rather than filled with plausible-sounding legal text,
   because inventing terms is worse than admitting they are unwritten.
   Owner: Shamin (compliance). Must be reviewed by a Nigerian lawyer and
   settled before the first real applicant. */

const TERMS = [
  {
    h: "What we do",
    p: `Rejista files a business-name registration with the Corporate Affairs Commission (CAC) on your behalf. We are a filing agent. We are not the government, and we do not issue the certificate — CAC does. You could file it yourself; what you are paying us for is not having to.`,
  },
  {
    h: "What it costs",
    p: `A flat service fee of ${naira(FEE_SERVICE)}, plus the government's own fee, which CAC sets and which we show you separately before you pay. We never add a margin to the government fee and present it as ours. If you later take up a service through us, such as payments or insurance, we may receive a share from that provider — we will say so at the time. We never take a cut of your sales.`,
  },
  {
    h: "If your business name is rejected",
    p: "We check availability before you pay and ask for a second choice for exactly this reason. If both are rejected, we will work with you on a third at no extra charge.",
  },
  {
    h: "Refunds",
    p: "If we cannot register you at all, you get the service fee back. Government fees already paid to CAC cannot be refunded by us — that is the government's money, not ours, and we will tell you exactly how much of what you paid falls into each bucket.",
  },
  {
    h: "What we are not responsible for",
    p: "How long CAC takes, and whether CAC approves a particular name. Both are the government's decisions, not ours. We are responsible for filing correctly, telling you the truth about where your case is, and refunding our fee if we fail.",
  },
  {
    h: "Your information",
    p: "We use your details to file your registration and nothing else. We do not sell your data. Sharing with a bank or insurer happens only if you separately agree, and declining does not affect your registration.",
  },
  {
    h: "Your obligations after registering",
    p: "A registration has to be kept alive with annual returns to CAC, and a tax number eventually means filing a return. These are yours, not ours, unless you take up a service where we do them for you.",
  },
];

const UNSETTLED = [
  "Governing law and how a dispute would actually be resolved.",
  "The limit of our liability if we get a filing wrong.",
  "How long we keep your data (this is also open on the data page).",
  "How and when these terms can change, and how you would be told.",
];

export default function TermsPage() {
  return (
    <div className="rj-wrap rj-narrow" style={{ paddingBlock: "var(--s12)" }}>
      <p className="rj-eyebrow">Terms</p>
      <h1 style={{ fontSize: "clamp(30px,4.6vw,44px)", marginTop: "var(--s3)" }}>
        What we promise, and what we do not.
      </h1>
      <p className="rj-lede" style={{ marginTop: "var(--s4)" }}>
        In plain words, because terms nobody reads protect nobody.
      </p>

      <div className="rj-flag" style={{ marginTop: "var(--s6)" }}>
        <strong>These terms are not final, and this build sells nothing.</strong>{" "}
        Rejista is a demonstration today: no payment is taken and nothing is
        filed. The clauses below restate promises made elsewhere on this site so
        they sit in one place. They have not been reviewed by a lawyer, and they
        are not a contract yet.
      </div>

      <div style={{ marginTop: "var(--s12)", display: "grid", gap: "var(--s8)" }}>
        {TERMS.map((t, i) => (
          <section key={t.h}>
            <h2 style={{ fontSize: 21 }}>
              {i + 1}. {t.h}
            </h2>
            <p style={{ color: "var(--rj-grey)", marginTop: 8 }}>{t.p}</p>
          </section>
        ))}
      </div>

      <h2 style={{ fontSize: 24, marginTop: "var(--s12)" }}>What is still unwritten</h2>
      <div className="rj-flag" style={{ marginTop: "var(--s4)" }}>
        <strong>Four things are missing, on purpose.</strong> Writing
        plausible-sounding legal text we have not actually decided would be worse
        than saying it is not decided. Each of these must be settled and reviewed
        before anyone pays us anything.
        <ul style={{ marginTop: "var(--s3)", paddingLeft: "1.1em", display: "grid", gap: 6 }}>
          {UNSETTLED.map((u) => (
            <li key={u}>{u}</li>
          ))}
        </ul>
      </div>

      <p style={{ marginTop: "var(--s10)", color: "var(--rj-grey)" }}>
        Questions about any of this: {BRAND.phone}, or {BRAND.address}.
      </p>

      <div style={{ display: "flex", gap: "var(--s3)", marginTop: "var(--s8)", flexWrap: "wrap" }}>
        <Link href="/privacy" className="rj-btn rj-btn--outline">
          How we use your data
        </Link>
        <Link href="/faq" className="rj-btn rj-btn--outline">
          Questions
        </Link>
      </div>
    </div>
  );
}
