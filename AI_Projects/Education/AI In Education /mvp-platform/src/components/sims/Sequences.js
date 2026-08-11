"use client";
import { useState, useMemo } from "react";
import SimFrame, { Slider } from "./SimFrame";

// Arithmetic vs geometric sequences: the first terms shown as bars.
export default function Sequences() {
  const [kind, setKind] = useState("arith");
  const [u0, setU0] = useState(2);
  const [step, setStep] = useState(2); // raison r (arith) or q (geo)

  const terms = useMemo(() => {
    const out = [];
    let u = u0;
    for (let i = 0; i < 8; i++) {
      out.push(u);
      u = kind === "arith" ? u + step : u * step;
    }
    return out;
  }, [kind, u0, step]);

  const max = Math.max(1, ...terms.map((t) => Math.abs(t)));
  const W = 400, H = 230, base = H - 30, bw = (W - 40) / 8;

  return (
    <SimFrame title="Suites numériques" hint={kind === "arith" ? "Suite arithmétique : on ajoute la raison r." : "Suite géométrique : on multiplie par la raison q."}>
      <svg viewBox={`0 0 ${W} ${H}`} className="sim-svg">
        <rect x="0" y="0" width={W} height={H} rx="14" fill="var(--slate-50)" stroke="var(--border)" />
        <line x1="20" y1={base} x2={W - 20} y2={base} stroke="var(--slate-400)" strokeWidth="1.5" />
        {terms.map((t, i) => {
          const h = (Math.abs(t) / max) * (base - 28);
          return (
            <g key={i}>
              <rect x={24 + i * bw + 4} y={base - h} width={bw - 10} height={h} rx="4" fill="var(--primary)" opacity={0.55 + 0.05 * i} />
              <text x={24 + i * bw + bw / 2 - 1} y={base - h - 5} fontSize="11" textAnchor="middle" fill="var(--text-soft)">{Number.isInteger(t) ? t : t.toFixed(1)}</text>
              <text x={24 + i * bw + bw / 2 - 1} y={base + 14} fontSize="10" textAnchor="middle" fill="var(--text-muted)">u{i}</text>
            </g>
          );
        })}
      </svg>
      <p className="sim-caption">
        {kind === "arith"
          ? `uₙ = u₀ + n·r = ${u0} + n·${step}`
          : `uₙ = u₀ · qⁿ = ${u0} · ${step}ⁿ`}
      </p>
      <div className="sim-btns">
        <button className={`sim-chip${kind === "arith" ? " on" : ""}`} onClick={() => setKind("arith")}>Arithmétique</button>
        <button className={`sim-chip${kind === "geo" ? " on" : ""}`} onClick={() => setKind("geo")}>Géométrique</button>
      </div>
      <Slider label="u₀" value={u0} min={-5} max={10} step={1} onChange={setU0} />
      <Slider label={kind === "arith" ? "raison r" : "raison q"} value={step} min={kind === "arith" ? -5 : 0.5} max={kind === "arith" ? 5 : 2} step={kind === "arith" ? 1 : 0.1} onChange={setStep} />
    </SimFrame>
  );
}
