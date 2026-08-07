"use client";
import { useState, useMemo, useRef } from "react";
import katex from "katex";
import Icon from "@/components/ui/Icon";
import TexPreview from "@/components/editor/TexPreview";
import { MATH_GROUPS, STRUCT_GROUPS, CHEM_GROUPS, PHYS_GROUPS, MATH_FONTS, applyFont, searchSymbols } from "@/lib/symbols";
import { expandTrigger, triggerFor } from "@/lib/mathInput";

// The symbol keyboard — wireframe 1f, callout 1.
//
// On a tablet there is no room for a palette sidebar beside the page and no mouse to
// steer a popover with, so the palette is flattened: the group list becomes a row of
// chips and the symbols become a grid of ≥40px keys docked at the bottom of the
// screen. It is the same symbols.ts data as the desktop palette — one definition of
// what "somme" inserts, two ways to reach it.
//
// The preview strip above the keys is the point of the whole surface: press a key and
// it tells you the word that would have typed it. The palette is meant to train the
// teacher out of needing the palette.
//
// \TeX swaps the grid for the raw LaTeX field, which is the same field the desktop
// FormulaEditor uses — so type-to-convert still works the moment a hardware keyboard
// is attached, exactly as 1f promises.

const GROUPS = [...MATH_GROUPS, ...STRUCT_GROUPS, ...PHYS_GROUPS, ...CHEM_GROUPS];

// The chip caption for each group. Full French labels do not fit a 1024px row, and the
// wireframe's row is glyphs — so each chip shows the notation it contains, with the
// real label as its accessible name.
const CHIP = {
  base: "a/b √",
  rel: "≤ ≥ ≠",
  analyse: "∑ ∫ ∏",
  ens: "∈ ∪ ⊂",
  geo: "∠ π →",
  mat: "( ⋮ )",
  sys: "{ cases",
  acc: "â ⏞",
  delim: "( [ ‖",
  big: "∬ ∮",
  units: "m/s Ω",
  vectors: "v⃗ Δ",
  consts: "ℏ ε₀",
  reac: "⇄",
  form: "H₂O",
  ions: "± pH",
};

