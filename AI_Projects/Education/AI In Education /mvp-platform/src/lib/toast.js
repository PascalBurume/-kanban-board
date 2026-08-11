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

  // An optional action, for the case where the fastest correction is right here.
  // Most accidental deletes are noticed within a couple of seconds, so an « Annuler »
  // on the toast catches nearly all of them without the teacher ever having to find
  // the bin. The toast stays up longer when it carries one.
  let dismiss;
  if (opts.action && typeof opts.action.onClick === "function") {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "toast-action";
    b.textContent = opts.action.label;
    b.addEventListener("click", () => {
      clearTimeout(dismiss);
      b.disabled = true;
      Promise.resolve(opts.action.onClick()).finally(() => close());
    });
    t.appendChild(b);
  }

  const close = () => {
    if (!t.isConnected) return;
    t.style.transition = "opacity .3s, transform .3s";
    t.style.opacity = "0";
    t.style.transform = "translateY(8px)";
    setTimeout(() => t.remove(), 320);
  };

  wrap.appendChild(t);
  dismiss = setTimeout(close, opts.duration || (opts.action ? 10000 : 2600));
}
