"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { findState } from "@/components/editor/findReplace";

// Rechercher et remplacer.
//
// Sits over the document rather than in the toolbar: it needs two fields and four
// buttons, and the toolbar is already 31 controls wide. Escape closes it and hands the
// caret back to the document, which is the same contract the formula editor and the
// menu bar keep.
export default function FindReplacePanel({ editor, onClose }) {
  const [term, setTerm] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Push the search into the plugin whenever it changes; clear it on the way out so no
  // highlights are left behind over a document the teacher is editing again.
  useEffect(() => {
    editor?.commands.setSearch(term, caseSensitive);
  }, [editor, term, caseSensitive]);

  useEffect(() => () => editor?.commands.setSearch("", false), [editor]);

  // The hit count lives in ProseMirror plugin state, which React knows nothing about —
  // without subscribing, the counter renders once and then reads "0 / 0" forever while
  // the highlights update perfectly well behind it.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!editor) return undefined;
    const bump = () => tick((n) => n + 1);
    editor.on("transaction", bump);
    return () => editor.off("transaction", bump);
  }, [editor]);

  const state = findState(editor);
  const count = state.matches.length;
  const position = count ? state.index + 1 : 0;

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) editor?.commands.findPrevious();
      else editor?.commands.findNext();
    }
  };

  return (
    <div className="lw-find" role="dialog" aria-label="Rechercher et remplacer" onKeyDown={onKeyDown}>
      <div className="lw-find-row">
        <input
          ref={inputRef}
          className="lw-find-in"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Rechercher"
          aria-label="Rechercher"
          spellCheck={false}
        />
        <span className={`lw-find-n${term && !count ? " none" : ""}`} aria-live="polite">
          {term ? `${position} / ${count}` : ""}
        </span>
        <button className="lw-btn" onClick={() => editor?.commands.findPrevious()} disabled={!count} title="Précédent (Maj+Entrée)" aria-label="Précédent">
          <Icon name="chevL" />
        </button>
        <button className="lw-btn" onClick={() => editor?.commands.findNext()} disabled={!count} title="Suivant (Entrée)" aria-label="Suivant">
          <Icon name="chevR" />
        </button>
        <button className="lw-btn" onClick={onClose} title="Fermer (Échap)" aria-label="Fermer">
          <Icon name="x" />
        </button>
      </div>

      <div className="lw-find-row">
        <input
          className="lw-find-in"
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          placeholder="Remplacer par"
          aria-label="Remplacer par"
          spellCheck={false}
        />
        <button className="btn btn-secondary btn-sm" onClick={() => editor?.commands.replaceCurrent(replacement)} disabled={!count}>
          Remplacer
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => editor?.commands.replaceAll(replacement)} disabled={!count}>
          Tout remplacer
        </button>
      </div>

      <label className="lw-find-case">
        <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
        Respecter la casse
      </label>
    </div>
  );
}
