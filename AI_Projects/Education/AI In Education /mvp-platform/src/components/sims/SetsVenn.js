"use client";
import { useState } from "react";
import SimFrame from "./SimFrame";

// Sets & logic: two overlapping sets A, B. Buttons highlight a region — union,
// intersection, difference, symmetric difference, complement.
const OPS = [
  { key: "union", label: "A ∪ B", desc: "Union — tout ce qui est dans A ou B." },
  { key: "inter", label: "A ∩ B", desc: "Intersection — ce qui est à la fois dans A et B." },
  { key: "diff", label: "A \\ B", desc: "Différence — dans A mais pas dans B." },
  { key: "sym", label: "A △ B", desc: "Différence symétrique — dans A ou B, mais pas les deux." },
  { key: "compA", label: "Aᶜ", desc: "Complément de A — tout ce qui n'est pas dans A." },
];

// The circles, in one place: the clip paths, the masks and the outlines all have
// to agree, and they did not when each carried its own copy of the numbers.
const A = { cx: 160, cy: 130, r: 95 };
const B = { cx: 240, cy: 130, r: 95 };

// One tint for every region. Each of the four is painted at most once, so the
// highlighted set reads as a single flat colour instead of going darker wherever
// two layers happened to overlap. It sits higher than the 0.28 the stacked
// version used for a single circle: that only had to be legible next to the 0.55
// overlap beside it, whereas here the whole answer to « which region? » is this
// one shade against the empty one.
const TINT = 0.42;

export default function SetsVenn() {
  const [op, setOp] = useState("union");
  const cur = OPS.find((o) => o.key === op);

  // Regions: onlyA, onlyB, both, outside — fill when active.
  const fill = (region) => {
    const on = {
      union: { onlyA: 1, onlyB: 1, both: 1, outside: 0 },
      inter: { onlyA: 0, onlyB: 0, both: 1, outside: 0 },
      diff: { onlyA: 1, onlyB: 0, both: 0, outside: 0 },
      sym: { onlyA: 1, onlyB: 1, both: 0, outside: 0 },
      compA: { onlyA: 0, onlyB: 1, both: 0, outside: 1 },
    }[op];
    return on[region] ? "var(--primary)" : "transparent";
  };

  return (
    <SimFrame title="Ensembles & logique" hint="Choisis une opération pour colorer la région correspondante.">
      <svg viewBox="0 0 400 260" className="sim-svg" style={{ "--op-fill": "var(--primary)" }}>
        {/*
          A region has to be MASKED, not clipped. A clip path can only intersect,
          so « dans A mais pas dans B » was drawn as the whole of A and then the
          overlap was painted `transparent` on top — and transparent paint erases
          nothing. A △ B came out identical to A ∪ B, A \ B came out as plain A,
          and Aᶜ swallowed the part of B sitting inside A. A mask subtracts: white
          shows, black hides.
        */}
        <defs>
          <clipPath id="cA"><circle cx={A.cx} cy={A.cy} r={A.r} /></clipPath>
          <clipPath id="cB"><circle cx={B.cx} cy={B.cy} r={B.r} /></clipPath>
          <mask id="mOnlyA">
            <circle cx={A.cx} cy={A.cy} r={A.r} fill="white" />
            <circle cx={B.cx} cy={B.cy} r={B.r} fill="black" />
          </mask>
          <mask id="mOnlyB">
            <circle cx={B.cx} cy={B.cy} r={B.r} fill="white" />
            <circle cx={A.cx} cy={A.cy} r={A.r} fill="black" />
          </mask>
          <mask id="mOutside">
            <rect x="6" y="6" width="388" height="248" rx="14" fill="white" />
            <circle cx={A.cx} cy={A.cy} r={A.r} fill="black" />
            <circle cx={B.cx} cy={B.cy} r={B.r} fill="black" />
          </mask>
        </defs>
        {/* universe */}
        <rect x="6" y="6" width="388" height="248" rx="14" fill="var(--slate-50)" stroke="var(--border)" />
        {/* the four disjoint regions, each painted once */}
        <rect x="0" y="0" width="400" height="260" mask="url(#mOutside)" fill={fill("outside")} opacity={TINT} />
        <rect x="0" y="0" width="400" height="260" mask="url(#mOnlyA)" fill={fill("onlyA")} opacity={TINT} />
        <rect x="0" y="0" width="400" height="260" mask="url(#mOnlyB)" fill={fill("onlyB")} opacity={TINT} />
        <g clipPath="url(#cA)"><g clipPath="url(#cB)"><rect x="0" y="0" width="400" height="260" fill={fill("both")} opacity={TINT} /></g></g>
        {/* outlines */}
        <circle cx={A.cx} cy={A.cy} r={A.r} fill="none" stroke="var(--math)" strokeWidth="2.5" />
        <circle cx={B.cx} cy={B.cy} r={B.r} fill="none" stroke="var(--physique)" strokeWidth="2.5" />
        <text x="95" y="60" fontSize="22" fontWeight="700" fill="var(--math)">A</text>
        <text x="300" y="60" fontSize="22" fontWeight="700" fill="var(--physique)">B</text>
      </svg>
      <p className="sim-caption">{cur.desc}</p>
      <div className="sim-btns">
        {OPS.map((o) => (
          <button key={o.key} className={`sim-chip${op === o.key ? " on" : ""}`} onClick={() => setOp(o.key)}>{o.label}</button>
        ))}
      </div>
    </SimFrame>
  );
}
