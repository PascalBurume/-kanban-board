"use client";
import { useState, useEffect, useRef } from "react";
import SimFrame, { Slider } from "./SimFrame";

const CX = 150, CY = 130, R = 100;

// Trigonometric circle: drag the angle, see sin & cos projections. Auto-play.
export default function UnitCircle() {
  const [deg, setDeg] = useState(45);
  const [play, setPlay] = useState(false);
  const raf = useRef(0);

  useEffect(() => {
    if (!play) return;
    let last = 0;
    const tick = (t) => {
      if (last) setDeg((d) => (d + (t - last) * 0.06) % 360);
      last = t;
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [play]);

  const rad = (deg * Math.PI) / 180;
  const px = CX + R * Math.cos(rad);
  const py = CY - R * Math.sin(rad);
  const cos = Math.cos(rad), sin = Math.sin(rad);

  return (
    <SimFrame title="Cercle trigonométrique" hint="Fais varier l'angle : cos = abscisse, sin = ordonnée.">
      <svg viewBox="0 0 400 260" className="sim-svg">
        <rect x="0" y="0" width="400" height="260" rx="14" fill="var(--slate-50)" stroke="var(--border)" />
        <line x1={CX - R - 16} y1={CY} x2={CX + R + 16} y2={CY} stroke="var(--slate-400)" strokeWidth="1.5" />
        <line x1={CX} y1={CY - R - 16} x2={CX} y2={CY + R + 16} stroke="var(--slate-400)" strokeWidth="1.5" />
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--math)" strokeWidth="2" />
        {/* projections */}
        <line x1={px} y1={py} x2={px} y2={CY} stroke="var(--physique)" strokeWidth="2" strokeDasharray="4 3" />
        <line x1={px} y1={py} x2={CX} y2={py} stroke="var(--success)" strokeWidth="2" strokeDasharray="4 3" />
        <line x1={CX} y1={CY} x2={px} y2={py} stroke="var(--primary)" strokeWidth="2.5" />
        <circle cx={px} cy={py} r="6" fill="var(--primary)" stroke="#fff" strokeWidth="1.5" />
        <line x1={CX} y1={CY} x2={px} y2={CY} stroke="var(--success)" strokeWidth="3" opacity="0.6" />
        <line x1={px} y1={CY} x2={px} y2={py} stroke="var(--physique)" strokeWidth="3" opacity="0.6" />
        {/* readouts */}
        <text x="270" y="90" fontSize="15" fill="var(--success)" fontWeight="700">cos θ = {cos.toFixed(2)}</text>
        <text x="270" y="120" fontSize="15" fill="var(--physique)" fontWeight="700">sin θ = {sin.toFixed(2)}</text>
        <text x="270" y="150" fontSize="14" fill="var(--text-soft)">θ = {Math.round(deg)}°</text>
      </svg>
      <div className="sim-btns">
        <button className={`sim-chip${play ? " on" : ""}`} onClick={() => setPlay((p) => !p)}>{play ? "⏸ Pause" : "▶ Animer"}</button>
      </div>
      <Slider label="θ" value={Math.round(deg)} min={0} max={360} step={1} onChange={(v) => { setPlay(false); setDeg(v); }} suffix="°" />
    </SimFrame>
  );
}
