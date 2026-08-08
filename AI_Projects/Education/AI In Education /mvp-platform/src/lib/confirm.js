// Imperative confirmation — same shape as toast(): builds DOM directly, needs no
// provider, styled by .cfm-* in mwalimu.css. Returns a Promise<boolean>.
//
// It replaces window.confirm for destructive actions. window.confirm is not
// reliable here: an installed PWA or an embedded webview can suppress it, and a
// suppressed dialog returns false — so the button silently does nothing and reads
// as broken. It is also the one piece of UI we cannot translate, cannot style, and
// cannot make touch-friendly on the 1024×768 tablets teachers carry.
//
// Destructive by default in the visual weight only: focus lands on Annuler, so
// Enter cancels rather than deletes.
import { ICONS } from "./icons";

export function confirmDialog({ title, message, confirmLabel = "Supprimer", cancelLabel = "Annuler", danger = true } = {}) {
  if (typeof document === "undefined") return Promise.resolve(false);

  return new Promise((resolve) => {
    const scrim = document.createElement("div");
    scrim.className = "cfm-scrim";
    scrim.innerHTML = `
      <div class="cfm" role="alertdialog" aria-modal="true" aria-labelledby="cfm-t">
        <div class="cfm-head">
          ${danger ? `<span class="cfm-ic">${ICONS.alert || ""}</span>` : ""}
          <h2 id="cfm-t">${esc(title || "Confirmer")}</h2>
        </div>
        ${message ? `<p class="cfm-msg">${esc(message)}</p>` : ""}
        <div class="cfm-acts">
          <button type="button" class="cfm-btn cfm-cancel">${esc(cancelLabel)}</button>
          <button type="button" class="cfm-btn ${danger ? "cfm-danger" : "cfm-ok"}">${esc(confirmLabel)}</button>
        </div>
      </div>`;

    let done = false;
    const close = (answer) => {
      if (done) return;
      done = true;
      document.removeEventListener("keydown", onKey, true);
      scrim.remove();
      resolve(answer);
    };
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(false); }
    };

    scrim.querySelector(".cfm-cancel").addEventListener("click", () => close(false));
    scrim.querySelector(".cfm-btn:last-child").addEventListener("click", () => close(true));
    // Only a click on the backdrop itself cancels — not one that bubbled from the card.
    scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) close(false); });
    document.addEventListener("keydown", onKey, true);

    document.body.appendChild(scrim);
    scrim.querySelector(".cfm-cancel").focus();
  });
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
