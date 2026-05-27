// Mountain-climb trend chart — the design's signature chart, used on the
// JLPT dashboard and Progress almanac. Replaces a normal line chart with a
// hand-drawn mountain landscape: pale back-range, dashed accent trail with
// flag markers at each data point, summit goal flag at the pass mark.
//
// Pure SVG, no chart library — the metaphor IS the chart.

import * as React from "react";

export interface MountainPoint {
  label: string;
  value: number; // 0–100 (e.g. mock score %)
}

interface Props {
  points: MountainPoint[];
  goal?: number; // summit pass-mark %
  goalLabel?: string;
  height?: number;
  ariaLabel?: string;
}

export function MountainChart({
  points,
  goal = 60,
  goalLabel = "pass",
  height = 220,
  ariaLabel = "Mountain climb chart of mock test scores",
}: Props) {
  const W = 720;
  const H = height;
  const padX = 32;
  const baseY = H - 36;

  // Map (i, value) → (x, y)
  const xs = points.map(
    (_, i) =>
      padX + ((W - padX * 2) / Math.max(1, points.length - 1)) * i
  );
  const ys = points.map((p) => baseY - (p.value / 100) * (baseY - 32));

  // Foreground polygon for the climb (closed shape down to baseline)
  const climbPath = [
    `M ${padX} ${baseY}`,
    ...xs.map((x, i) => `L ${x} ${ys[i]}`),
    `L ${W - padX} ${baseY}`,
    "Z",
  ].join(" ");

  // Dashed trail (accent) connecting points
  const trail = xs.map((x, i) => `${i === 0 ? "M" : "L"} ${x} ${ys[i]}`).join(" ");

  // Back range silhouette — generated jitter
  const backRange = backRangePath(W, baseY);

  // Summit goal pos
  const summitX = W - padX;
  const summitY = baseY - (goal / 100) * (baseY - 32);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={ariaLabel}
      className="block h-auto w-full"
    >
      {/* sky */}
      <rect width={W} height={H} fill="var(--paper-2)" />

      {/* back range */}
      <path d={backRange} fill="var(--paper-3)" opacity={0.9} />

      {/* foreground climb */}
      <path
        d={climbPath}
        fill="var(--accent-soft)"
        stroke="none"
        opacity={0.9}
      />
      <path
        d={trail}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2}
        strokeDasharray="6 5"
      />

      {/* baseline */}
      <line
        x1={padX}
        y1={baseY}
        x2={W - padX}
        y2={baseY}
        stroke="var(--ink)"
        strokeWidth={1.5}
      />

      {/* flag markers */}
      {points.map((p, i) => {
        const isCurrent = i === points.length - 1;
        return (
          <g key={i}>
            <line
              x1={xs[i]}
              y1={ys[i]}
              x2={xs[i]}
              y2={ys[i] - 18}
              stroke="var(--ink)"
              strokeWidth={1.3}
            />
            <polygon
              points={`${xs[i]},${ys[i] - 18} ${xs[i] + 10},${ys[i] - 14} ${xs[i]},${ys[i] - 10}`}
              fill={isCurrent ? "var(--accent)" : "var(--paper)"}
              stroke="var(--ink)"
              strokeWidth={1.2}
            />
            <text
              x={xs[i]}
              y={baseY + 14}
              fontSize={10}
              textAnchor="middle"
              fill="var(--ink-2)"
              fontFamily="var(--font-jetbrains)"
            >
              {p.label}
            </text>
            <text
              x={xs[i]}
              y={ys[i] - 24}
              fontSize={11}
              textAnchor="middle"
              fill="var(--ink)"
              fontFamily="var(--font-jetbrains)"
            >
              {p.value}
            </text>
          </g>
        );
      })}

      {/* hiker icon near current point */}
      {points.length > 0 && (
        <g
          transform={`translate(${xs[xs.length - 1] - 16},${
            ys[ys.length - 1] - 4
          })`}
        >
          <circle r={2.5} cx={4} cy={2} fill="var(--ink)" />
          <line
            x1={4}
            y1={4}
            x2={4}
            y2={12}
            stroke="var(--ink)"
            strokeWidth={1.3}
          />
          <line
            x1={4}
            y1={6}
            x2={9}
            y2={9}
            stroke="var(--ink)"
            strokeWidth={1.3}
          />
          <text
            x={-10}
            y={20}
            fontSize={9}
            fill="var(--ink-3)"
            fontFamily="var(--font-jetbrains)"
          >
            you · last mock
          </text>
        </g>
      )}

      {/* summit goal flag */}
      <line
        x1={summitX}
        y1={summitY}
        x2={summitX}
        y2={summitY - 24}
        stroke="var(--ink)"
        strokeWidth={1.5}
      />
      <polygon
        points={`${summitX},${summitY - 24} ${summitX + 14},${summitY - 20} ${summitX},${summitY - 16}`}
        fill="none"
        stroke="var(--ink)"
        strokeWidth={1.5}
      />
      <text
        x={summitX - 4}
        y={summitY - 30}
        fontSize={10}
        textAnchor="end"
        fill="var(--ink)"
        fontFamily="var(--font-jetbrains)"
      >
        summit · {goalLabel} {goal}%
      </text>
    </svg>
  );
}

function backRangePath(W: number, baseY: number) {
  const peaks = [120, 80, 140, 95, 130, 70, 115];
  const step = W / (peaks.length - 1);
  let path = `M 0 ${baseY}`;
  for (let i = 0; i < peaks.length; i++) {
    const x = i * step;
    const peakY = baseY - peaks[i];
    if (i === 0) path += ` L ${x} ${baseY}`;
    path += ` L ${x + step / 2} ${peakY}`;
    path += ` L ${x + step} ${baseY - peaks[Math.min(i + 1, peaks.length - 1)] * 0.4}`;
  }
  path += ` L ${W} ${baseY} Z`;
  return path;
}
