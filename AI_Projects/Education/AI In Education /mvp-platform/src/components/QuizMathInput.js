"use client";
import { useRef, useState } from "react";
import Markdown from "@/components/Markdown";
import { pickSymbols } from "@/lib/symbols";
import "./QuizMathInput.css";

// Quiz text input with LaTeX support: a small ƒx toolbar inserts $…$ snippets
// at the caret and a live KaTeX preview renders underneath as soon as the value
// contains math. Used for question prompts, MCQ options and explanations.
//
// The snippets come from the shared palette rather than a list of their own. They
// used to be duplicated here, and had already drifted: this bar inserted "\le" while
// the lesson palette inserted "\leq" for the same button. Curating by id means the
// quiz surface inherits every correction and addition made to the palette.
const QUICK_IDS = ["frac", "pow", "sqrt", "times", "pi", "leq", "vec"];

// Wrapping a symbol for a markdown field: the quiz stores prose, so the LaTeX has to
// carry its own "$…$". `select` is the placeholder to overtype, offset into the
// wrapped snippet — the leading "$" shifts it by one.
const SNIPPETS = [
  // Not a symbol: the plain "make this maths" action, which needs a bare placeholder.
  { label: "ƒ", title: "Formule", snippet: "$x$", at: 1, len: 1 },
  ...pickSymbols(QUICK_IDS).map((s) => {
    const tex = s.insert.trim();
    return {
      label: s.short ?? s.label,
      title: s.label,
      snippet: `$${tex}$`,
      at: s.select ? s.select[0] + 1 : 1,
      len: s.select ? s.select[1] : tex.length,
    };
  }),
];

export default function QuizMathInput({ value, onChange, placeholder, multiline = false, compact = false, disabled = false, rows = 2 }) {
  const ref = useRef(null);
  const [focused, setFocused] = useState(false);
  const [fx, setFx] = useState(!compact);
  const v = value ?? "";
  const hasMath = v.includes("$");

  function insert(snip) {
    const el = ref.current;
    if (!el || disabled) return;
    const s = el.selectionStart ?? v.length;
    const e = el.selectionEnd ?? v.length;
    const sel = v.slice(s, e);
    // Wrap an existing selection in $…$, else insert the snippet and select its
    // placeholder so the teacher types over it directly.
    const text = sel ? `$${sel}$` : snip.snippet;
    const next = v.slice(0, s) + text + v.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      if (sel) {
        el.selectionStart = s + 1;
        el.selectionEnd = s + 1 + sel.length;
      } else {
        el.selectionStart = s + snip.at;
        el.selectionEnd = s + snip.at + snip.len;
      }
    });
  }

  const showToolbar = !disabled && (fx || focused);
  const showPreview = hasMath && (focused || !compact);
  const Field = multiline ? "textarea" : "input";

  return (
    <div className={`qmi ${compact ? "compact" : ""}`.trim()}>
      <div className="qmi-top">
        {showToolbar && (
          <div className="qmi-toolbar">
            {SNIPPETS.map((sn) => (
              <button key={sn.label} type="button" title={sn.title} tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()} onClick={() => insert(sn)}>
                {sn.label}
              </button>
            ))}
          </div>
        )}
        {compact && !disabled && (
          <button type="button" className={`qmi-fx ${fx ? "on" : ""}`} title="Insérer une formule LaTeX"
            onMouseDown={(e) => e.preventDefault()} onClick={() => setFx((x) => !x)}>
            ƒx
          </button>
        )}
      </div>
      <Field
        ref={ref}
        value={v}
        rows={multiline ? rows : undefined}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {showPreview && (
        <div className="qmi-preview">
          <Markdown>{v}</Markdown>
        </div>
      )}
    </div>
  );
}
