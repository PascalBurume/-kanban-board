import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/content";

export const metadata: Metadata = {
  title: "How we use your data — Rejista",
  description:
    "What Rejista collects, why, who sees it, how long we keep it, and how to get it deleted. Written under the Nigeria Data Protection Act.",
};

/* ENGLISH ONLY, DELIBERATELY.
   This page is not translated and should not be. It is a compliance document,
   Nigerian law operates in English, and shipping a refund or consent clause
   drafted in a language none of us speaks natively is a legal risk rather than
   a copy improvement (see the translation scope decision, plan §3/§7).
   The rest of the site is available in Pidgin. */

/* This page is linked from the consent checkbox in the registration flow, so
   it is part of the consent itself rather than a footer formality. It is
   deliberately written in the same plain voice as the rest of the site.

   SPEC §10 OPEN ITEM: the retention period, the named data protection
   contact, and the DPIA referenced below are all UNSETTLED. Shamin owns them
   (§15) and they must be settled before a single real applicant is accepted.
   Every unsettled item is marked inline rather than quietly omitted. */

const COLLECTED = [
  {
    what: "Your name and phone number",
    why: "To file your registration and to reach you about it.",
    shared: "The Corporate Affairs Commission, on your registration form.",
  },
  {
    what: "Your National Identification Number (NIN)",
    why: "CAC requires it to confirm who is registering the business.",
    shared: "The Corporate Affairs Commission. Nobody else.",
  },
  {
    what: "A photo of your ID, if we need one",
    why: "Only when CAC asks us to prove your identity.",
    shared: "The Corporate Affairs Commission. Nobody else.",
  },
  {
    what: "Your business name, trade, state and market",
    why: "This is what gets registered. It becomes public on the CAC register.",
    shared: "Public once registered — that is the point of registering.",
  },
  {
    what: "Your payment reference",
    why: "To confirm you paid and to refund you if we cannot register you.",
    shared: "Our payment provider. We never see or store your card details.",
  },
];

export default function PrivacyPage() {
  return (
    <div className="rj-wrap rj-narrow" style={{ paddingBlock: "var(--s12)" }}>
      <p className="rj-eyebrow">How we use your data</p>
      <h1 style={{ fontSize: "clamp(30px,4.6vw,44px)", marginTop: "var(--s3)" }}>
        Your details are for registering your business. Nothing else.
      </h1>
      <p className="rj-lede" style={{ marginTop: "var(--s4)" }}>
        Written under the Nigeria Data Protection Act (NDPA). In plain words, then in detail.
      </p>

      <div className="rj-flag" style={{ marginTop: "var(--s6)" }}>
        <strong>This build takes no real data.</strong> Rejista is a
        demonstration today. Nothing you type into it is stored, sent to the
        government, or seen by anyone. This page describes how the real service
        will handle your data once it exists.
      </div>

      <h2 style={{ fontSize: 24, marginTop: "var(--s12)" }}>The short version</h2>
      <ul style={{ marginTop: "var(--s4)", display: "grid", gap: "var(--s3)", paddingLeft: "1.1em" }}>
        <li>We collect only what the government needs to register your business.</li>
        <li>We do not sell your data. Not to anyone, not ever.</li>
        <li>
          We only share it with a bank, lender or insurer if you separately say
          yes. Saying no does not affect your registration.
        </li>
        <li>You can ask us to delete your data, and we will.</li>
        <li>Consent is never pre-ticked, and we record the exact wording you agreed to.</li>
      </ul>

      <h2 style={{ fontSize: 24, marginTop: "var(--s12)" }}>What we collect, and why</h2>
      <div style={{ marginTop: "var(--s5)", display: "grid", gap: "var(--s4)" }}>
        {COLLECTED.map((c) => (
          <div key={c.what} className="rj-card" style={{ padding: "var(--s5)" }}>
            <h3 style={{ fontSize: 17 }}>{c.what}</h3>
            <p style={{ marginTop: 8, color: "var(--rj-grey)" }}>
              <strong style={{ color: "var(--rj-ink)" }}>Why:</strong> {c.why}
            </p>
            <p style={{ marginTop: 4, color: "var(--rj-grey)" }}>
              <strong style={{ color: "var(--rj-ink)" }}>Who sees it:</strong> {c.shared}
            </p>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 24, marginTop: "var(--s12)" }}>How long we keep it</h2>
      <div className="rj-flag" style={{ marginTop: "var(--s4)" }}>
        <strong>Not settled yet.</strong> The retention period has not been
        decided. It must be set, written here, and backed by a real deletion
        mechanism before the first real applicant is accepted. Leaving this
        blank on a live site would itself be an NDPA failure, so it is stated
        rather than hidden.
      </div>

      <h2 style={{ fontSize: 24, marginTop: "var(--s12)" }}>Your rights</h2>
      <p style={{ marginTop: "var(--s4)", color: "var(--rj-grey)" }}>
        Under the NDPA you can ask us what we hold about you, ask us to correct
        it, ask us to delete it, and withdraw a consent you gave earlier. Ask a
        real person on {BRAND.phone} and we will do it.
      </p>

      <h2 style={{ fontSize: 24, marginTop: "var(--s12)" }}>If something goes wrong</h2>
      <div className="rj-flag" style={{ marginTop: "var(--s4)" }}>
        <strong>Not settled yet.</strong> The breach response — who is told,
        by whom, within what window — has not been written. It is owned by our
        compliance lead and is required before launch.
      </div>

      <h2 style={{ fontSize: 24, marginTop: "var(--s12)" }}>Who to contact</h2>
      <p style={{ marginTop: "var(--s4)", color: "var(--rj-grey)" }}>
        {BRAND.address}. Phone {BRAND.phone}.{" "}
        <span className="rj-note">
          (Placeholder contact details — to be replaced with a named data
          protection contact before launch.)
        </span>
      </p>

      <p style={{ marginTop: "var(--s12)" }}>
        <Link href="/register" className="rj-btn rj-btn--primary">
          Register my business
        </Link>
      </p>
    </div>
  );
}
