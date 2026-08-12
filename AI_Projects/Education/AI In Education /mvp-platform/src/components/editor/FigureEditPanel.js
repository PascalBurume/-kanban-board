"use client";
import FigurePanel from "@/components/editor/FigurePanel";
import EpurePanel from "@/components/editor/EpurePanel";
import InteractivePanel from "@/components/editor/InteractivePanel";
import { isEpure } from "@/lib/figures";
import { isInteractive } from "@/lib/interactive";

// Which editor a selected figure gets.
//
// One node type, three things it can hold, and therefore three panels: a chart is data,
// an épure is geometry, an interactive figure is a widget with options. A single panel
// that tried to be all three would serve none of them.
//
// It lives in its own file because there are two chromes over the same document — the
// desktop ribbon and the tablet dock — and the choice must be identical in both. It was
// not: the tablet chrome rendered the chart panel for everything, so a teacher editing
// an épure on a tablet got fields for series and axis labels on a figure that has neither.

export default function FigureEditPanel({ spec, anchor, onChange, onClose }) {
  const Panel = isInteractive(spec) ? InteractivePanel : isEpure(spec) ? EpurePanel : FigurePanel;
  return <Panel spec={spec} anchor={anchor} onChange={onChange} onClose={onClose} />;
}
