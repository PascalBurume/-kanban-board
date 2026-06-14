"use client";
import { useRef } from "react";
import Icon from "@/components/ui/Icon";
import { useFullscreen } from "@/lib/fullscreen";

// Shared chrome for every simulation: a titled card with a fullscreen toggle.
// In fullscreen the card fills the screen and the inner SVG (responsive viewBox)
// scales up with it. `controls` renders below the stage.
export default function SimFrame({ title, hint, children, controls }) {
  const ref = useRef(null);
  const { isFull, toggle } = useFullscreen(ref);
  return (
    <div className={`sim-frame${isFull ? " is-full" : ""}`} ref={ref}>
      <div className="sim-head">
        <div>
          <h3>{title}</h3>
          {hint && <p className="sim-hint">{hint}</p>}
        </div>
        <button className="sim-fs" onClick={toggle} title={isFull ? "Quitter le plein écran" : "Plein écran"}>
          <Icon name={isFull ? "x" : "eye"} />
          <span>{isFull ? "Quitter" : "Plein écran"}</span>
        </button>
      </div>
      <div className="sim-stage">{children}</div>
      {controls && <div className="sim-controls">{controls}</div>}
    </div>
  );
}

// Small labelled slider used by the widgets.
export function Slider({ label, value, min, max, step = 1, onChange, suffix = "" }) {
  return (
    <label className="sim-slider">
      <span className="sl-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="sl-val">{value}{suffix}</span>
    </label>
  );
}
