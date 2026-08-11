"use client";
import { useState } from "react";
import SimFrame, { Slider } from "./SimFrame";

const OX = 200, OY = 150, SCALE = 1.4;

// Two force vectors and their resultant (parallelogram rule).
export default function ForceVectors() {
  const [f1, setF1] = useState(60);
  const [a1, setA1] = useState(20);
  const [f2, setF2] = useState(50);
  const [a2, setA2] = useState(110);

  const vec = (f, a) => [f * Math.cos((a * Math.PI) / 180) * SCALE, -f * Math.sin((a * Math.PI) / 180) * SCALE];
  const [x1, y1] = vec(f1, a1);
  const [x2, y2] = vec(f2, a2);
  const rx = x1 + x2, ry = y1 + y2;
  const R = Math.hypot(rx, ry) / SCALE;
  const Rang = ((Math.atan2(-ry, rx) * 180) / Math.PI + 360) % 360;

  const Arrow = ({ dx, dy, color, w = 3 }) => (
    <line x1={OX} y1={OY} x2={OX + dx} y2={OY + dy} stroke={color} strokeWidth={w} markerEnd="url(#fa)" />
  );

  return (
    <SimFrame title="Vecteurs & forces" hint="Deux forces et leur résultante (règle du parallélogramme).">
      <svg viewBox="0 0 400 300" className="sim-svg">
        <rect x="0" y="0" width="400" height="300" rx="14" fill="var(--slate-50)" stroke="var(--border)" />
        <defs><marker id="fa" markerWidth="10" markerHeight="10" refX="7" refY="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="context-stroke" /></marker></defs>
        <line x1="20" y1={OY} x2="380" y2={OY} stroke="var(--border)" />
        <line x1={OX} y1="20" x2={OX} y2="280" stroke="var(--border)" />
        {/* parallelogram guides */}
        <line x1={OX + x1} y1={OY + y1} x2={OX + rx} y2={OY + ry} stroke="var(--border-strong)" strokeDasharray="4 3" />
        <line x1={OX + x2} y1={OY + y2} x2={OX + rx} y2={OY + ry} stroke="var(--border-strong)" strokeDasharray="4 3" />
        <Arrow dx={x1} dy={y1} color="var(--math)" />
        <Arrow dx={x2} dy={y2} color="var(--physique)" />
        <Arrow dx={rx} dy={ry} color="var(--primary)" w={4} />
      </svg>
      <p className="sim-caption">Résultante R = <b>{R.toFixed(1)} N</b> à <b>{Rang.toFixed(0)}°</b></p>
      <Slider label="F₁" value={f1} min={0} max={100} step={5} onChange={setF1} suffix=" N" />
      <Slider label="angle₁" value={a1} min={0} max={360} step={5} onChange={setA1} suffix="°" />
      <Slider label="F₂" value={f2} min={0} max={100} step={5} onChange={setF2} suffix=" N" />
      <Slider label="angle₂" value={a2} min={0} max={360} step={5} onChange={setA2} suffix="°" />
    </SimFrame>
  );
}
