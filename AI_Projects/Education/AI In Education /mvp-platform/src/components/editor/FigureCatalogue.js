"use client";
import { useState, useMemo, useRef, useEffect } from "react";
import katex from "katex";
import Icon from "@/components/ui/Icon";
import { DISCIPLINES, searchCatalogue, groupByDomain, disciplineOf } from "@/lib/figureCatalogue";
import { EPURE_CATALOGUE } from "@/lib/epureCatalogue";
import { renderEpure } from "@/lib/epure";
import { figureToJson } from "@/lib/figures";
import { toast } from "@/lib/toast";

// The « Catalogue des figures scientifiques » — 76 reference figures, browsable.
//
// The catalogue is a classification vocabulary: each figure carries a code
// (MA-TR-01) meant to label a scanned plate, and fixes the vocabulary of that family
// of figure. So this browser is built around the code as much as the picture: you can
// arrive here from a label written on a page, or from the word you have in your head,
// and both find the same entry.
//
// What you insert is the LaTeX that belongs BESIDE that figure — the defining relation
// a teacher writes under a diagram, or the labelled legend of the parts where the
// figure has no relation. Every entry renders; that is enforced by a test that walks
// all 76 through KaTeX.

const DISC_COLOR = { MA: "ma", PH: "ph", CH: "ch", SV: "sv" };

function Rendered({ tex }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, { throwOnError: true, displayMode: true });
    } catch {
      return "";
    }
  }, [tex]);
  if (!html) return <span className="fc-bad">Cette entrée ne s'affiche pas — signalez-la.</span>;
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

// `allowChart` is false inside the formula editor: a ```figure block is markdown, and
// the formula editor writes into a single maths node. Offering a button that cannot
// work there would be worse than not offering it.
export default function FigureCatalogue({ query, onQuery, onInsert, disabled, allowChart = true }) {
  const [disc, setDisc] = useState(null); // null = toutes les disciplines
  const [open, setOpen] = useState(null); // the expanded figure code

  const results = useMemo(() => searchCatalogue(query || "", disc), [query, disc]);
  const groups = useMemo(() => groupByDomain(results), [results]);

  // An opened entry is tall — drawing, relation, LaTeX, then the buttons that do the
  // work. Opened from halfway down the list, all of that unfolds below the fold and the
  // teacher sees a figure with no way to insert it. `nearest` keeps an entry that
  // already fits exactly where it is rather than yanking the list around.
  const openRef = useRef(null);
  useEffect(() => {
    if (!open || !openRef.current) return;
    // Instant, not smooth: a smooth scroll is cancelled the moment anything takes
    // focus, and lands the list halfway.
    openRef.current.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [open]);

  // Schools reach this over plain http on the LAN, where navigator.clipboard is
  // undefined — the legacy path is the normal one here, not a rare fallback.
  function copy(text) {
    const report = (ok) => toast(ok ? "LaTeX copié ✓" : "Copie impossible", { icon: ok ? "check" : "alert" });
    if (!navigator.clipboard?.writeText) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      document.body.removeChild(ta);
      report(ok);
      return;
    }
    navigator.clipboard.writeText(text).then(() => report(true), () => report(false));
  }

  return (
    <div className="fc">
      <div className="fc-bar">
        <div className="fc-chips" role="tablist" aria-label="Disciplines">
          <button role="tab" aria-selected={!disc} className={!disc ? "on" : ""} onClick={() => setDisc(null)}>
            Toutes
          </button>
          {DISCIPLINES.map((d) => (
            <button
              key={d.id}
              role="tab"
              aria-selected={disc === d.id}
              title={d.label}
              className={`${DISC_COLOR[d.id]}${disc === d.id ? " on" : ""}`}
              onClick={() => setDisc(disc === d.id ? null : d.id)}
            >
              {d.short}
            </button>
          ))}
        </div>
        <input
          className="fc-search"
          value={query || ""}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Chercher — « thalès », « optique », ou un code « MA-TR-01 »…"
          aria-label="Chercher une figure du catalogue"
        />
        <span className="fc-count">{results.length} / 76</span>
      </div>

      <div className="fc-body">
        {groups.length === 0 && (
          <p className="fc-none">Aucune figure pour « {query} »{disc ? ` en ${DISCIPLINES.find((d) => d.id === disc).label.toLowerCase()}` : ""}.</p>
        )}
        {groups.map((g) => (
          <section className="fc-group" key={g.domain}>
            <p className="fc-group-l">
              <span className={`fc-code ${DISC_COLOR[disciplineOf(g.domain)]}`}>{g.domain}</span>
              {g.label}
            </p>
            {g.items.map((f) => {
              const isOpen = open === f.code;
              return (
                <div className={`fc-item${isOpen ? " open" : ""}`} key={f.code} ref={isOpen ? openRef : null}>
                  <button className="fc-head" onClick={() => setOpen(isOpen ? null : f.code)} aria-expanded={isOpen}>
                    <span className={`fc-code ${DISC_COLOR[disciplineOf(f.code)]}`}>{f.code}</span>
                    <span className="fc-t">
                      <b>{f.title}</b>
                      <i>{f.keywords}</i>
                    </span>
                    <Icon name={isOpen ? "chevD" : "chevR"} />
                  </button>

                  {isOpen && (
                    <div className="fc-detail">
                      {/* Drawn from the figure's SPEC, which is also what gets
                          inserted — so the preview cannot drift from the result. The
                          hand-drawn originals in figureDrawings.ts remain the source
                          the spec was generated from, and are no longer shipped. */}
                      <div className="fc-fig" dangerouslySetInnerHTML={{ __html: renderEpure(EPURE_CATALOGUE[f.code]) }} />
                      {/* Everything that is not the drawing, in one element — so a wide
                          palette can set it beside the figure instead of under it. */}
                      <div className="fc-side">
                        <p className="fc-l">Formule associée</p>
                        <div className="fc-preview"><Rendered tex={f.latex} /></div>
                        <p className="fc-l">Code LaTeX</p>
                        <pre className="fc-src">{f.latex}</pre>
                        <div className="fc-acts">
                          {allowChart && (
                            <button
                              className="btn btn-primary btn-sm"
                              disabled={disabled}
                              title="Insérer la figure — modifiable point par point"
                              // A ```figure fence rather than raw <svg>: it arrives as
                              // an editable épure instead of a frozen picture, and every
                              // surface that inserts markdown already handles a fence.
                              onClick={() => onInsert("```figure\n" + figureToJson(EPURE_CATALOGUE[f.code]) + "\n```", "epure", f)}
                            >
                              <Icon name="chart" /> Insérer la figure
                            </button>
                          )}
                          <button
                            className={`btn btn-sm ${allowChart ? "btn-secondary" : "btn-primary"}`}
                            disabled={disabled}
                            onClick={() => onInsert(f.latex, "math", f)}
                          >
                            <Icon name="plus" /> Insérer la formule
                          </button>
                          {f.chart && allowChart && (
                            <button
                              className="btn btn-secondary btn-sm"
                              disabled={disabled}
                              title="Insérer le graphique que l'application sait tracer"
                              onClick={() => onInsert(f.chart, "chart", f)}
                            >
                              <Icon name="chart" /> Insérer le graphique
                            </button>
                          )}
                          <button className="btn btn-secondary btn-sm" onClick={() => copy(f.latex)}>
                            <Icon name="download" /> Copier
                          </button>
                        </div>
                        <p className="fc-note">
                          Cette figure du catalogue porte le code <b>{f.code}</b> — écrivez-le sur la planche scannée
                          pour la rattacher au type de référence.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
