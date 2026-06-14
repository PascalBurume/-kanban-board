"use client";
import "./BarChart.css";

// Reusable bar chart used by the student & teacher dashboards and insights.
// CSS/flex layout (crisp labels, responsive) with a real baseline + gridlines,
// honest zero values (height 0, not faked), an optional highlighted bar, value
// labels, hover tooltips, an empty state, and a screen-reader data table.
//
// props:
//   data: [{ label, value, highlight? }]
//   unit, formatValue   — value formatting ("12 min")
//   color, highlightColor
//   height              — plot area height in px (default 160)
//   showValues          — value label above each bar (default true)
//   gridLines           — number of horizontal gridlines (default 3)
//   ariaLabel           — accessible name (required for a11y)
//   emptyLabel          — shown when there is no data / all values are 0
export default function BarChart({
  data = [],
  unit = "",
  formatValue,
  color = "var(--indigo-600)",
  highlightColor = "var(--primary)",
  height = 160,
  showValues = true,
  gridLines = 3,
  ariaLabel,
  emptyLabel,
}) {
  const fmt = formatValue || ((v) => `${v}${unit ? ` ${unit}` : ""}`);
  const max = Math.max(...data.map((d) => Number(d.value) || 0), 1);
  const allZero = data.every((d) => !Number(d.value));

  if (!data.length || (allZero && emptyLabel)) {
    return (
      <figure className="bc" role="img" aria-label={ariaLabel} style={{ margin: 0 }}>
        <div className="bc-plot" style={{ height }}>
          <div className="bc-baseline" />
          {emptyLabel && <div className="bc-empty">{emptyLabel}</div>}
        </div>
      </figure>
    );
  }

  // Gridline positions (fractions from baseline up), excluding the baseline (0).
  const lines = Array.from({ length: gridLines }, (_, i) => (i + 1) / gridLines);

  return (
    <figure className="bc" role="img" aria-label={ariaLabel} style={{ margin: 0 }}>
      <div className="bc-plot" style={{ height }}>
        {lines.map((f) => (
          <div className="bc-grid" key={f} style={{ bottom: `${f * 100}%` }}>
            <span className="bc-tick">{fmt(Math.round(max * f))}</span>
          </div>
        ))}
        <div className="bc-baseline" />
        <div className="bc-bars">
          {data.map((d, i) => {
            const v = Number(d.value) || 0;
            const pct = (v / max) * 100;
            return (
              <div className="bc-col" key={`${d.label}-${i}`} title={`${d.label} : ${fmt(v)}`}>
                <div
                  className={`bc-bar${d.highlight ? " hl" : ""}`}
                  style={{ height: `${pct}%`, background: d.highlight ? highlightColor : color }}
                >
                  {showValues && v > 0 && <span className="bc-val">{fmt(v)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="bc-xlabels">
        {data.map((d, i) => (
          <span className={`bc-xlbl${d.highlight ? " hl" : ""}`} key={`${d.label}-${i}`}>{d.label}</span>
        ))}
      </div>
      {/* Screen-reader equivalent */}
      <table className="bc-sr">
        <caption>{ariaLabel}</caption>
        <tbody>
          {data.map((d, i) => (
            <tr key={`${d.label}-${i}`}><th scope="row">{d.label}</th><td>{fmt(Number(d.value) || 0)}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
