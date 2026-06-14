"use client";
import { useState, useMemo } from "react";
import SimFrame, { Slider } from "./SimFrame";

const W = 400, H = 260, PAD = 24;
const X_MIN = -6, X_MAX = 6, Y_MIN = -6, Y_MAX = 6;
const sx = (x) => PAD + ((x - X_MIN) / (X_MAX - X_MIN)) * (W - 2 * PAD);
const sy = (y) => H - PAD - ((y - Y_MIN) / (Y_MAX - Y_MIN)) * (H - 2 * PAD);

// y = ax² + bx + c — shows the parabola, its roots and vertex; live discriminant.
export default function SecondDegree() {
  const [a, setA] = useState(1);
  const [b, setB] = useState(-1);
  const [c, setC] = useState(-2);

  const { path, disc, roots, vx, vy } = useMemo(() => {
    let d = "", pen = false;
    for (let px = 0; px <= W - 2 * PAD; px += 2) {
      const x = X_MIN + (px / (W - 2 * PAD)) * (X_MAX - X_MIN);
      const y = a * x * x + b * x + c;
      if (y < Y_MIN - 3 || y > Y_MAX + 3) { pen = false; continue; }
      d += `${pen ? "L" : "M"}${sx(x).toFixed(1)} ${sy(y).toFixed(1)} `;
      pen = true;
    }
    const disc = b * b - 4 * a * c;
    const roots = a !== 0 && disc >= 0 ? [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)] : [];
    const vx = a !== 0 ? -b / (2 * a) : 0;
    const vy = a * vx * vx + b * vx + c;
    return { path: d, disc, roots, vx, vy };
  }, [a, b, c]);

  return (
    <SimFrame title="Second degré" hint="ax² + bx + c — observe les racines et le sommet.">
      <svg viewBox={`0 0 ${W} ${H}`} className="sim-svg">
        <rect x="0" y="0" width={W} height={H} rx="14" fill="var(--slate-50)" stroke="var(--border)" />
        <line x1={PAD} y1={sy(0)} x2={W - PAD} y2={sy(0)} stroke="var(--slate-400)" strokeWidth="1.5" />
        <line x1={sx(0)} y1={PAD} x2={sx(0)} y2={H - PAD} stroke="var(--slate-400)" strokeWidth="1.5" />
        <path d={path} fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {roots.map((r, i) => (
          <circle key={i} cx={sx(r)} cy={sy(0)} r="5" fill="var(--success)" stroke="#fff" strokeWidth="1.5" />
        ))}
        {Math.abs(vx) < 7 && Math.abs(vy) < 7 && (
          <circle cx={sx(vx)} cy={sy(vy)} r="5" fill="var(--warning)" stroke="#fff" strokeWidth="1.5" />
        )}
      </svg>
      <p className="sim-caption">
        Δ = b² − 4ac = <b>{disc.toFixed(1)}</b> →{" "}
        {disc > 0 ? "deux racines réelles" : disc === 0 ? "une racine double" : "aucune racine réelle"}
        {roots.length ? ` (x = ${roots.map((r) => r.toFixed(2)).join(" ; ")})` : ""}
      </p>
      <Slider label="a" value={a} min={-3} max={3} step={0.1} onChange={setA} />
      <Slider label="b" value={b} min={-6} max={6} step={0.5} onChange={setB} />
      <Slider label="c" value={c} min={-6} max={6} step={0.5} onChange={setC} />
    </SimFrame>
  );
}
