"use client";
import { useState } from "react";
import SimFrame, { Slider } from "./SimFrame";

// Molar concentration C = n/V. A beaker whose colour intensity tracks C.
export default function Concentration() {
  const [n, setN] = useState(0.5); // mol
  const [v, setV] = useState(1); // L
  const C = n / v;
  const intensity = Math.min(1, C / 2); // 2 mol/L = saturated colour
  const fillH = 150 * Math.min(1, v / 2);

  return (
    <SimFrame title="Concentration & dilution" hint="C = n / V. Ajoute du soluté pour concentrer, ajoute du solvant pour diluer.">
      <svg viewBox="0 0 400 230" className="sim-svg">
        <rect x="0" y="0" width="400" height="230" rx="14" fill="var(--slate-50)" stroke="var(--border)" />
        {/* beaker */}
        <g>
          <path d="M150 40 L150 195 Q150 205 160 205 L240 205 Q250 205 250 195 L250 40" fill="none" stroke="var(--slate-500)" strokeWidth="3" />
          <clipPath id="beaker"><path d="M152 42 L152 194 Q152 203 161 203 L239 203 Q248 203 248 194 L248 42 Z" /></clipPath>
          <rect x="152" y={203 - fillH} width="96" height={fillH} clipPath="url(#beaker)"
            fill={`rgba(13,148,136,${0.15 + intensity * 0.7})`} />
          {/* solute dots */}
          {Array.from({ length: Math.round(n * 8) }, (_, i) => (
            <circle key={i} cx={162 + ((i * 37) % 76)} cy={200 - ((i * 23) % Math.max(10, fillH - 10))} r="3.2" fill="rgba(15,118,110,.9)" clipPath="url(#beaker)" />
          ))}
        </g>
        <text x="320" y="90" fontSize="14" textAnchor="middle" fill="var(--text-soft)">n = {n} mol</text>
        <text x="320" y="120" fontSize="14" textAnchor="middle" fill="var(--text-soft)">V = {v} L</text>
        <text x="320" y="155" fontSize="18" textAnchor="middle" fontWeight="700" fill="#0d9488">C = {C.toFixed(2)} mol/L</text>
      </svg>
      <Slider label="n (soluté)" value={n} min={0} max={2} step={0.1} onChange={setN} suffix=" mol" />
      <Slider label="V (solution)" value={v} min={0.2} max={2} step={0.1} onChange={setV} suffix=" L" />
    </SimFrame>
  );
}
