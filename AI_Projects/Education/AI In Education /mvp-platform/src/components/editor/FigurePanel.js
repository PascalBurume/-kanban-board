"use client";
import { useMemo, useState, useEffect } from "react";
import Icon from "@/components/ui/Icon";
import { compile, renderFigure, FIGURE_KINDS, COLORS, DEFAULTS, clampRange } from "@/lib/figures";

// Editing panel for a selected figure.
//
// Split in two: "Données" is what the figure plots, "Axes et apparence" is how it
// looks. A teacher edits a curve by typing "x^2 - 3" and a chart by filling a small
// table — never by editing the JSON that happens to be the storage format.
//
// The table holds RAW strings, not parsed numbers. The earlier version parsed on every
// keystroke and dropped anything unparseable, so "12, abc, 15" silently became a
// two-bar chart against three labels. Here a bad cell stays visible and is counted.

const isNum = (s) => s.trim() !== "" && Number.isFinite(Number(s.replace(",", ".")));
const toNum = (s) => Number(s.replace(",", "."));

function rowsFromSpec(spec) {
  if (spec.type === "scatter" && spec.points) return spec.points.map((p) => ({ a: String(p.x ?? ""), b: String(p.y ?? "") }));
  const labels = spec.labels || [];
  const values = spec.values || [];
  const n = Math.max(labels.length, values.length);
  return Array.from({ length: n }, (_, i) => ({ a: labels[i] ?? "", b: values[i] == null ? "" : String(values[i]) }));
}

