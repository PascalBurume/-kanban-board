"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import katex from "katex";
import { MATH_GROUPS, CHEM_GROUPS, STRUCT_GROUPS, MATH_FONTS, applyFont, searchSymbols } from "@/lib/symbols";
import { expandTrigger, triggerWords } from "@/lib/mathInput";
import { toast } from "@/lib/toast";

// The formula editor, anchored to the formula it edits.
//
// It used to be a bar pinned to the top of the pane, which meant looking 600px away
// from the thing you were changing. It now sits under the formula, and it is the
// keyboard surface: focus arrives here automatically when a formula is selected, so
// typing "$" in the document and then typing "\frac" never involves the mouse.

const ALL_GROUPS = [...MATH_GROUPS, ...STRUCT_GROUPS, ...CHEM_GROUPS];

const TRIGGERS = triggerWords();

// The fragment the teacher is part-way through typing — either a "\command", or a
// bare word that is on its way to becoming one ("som…" → somme). The bare form only
// counts while it is still a prefix of something real, so ordinary variable names do
// not pop a menu over the formula.
function trailingCommand(text, caret) {
  const before = text.slice(0, caret);
  const cmd = before.match(/\\([a-zA-Zé]*)$/);
  if (cmd) return { word: cmd[1], from: caret - cmd[0].length, to: caret };

  const bare = before.match(/([a-zA-Zé]{2,})$/);
  if (!bare) return null;
  const word = bare[1].toLowerCase();
  if (!TRIGGERS.some((t) => t.toLowerCase().startsWith(word))) return null;
  return { word: bare[1], from: caret - bare[1].length, to: caret };
}

// "{a}" placeholders left by a snippet — Tab walks between them.
function nextPlaceholder(text, from) {
  const re = /\{([a-zA-Z][a-zA-Z0-9]{0,2})\}/g;
  let m;
  while ((m = re.exec(text))) {
    if (m.index + 1 >= from) return { from: m.index + 1, to: m.index + 1 + m[1].length };
  }
  re.lastIndex = 0;
  m = re.exec(text);
  return m ? { from: m.index + 1, to: m.index + 1 + m[1].length } : null;
}

