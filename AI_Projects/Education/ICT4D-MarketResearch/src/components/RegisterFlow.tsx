"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { STATES } from "@/lib/nigeria";
import { BRAND, LANGUAGES } from "@/lib/content";
import type { Copy } from "@/lib/copy";
// From ./copy/fill, not ./copy — the index imports next/headers, which cannot
// be reached from a client component.
import { fill } from "@/lib/copy/fill";
import {
  EMPTY,
  FEE_GOVERNMENT,
  FEE_SERVICE,
  FILING_STAGES,
  availabilityHint,
  makeRejistaId,
  naira,
  validBizName,
  validName,
  validPhone,
  type Registration,
} from "@/lib/registration";
import BusinessIdCard, { type CardData } from "./BusinessIdCard";
import Certificate from "./Certificate";

const STORE = "rejista.registration.v1";
const TOTAL_STEPS = 4;

// Copy arrives as a prop rather than being read here: this is a client
// component, so it cannot call cookies(). The server page resolves the locale
// once and hands down exactly the strings this flow needs.
export default function RegisterFlow({
  initialLang,
  copy,
  trades,
  stages,
}: {
  initialLang?: string;
  copy: Copy["register"];
  trades: Copy["trades"];
  stages: Copy["filingStages"];
}) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<Registration>(() =>
    initialLang ? { ...EMPTY, lang: initialLang } : EMPTY,
  );
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [stageIdx, setStageIdx] = useState(-1);
  const [result, setResult] = useState<CardData | null>(null);
  const [qrSvg, setQrSvg] = useState<string>();
  const [copied, setCopied] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Nothing is lost: state survives a dropped connection or an accidental
  // reload (spec §5.2). Read after mount so server and client markup match.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORE);
      if (raw) setData((d) => ({ ...d, ...JSON.parse(raw) }));
    } catch {
      /* storage unavailable — the flow still works, it just won't resume */
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }, [data]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const set = <K extends keyof Registration>(k: K, v: Registration[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  const hint = useMemo(() => availabilityHint(data.bizName), [data.bizName]);
  const state = STATES.find((s) => s.id === data.stateId);
  const langLabel = LANGUAGES.find((l) => l.code === data.lang)?.label ?? "English";
  const badgeLabels = {
    done: copy.statusDone,
    pending: copy.statusPending,
    partner: copy.statusPartner,
  };

  const step1Ok = validName(data.fullName) && validPhone(data.phone);
  const step2Ok =
    validBizName(data.bizName) && data.trade !== "" && data.stateId !== "";
  const step3Ok = data.consent;

  // Step 4: a real staged progress view, never a fake spinner. Each stage
  // corresponds to work the operator/system actually performs (spec §5.2).
  useEffect(() => {
    if (step !== 4 || stageIdx < 0) return;
    if (stageIdx >= FILING_STAGES.length) {
      const seq = 482913;
      const now = new Date();
      setResult({
        bizName: data.bizName,
        trade: data.trade,
        ownerName: data.fullName,
        rejistaId: makeRejistaId(data.stateId, seq),
        stateId: data.stateId,
        market: data.market,
        issued: now.toLocaleDateString("en-NG", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
      });
      setStep(5);
      return;
    }
    const t = setTimeout(
      () => setStageIdx((i) => i + 1),
      FILING_STAGES[stageIdx].seconds * 1000,
    );
    return () => clearTimeout(t);
  }, [step, stageIdx, data]);

  // QR generated in the browser, loaded on demand so it never weighs on the
  // first view of the marketing pages.
  useEffect(() => {
    if (!result) return;
    let alive = true;
    (async () => {
      const QRCode = (await import("qrcode")).default;
      const svg = await QRCode.toString(
        `https://${BRAND.domain}/verify/${result.rejistaId}`,
        { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#1A3A8F", light: "#FFFFFF" } },
      );
      if (alive) setQrSvg(svg);
    })();
    return () => {
      alive = false;
    };
  }, [result]);

  /* ------------------------------ step 5 ------------------------------ */
  if (step === 5 && result) {
    return (
      <div className="rj-wrap" style={{ paddingBlock: "var(--s12)" }}>
        <p className="rj-eyebrow">
          {copy.step} 5 {copy.of} 5 · {copy.done}
        </p>
        <h1 tabIndex={-1} ref={headingRef} style={{ fontSize: "clamp(28px,4.2vw,40px)", marginTop: "var(--s3)" }}>
          {data.bizName} {copy.s5Title}
        </h1>
        <p className="rj-lede" style={{ marginTop: "var(--s3)" }}>
          {copy.s5Lede}
        </p>

        <div style={{ display: "grid", gap: "var(--s8)", marginTop: "var(--s8)" }} className="rj-result-grid">
          <div>
            <BusinessIdCard data={result} qrSvg={qrSvg} />
            <div style={{ display: "flex", gap: "var(--s3)", marginTop: "var(--s5)", flexWrap: "wrap" }}>
              <button
                type="button"
                className="rj-btn rj-btn--primary"
                onClick={() => window.print()}
              >
                {copy.print}
              </button>
              <button
                type="button"
                className="rj-btn rj-btn--outline"
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(`https://${BRAND.domain}/verify/${result.rejistaId}`)
                    .then(() => setCopied(true))
                    .catch(() => setCopied(false));
                }}
              >
                {copied ? copy.copied : copy.copyLink}
              </button>
              <a
                className="rj-btn rj-btn--outline"
                href={`https://wa.me/?text=${encodeURIComponent(
                  `${data.bizName} is now registered with Rejista. Verify: https://${BRAND.domain}/verify/${result.rejistaId}`,
                )}`}
                target="_blank"
                rel="noreferrer"
              >
                {copy.share}
              </a>
            </div>
          </div>

          <div>
            <h2 style={{ fontSize: 22 }}>{copy.unlocked}</h2>
            <ul style={{ listStyle: "none", display: "grid", gap: "var(--s3)", marginTop: "var(--s4)" }}>
              <Unlocked
                title={copy.unlockedCac}
                note={copy.unlockedCacNote}
                status="pending"
                labels={badgeLabels}
              />
              <Unlocked
                title={copy.unlockedTin}
                note={copy.unlockedTinNote}
                status="pending"
                labels={badgeLabels}
              />
              <Unlocked
                title={copy.unlockedBank}
                note={copy.unlockedBankNote}
                status="partner"
                labels={badgeLabels}
              />
            </ul>

            <div className="rj-flag" style={{ marginTop: "var(--s5)" }}>
              <strong>{copy.demoLabel}</strong> {copy.s5Demo}
            </div>
          </div>
        </div>

        <div style={{ marginTop: "var(--s12)" }}>
          <h2 style={{ fontSize: 22, marginBottom: "var(--s4)" }}>
            {copy.recordTitle}
          </h2>
          <Certificate data={result} qrSvg={qrSvg} />
        </div>

        <p style={{ marginTop: "var(--s8)" }}>
          <Link href="/services" style={{ fontWeight: 600 }}>
            {copy.servicesLink}
          </Link>
        </p>

        <style>{`@media (min-width: 940px) { .rj-result-grid { grid-template-columns: 1fr 1fr; } }`}</style>
      </div>
    );
  }

  /* ------------------------------ step 4 ------------------------------ */
  if (step === 4) {
    return (
      <div className="rj-wrap rj-narrow" style={{ paddingBlock: "var(--s12)" }}>
        <Progress step={4} stepWord={copy.step} ofWord={copy.of} />
        <h1 tabIndex={-1} ref={headingRef} style={{ fontSize: 30, marginTop: "var(--s4)" }}>
          {copy.s4Title}
        </h1>
        <p className="rj-lede" style={{ marginTop: "var(--s3)" }}>
          {copy.s4Lede}
        </p>

        <ul style={{ listStyle: "none", display: "grid", gap: "var(--s3)", marginTop: "var(--s8)" }}>
          {stages.map((s, i) => {
            const done = i < stageIdx;
            const active = i === stageIdx;
            return (
              <li
                key={i}
                className="rj-card"
                style={{
                  display: "flex",
                  gap: "var(--s4)",
                  alignItems: "center",
                  borderColor: active ? "var(--rj-blue)" : undefined,
                  opacity: !done && !active ? 0.55 : 1,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    flexShrink: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: done ? "var(--rj-green)" : active ? "var(--rj-yellow)" : "var(--rj-line)",
                    color: done ? "#fff" : "#3d2a06",
                    fontWeight: 700,
                  }}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span>
                  <strong style={{ fontFamily: "var(--font-display)" }}>{s.label}</strong>
                  <span style={{ display: "block", color: "var(--rj-grey)", fontSize: 14.5 }}>
                    {s.detail}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>

        <div className="rj-flag" style={{ marginTop: "var(--s6)" }}>
          <strong>{copy.demoLabel}</strong> {copy.s4Demo}
        </div>
      </div>
    );
  }

  /* --------------------------- steps 1 – 3 ---------------------------- */
  return (
    <div className="rj-wrap rj-narrow" style={{ paddingBlock: "var(--s12)" }}>
      <Progress step={step} stepWord={copy.step} ofWord={copy.of} />

      {step === 1 && (
        <>
          <h1 tabIndex={-1} ref={headingRef} style={{ fontSize: 30, marginTop: "var(--s4)" }}>
            {copy.s1Title}
          </h1>
          <p className="rj-lede" style={{ marginTop: "var(--s3)" }}>
            {copy.s1Lede}
          </p>

          <div style={{ marginTop: "var(--s8)" }}>
            <Field
              id="fullName"
              label={copy.fullName}
              help={copy.fullNameHelp}
              value={data.fullName}
              onChange={(v) => set("fullName", v)}
              onBlur={() => setTouched((t) => ({ ...t, fullName: true }))}
              error={touched.fullName && !validName(data.fullName) ? copy.fullNameErr : undefined}
              autoComplete="name"
            />
            <Field
              id="phone"
              label={copy.phone}
              help={copy.phoneHelp}
              value={data.phone}
              onChange={(v) => set("phone", v)}
              onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
              error={touched.phone && !validPhone(data.phone) ? copy.phoneErr : undefined}
              inputMode="tel"
              autoComplete="tel"
            />
            <div className="rj-field">
              <label className="rj-label" htmlFor="lang">
                {copy.langLabel}
              </label>
              <span className="rj-help" id="lang-help">
                {copy.langHelp}
              </span>
              <select
                id="lang"
                className="rj-select"
                aria-describedby="lang-help"
                value={data.lang}
                onChange={(e) => set("lang", e.target.value)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
              {/* Answers back in the language just chosen. Without this the
                  control changed nothing on screen, so it read as broken —
                  the greeting is the proof that the choice registered. */}
              <p aria-live="polite" className="rj-note" style={{ marginTop: "var(--s2)" }}>
                {fill(copy.langConfirm, {
                  greeting: LANGUAGES.find((l) => l.code === data.lang)?.greeting ?? "Welcome",
                  lang: LANGUAGES.find((l) => l.code === data.lang)?.label ?? "English",
                })}
              </p>
            </div>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h1 tabIndex={-1} ref={headingRef} style={{ fontSize: 30, marginTop: "var(--s4)" }}>
            {copy.s2Title}
          </h1>
          <p className="rj-lede" style={{ marginTop: "var(--s3)" }}>
            {copy.s2Lede}
          </p>

          <div style={{ marginTop: "var(--s8)" }}>
            <Field
              id="bizName"
              label={copy.bizName}
              help={copy.bizNameHelp}
              value={data.bizName}
              onChange={(v) => set("bizName", v)}
              onBlur={() => setTouched((t) => ({ ...t, bizName: true }))}
              error={
                touched.bizName && !validBizName(data.bizName)
                  ? copy.bizNameErr
                  : undefined
              }
            />
            {data.bizName.trim().length >= 3 && validBizName(data.bizName) && (
              <p
                className={hint === "likely" ? "rj-hint-ok" : "rj-error"}
                style={{ marginTop: -12, marginBottom: "var(--s5)" }}
              >
                {hint === "likely" ? copy.hintLikely : copy.hintRisky}
              </p>
            )}
            <Field
              id="bizAlt"
              label={copy.bizAlt}
              help={copy.bizAltHelp}
              value={data.bizAlt}
              onChange={(v) => set("bizAlt", v)}
              optional
              optionalLabel={copy.optional}
            />

            <div className="rj-field">
              <label className="rj-label" htmlFor="trade">
                {copy.trade}
              </label>
              <span className="rj-help" id="trade-help">
                {copy.tradeHelp}
              </span>
              <select
                id="trade"
                className="rj-select"
                aria-describedby="trade-help"
                value={data.trade}
                onChange={(e) => set("trade", e.target.value)}
              >
                <option value="">{copy.tradeChoose}</option>
                {trades.map((tr) => (
                  <option key={tr} value={tr}>
                    {tr}
                  </option>
                ))}
              </select>
            </div>

            <div className="rj-field">
              <label className="rj-label" htmlFor="state">
                {copy.state}
              </label>
              <span className="rj-help" id="state-help">
                {copy.stateHelp}
              </span>
              <select
                id="state"
                className="rj-select"
                aria-describedby="state-help"
                value={data.stateId}
                onChange={(e) => set("stateId", e.target.value)}
              >
                {[...STATES]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>

            <Field
              id="market"
              label={copy.market}
              help={copy.marketHelp}
              value={data.market}
              onChange={(v) => set("market", v)}
              optional
              optionalLabel={copy.optional}
            />
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <h1 tabIndex={-1} ref={headingRef} style={{ fontSize: 30, marginTop: "var(--s4)" }}>
            {copy.s3Title}
          </h1>
          <p className="rj-lede" style={{ marginTop: "var(--s3)" }}>
            {copy.s3Lede}
          </p>

          <dl className="rj-card" style={{ marginTop: "var(--s6)", display: "grid", gap: "var(--s3)" }}>
            {[
              [copy.fullName, data.fullName, 1],
              [copy.phone, data.phone, 1],
              [copy.sumLang, langLabel, 1],
              [copy.bizName, data.bizName, 2],
              [copy.bizAlt, data.bizAlt || "—", 2],
              [copy.trade, data.trade, 2],
              [copy.state, state?.name ?? "—", 2],
              [copy.market, data.market || "—", 2],
            ].map(([k, v, s]) => (
              <div
                key={k as string}
                style={{ display: "flex", justifyContent: "space-between", gap: "var(--s4)", alignItems: "baseline" }}
              >
                <dt style={{ color: "var(--rj-grey)", fontSize: 14.5, minWidth: 128 }}>{k}</dt>
                <dd style={{ fontWeight: 600, textAlign: "right", flex: 1, overflowWrap: "anywhere" }}>
                  {v as string}
                </dd>
                <button
                  type="button"
                  onClick={() => setStep(s as number)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--rj-blue)",
                    cursor: "pointer",
                    fontSize: 14.5,
                    fontWeight: 600,
                    padding: "6px 4px",
                  }}
                >
                  {copy.edit}
                </button>
              </div>
            ))}
          </dl>

          <div className="rj-card" style={{ marginTop: "var(--s5)" }}>
            <h2 style={{ fontSize: 18 }}>{copy.costTitle}</h2>
            <div style={{ display: "grid", gap: 8, marginTop: "var(--s4)" }}>
              <Row k={copy.costService} v={naira(FEE_SERVICE)} />
              <Row k={copy.costGov} v={naira(FEE_GOVERNMENT)} note={copy.costGovNote} />
              <div style={{ borderTop: "1px solid var(--rj-line)", paddingTop: 10 }}>
                <Row k={copy.costTotal} v={naira(FEE_SERVICE + FEE_GOVERNMENT)} strong />
              </div>
            </div>
            {/* copy.costNote, not a hardcoded agent price. The hardcoded line
                claimed a specific agent range, which contradicted the "comparable
                all-in" figure on the model card elsewhere on the site. */}
            <p className="rj-note" style={{ marginTop: "var(--s4)" }}>
              {copy.costNote}
            </p>
          </div>

          <div style={{ marginTop: "var(--s5)", display: "grid", gap: "var(--s3)" }}>
            <label className="rj-checkrow">
              <input
                type="checkbox"
                checked={data.consent}
                onChange={(e) => set("consent", e.target.checked)}
              />
              <span>
                {copy.consent}{" "}
                <Link href="/privacy">{copy.consentLink}</Link>.
              </span>
            </label>
            {/* Marketing consent is separate and optional — never bundled. */}
            <label className="rj-checkrow">
              <input
                type="checkbox"
                checked={data.marketing}
                onChange={(e) => set("marketing", e.target.checked)}
              />
              <span>{copy.marketing}</span>
            </label>
            <p className="rj-note">{copy.consentNote}</p>
          </div>
        </>
      )}

      <div style={{ display: "flex", gap: "var(--s3)", marginTop: "var(--s8)", flexWrap: "wrap" }}>
        {step > 1 && (
          <button type="button" className="rj-btn rj-btn--outline" onClick={() => setStep(step - 1)}>
            {copy.back}
          </button>
        )}
        <button
          type="button"
          className="rj-btn rj-btn--primary"
          disabled={(step === 1 && !step1Ok) || (step === 2 && !step2Ok) || (step === 3 && !step3Ok)}
          onClick={() => {
            if (step === 3) {
              setStageIdx(0);
              setStep(4);
            } else {
              setStep(step + 1);
            }
          }}
        >
          {step === 3 ? copy.submit : copy.continue}
        </button>
        <Link
          href="/faq"
          className="rj-btn rj-btn--outline"
          style={{ marginLeft: "auto" }}
        >
          {copy.stuck} {BRAND.phone}
        </Link>
      </div>
    </div>
  );
}

function Progress({
  step,
  stepWord,
  ofWord,
}: {
  step: number;
  stepWord: string;
  ofWord: string;
}) {
  const pct = (step / TOTAL_STEPS) * 100;
  return (
    <div>
      <p className="rj-eyebrow">
        {stepWord} {step} {ofWord} {TOTAL_STEPS}
      </p>
      <div
        role="progressbar"
        aria-valuenow={step}
        aria-valuemin={1}
        aria-valuemax={TOTAL_STEPS}
        aria-label={`${stepWord} ${step} ${ofWord} ${TOTAL_STEPS}`}
        style={{
          height: 6,
          background: "var(--rj-line)",
          borderRadius: 999,
          marginTop: "var(--s3)",
          overflow: "hidden",
        }}
      >
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--rj-blue)" }} />
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  help,
  value,
  onChange,
  onBlur,
  error,
  inputMode,
  autoComplete,
  optional,
  optionalLabel,
}: {
  id: string;
  label: string;
  help: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  error?: string;
  inputMode?: "tel" | "text" | "numeric";
  autoComplete?: string;
  optional?: boolean;
  optionalLabel?: string;
}) {
  return (
    <div className="rj-field">
      {/* Label above the input, never placeholder-only: placeholders vanish and
          low-confidence users lose their place (spec §5.2). */}
      <label className="rj-label" htmlFor={id}>
        {label}
        {optional && (
          <span style={{ color: "var(--rj-grey)", fontWeight: 400 }}>
            {" "}({optionalLabel})
          </span>
        )}
      </label>
      <span className="rj-help" id={`${id}-help`}>
        {help}
      </span>
      <input
        id={id}
        className="rj-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-describedby={`${id}-help${error ? ` ${id}-err` : ""}`}
        aria-invalid={error ? true : undefined}
        style={error ? { borderColor: "var(--rj-red)" } : undefined}
      />
      {error && (
        <span className="rj-error" id={`${id}-err`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function Row({ k, v, note, strong }: { k: string; v: string; note?: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s4)", alignItems: "baseline" }}>
      <span>
        {k}
        {note && <span style={{ display: "block", fontSize: 13, color: "var(--rj-grey)" }}>{note}</span>}
      </span>
      <span
        className="rj-tabular"
        style={{ fontWeight: strong ? 700 : 600, fontSize: strong ? 20 : 16, fontFamily: "var(--font-display)" }}
      >
        {v}
      </span>
    </div>
  );
}

function Unlocked({
  title,
  note,
  status,
  labels,
}: {
  title: string;
  note: string;
  status: "done" | "pending" | "partner";
  labels: { done: string; pending: string; partner: string };
}) {
  const badge =
    status === "done"
      ? { cls: "rj-badge--live", text: labels.done }
      : status === "pending"
        ? { cls: "rj-badge--soon", text: labels.pending }
        : { cls: "rj-badge--partner", text: labels.partner };
  return (
    <li className="rj-card" style={{ padding: "var(--s4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <strong style={{ fontFamily: "var(--font-display)" }}>{title}</strong>
        <span className={`rj-badge ${badge.cls} rj-badge--dot`}>{badge.text}</span>
      </div>
      <p className="rj-note" style={{ marginTop: 6 }}>
        {note}
      </p>
    </li>
  );
}
