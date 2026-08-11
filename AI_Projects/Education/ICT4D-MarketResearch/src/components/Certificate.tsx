"use client";

import { LATTICE_INK } from "@/lib/motif";
import { STATES } from "@/lib/nigeria";
import { BRAND } from "@/lib/content";
import type { CardData } from "./BusinessIdCard";
import type { Copy } from "@/lib/copy";

/**
 * A4 landscape record for the wall. Laid out entirely in container-query units
 * (cqw), so the same markup renders correctly as a ~700px on-screen preview and
 * as a full-bleed 297×210mm sheet in print, with no second stylesheet and no
 * rasterised image. "Download (PDF)" calls window.print(); every browser's
 * print dialogue offers Save as PDF, so there is no library, no upload of the
 * owner's details to a third-party converter, and no failure mode at a booth
 * with bad network.
 *
 * ATTRIBUTION IS A HARD RULE (spec §6.1). This document must never present
 * itself as a government document. It is headed as a Rejista service record,
 * signed as a filing agent, states plainly that CAC issues the certificate of
 * incorporation, and in this build carries a DEMONSTRATION stamp and a specimen
 * notice. Producing something that reads as a CAC certificate with a fabricated
 * Registrar-General's signature would be a forged government document; no small
 * print underneath makes that acceptable.
 */
export default function Certificate({
  data,
  qrSvg,
  t,
}: {
  data: CardData;
  qrSvg?: string;
  t: Copy["cert"];
}) {
  const state = STATES.find((s) => s.id === data.stateId);

  return (
    <div
      id="rj-certificate"
      style={{
        containerType: "inline-size",
        width: "100%",
        aspectRatio: "1.414 / 1",
        background: "#FBF7F1",
        position: "relative",
        overflow: "hidden",
        boxShadow: "var(--rj-shadow-2)",
        borderRadius: 6,
      }}
    >
      <div
        className="rj-lattice"
        style={{ "--rj-lattice-img": LATTICE_INK, opacity: 0.045 } as React.CSSProperties}
        aria-hidden="true"
      />

      {/* Double frame: indigo outer, fine gold inner rule. */}
      <div
        style={{
          position: "absolute",
          inset: "2.2cqw",
          border: "0.62cqw solid #1A3A8F",
          pointerEvents: "none",
        }}
        aria-hidden="true"
      />
      <div
        style={{
          position: "absolute",
          inset: "3.5cqw",
          border: "0.16cqw solid #E8A33D",
          pointerEvents: "none",
        }}
        aria-hidden="true"
      />

      {/* Demonstration stamp — structural, not decorative. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "46%",
          left: "50%",
          transform: "translate(-50%, -50%) rotate(-19deg)",
          border: "0.55cqw solid rgba(217,48,37,0.34)",
          color: "rgba(217,48,37,0.34)",
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: "7.4cqw",
          letterSpacing: "0.1em",
          padding: "0.9cqw 2.4cqw",
          borderRadius: "0.8cqw",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      >
        {t.demoStamp}
      </div>

      <div
        style={{
          position: "relative",
          height: "100%",
          padding: "6.4cqw 7.4cqw",
          display: "flex",
          flexDirection: "column",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: "1.5cqw",
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: "#C1521F",
          }}
        >
          {t.eyebrow}
        </p>

        <h2
          style={{
            fontSize: "4.3cqw",
            color: "#1A3A8F",
            marginTop: "1.4cqw",
            letterSpacing: "-0.01em",
          }}
        >
          {t.title}
        </h2>

        <p style={{ fontSize: "1.45cqw", color: "#5F6368", marginTop: "0.7cqw" }}>
          {t.lede}
        </p>

        <div style={{ marginTop: "3.4cqw" }}>
          <p
            style={{
              fontSize: "1.25cqw",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#5F6368",
            }}
          >
            {t.bizNameLabel}
          </p>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "4.9cqw",
              color: "#202124",
              lineHeight: 1.1,
              marginTop: "0.5cqw",
              overflowWrap: "anywhere",
            }}
          >
            {data.bizName || "—"}
          </p>
          <div
            style={{
              width: "22cqw",
              height: "0.2cqw",
              background: "#E8A33D",
              margin: "1.6cqw auto 0",
            }}
            aria-hidden="true"
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "1.6cqw",
            marginTop: "3.2cqw",
            textAlign: "left",
          }}
        >
          <Cell label={t.owner} value={data.ownerName || "—"} />
          <Cell label={t.tradeLabel} value={data.trade || "—"} />
          <Cell label={t.stateLabel} value={state?.name ?? "—"} />
          <Cell label={t.issuedLabel} value={data.issued} />
          <Cell label={t.refLabel} value={data.rejistaId} mono />
          <Cell
            label={t.cacRegLabel}
            value={data.cacNumber ?? t.cacPending}
            mono
          />
          <Cell label={t.marketLabel} value={data.market || "—"} />
          <Cell label={t.statusLabel} value={t.statusValue} />
        </div>

        <div
          style={{
            marginTop: "auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: "2cqw",
            textAlign: "left",
          }}
        >
          <div style={{ maxWidth: "46cqw" }}>
            <p style={{ fontSize: "1.15cqw", color: "#5F6368", lineHeight: 1.45 }}>
              {t.disclaimer}
            </p>
            <p
              style={{
                fontSize: "1.15cqw",
                color: "#A5251C",
                fontWeight: 600,
                marginTop: "0.7cqw",
              }}
            >
              {t.specimen}
            </p>
          </div>

          <div style={{ textAlign: "center" }}>
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: "1.5cqw",
                color: "#1A3A8F",
                borderTop: "0.14cqw solid #202124",
                paddingTop: "0.7cqw",
                minWidth: "22cqw",
              }}
            >
              {t.agent}
            </p>
            <p style={{ fontSize: "1.05cqw", color: "#5F6368", marginTop: "0.35cqw" }}>
              {BRAND.address}
            </p>
          </div>

          {qrSvg && (
            <div style={{ textAlign: "center" }}>
              <div
                style={{ width: "9.4cqw", height: "9.4cqw", lineHeight: 0 }}
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
              <p style={{ fontSize: "0.95cqw", color: "#5F6368", marginTop: "0.4cqw" }}>
                {t.verify}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p
        style={{
          fontSize: "1.02cqw",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#5F6368",
        }}
      >
        {label}
      </p>
      <p
        className={mono ? "rj-tabular" : undefined}
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: "1.55cqw",
          color: "#202124",
          marginTop: "0.25cqw",
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </p>
    </div>
  );
}