export default function SymbolKeyboard({
  tex, display, onTexChange, onInsertSymbol, onClose, disabled,
}) {
  const [groupId, setGroupId] = useState(GROUPS[0].id);
  const [raw, setRaw] = useState(false);
  const [hint, setHint] = useState(null); // the symbol whose help is showing
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);

  // Searching collapses the group row: a query is a better filter than a category, and
  // "racine" should find \sqrt whichever group the teacher happens to be looking at.
  const found = useMemo(() => (query.trim() ? searchSymbols(GROUPS, query).flatMap((g) => g.items) : null), [query]);
  const group = GROUPS.find((g) => g.id === groupId) ?? GROUPS[0];
  const keys = found ?? group.items;

  const editing = typeof tex === "string";

  function press(sym) {
    setHint(sym);
    onInsertSymbol(sym);
  }

  // The raw field is the desktop formula input: same expandTrigger call, so "somme "
  // becomes \sum_{i=1}^{n} with the caret on the index here too.
  function onRawInput(e) {
    const value = e.target.value;
    const at = e.target.selectionStart ?? value.length;
    const r = expandTrigger(value, at);
    if (!r) {
      onTexChange(value);
      return;
    }
    const next = value.slice(0, r.from) + r.insert + value.slice(r.to);
    onTexChange(next);
    const from = r.select ? r.select[0] : r.from + r.insert.length;
    const len = r.select ? r.select[1] : 0;
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(from, from + len);
    });
  }

  function applyFontChoice(cmd) {
    if (!cmd || !editing) return;
    const el = inputRef.current;
    const from = el?.selectionStart ?? 0;
    const to = el?.selectionEnd ?? 0;
    const whole = !el || from === to;
    const target = whole ? tex : tex.slice(from, to);
    const { latex } = applyFont(cmd, target);
    onTexChange(whole ? latex : tex.slice(0, from) + latex + tex.slice(to));
  }

  const preview = useMemo(() => {
    if (!editing || !tex.trim()) return "";
    try {
      return katex.renderToString(tex, { throwOnError: true, displayMode: !!display });
    } catch (e) {
      return `<span class="sk-err">${e instanceof Error ? e.message.replace(/^KaTeX parse error:\s*/, "") : "formule incorrecte"}</span>`;
    }
  }, [tex, display, editing]);

  const word = hint ? triggerFor(hint.id) : null;

  return (
    <div className="sk" role="group" aria-label="Clavier de symboles">
      {/* The formula being written, big enough to read at arm's length on a tablet. */}
      {editing && (
        <div className="sk-zone">
          <span className="sk-zone-l">fx</span>
          {tex.trim() ? (
            <span className="sk-zone-p" dangerouslySetInnerHTML={{ __html: preview }} />
          ) : (
            <span className="sk-zone-h">Touchez un symbole, ou tapez « somme », « racine », « matrice »…</span>
          )}
          <button className="sk-x" onClick={onClose} aria-label="Terminer la formule">OK</button>
        </div>
      )}

      {/* Callout 2 — the strip teaches the type-to-convert token for whatever was
          last pressed, so the palette works itself out of a job. */}
      <div className="sk-hint" aria-live="polite">
        {hint ? (
          <>
            <TexPreview tex={hint.tex} className="sk-hint-tex" />
            <span className="sk-hint-l">{hint.label}</span>
            <code>{hint.insert.trim()}</code>
            {word && <span className="sk-hint-w">ou tapez <b>{word}</b> puis espace</span>}
          </>
        ) : (
          <span className="sk-hint-idle">Les touches insèrent du LaTeX — la barre ci-dessous vous apprend le raccourci clavier de chacune.</span>
        )}
      </div>

      <div className="sk-groups" role="tablist" aria-label="Familles de symboles">
        {GROUPS.map((g) => (
          <button
            key={g.id}
            role="tab"
            aria-selected={!found && g.id === groupId}
            className={`sk-g${!found && g.id === groupId ? " on" : ""}`}
            title={g.label}
            aria-label={g.label}
            onClick={() => { setGroupId(g.id); setQuery(""); setRaw(false); }}
          >
            {CHIP[g.id] ?? g.label}
          </button>
        ))}
        <span className="sk-spacer" />
        <button
          className={`sk-g sk-tex${raw ? " on" : ""}`}
          onClick={() => setRaw((r) => !r)}
          disabled={!editing}
          title={editing ? "Écrire le LaTeX à la main" : "Ouvrez une formule d'abord"}
          aria-pressed={raw}
        >
          \TeX
        </button>
      </div>

      {raw && editing ? (
        <div className="sk-raw">
          <input
            ref={inputRef}
            className="sk-raw-i"
            value={tex}
            spellCheck="false"
            autoComplete="off"
            autoCapitalize="off"
            placeholder="\frac{a}{b}"
            aria-label="Formule LaTeX"
            onChange={onRawInput}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onClose(); } }}
          />
          <select
            className="sk-raw-f"
            value=""
            aria-label="Police mathématique"
            onChange={(e) => { applyFontChoice(e.target.value); e.target.value = ""; }}
          >
            <option value="">Police…</option>
            {MATH_FONTS.map((f) => <option key={f.cmd} value={f.cmd}>{f.label}</option>)}
          </select>
        </div>
      ) : (
        <>
          <div className="sk-search">
            <Icon name="search" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Chercher — « racine », « fraction », « réversible »…"
              aria-label="Chercher un symbole"
            />
            {query && <button className="sk-clear" onClick={() => setQuery("")} aria-label="Effacer la recherche"><Icon name="x" /></button>}
          </div>
          <div className="sk-keys" role="group" aria-label={found ? `Résultats pour ${query}` : group.label}>
            {keys.length === 0 && <p className="sk-none">Aucun symbole pour « {query} ».</p>}
            {keys.map((s) => (
              <button key={s.id} className="sk-k" onClick={() => press(s)} disabled={disabled} title={s.label} aria-label={s.label}>
                <TexPreview tex={s.tex} className="sk-k-tex" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
