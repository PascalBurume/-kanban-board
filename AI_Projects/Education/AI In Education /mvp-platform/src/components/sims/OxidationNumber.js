"use client";
import { useState } from "react";
import SimFrame from "./SimFrame";

// Oxidation numbers for common compounds — pick one, see each element's n.o.
const COMPOUNDS = [
  { f: "H₂O", parts: [["H", "+I", 2], ["O", "−II", 1]] },
  { f: "H₂SO₄", parts: [["H", "+I", 2], ["S", "+VI", 1], ["O", "−II", 4]] },
  { f: "KMnO₄", parts: [["K", "+I", 1], ["Mn", "+VII", 1], ["O", "−II", 4]] },
  { f: "Fe₂O₃", parts: [["Fe", "+III", 2], ["O", "−II", 3]] },
  { f: "CO₂", parts: [["C", "+IV", 1], ["O", "−II", 2]] },
  { f: "NaCl", parts: [["Na", "+I", 1], ["Cl", "−I", 1]] },
  { f: "NH₃", parts: [["N", "−III", 1], ["H", "+I", 3]] },
];
const colorOf = (n) => (n.startsWith("+") ? "var(--danger-fg)" : "var(--primary)");
const bgOf = (n) => (n.startsWith("+") ? "var(--danger-bg)" : "var(--indigo-100)");

export default function OxidationNumber() {
  const [i, setI] = useState(1);
  const c = COMPOUNDS[i];
  const sum = c.parts.reduce((s, [, n, k]) => s + romanToInt(n) * k, 0);

  return (
    <SimFrame title="Nombre d'oxydation" hint="Le nombre d'oxydation de l'oxygène est −II, celui de l'hydrogène +I. La somme est nulle pour une molécule neutre.">
      <svg viewBox="0 0 400 200" className="sim-svg">
        <rect x="0" y="0" width="400" height="200" rx="14" fill="var(--slate-50)" stroke="var(--border)" />
        {c.parts.map(([el, no, k], idx) => {
          const x = 60 + idx * (280 / Math.max(1, c.parts.length - 1 || 1));
          const cx = c.parts.length === 1 ? 200 : x;
          return (
            <g key={idx}>
              <circle cx={cx} cy="110" r="32" fill={bgOf(no)} stroke={colorOf(no)} strokeWidth="2.5" />
              <text x={cx} y="116" fontSize="20" textAnchor="middle" fontWeight="700" fill={colorOf(no)}>{el}{k > 1 ? <tspan fontSize="13" dy="6">{k}</tspan> : null}</text>
              <text x={cx} y="62" fontSize="15" textAnchor="middle" fontWeight="700" fill={colorOf(no)}>{no}</text>
            </g>
          );
        })}
        <text x="200" y="180" fontSize="13" textAnchor="middle" fill="var(--text-soft)">Somme des n.o. (pondérée) = {sum === 0 ? "0 ✓ (molécule neutre)" : sum}</text>
      </svg>
      <div className="sim-btns">
        {COMPOUNDS.map((comp, idx) => (
          <button key={comp.f} className={`sim-chip${i === idx ? " on" : ""}`} onClick={() => setI(idx)}>{comp.f}</button>
        ))}
      </div>
    </SimFrame>
  );
}

function romanToInt(s) {
  const sign = s.startsWith("−") || s.startsWith("-") ? -1 : 1;
  const r = s.replace(/[+−-]/g, "");
  const map = { I: 1, V: 5, X: 10 };
  let val = 0;
  for (let i = 0; i < r.length; i++) {
    const cur = map[r[i]], nxt = map[r[i + 1]] || 0;
    val += cur < nxt ? -cur : cur;
  }
  return sign * val;
}