export default function FigurePanel({ spec, anchor, onChange, onClose }) {
  const kind = FIGURE_KINDS.find((k) => k.kind === spec.type);
  const usesPoints = spec.type === "scatter";
  const [rows, setRows] = useState(() => rowsFromSpec(spec));
  const [showAxes, setShowAxes] = useState(false);

  // Reload the table when a DIFFERENT figure is selected, not on our own edits.
  useEffect(() => { setRows(rowsFromSpec(spec)); /* eslint-disable-next-line */ }, [anchor?.top, spec.type]);

  const set = (patch) => onChange({ ...spec, ...patch });
  const svg = useMemo(() => renderFigure(spec), [spec]);
  const exprOk = spec.type !== "function" || !!compile(spec.expr || "");
  const rangeBad = (spec.ymin != null || spec.ymax != null) && !clampRange(spec.ymin, spec.ymax);

  // Push the table into the spec, keeping only complete rows — and report the rest.
  function commit(next) {
    setRows(next);
    if (usesPoints) {
      set({ points: next.filter((r) => isNum(r.a) && isNum(r.b)).map((r) => ({ x: toNum(r.a), y: toNum(r.b) })) });
    } else {
      const keep = next.filter((r) => isNum(r.b));
      set({ labels: keep.map((r) => r.a), values: keep.map((r) => toNum(r.b)) });
    }
  }
  const badRows = rows.filter((r) => (usesPoints ? !(isNum(r.a) && isNum(r.b)) : !isNum(r.b))).length;

  const editRow = (i, key, v) => commit(rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  const addRow = () => commit([...rows, { a: "", b: "" }]);
  const delRow = (i) => commit(rows.filter((_, j) => j !== i));

  const numOrEmpty = (v) => (v == null || Number.isNaN(v) ? "" : v);

  return (
    <div className="fp" style={anchor ? { top: anchor.top, left: anchor.left } : undefined} role="dialog" aria-label="Modifier la figure">
      <div className="fp-head">
        <span className="fp-l"><Icon name="chart" /> {kind?.label || "Figure"}</span>
        <input className="fp-title" value={spec.title || ""} onChange={(e) => set({ title: e.target.value })} placeholder="Titre (facultatif)" aria-label="Titre de la figure" />
        <button className="fe-done" onClick={onClose} title="Terminer">OK</button>
      </div>

      {/* ── Données ── */}
      {spec.type === "function" ? (
        <div className="fp-row">
          <label htmlFor="fp-expr">y =</label>
          <input id="fp-expr" className={exprOk ? "" : "bad"} value={spec.expr || ""} onChange={(e) => set({ expr: e.target.value })} spellCheck="false" placeholder="x^2 - 3" />
          <label htmlFor="fp-xmin">x de</label>
          <input id="fp-xmin" className="fp-num" type="number" value={numOrEmpty(spec.xmin)} onChange={(e) => set({ xmin: e.target.value === "" ? undefined : parseFloat(e.target.value) })} />
          <label htmlFor="fp-xmax">à</label>
          <input id="fp-xmax" className="fp-num" type="number" value={numOrEmpty(spec.xmax)} onChange={(e) => set({ xmax: e.target.value === "" ? undefined : parseFloat(e.target.value) })} />
        </div>
      ) : (
        <div className="fp-table">
          <div className="fp-th"><span>{usesPoints ? "x" : "Étiquette"}</span><span>{usesPoints ? "y" : "Valeur"}</span><span /></div>
          {rows.map((r, i) => {
            const aBad = usesPoints && r.a !== "" && !isNum(r.a);
            const bBad = r.b !== "" && !isNum(r.b);
            return (
              <div className="fp-tr" key={i}>
                <input value={r.a} onChange={(e) => editRow(i, "a", e.target.value)} className={aBad ? "bad" : ""} aria-label={`${usesPoints ? "x" : "Étiquette"} ligne ${i + 1}`} inputMode={usesPoints ? "decimal" : "text"} />
                <input value={r.b} onChange={(e) => editRow(i, "b", e.target.value)} className={bBad ? "bad" : ""} aria-label={`${usesPoints ? "y" : "Valeur"} ligne ${i + 1}`} inputMode="decimal" />
                <button onClick={() => delRow(i)} title="Supprimer la ligne" aria-label={`Supprimer la ligne ${i + 1}`}><Icon name="x" /></button>
              </div>
            );
          })}
          <button className="fp-add" onClick={addRow}><Icon name="plus" /> Ajouter une ligne</button>
        </div>
      )}

      {badRows > 0 && (
        <p className="fp-err"><Icon name="alert" /> {badRows} ligne{badRows > 1 ? "s" : ""} incomplète{badRows > 1 ? "s" : ""} — elle{badRows > 1 ? "s ne sont" : " n'est"} pas tracée{badRows > 1 ? "s" : ""}.</p>
      )}
      {!exprOk && <p className="fp-err"><Icon name="alert" /> Expression non reconnue. Utilisez x, + - * / ^, des parenthèses et sin, cos, tan, sqrt, ln, log, abs.</p>}
      {rangeBad && <p className="fp-err"><Icon name="alert" /> L&apos;échelle y est ignorée : le minimum doit être inférieur au maximum.</p>}

      {/* ── Axes et apparence ── */}
      <button className="fp-toggle" onClick={() => setShowAxes((s) => !s)} aria-expanded={showAxes}>
        <Icon name="settings" /> Axes et apparence
      </button>

      {showAxes && (
        <div className="fp-adv">
          <div className="fp-row">
            <label htmlFor="fp-xl">Axe x</label>
            <input id="fp-xl" value={spec.xlabel || ""} onChange={(e) => set({ xlabel: e.target.value })} placeholder="temps (s)" />
            <label htmlFor="fp-yl">Axe y</label>
            <input id="fp-yl" value={spec.ylabel || ""} onChange={(e) => set({ ylabel: e.target.value })} placeholder="distance (m)" />
          </div>
          <div className="fp-row">
            <label htmlFor="fp-ymin">y de</label>
            <input id="fp-ymin" className="fp-num" type="number" value={numOrEmpty(spec.ymin)} placeholder="auto" onChange={(e) => set({ ymin: e.target.value === "" ? undefined : parseFloat(e.target.value) })} />
            <label htmlFor="fp-ymax">à</label>
            <input id="fp-ymax" className="fp-num" type="number" value={numOrEmpty(spec.ymax)} placeholder="auto" onChange={(e) => set({ ymax: e.target.value === "" ? undefined : parseFloat(e.target.value) })} />
            <label htmlFor="fp-ticks">Graduations</label>
            <input id="fp-ticks" className="fp-num" type="number" min="2" max="10" value={spec.ticks ?? DEFAULTS.ticks} onChange={(e) => set({ ticks: parseInt(e.target.value, 10) })} />
          </div>
          <div className="fp-row">
            <label>Couleur</label>
            <span className="fp-swatches">
              {COLORS.map((c) => (
                <button key={c} className={`fp-sw${(spec.color || DEFAULTS.color) === c ? " on" : ""}`} style={{ background: c }}
                        onClick={() => set({ color: c })} title={c} aria-label={`Couleur ${c}`} />
              ))}
            </span>
            <label htmlFor="fp-grid" className="fp-check">
              <input id="fp-grid" type="checkbox" checked={spec.grid !== false} onChange={(e) => set({ grid: e.target.checked })} /> Grille
            </label>
          </div>
          <div className="fp-row">
            <label htmlFor="fp-sw">Épaisseur</label>
            <input id="fp-sw" className="fp-range" type="range" min="1" max="6" step="0.5" value={spec.strokeWidth ?? DEFAULTS.strokeWidth} onChange={(e) => set({ strokeWidth: parseFloat(e.target.value) })} />
            <label htmlFor="fp-ps">Points</label>
            <input id="fp-ps" className="fp-range" type="range" min="1" max="10" step="0.5" value={spec.pointSize ?? DEFAULTS.pointSize} onChange={(e) => set({ pointSize: parseFloat(e.target.value) })} />
            <label htmlFor="fp-h">Hauteur</label>
            <input id="fp-h" className="fp-range" type="range" min="240" max="560" step="20" value={spec.height ?? DEFAULTS.height} onChange={(e) => set({ height: parseInt(e.target.value, 10) })} />
          </div>
        </div>
      )}

      <div className="fp-preview" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}
