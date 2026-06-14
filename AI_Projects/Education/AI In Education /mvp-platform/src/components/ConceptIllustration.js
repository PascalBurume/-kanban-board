"use client";
import { useState, useEffect, useRef } from "react";
import Markdown from "./Markdown";
import Icon from "@/components/ui/Icon";

// Animated walkthrough of a chapter's key ideas: one card per lesson, showing
// its objectives and "notions clés", auto-advancing with progress dots. Pure
// presentation built from the lesson highlights — works for any chapter.
export default function ConceptIllustration({ lessons }) {
  const cards = (lessons || []).filter((l) => (l.objectives?.length || l.notions?.length));
  const [i, setI] = useState(0);
  const [play, setPlay] = useState(true);
  const timer = useRef(null);

  useEffect(() => {
    if (!play || cards.length < 2) return;
    timer.current = setTimeout(() => setI((p) => (p + 1) % cards.length), 6000);
    return () => clearTimeout(timer.current);
  }, [i, play, cards.length]);

  if (!cards.length) {
    return <p className="sim-caption" style={{ padding: 30 }}>Cette leçon n’a pas encore d’illustration animée.</p>;
  }
  const c = cards[i];
  const go = (n) => { setPlay(false); setI((n + cards.length) % cards.length); };

  return (
    <div className="illu">
      <div className="illu-stage">
        <div className="illu-card" key={i}>
          <div className="illu-step">Notion {i + 1} / {cards.length}</div>
          <h3>{c.title}</h3>
          {c.objectives?.length > 0 && (
            <div className="illu-block">
              <span className="illu-tag obj"><Icon name="target" /> Objectifs</span>
              <ul>{c.objectives.map((o, k) => <li key={k} style={{ animationDelay: `${0.15 * k}s` }}><Markdown>{o}</Markdown></li>)}</ul>
            </div>
          )}
          {c.notions?.length > 0 && (
            <div className="illu-block">
              <span className="illu-tag not"><Icon name="sparkles" /> Notions clés</span>
              <ul>{c.notions.map((o, k) => <li key={k} style={{ animationDelay: `${0.15 * (k + (c.objectives?.length || 0))}s` }}><Markdown>{o}</Markdown></li>)}</ul>
            </div>
          )}
        </div>
      </div>
      <div className="illu-ctrl">
        <button className="illu-nav" onClick={() => go(i - 1)} title="Précédent"><Icon name="chevL" /></button>
        <div className="illu-dots">
          {cards.map((_, k) => <i key={k} className={k === i ? "on" : ""} onClick={() => go(k)} />)}
        </div>
        <button className="illu-nav" onClick={() => go(i + 1)} title="Suivant"><Icon name="chevR" /></button>
        <button className={`sim-chip${play ? " on" : ""}`} onClick={() => setPlay((p) => !p)}>{play ? "⏸" : "▶"}</button>
      </div>
    </div>
  );
}
