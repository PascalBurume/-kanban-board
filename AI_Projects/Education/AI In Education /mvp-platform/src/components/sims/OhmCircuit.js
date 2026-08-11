"use client";
import { useState, useEffect, useRef } from "react";
import SimFrame, { Slider } from "./SimFrame";

// Ohm's law V = R·I. A loop with animated current dots whose speed ∝ I.
export default function OhmCircuit() {
  const [v, setV] = useState(12);
  const [r, setR] = useState(4);
  const i = v / r;
  const [t, setT] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    let last = 0;
    const tick = (ts) => {
      if (last) setT((p) => p + (ts - last) * 0.0006 * Math.min(6, i));
      last = ts;
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [i]);

  // rectangular loop path points
  const loop = [[80, 60], [320, 60], [320, 180], [80, 180]];
  const peri = 2 * (240 + 120);
  const at = (frac) => {
    let d = ((frac % 1) + 1) % 1 * peri;
    const segs = [[240, [80, 60], [320, 60]], [120, [320, 60], [320, 180]], [240, [320, 180], [80, 180]], [120, [80, 180], [80, 60]]];
    for (const [len, a, b] of segs) {
      if (d <= len) { const f = d / len; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; }
      d -= len;
    }
    return [80, 60];
  };

  return (
    <SimFrame title="Loi d'Ohm" hint="U = R·I. Augmente la tension ou baisse la résistance : le courant accélère.">
      <svg viewBox="0 0 400 240" className="sim-svg">
        <rect x="0" y="0" width="400" height="240" rx="14" fill="var(--slate-50)" stroke="var(--border)" />
        <polygon points={loop.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--slate-500)" strokeWidth="3" />
        {/* battery */}
        <rect x="64" y="105" width="32" height="30" fill="var(--surface)" stroke="var(--slate-500)" strokeWidth="2" />
        <text x="80" y="124" fontSize="11" textAnchor="middle" fill="var(--text-soft)">{v}V</text>
        {/* resistor */}
        <rect x="300" y="105" width="36" height="30" fill="var(--warning-bg)" stroke="var(--warning)" strokeWidth="2" />
        <text x="318" y="124" fontSize="11" textAnchor="middle" fill="var(--warning-fg)">{r}Ω</text>
        {[0, 0.25, 0.5, 0.75].map((o) => {
          const [x, y] = at(t + o);
          return <circle key={o} cx={x} cy={y} r="5" fill="var(--primary)" />;
        })}
      </svg>
      <p className="sim-caption">I = U / R = {v} / {r} = <b>{i.toFixed(2)} A</b></p>
      <Slider label="U (tension)" value={v} min={1} max={24} step={1} onChange={setV} suffix=" V" />
      <Slider label="R (résistance)" value={r} min={1} max={20} step={1} onChange={setR} suffix=" Ω" />
    </SimFrame>
  );
}
