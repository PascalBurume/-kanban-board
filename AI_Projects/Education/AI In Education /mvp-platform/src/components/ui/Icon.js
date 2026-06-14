"use client";
import { ICONS } from "@/lib/icons";

// Renders an inline SVG icon from the Mwalimu icon set.
// Sizing/colour come from CSS (currentColor + width/height on the svg).
export default function Icon({ name, className = "", style, ...rest }) {
  const svg = ICONS[name];
  if (!svg) return null;
  return (
    <span
      className={`icon ${className}`.trim()}
      style={{ display: "inline-flex", ...style }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
      {...rest}
    />
  );
}
