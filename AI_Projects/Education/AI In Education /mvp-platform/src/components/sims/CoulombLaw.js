"use client";
import { useState } from "react";
import SimFrame, { Slider } from "./SimFrame";

const K = 9e9;

// Coulomb's law: two charges, force F = k·q1·q2/r². Arrows show attraction or
// repulsion; magnitude scales the arrow length.
export default function CoulombLaw() {
  const [q1, setQ1] = useState(3); // µC
  const [q2, setQ2] = useState(-2); // µC
  const [r, setR] = useState(20); // cm

  const F = (K * Math.abs(q1 * q2) * 1e-12) / Math.pow(r / 100, 2); // N
  const attract = q1 * q2 < 0;
  const cx1 = 120, cx2 = 120 + Math.min(180, r * 2.4), cy = 120;
  const arrow = Math.max(14, Math.min(70, Math.log10(F + 1) * 26));

  const Charge = ({ x, q }) => (
    <g>
      <circle cx={x} cy={cy} r="22" fill={q >= 0 ? "var(--danger-bg)" : "var(--indigo-100)"} stroke={q >= 0 ? "var(--danger)" : "var(--primary)"} strokeWidth="2.5" />
      <text x={x} y={cy + 6} fontSize="18" textAnchor="middle" fontWeight="700" fill={q >= 0 ? "var(--danger-fg)" : "var(--primary)"}>{q >= 0 ? "+" : "−"}</text>
      <text x={x} y={cy + 44} fontSize="12" textAnchor="middle" fill="var(--text-soft)">{q} µC</text>
    </g>
  );

  return (
    <SimFrame title="Loi de Coulomb" hint="Deux charges de même signe se repoussent ; de signes opposés s'attirent.">
      <svg viewBox="0 0 400 220" className="sim-svg">
        <rect x="0" y="0" width="400" height="220" rx="14" fill="var(--slate-50)" stroke="var(--border)" />
        {/* distance line */}
        <line x1={cx1} y1={cy} x2={cx2} y2={cy} stroke="var(--border-strong)" strokeWidth="1.5" strokeDasharray="5 4" />
        <text x={(cx1 + cx2) / 2} y={cy - 30} fontSize="12" textAnchor="middle" fill="var(--text-muted)">r = {r} cm</text>
        {/* force arrows (on charge 1 then charge 2) */}
        <line x1={cx1} y1={cy} x2={cx1 + (attract ? arrow : -arrow)} y2={cy} stroke="var(--success)" strokeWidth="3" markerEnd="url(#ah)" />
        <line x1={cx2} y1={cy} x2={cx2 + (attract ? -arrow : arrow)} y2={cy} stroke="var(--success)" strokeWidth="3" markerEnd="url(#ah)" />
        <defs>
          <marker id="ah" markerWidth="9" markerHeight="9" refX="6" refY="4.5" orient="auto"><path d="M0 0L9 4.5L0 9z" fill="var(--success)" /></marker>
        </defs>
        <Charge x={cx1} q={q1} />
        <Charge x={cx2} q={q2} />
      </svg>
      <p className="sim-caption">
        F = k·|q₁·q₂|/r² = <b>{F < 0.01 ? F.toExponential(2) : F.toFixed(2)} N</b> — {attract ? "attraction" : "répulsion"}
      </p>
      <Slider label="q₁" value={q1} min={-5} max={5} step={1} onChange={setQ1} suffix=" µC" />
      <Slider label="q₂" value={q2} min={-5} max={5} step={1} onChange={setQ2} suffix=" µC" />
      <Slider label="r" value={r} min={5} max={60} step={1} onChange={setR} suffix=" cm" />
    </SimFrame>
  );
}
