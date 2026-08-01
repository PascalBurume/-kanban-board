"use client";

import { LATTICE_GOLD } from "@/lib/motif";
import type { Copy } from "@/lib/copy";
import { STATES } from "@/lib/nigeria";
import RejistaMark from "./RejistaMark";

export interface CardData {
  bizName: string;
  trade: string;
  ownerName: string;
  rejistaId: string;
  cacNumber?: string;
  stateId: string;
  market: string;
  issued: string;
}

/**
 * Credit-card proportion (85.6 × 54 mm → 1.586:1). This is the most
 * photographed, most WhatsApp-forwarded artefact Rejista produces, so it is
 * designed as a product rather than a receipt.
 */
export default function BusinessIdCard({
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
      style={{
        width: "100%",
        maxWidth: 460,
        aspectRatio: "1.586 / 1",
        borderRadius: 16,
        background: "linear-gradient(135deg, #1A3A8F 0%, #1A73E8 100%)",
        color: "#fff",
        position: "relative",
        overflow: "hidden",
        boxShadow: "var(--rj-shadow-3)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* The one place the lattice appears at full strength (spec §3.2). */}
      <div
        className="rj-lattice rj-lattice--band"
        style={{
          "--rj-lattice-img": LATTICE_GOLD,
          inset: "0 0 auto 0",
          height: 6,
        } as React.CSSProperties}
        aria-hidden="true"
      />

      <div
        style={{
          padding: "22px 22px 16px",
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                fontSize: 10,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.6)",
              }}
            >
              Business
            </p>
            <h3
              style={{
                color: "#fff",
                fontSize: "clamp(19px, 4.4vw, 25px)",
                lineHeight: 1.12,
                marginTop: 2,
                overflowWrap: "anywhere",
              }}
            >
              {data.bizName || t.cardBizPlaceholder}
            </h3>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.78)", marginTop: 3 }}>
              {data.trade || t.cardTradePlaceholder}
            </p>
          </div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: "rgba(95,191,139,0.2)",
              border: "1px solid rgba(95,191,139,0.55)",
              color: "#B7F0CE",
              borderRadius: 999,
              padding: "4px 9px",
              fontSize: 11,
              fontWeight: 600,
              fontFamily: "var(--font-display)",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            ✓ {t.cardVerified}
          </span>
        </div>

        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 14 }}>
          <div style={{ minWidth: 0 }}>
            <Field label={t.owner} value={data.ownerName || "—"} />
            <Field label={t.rejistaId} value={data.rejistaId} mono />
            <Field
              label={t.cacNumber}
              value={data.cacNumber ?? t.cacPending}
              mono
              dim={!data.cacNumber}
            />
            <p style={{ fontSize: 10.5, color: "rgba(255,255,255,0.6)", marginTop: 6 }}>
              {state?.name}
              {data.market ? ` · ${data.market}` : ""} · {t.cardIssued}{" "}
              {data.issued}
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
            {qrSvg && (
              <div
                style={{ width: 62, height: 62, background: "#fff", padding: 3, borderRadius: 6, lineHeight: 0 }}
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            )}
            <RejistaMark size={22} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  dim,
}: {
  label: string;
  value: string;
  mono?: boolean;
  dim?: boolean;
}) {
  return (
    <p style={{ fontSize: 11.5, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
      <span style={{ color: "rgba(255,255,255,0.55)" }}>{label}: </span>
      <span
        className={mono ? "rj-tabular" : undefined}
        style={{
          color: dim ? "rgba(255,255,255,0.65)" : "#fff",
          fontWeight: 600,
          letterSpacing: mono ? "0.02em" : undefined,
        }}
      >
        {value}
      </span>
    </p>
  );
}
