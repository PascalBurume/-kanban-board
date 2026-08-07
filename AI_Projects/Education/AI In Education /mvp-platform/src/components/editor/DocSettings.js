"use client";
import { useState, useRef } from "react";
import Icon from "@/components/ui/Icon";
import { MATH_FONTS } from "@/lib/symbols";
import { FIELDS, DEFAULTS } from "@/lib/docSettings";

// The Document Settings modal — wireframe 1e callout 3, two columns, hairline-ruled,
// no tabs. The list is short enough to read at once, which is the whole design claim.
//
// Edits are live on a draft copy: a teacher changing the line height wants to see the
// line height change, and Cancel has to be able to put it back. Apply is what commits.

export default function DocSettings({ settings, onPreview, onApply, onClose }) {
  const [draft, setDraft] = useState(settings);
  // What Cancel restores. It has to be captured on the way IN: `settings` is the same
  // state the preview writes to, so by the time Cancel runs the prop already holds the
  // previewed values and reverting to it would revert to nothing.
  const original = useRef(settings);

  function set(key, value) {
    const next = { ...draft, [key]: value };
    setDraft(next);
    onPreview(next);
  }

  function cancel() {
    onPreview(original.current);
    onClose();
  }

  return (
    <div
      className="ds-back"
      role="dialog"
      aria-modal="true"
      aria-label="Paramètres du document"
      tabIndex={-1}
      ref={(el) => el?.focus()}
      // Escape belongs to the modal while it is open. Left to bubble it reaches the
      // editor's own handler, which would quietly close the formula zone behind it.
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); cancel(); } }}
      onClick={(e) => { if (e.target === e.currentTarget) cancel(); }}
    >
      <div className="ds">
        <header className="ds-head">
          <h2>Paramètres du document</h2>
          <button onClick={cancel} aria-label="Fermer"><Icon name="x" /></button>
        </header>

        <div className="ds-grid">
          {FIELDS.map((f) => (
            <div className={`ds-f${f.wide ? " wide" : ""}`} key={f.key}>
              <label htmlFor={`ds-${f.key}`}>{f.label}</label>
              {f.type === "range" && (
                <span className="ds-range">
                  <input
                    id={`ds-${f.key}`}
                    type="range"
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={draft[f.key]}
                    onChange={(e) => set(f.key, Number(e.target.value))}
                  />
                  <b>{draft[f.key]}{f.unit}</b>
                </span>
              )}
              {f.type === "select" && (
                <select id={`ds-${f.key}`} value={draft[f.key]} onChange={(e) => set(f.key, e.target.value)}>
                  {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              )}
              {f.type === "mathfont" && (
                <select id={`ds-${f.key}`} value={draft[f.key]} onChange={(e) => set(f.key, e.target.value)}>
                  {MATH_FONTS.map((m) => <option key={m.cmd} value={m.cmd}>{m.label}</option>)}
                </select>
              )}
              {f.type === "toggle" && (
                <button
                  id={`ds-${f.key}`}
                  className={`ds-toggle${draft[f.key] ? " on" : ""}`}
                  role="switch"
                  aria-checked={!!draft[f.key]}
                  onClick={() => set(f.key, !draft[f.key])}
                >
                  <i />
                </button>
              )}
            </div>
          ))}
        </div>

        <footer className="ds-foot">
          <button className="ds-reset" onClick={() => { setDraft({ ...DEFAULTS }); onPreview({ ...DEFAULTS }); }}>
            Rétablir les valeurs par défaut
          </button>
          <span className="ds-actions">
            <button className="btn btn-secondary btn-sm" onClick={cancel}>Annuler</button>
            <button className="btn btn-primary btn-sm" onClick={() => { onApply(draft); onClose(); }}>Appliquer</button>
          </span>
        </footer>
      </div>
    </div>
  );
}
