"use client";
import Icon from "./Icon";
import { avatarColor, initials } from "@/lib/icons";

// Brand mark — gradient indigo tile with the Mwalimu book glyph.
export function BrandMark({ className = "" }) {
  return (
    <span className={`brand-mark ${className}`.trim()}>
      <Icon name="logo" />
    </span>
  );
}

// Offline status pill — "Local server connected" (design system component).
export function OfflinePill({ off = false, label }) {
  return (
    <span className={`offline-pill ${off ? "off" : ""}`.trim()}>
      <span className="dot" />
      {label || (off ? "Serveur local injoignable" : "Serveur local connecté")}
    </span>
  );
}

// Circular avatar with deterministic colour + initials.
export function Avatar({ name = "", size = "", className = "", style }) {
  return (
    <span
      className={`avatar ${size} ${className}`.trim()}
      style={{ background: avatarColor(name), ...style }}
    >
      {initials(name)}
    </span>
  );
}
