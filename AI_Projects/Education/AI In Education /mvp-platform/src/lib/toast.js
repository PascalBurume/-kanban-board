// Imperative toast — mirrors the design system's Mwalimu.toast().
// Safe to call from React event handlers; builds DOM nodes directly so it
// needs no provider. Styling comes from .toast-wrap / .toast in mwalimu.css.
import { ICONS } from "./icons";

export function toast(msg, opts = {}) {
  if (typeof document === "undefined") return;
  let wrap = document.querySelector(".toast-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "toast-wrap";
    document.body.appendChild(wrap);
  }
  const t = document.createElement("div");
  t.className = "toast";
  const ic = opts.icon
    ? `<span style="color:${opts.color || "#a5b4fc"}">${ICONS[opts.icon] || ""}</span>`
    : "";
  t.innerHTML = ic + `<span>${msg}</span>`;
  wrap.appendChild(t);
  setTimeout(() => {
    t.style.transition = "opacity .3s, transform .3s";
    t.style.opacity = "0";
    t.style.transform = "translateY(8px)";
    setTimeout(() => t.remove(), 320);
  }, opts.duration || 2600);
}
