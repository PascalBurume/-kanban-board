"use client";
import { useState, useMemo } from "react";
import SimFrame, { Slider } from "./SimFrame";

const fact = (n) => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
const comb = (n, k) => (k < 0 || k > n ? 0 : fact(n) / (fact(k) * fact(n - k)));
const arr = (n, k) => (k < 0 || k > n ? 0 : fact(n) / fact(n - k));

// Counting: combinations C(n,k) vs arrangements A(n,k), with a Pascal triangle.
export default function Combinatorics() {
  const [n, setN] = useState(5);
  const [k, setK] = useState(2);

  const triangle = useMemo(() => {
    const rows = [];
    for (let i = 0; i <= Math.min(n, 7); i++) {
      const row = [];
      for (let j = 0; j <= i; j++) row.push(comb(i, j));
      rows.push(row);
    }
    return rows;
  }, [n]);

  return (
    <SimFrame title="Dénombrement" hint="Combinaisons (l'ordre ne compte pas) vs arrangements (l'ordre compte).">
      <svg viewBox="0 0 400 250" className="sim-svg">
        <rect x="0" y="0" width="400" height="250" rx="14" fill="var(--slate-50)" stroke="var(--border)" />
        {triangle.map((row, i) =>
          row.map((v, j) => {
            const x = 200 - row.length * 26 + j * 52 + 26;
            const y = 28 + i * 28;
            const hot = i === Math.min(n, 7) && j === k;
            return (
              <g key={`${i}-${j}`}>
                <circle cx={x} cy={y} r="13" fill={hot ? "var(--primary)" : "var(--surface)"} stroke="var(--border)" />
                <text x={x} y={y + 4} fontSize="11" textAnchor="middle" fill={hot ? "#fff" : "var(--text-soft)"} fontWeight={hot ? 700 : 500}>{v}</text>
              </g>
            );
          })
        )}
      </svg>
      <p className="sim-caption">
        C({n},{k}) = <b>{comb(n, k)}</b> &nbsp;·&nbsp; A({n},{k}) = <b>{arr(n, k)}</b> &nbsp;·&nbsp; {n}! = {fact(n)}
      </p>
      <Slider label="n" value={n} min={1} max={7} step={1} onChange={(v) => { setN(v); if (k > v) setK(v); }} />
      <Slider label="k" value={k} min={0} max={n} step={1} onChange={setK} />
    </SimFrame>
  );
}