function Preview({ tex, display }) {
  const html = useMemo(() => {
    if (!tex.trim()) return "";
    try {
      return katex.renderToString(tex, { throwOnError: true, displayMode: !!display });
    } catch (e) {
      return `<span class="fe-err">${e instanceof Error ? e.message.replace(/^KaTeX parse error:\s*/, "") : "formule incorrecte"}</span>`;
    }
  }, [tex, display]);
  if (!tex.trim()) return <span className="fe-hint">Tapez « somme », « racine », « matrice »… ou « \ » pour chercher un symbole</span>;
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

// `onExpand` escalates to the full LaTeX editor on the SAME formula. A teacher who
// starts a derivation in this one-line field hits its limit within a few keystrokes;
// without a way out they retype the whole thing somewhere else.
export default function FormulaEditor({ tex, display, anchor, onChange, onClose, onExpand }) {
  const [menuIndex, setMenuIndex] = useState(0);
  const inputRef = useRef(null);
  const [caret, setCaret] = useState(tex.length);

  // Focus lands here the moment a formula is selected — that is what makes typing
  // "$" in the document flow straight into writing maths.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [anchor]);

  const frag = trailingCommand(tex, caret);
  const matches = useMemo(() => {
    if (!frag) return [];
    return searchSymbols(ALL_GROUPS, frag.word).flatMap((g) => g.items).slice(0, 8);
  }, [frag?.word]);

  useEffect(() => setMenuIndex(0), [frag?.word]);

  function apply(sym, liveFrag, liveText) {
    const base = liveText ?? tex;
    const frag = liveFrag || trailingCommand(base, caret);
    if (!frag) return;
    const next = base.slice(0, frag.from) + sym.insert.trimEnd() + base.slice(frag.to);
    onChange(next);
    const at = frag.from + (sym.select ? sym.select[0] : sym.insert.trimEnd().length);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const len = sym.select ? sym.select[1] : 0;
      el.setSelectionRange(at, at + len);
      setCaret(at + len);
    });
  }

  // Type-to-convert: "sum" + a boundary character becomes \sum_{i=1}^{n} with the
  // caret on the index. Applied as one ordinary edit, so Ctrl+Z brings back the word
  // the teacher actually typed.
  function applyReplacement(r, base) {
    const next = base.slice(0, r.from) + r.insert + base.slice(r.to);
    onChange(next);
    const at = r.select ? r.select[0] : r.from + r.insert.length;
    const len = r.select ? r.select[1] : 0;
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(at, at + len);
      setCaret(at + len);
    });
  }

  function onInput(e) {
    const value = e.target.value;
    const at = e.target.selectionStart ?? value.length;
    const r = expandTrigger(value, at);
    if (r) {
      applyReplacement(r, value);
      return;
    }
    onChange(value);
    setCaret(at);
  }

  // Applying an alphabet wraps what the teacher has SELECTED, or the whole formula if
  // they have selected nothing — which is what "make this bold" means when you have
  // not highlighted anything.
  function applyFontChoice(cmd) {
    const el = inputRef.current;
    if (!cmd || !el) return;
    const from = el.selectionStart ?? 0;
    const to = el.selectionEnd ?? 0;
    const whole = from === to;
    const target = whole ? tex : tex.slice(from, to);
    const { latex, select } = applyFont(cmd, target);
    const base = whole ? 0 : from;
    const next = whole ? latex : tex.slice(0, from) + latex + tex.slice(to);
    onChange(next);
    requestAnimationFrame(() => {
      const i = inputRef.current;
      if (!i) return;
      i.focus();
      i.setSelectionRange(base + select[0], base + select[0] + select[1]);
      setCaret(base + select[0] + select[1]);
    });
  }

  // Schools reach this app over plain http on the LAN, where navigator.clipboard is
  // undefined — so the legacy path is not a rare fallback here, it is the normal one.
  //
  // execCommand("copy") is only permitted while the user gesture is still live, which
  // means it must NOT run after an await. Checking for the async API synchronously and
  // branching before any await is what makes the offline path actually work.
  function legacyCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    inputRef.current?.focus();
    return ok;
  }

  function report(ok) {
    toast(ok ? "LaTeX copié ✓" : "Copie impossible", { icon: ok ? "check" : "alert" });
  }

  function copyLatex() {
    const text = tex.trim();
    if (!text) return;
    if (!navigator.clipboard?.writeText) {
      report(legacyCopy(text));
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => report(true),
      // Last resort: the gesture is already spent, so this may itself be refused.
      // Reporting the real outcome beats claiming a copy that did not happen.
      () => report(legacyCopy(text))
    );
  }

  function onKeyDown(e) {
    // Ctrl/Cmd+Shift+J — copy the LaTeX. Checked before the autocomplete keys so it
    // works while the suggestion menu is open.
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "j") {
      e.preventDefault();
      copyLatex();
      return;
    }
    // Read the caret from the input itself rather than from React state: state can
    // lag a fast typist by a render, and a stale caret makes Enter close the editor
    // instead of accepting the highlighted symbol.
    const liveFrag = trailingCommand(e.currentTarget.value, e.currentTarget.selectionStart ?? 0);
    const live = liveFrag ? searchSymbols(ALL_GROUPS, liveFrag.word).flatMap((g) => g.items).slice(0, 8) : [];
    if (live.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMenuIndex((i) => (i + 1) % live.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMenuIndex((i) => (i - 1 + live.length) % live.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); apply(live[Math.min(menuIndex, live.length - 1)], liveFrag, e.currentTarget.value); return; }
    }
    if (e.key === "Tab") {
      const el = e.currentTarget;
      const p = nextPlaceholder(tex, el.selectionEnd);
      if (p) { e.preventDefault(); el.setSelectionRange(p.from, p.to); setCaret(p.to); return; }
    }
    if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
      e.preventDefault();
      onClose();
    }
  }

  const style = anchor ? { top: anchor.top, left: anchor.left } : undefined;

  return (
    <div className="fe" style={style} role="dialog" aria-label="Modifier la formule">
      <div className="fe-row">
        <label className="fe-l" htmlFor="fe-input">Formule</label>
        <input
          id="fe-input"
          ref={inputRef}
          value={tex}
          spellCheck="false"
          autoComplete="off"
          placeholder="\frac{a}{b}"
          onChange={onInput}
          onKeyUp={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onClick={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onKeyDown={onKeyDown}
        />
        <button className="fe-done" onClick={onClose} title="Terminer (Échap)">OK</button>
      </div>

      <div className="fe-row fe-tools">
        <select
          className="fe-font"
          value=""
          aria-label="Police mathématique"
          title="Appliquer une police à la sélection, ou à toute la formule"
          onChange={(e) => { applyFontChoice(e.target.value); e.target.value = ""; }}
        >
          <option value="">Police…</option>
          {MATH_FONTS.map((f) => (
            <option key={f.cmd} value={f.cmd}>{f.label}</option>
          ))}
        </select>
        <button className="fe-copy" onClick={copyLatex} disabled={!tex.trim()} title="Copier le LaTeX (Ctrl+Maj+J)">
          Copier le LaTeX
        </button>
        {onExpand && (
          <button className="fe-copy" onClick={onExpand} title="Ouvrir l'éditeur LaTeX — plusieurs lignes, aperçu, Copilot">
            Éditeur LaTeX
          </button>
        )}
      </div>

      <div className="fe-preview"><Preview tex={tex} display={display} /></div>

      {matches.length > 0 && (
        <ul className="fe-menu" role="listbox" aria-label="Symboles proposés">
          {matches.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === menuIndex} className={i === menuIndex ? "on" : ""}
                onMouseDown={(e) => { e.preventDefault(); apply(s); }}>
              <span className="fe-menu-tex" dangerouslySetInnerHTML={{ __html: katex.renderToString(s.tex, { throwOnError: false }) }} />
              <span className="fe-menu-l">{s.label}</span>
              <code>{s.insert.trim()}</code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
