"use client";
import { useState } from "react";
import Markdown from "./Markdown";
import Icon from "@/components/ui/Icon";
import { splitRep } from "@/lib/copilot";

// Light cleanup so OCR drafts read as tidily as possible (collapse runs of
// spaces / blank lines / stray separator dashes left by the scanner).
function tidy(t) {
  return (t || "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[—–-]{3,}/g, " … ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Lesson-linked exercise list. `linked`=true when shown inside a lesson/chapter.
// `onActiveExercise(e)` (optional) fires when a card is focused/hovered so the
// Copilot can suggest help for the exercise the student is looking at.
export default function Exercises({ items, linked, onOpenLesson, onActiveExercise }) {
  if (!items?.length) {
    return (
      <div className="ex-empty">
        <Icon name="edit" />
        <p>Pas encore d’exercices extraits pour ce chapitre.</p>
      </div>
    );
  }
  return (
    <div className="ex-grid">
      {items.map((e, i) => (
        <ExCard key={e.id} e={e} index={i + 1} linked={linked} onOpenLesson={onOpenLesson} onActiveExercise={onActiveExercise} />
      ))}
    </div>
  );
}

function ExCard({ e, index, linked, onOpenLesson, onActiveExercise }) {
  const [showRep, setShowRep] = useState(false);
  const isOcr = e.quality === "ocr";
  // Cleaned exercises carry an explicit solution; raw OCR splits on a "Rép:" marker.
  const split = isOcr ? splitRep(e.text) : { q: e.text, rep: e.solution || "" };
  const { q, rep } = split;
  const markActive = onActiveExercise ? () => onActiveExercise({ ...e, n: e.n || index }) : undefined;

  return (
    <article
      className={`ex-card${isOcr ? " ex-draft" : " ex-clean"}`}
      onMouseEnter={markActive}
      onFocusCapture={markActive}
      onClick={markActive}
    >
      <div className="ex-head">
        <span className="ex-num">{e.n || index}</span>
        <div className="ex-meta">
          <span className="ex-title">{e.n ? `Exercice ${e.n}` : e.section || "Exercice"}</span>
          <span className="ex-src">{e.subject}{e.moduleTitle ? ` · ${e.moduleTitle}` : ""}</span>
        </div>
        <span className={`ex-tag${isOcr ? " draft" : ""}`}>
          <Icon name={isOcr ? "alert" : "check"} /> {isOcr ? "Brouillon" : "Vérifié"}
        </span>
      </div>

      <div className="ex-body">
        {isOcr ? <pre className="ex-pre">{tidy(q)}</pre> : <Markdown>{q}</Markdown>}
      </div>

      {(rep || (!linked && onOpenLesson)) && (
        <div className="ex-actions">
          {rep && (
            <button className={`ex-btn${showRep ? " on" : ""}`} onClick={() => setShowRep((v) => !v)}>
              <Icon name="sparkles" /> {showRep ? "Cacher la solution" : "Voir la solution"}
            </button>
          )}
          {!linked && onOpenLesson && (
            <button className="ex-btn" onClick={() => onOpenLesson({ path: e.lessonPath, title: e.moduleTitle, n: e.module })}>
              <Icon name="book" /> Ouvrir la leçon
            </button>
          )}
        </div>
      )}

      {rep && showRep && (
        <div className="ex-sol">
          <span className="ex-sol-tag"><Icon name="check" /> Solution</span>
          {isOcr ? <pre className="ex-pre sol">{tidy(rep)}</pre> : <div className="ex-sol-md"><Markdown>{rep}</Markdown></div>}
        </div>
      )}
    </article>
  );
}
