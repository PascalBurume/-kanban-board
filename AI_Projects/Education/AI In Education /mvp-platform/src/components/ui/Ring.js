// Circular progress ring. `pct` 0–100; `size`/`stroke` in px; `color` the arc,
// `track` the background. Renders the % in the centre unless `label` is given.
export default function Ring({ pct = 0, size = 80, stroke = 7, color = "var(--primary)", track = "var(--slate-200)", label }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  const cx = size / 2;
  return (
    <div className="prog-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c.toFixed(1)} strokeDashoffset={off.toFixed(1)}
          transform={`rotate(-90 ${cx} ${cx})`}
          style={{ transition: "stroke-dashoffset .5s ease" }}
        />
      </svg>
      <span className="pct" style={{ fontSize: Math.round(size * 0.26) }}>{label ?? `${Math.round(pct)}%`}</span>
    </div>
  );
}
