"use client";
import Icon from "@/components/ui/Icon";
import TexPreview from "@/components/editor/TexPreview";
import FigureCatalogue from "@/components/editor/FigureCatalogue";
import { MATH_GROUPS, STRUCT_GROUPS, PHYS_GROUPS, CHEM_GROUPS, searchSymbols } from "@/lib/symbols";
import "./SymbolPalette.css";

// The prebuilt function panel, one implementation for every surface that shows it:
// the ribbon popover, the LaTeX editor's docked palette, and the LaTeX workspace page.
//
// It used to live inline in LessonWriter, which meant the LaTeX editor would have been
// a second copy — and two copies of a tab list is how "Physique" ends up present in one
// place and missing in the other.
//
// Search is the primary way in, not the tabs: a teacher looking for a square root
// types "racine" and should find it whether or not they guessed it lives under
// Mathématiques. searchSymbols is accent-insensitive, so "réversible" and "reversible"
// both work — which matters on a school keyboard without a French layout.

export const PALETTE_TABS = [
  { id: "math", label: "Mathématiques", groups: MATH_GROUPS },
  { id: "struct", label: "Structures", groups: STRUCT_GROUPS },
  { id: "phys", label: "Physique", groups: PHYS_GROUPS },
  { id: "chem", label: "Chimie", groups: CHEM_GROUPS },
  // The 76 reference figures. Not a symbol group — it has its own browser, because a
  // figure is found by its classification code as often as by its name.
  { id: "figures", label: "Figures", groups: null },
];

export default function SymbolPalette({ tab, onTab, query, onQuery, onPick, onInsertFigure, onClose, disabled, compact, allowChart }) {
  const active = PALETTE_TABS.find((t) => t.id === tab) ?? PALETTE_TABS[0];
  // A query searches the CURRENT subject only. Searching all four at once looked
  // helpful and was not: "delta" then returns the maths Δ, the physics Δt and the
  // chemistry ΔH in one undifferentiated grid.
  const isFigures = active.id === "figures";
  const groups = isFigures ? [] : searchSymbols(active.groups, query || "");

  return (
    <>
      <div className="sp-head">
        <div className="sp-tabs" role="tablist" aria-label="Matières">
          {PALETTE_TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`${tab === t.id ? "on" : ""}${t.id === "figures" ? " sp-tab-fig" : ""}`}
              onClick={() => onTab(t.id)}
            >
              {t.id === "figures" && <Icon name="chart" />}
              {t.label}
            </button>
          ))}
        </div>
        {/* The catalogue carries its own search field, next to its discipline chips —
            two search boxes on one row would be a puzzle, not a shortcut. */}
        {!isFigures && (
          <input
            className="sp-search"
            aria-label="Chercher un symbole"
            value={query || ""}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Chercher — « racine », « fraction », « réversible »…"
          />
        )}
        {isFigures && <span className="sp-head-note">Catalogue des figures scientifiques · 76 figures</span>}
        {onClose && <button className="sp-x" onClick={onClose} title="Fermer" aria-label="Fermer les symboles"><Icon name="x" /></button>}
      </div>

      {isFigures ? (
        <FigureCatalogue query={query} onQuery={onQuery} onInsert={onInsertFigure} disabled={disabled} allowChart={allowChart} />
      ) : (
        <div className={`sp-body${compact ? " compact" : ""}`}>
          {groups.length === 0 && <p className="sp-none">Aucun symbole pour « {query} » dans {active.label.toLowerCase()}.</p>}
          {groups.map((g) => (
            <div className="sp-group" key={g.id}>
              <p className="sp-group-l">{g.label}</p>
              <div className="sp-grid">
                {g.items.map((s) => (
                  <button key={s.id} className="sp-sym" onClick={() => onPick(s)} title={`${s.label} — ${s.insert.trim()}`} disabled={disabled}>
                    <TexPreview tex={s.tex} className="sp-tex" />
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
