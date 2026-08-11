"use client";
import { useMemo, useState } from "react";
import { Check, X, RotateCcw, ClipboardCheck } from "lucide-react";

// « Calque à annoter » — the tracing-paper exercise.
//
// Every structure on the specimen is reduced to a numbered blank marker, and the
// student names each one before checking. It is the drill a Bio-Chimie class
// already does on paper: lay a calque over the plate, mark the parts, label them.
//
// This is a different exercise from « Mode révision », which shows one marker and
// asks for its name. Here the whole plate has to be labelled at once, so the
// student has to tell neighbouring structures apart rather than recognise one in
// isolation — which is what the exam actually asks of them.

/** Deterministic shuffle so the option order is stable across re-renders. */
function shuffled(list, seed) {
  const a = [...list];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function CalqueOverlay({ organ, answers, onAnswer, checked, onCheck, onReset, onFocus }) {
  const [seed] = useState(() => Math.floor(Math.random() * 1e9));

  // One shared pool of every name on this specimen, shuffled once. Each row
  // offers the same list, so the student cannot narrow by elimination of order.
  const options = useMemo(
    () => shuffled(organ.hotspots.map((h) => h.label), seed),
    [organ.id, seed], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const filled = organ.hotspots.filter((h) => answers[h.id]).length;
  const score = organ.hotspots.filter((h) => answers[h.id] === h.label).length;
  const total = organ.hotspots.length;

  return (
    <section className="an-calque">
      <header>
        <h2>
          <ClipboardCheck size={17} /> Calque à annoter
        </h2>
        {checked && (
          <span className="an-score">
            {score} / {total}
          </span>
        )}
      </header>
      <p className="an-calque-intro">
        Les noms ont été retirés du spécimen. Nommez chaque repère numéroté, puis vérifiez.
      </p>

      <div className="an-tags">
        {organ.hotspots.map((h, i) => {
          const given = answers[h.id] ?? "";
          const right = given === h.label;
          const state = !checked || !given ? "" : right ? " is-right" : " is-wrong";
          return (
            <div key={h.id} className={`an-tag${state}`} style={{ "--pin": h.color }}>
              <span className="an-tag-n">{i + 1}</span>
              <select
                value={given}
                disabled={checked}
                onChange={(e) => onAnswer(h.id, e.target.value)}
                onFocus={() => onFocus?.(h)}
                aria-label={`Repère ${i + 1}`}
              >
                <option value="">— à nommer —</option>
                {options.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
              <span className="an-tag-mark">
                {checked && given ? right ? <Check size={15} /> : <X size={15} /> : null}
              </span>
            </div>
          );
        })}
      </div>

      <div className="an-calque-actions">
        {checked ? (
          <button className="an-btn" onClick={onReset}>
            <RotateCcw size={14} /> Recommencer
          </button>
        ) : (
          <button className="an-btn" onClick={onCheck} disabled={filled === 0}>
            Vérifier {filled < total ? `(${filled}/${total})` : ""}
          </button>
        )}
      </div>

      {/* The correction names what was missed rather than only scoring it —
          a mark alone teaches nothing about which two the student confused. */}
      {checked && score < total && (
        <div className="an-corrige">
          <strong>À revoir :</strong>{" "}
          {organ.hotspots
            .filter((h) => answers[h.id] !== h.label)
            .map((h, i, arr) => (
              <span key={h.id}>
                n° {organ.hotspots.indexOf(h) + 1} = {h.label}
                {i < arr.length - 1 ? " · " : ""}
              </span>
            ))}
        </div>
      )}
      {checked && score === total && (
        <div className="an-corrige">
          <strong>Tout juste.</strong> Les {total} repères {organ.de} {organ.name.toLowerCase()} sont nommés
          correctement.
        </div>
      )}
    </section>
  );
}
