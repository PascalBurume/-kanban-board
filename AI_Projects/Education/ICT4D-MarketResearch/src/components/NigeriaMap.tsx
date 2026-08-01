"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ARCS,
  OUTLINE,
  STATES,
  TOTAL_REGISTERED,
  ZONE_COLOR,
  project,
  type NgState,
} from "@/lib/nigeria";

const W = 920;
const H = 760;
const PULSES = 14;

export default function NigeriaMap() {
  const [selected, setSelected] = useState<NgState>(
    () => STATES.find((s) => s.id === "LA")!,
  );
  const [count, setCount] = useState(TOTAL_REGISTERED);
  const arcRefs = useRef<(SVGPathElement | null)[]>([]);
  const pulseRefs = useRef<(SVGCircleElement | null)[]>([]);
  const frame = useRef<number>(0);

  const nodes = useMemo(
    () =>
      STATES.map((s) => {
        const [x, y] = project(s.lon, s.lat, W, H);
        return { ...s, x, y };
      }),
    [],
  );

  const byId = useMemo(
    () => Object.fromEntries(nodes.map((n) => [n.id, n])),
    [nodes],
  );

  const outlinePoints = useMemo(
    () =>
      OUTLINE.map(([lon, lat]) => project(lon, lat, W, H).join(","))
        .join(" "),
    [],
  );

  // Quadratic arcs bowed 16% perpendicular to their chord (spec §5.8).
  const arcs = useMemo(
    () =>
      ARCS.map(([a, b]) => {
        const p = byId[a];
        const q = byId[b];
        if (!p || !q) return null;
        const mx = (p.x + q.x) / 2;
        const my = (p.y + q.y) / 2;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        // Perpendicular offset, consistently to one side so arcs don't cross.
        const cx = mx + (-dy / len) * len * 0.16;
        const cy = my + (dx / len) * len * 0.16;
        return { d: `M${p.x},${p.y} Q${cx},${cy} ${q.x},${q.y}`, key: `${a}-${b}` };
      }).filter(Boolean) as { d: string; key: string }[],
    [byId],
  );

  // One rAF loop drives every pulse — cheap enough for a ₦25,000 Android.
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const paths = arcRefs.current.filter(Boolean) as SVGPathElement[];
    if (!paths.length) return;
    const lengths = paths.map((p) => p.getTotalLength());
    // Stagger start offsets so pulses don't move in lockstep.
    const offsets = Array.from({ length: PULSES }, (_, i) => (i * 0.137) % 1);
    const speed = 0.00013;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      for (let i = 0; i < PULSES; i++) {
        const dot = pulseRefs.current[i];
        if (!dot) continue;
        const ai = i % paths.length;
        offsets[i] = (offsets[i] + dt * speed) % 1;
        const pt = paths[ai].getPointAtLength(lengths[ai] * offsets[i]);
        dot.setAttribute("cx", String(pt.x));
        dot.setAttribute("cy", String(pt.y));
        // Fade in and out at the ends so pulses appear to depart and arrive.
        const o = Math.sin(offsets[i] * Math.PI);
        dot.setAttribute("opacity", String(0.15 + o * 0.85));
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [arcs.length]);

  // The counter ticks upward. Illustrative, and labelled as such directly
  // beneath — never in a footnote below the fold (spec §5.8).
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const t = setInterval(() => setCount((c) => c + 1), 4200);
    return () => clearInterval(t);
  }, []);

  const unregisteredPct = Math.round(selected.unregisteredShare * 100);

  return (
    <div>
      <div style={{ position: "relative" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: "#5FBF8B",
              boxShadow: "0 0 0 4px rgba(95,191,139,0.22)",
            }}
          />
          <span
            className="rj-tabular"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              color: "#fff",
              fontSize: 17,
            }}
          >
            {count.toLocaleString("en-NG")} businesses registered
          </span>
          <span style={{ color: "rgba(255,255,255,0.45)" }}>·</span>
          <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 15 }}>
            37 states connected
          </span>
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="group"
          aria-label="Map of Nigeria showing Rejista coverage by state"
          style={{ display: "block", maxHeight: "62vh" }}
        >
          <defs>
            <radialGradient id="rj-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#E8A33D" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#E8A33D" stopOpacity="0" />
            </radialGradient>
          </defs>

          <ellipse cx={W * 0.5} cy={H * 0.47} rx={W * 0.46} ry={H * 0.4} fill="url(#rj-glow)" />

          {/* Polygon with rounded joins, not a smoothed spline — a spline turns
              the coastline into a blob (spec §5.8). */}
          <polygon
            points={outlinePoints}
            fill="rgba(232,163,61,0.06)"
            stroke="#E8A33D"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeOpacity="0.62"
          />

          <g>
            {arcs.map((a, i) => (
              <path
                key={a.key}
                ref={(el) => {
                  arcRefs.current[i] = el;
                }}
                d={a.d}
                fill="none"
                stroke="#E8A33D"
                strokeWidth="1"
                strokeOpacity="0.24"
              />
            ))}
          </g>

          <g>
            {Array.from({ length: PULSES }, (_, i) => (
              <circle
                key={i}
                ref={(el) => {
                  pulseRefs.current[i] = el;
                }}
                r="3"
                fill="#F2C57C"
                opacity="0"
              />
            ))}
          </g>

          {nodes.map((n) => {
            const isSel = n.id === selected.id;
            const r = n.hub ? 8 : 5;
            return (
              <g key={n.id}>
                {/* Hub rings use SVG <animate> rather than JS, so they cost
                    nothing per frame (spec §5.8). */}
                {n.hub && (
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={r}
                    fill="none"
                    stroke={ZONE_COLOR[n.zone]}
                    strokeWidth="1.4"
                  >
                    <animate
                      attributeName="r"
                      values={`${r};${r + 20}`}
                      dur="3.4s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="stroke-opacity"
                      values="0.6;0"
                      dur="3.4s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}

                {isSel && (
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={r + 9}
                    fill="none"
                    stroke="#fff"
                    strokeWidth="2"
                    strokeOpacity="0.9"
                  />
                )}

                <circle
                  cx={n.x}
                  cy={n.y}
                  r={r}
                  fill={ZONE_COLOR[n.zone]}
                  stroke="#0F2A6B"
                  strokeWidth="1.2"
                />

                {/* Invisible 44px hit circle over the visible dot, so the
                    target meets the touch minimum without a fat visual dot. */}
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={22}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`${n.name}. ${n.registered.toLocaleString("en-NG")} businesses registered through Rejista.`}
                  aria-pressed={isSel}
                  style={{ cursor: "pointer", outlineOffset: 2 }}
                  onClick={() => setSelected(n)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(n);
                    }
                  }}
                />

                {n.hub && (
                  <text
                    x={n.x + 13}
                    y={n.y + 4}
                    fill="rgba(255,255,255,0.92)"
                    fontSize="15"
                    fontFamily="var(--font-display)"
                    fontWeight="600"
                    style={{ pointerEvents: "none" }}
                  >
                    {n.name === "Federal Capital Territory" ? "Abuja" : n.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Detail panel directly beneath the map. Lagos is selected on load so
          this is never empty (spec §5.8). */}
      <div
        aria-live="polite"
        style={{
          marginTop: "var(--s4)",
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(232,163,61,0.28)",
          borderRadius: "var(--rj-r-md)",
          padding: "var(--s5)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "var(--s4)",
            flexWrap: "wrap",
            alignItems: "baseline",
          }}
        >
          <div>
            <h3 style={{ color: "#fff", fontSize: 21 }}>{selected.name}</h3>
            <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 14.5 }}>
              {selected.capital} · {selected.zone}
            </p>
          </div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: ZONE_COLOR[selected.zone],
              color: "#0F2A6B",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 12.5,
              padding: "4px 11px",
              borderRadius: 999,
            }}
          >
            {selected.zone}
          </span>
        </div>

        <dl
          style={{
            display: "grid",
            gap: "var(--s4)",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            marginTop: "var(--s4)",
          }}
        >
          {[
            {
              k: "Small businesses",
              v: `~${selected.smallBusinesses.toLocaleString("en-NG")}k`,
            },
            { k: "Not yet registered", v: `${unregisteredPct}%` },
            {
              k: "Registered with Rejista",
              v: selected.registered.toLocaleString("en-NG"),
            },
          ].map((s) => (
            <div key={s.k}>
              <dt
                style={{
                  fontSize: 12,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.55)",
                }}
              >
                {s.k}
              </dt>
              <dd
                className="rj-tabular"
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 26,
                  color: "#E8A33D",
                }}
              >
                {s.v}
              </dd>
            </div>
          ))}
        </dl>

        <p
          className="rj-note"
          style={{ color: "rgba(255,255,255,0.62)", marginTop: "var(--s3)" }}
        >
          <strong style={{ color: "rgba(255,255,255,0.8)" }}>
            Illustrative figures.
          </strong>{" "}
          State-level business counts and registration shares are estimates for
          demonstration, not measured data. They are to be replaced with
          verified SMEDAN/NBS figures before launch. Rejista registration totals
          become real reads from our own database once the backend is live.
        </p>
      </div>
    </div>
  );
}
