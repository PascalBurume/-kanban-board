"use client";
import { useState, useMemo } from "react";
import SimFrame, { Slider } from "./SimFrame";

// Plot y = a·f(x) + b for a selectable base function. Live curve + axes.
const FUNCS = {
  lin: { label: "x", f: (x) => x, tex: "a\\,x + b" },
  quad: { label: "x²", f: (x) => x * x, tex: "a\\,x^2 + b" },
  ln: { label: "ln x", f: (x) => (x > 0 ? Math.log(x) : NaN), tex: "a\\,\\ln x + b" },
  exp: { label: "eˣ", f: (x) => Math.exp(x), tex: "a\\,e^{x} + b" },
  sin: { label: "sin x", f: (x) => Math.sin(x), tex: "a\\,\\sin x + b" },
};

const W = 400, H = 260, PAD = 24;
const X_MIN = -6, X_MAX = 6, Y_MIN = -6, Y_MAX = 6;
const sx = (x) => PAD + ((x - X_MIN) / (X_MAX - X_MIN)) * (W - 2 * PAD);
const sy = (y) => H - PAD - ((y - Y_MIN) / (Y_MAX - Y_MIN)) * (H - 2 * PAD);

export default function FunctionPlotter() {
  const [fk, setFk] = useState("quad");
  const [a, setA] = useState(1);
  const [b, setB] = useState(0);
  const fn = FUNCS[fk];

  const path = useMemo(() => {
    let d = "";
    let pen = false;
    for (let px = 0; px <= W - 2 * PAD; px += 2) {
      const x = X_MIN + (px / (W - 2 * PAD)) * (X_MAX - X_MIN);
      const y = a * fn.f(x) + b;
      if (!isFinite(y) || y < Y_MIN - 2 || y > Y_MAX + 2) { pen = false; continue; }
      const X = sx(x), Y = sy(y);
      d += `${pen ? "L" : "M"}${X.toFixed(1)} ${Y.toFixed(1)} `;
      pen = true;
    }
    return d;
  }, [fk, a, b, fn]);

  return (
    <SimFrame title="Tracé de fonction" hint={`y = ${fn.tex.replace(/\\,/g, " ").replace(/\\/g, "")}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="sim-svg">
        <rect x="0" y="0" width={W} height={H} rx="14" fill="var(--slate-50)" stroke="var(--border)" />
        {/* grid */}
        {[-4, -2, 2, 4].map((g) => (
          <g key={g}>
            <line x1={sx(g)} y1={PAD} x2={sx(g)} y2={H - PAD} stroke="var(--border)" strokeWidth="1" />
            <line x1={PAD} y1={sy(g)} x2={W - PAD} y2={sy(g)} stroke="var(--border)" strokeWidth="1" />
          </g>
        ))}
        {/* axes */}
        <line x1={PAD} y1={sy(0)} x2={W - PAD} y2={sy(0)} stroke="var(--slate-400)" strokeWidth="1.5" />
        <line x1={sx(0)} y1={PAD} x2={sx(0)} y2={H - PAD} stroke="var(--slate-400)" strokeWidth="1.5" />
        <path d={path} fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="sim-btns">
        {Object.entries(FUNCS).map(([k, v]) => (
          <button key={k} className={`sim-chip${fk === k ? " on" : ""}`} onClick={() => setFk(k)}>{v.label}</button>
        ))}
      </div>
      <Slider label="a" value={a} min={-3} max={3} step={0.1} onChange={setA} />
      <Slider label="b" value={b} min={-5} max={5} step={0.5} onChange={setB} />
    </SimFrame>
  );
}
