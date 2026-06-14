"use client";
import { useState } from "react";
import SimFrame from "./SimFrame";

// Sets & logic: two overlapping sets A, B. Buttons highlight a region — union,
// intersection, difference, symmetric difference, complement.
const OPS = [
  { key: "union", label: "A ∪ B", desc: "Union — tout ce qui est dans A ou B." },
  { key: "inter", label: "A ∩ B", desc: "Intersection — ce qui est à la fois dans A et B." },
  { key: "diff", label: "A \\ B", desc: "Différence — dans A mais pas dans B." },
  { key: "sym", label: "A △ B", desc: "Différence symétrique — dans A ou B, mais pas les deux." },
  { key: "compA", label: "Aᶜ", desc: "Complément de A — tout ce qui n'est pas dans A." },
];

export default function SetsVenn() {
  const [op, setOp] = useState("union");
  const cur = OPS.find((o) => o.key === op);

  // Regions: onlyA, onlyB, both, outside — fill when active.
  const fill = (region) => {
    const on = {
      union: { onlyA: 1, onlyB: 1, both: 1, outside: 0 },
      inter: { onlyA: 0, onlyB: 0, both: 1, outside: 0 },
      diff: { onlyA: 1, onlyB: 0, both: 0, outside: 0 },
      sym: { onlyA: 1, onlyB: 1, both: 0, outside: 0 },
      compA: { onlyA: 0, onlyB: 1, both: 0, outside: 1 },
    }[op];
    return on[region] ? "var(--primary)" : "transparent";
  };

  return (
    <SimFrame title="Ensembles & logique" hint="Choisis une opération pour colorer la région correspondante.">
      <svg viewBox="0 0 400 260" className="sim-svg" style={{ "--op-fill": "var(--primary)" }}>
        <defs>
          <clipPath id="cA"><circle cx="160" cy="130" r="95" /></clipPath>
          <clipPath id="cB"><circle cx="240" cy="130" r="95" /></clipPath>
        </defs>
        {/* universe */}
        <rect x="6" y="6" width="388" height="248" rx="14" fill={op === "compA" ? "rgba(79,70,229,.10)" : "var(--slate-50)"} stroke="var(--border)" />
        {/* outside fill handled by universe tint for compA */}
        {/* onlyA */}
        <g clipPath="url(#cA)"><rect x="0" y="0" width="400" height="260" fill={fill("onlyA")} opacity="0.28" /></g>
        {/* onlyB */}
        <g clipPath="url(#cB)"><rect x="0" y="0" width="400" height="260" fill={fill("onlyB")} opacity="0.28" /></g>
        {/* both */}
        <g clipPath="url(#cA)"><g clipPath="url(#cB)"><rect x="0" y="0" width="400" height="260" fill={fill("both")} opacity="0.55" /></g></g>
        {/* outlines */}
        <circle cx="160" cy="130" r="95" fill="none" stroke="var(--math)" strokeWidth="2.5" />
        <circle cx="240" cy="130" r="95" fill="none" stroke="var(--physique)" strokeWidth="2.5" />
        <text x="95" y="60" fontSize="22" fontWeight="700" fill="var(--math)">A</text>
        <text x="300" y="60" fontSize="22" fontWeight="700" fill="var(--physique)">B</text>
      </svg>
      <p className="sim-caption">{cur.desc}</p>
      <div className="sim-btns">
        {OPS.map((o) => (
          <button key={o.key} className={`sim-chip${op === o.key ? " on" : ""}`} onClick={() => setOp(o.key)}>{o.label}</button>
        ))}
      </div>
    </SimFrame>
  );
}
