"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
// Underline ships INSIDE StarterKit v3 — adding @tiptap/extension-underline as well
// registers it twice and doubles its keyboard shortcut.
import { TextStyle, Color } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import TextAlign from "@tiptap/extension-text-align";
import { TableKit } from "@tiptap/extension-table";
import { FindReplace } from "@/components/editor/findReplace";
import { RawHtml } from "@/components/editor/rawHtmlNode";
import { InlineMath, BlockMath } from "@/components/editor/mathNodes";
import { Figure } from "@/components/editor/figureNode";
import { Image } from "@/components/editor/imageNode";
import { defaultSpec } from "@/lib/figures";
import { mdToDoc, docToMd, canEditVisually } from "@/lib/lessonDoc";

// The lesson document, separated from the chrome that drives it.
//
// There are now two chromes over the same document — the desktop ribbon and the tablet
// dock of wireframe 1f — and they must not be two implementations of "what a lesson
// is". Everything about the document lives here; a chrome only decides what the
// controls look like and where they sit.
//
// The context machine (1a callout 3) is the other half. A lesson has three nested
// levels — the Document, a Formula inside it, and the full LaTeX editor over that
// same formula — and both chromes need the same answer to "where am I", the same
// Escape behaviour, and the same breadcrumb. Deriving it from the ProseMirror
// selection rather than storing it separately means it can never disagree with what
// is actually selected.
//
// "latex" is deliberately NOT a fourth kind of node. The big editor and the small
// inline field edit the very same blockMath/inlineMath node — only the surface
// differs — so a derivation written in one is editable in the other, and nothing new
// has to survive the markdown round trip.

/**
 * Every floating panel that edits the SELECTED node. One list, because a panel missing
 * from it looks finished and then closes itself the first time it is used — which is
 * what `.ep`, the épure editor, did on every drag.
 *   .fe  figure / épure panel chrome     .lx  LaTeX workspace     .ep  épure editor
 */
const PANEL_SEL = ".ep, .fe, .lx";

/**
 * Keep the document's selection while a control outside the editor is pressed.
 *
 * Every surface that acts on the SELECTED node — the symbol keyboard, the dock, the
 * palette, the drawing tools — has the same problem: pressing it blurs the editor,
 * ProseMirror drops the NodeSelection, and the surface unmounts. On a mouse that reads
 * as "the keyboard closed when I clicked a key". On a touchscreen it is worse: the dock
 * disappears between pointerdown and click, so the press never lands at all.
 *
 * Cancelling mousedown keeps focus in the editor, so the selection — and therefore the
 * surface — survives. Fields that genuinely need the caret are exempt, or the teacher
 * could not type in the search box or the LaTeX field.
 */
export function keepSelection(e) {
  if (e.target.closest("input, textarea, select, [contenteditable]")) return;
  e.preventDefault();
}

export const CONTEXTS = {
  doc: { label: "Document", crumb: "Document", chip: "Document" },
  math: { label: "Formule", crumb: "Formule (fx)", chip: "fx Formule" },
  latex: { label: "Éditeur LaTeX", crumb: "Éditeur LaTeX", chip: "∑ LaTeX" },
};

export function useLessonEditor({ value, onChange, disabled }) {
  // The gate judges the document as it ARRIVES, not every keystroke. Half-typed
  // LaTeX legitimately produces markdown that cannot round-trip — "\\" alone
  // serialises to "$\\$", an escaped dollar — and re-gating on that would throw the
  // teacher into the source editor in the middle of writing a formula.
  const [gate, setGate] = useState(() => canEditVisually(value || ""));
  const [mode, setMode] = useState(null); // 'visual' | 'source'
  const [mathSel, setMathSel] = useState(null); // { tex, display, anchor, pos }
  const [figSel, setFigSel] = useState(null); // { spec, pos, anchor }
  // Show the full LaTeX editor over the selected formula instead of the inline field.
  // A flag rather than a second selection: both surfaces edit the same math node, and
  // two sources of truth for "which formula" is how they end up disagreeing.
  const [latexOpen, setLatexOpen] = useState(false);
  const emitted = useRef(null); // last markdown WE produced, to ignore our own echo
  const modeRef = useRef(null); // read inside TipTap callbacks, which capture stale state
  const writingBack = useRef(false); // true while a panel is saving into the document
  const seeded = useRef(false); // has the editor emitted its very first update yet?
  // Did the interaction in progress START inside a panel? See the guard in
  // onSelectionUpdate — this is the signal that survives an async re-render, which
  // neither `writingBack` (synchronous only) nor activeElement (the document keeps
  // focus, because the handles preventDefault) does.
  const fromPanel = useRef(false);

  // Choose the mode from the document as it first arrives — and if the content later
  // becomes unsafe to represent visually (Copilot inserting a table, say), drop back
  // to source rather than let the editor quietly discard what it cannot model.
  useEffect(() => {
    if (mode === null) setMode(gate.ok ? "visual" : "source");
    else if (!gate.ok && mode === "visual") setMode("source");
  }, [gate.ok, mode]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Re-gate only when the document is replaced from outside (Copilot, a reload) —
  // never for the teacher's own edits.
  useEffect(() => {
    if (value === emitted.current) return;
    setGate(canEditVisually(value || ""));
  }, [value]);

  const editor = useEditor({
    editable: !disabled,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: {}, link: { openOnClick: false } }),
      // Every one of these has exactly one spelling in lessonDoc's inline-HTML
      // dialect. Nothing may be enabled here that the serialiser cannot write back —
      // a mark with no markdown form silently fails the round-trip gate and drops the
      // teacher into source mode.
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      TextAlign.configure({ types: ["paragraph", "heading"] }),
      // resizable:false on purpose — a column width has nowhere to live in a GFM pipe
      // table, so a teacher who dragged one would watch it snap back on reload. Cell
      // merging is absent for the same reason: GFM has no colspan.
      TableKit.configure({ table: { resizable: false } }),
      FindReplace,
      RawHtml,
      InlineMath,
      BlockMath,
      Figure,
      Image,
    ],
    content: mdToDoc(value || "").doc,
    immediatelyRender: false,
    editorProps: { attributes: { class: "lw-prose" } },
    onUpdate({ editor }) {
      // ProseMirror emits once on creation, and it emits whatever it could model —
      // which, for a lesson holding an SVG figure, is the lesson MINUS the figure.
      // Only the surface the teacher is actually using may write back.
      if (modeRef.current !== "visual") return;

      // That first emit is the editor loading the document, NOT the teacher editing it,
      // and it must never reach the server. Loading a lesson re-serialises it, and the
      // result is not always byte-identical to what was stored — a serialiser that has
      // learned a new construct, or a document that only just started round-tripping,
      // both produce a diff on open. Writing that back turns "I opened a lesson" into
      // "I edited a lesson", and an editor left open on a page that reloads then
      // rewrites the teacher's work with nobody touching the keyboard.
      if (!seeded.current) {
        seeded.current = true;
        emitted.current = docToMd(editor.getJSON());
        return;
      }

      const md = docToMd(editor.getJSON());
      emitted.current = md;
      onChange(md);
    },
    onSelectionUpdate({ editor }) {
      // A panel saving into the document fires this callback, and setNodeMarkup maps
      // the NodeSelection through its own step — so by the time we get here the node is
      // no longer "selected" and acting on that would close the panel out from under
      // the teacher, mid-formula.
      //
      // This used to test where focus was. That worked for the desktop formula editor,
      // whose input really does take focus, and failed for every touch surface: a tap
      // on a dock key deliberately keeps focus in the document (see keepSelection), and
      // buttons do not take focus on tap at all on iPadOS. Latching around our OWN
      // write is the thing that is actually true in both cases.
      if (writingBack.current) return;
      // WHERE THE INTERACTION STARTED, not where focus is now, and not just for the
      // duration of our own write. Dragging a point in the épure panel closed the panel
      // on the first drag: the handles preventDefault so the document keeps focus (the
      // activeElement test below sees ProseMirror and lets the close through), and the
      // selection update that kills it arrives ~40ms AFTER pointerup, long past the
      // synchronous `writingBack` latch. A pointer that went down in a panel is editing
      // that panel until it goes down somewhere else.
      if (fromPanel.current) return;
      // `.ep` was missing here — the épure panel is the third panel and was never added.
      if (typeof document !== "undefined" && document.activeElement?.closest?.(PANEL_SEL)) return;
      const n = editor.state.selection.node;
      // Every panel anchors to the node it edits — a panel pinned to the top of the
      // pane sits 800px from its figure in a long lesson.
      const anchorFor = () => {
        try {
          const dom = editor.view.nodeDOM(editor.state.selection.from);
          const host = editor.view.dom.closest(".lw-canvas") || editor.view.dom;
          if (!dom?.getBoundingClientRect) return null;
          const r = dom.getBoundingClientRect(), h = host.getBoundingClientRect();
          return { top: r.bottom - h.top + host.scrollTop + 6, left: Math.max(8, r.left - h.left) };
        } catch {
          return null;
        }
      };
      const kind = n?.type.name;
      if (kind === "figure") {
        setMathSel(null);
        setFigSel({ spec: n.attrs.spec, pos: editor.state.selection.from, anchor: anchorFor() });
        return;
      }
      setFigSel(null);
      if (kind !== "inlineMath" && kind !== "blockMath") {
        setMathSel(null);
        // The big editor is bound to a formula; with none selected there is nothing
        // for it to be open over.
        setLatexOpen(false);
        return;
      }
      // Remember WHERE the formula is. Once focus moves into the formula field the
      // editor's own selection collapses, so "the selected node" is no longer a
      // usable handle for writing the change back.
      setMathSel({ tex: n.attrs.tex, display: kind === "blockMath" || !!n.attrs.display, anchor: anchorFor(), pos: editor.state.selection.from });
    },
  }, []);

  // Who owns the interaction in progress: the document, or a panel floating over it.
  // Capture phase, so it is settled before any handler — ours or ProseMirror's — runs,
  // and it stays set until the pointer next goes down somewhere else, which is what lets
  // it outlive the asynchronous re-render at the end of a drag. focusin covers the
  // keyboard route into a panel, where no pointer is involved at all.
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const inPanel = (t) => !!(t instanceof Element && t.closest(PANEL_SEL));
    const onDown = (e) => { fromPanel.current = inPanel(e.target); };
    const onFocus = (e) => { fromPanel.current = inPanel(e.target); };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("focusin", onFocus, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("focusin", onFocus, true);
    };
  }, []);

  // Content replaced from outside (Copilot inserting a draft) → reload the document.
  // Our own edits are skipped, or every keystroke would reset the caret.
  useEffect(() => {
    if (!editor || mode !== "visual") return;
    if (value === emitted.current) return;
    editor.commands.setContent(mdToDoc(value || "").doc, { emitUpdate: false });
  }, [value, editor, mode]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  // ── the context machine ──
  //
  // Depth is a property of the selection, not a second piece of state that has to be
  // kept in sync with it. `exitCtx` puts the caret back in the document, which is
  // exactly what "Esc — exit to Document" means.
  const ctx = mathSel && latexOpen ? "latex" : mathSel ? "math" : "doc";

  const exitCtx = useCallback(() => {
    setMathSel(null);
    setFigSel(null);
    setLatexOpen(false);
    editor?.chain().focus().run();
  }, [editor]);

  useEffect(() => {
    if (ctx === "doc") return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      // A panel that handles its own Escape (the formula field) has already stopped
      // the event; reaching here means nothing nearer claimed it.
      e.preventDefault();
      exitCtx();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ctx, exitCtx]);

  // ── document commands ──

  const chain = useCallback(() => editor?.chain().focus(), [editor]);
  const active = useCallback((name, attrs) => !!editor?.isActive(name, attrs), [editor]);

  // Inserting at a NodeSelection REPLACES the selected node. A teacher who has a
  // figure selected and picks a new type from the menu would silently lose the old
  // one, so insert AFTER the selection instead.
  const insertAfterSelection = useCallback((content) => {
    if (!editor) return;
    const { selection } = editor.state;
    const c = editor.chain().focus();
    if (selection.node) c.insertContentAt(selection.to, content).run();
    else c.insertContent(content).run();
  }, [editor]);

  // Aa — the OCR'd book headings arrive in wildly inconsistent case, so this earns
  // its place. A pure text transform: no storage implication at all.
  const changeCase = useCallback((how) => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const text = editor.state.doc.textBetween(from, to, " ");
    const next =
      how === "upper" ? text.toLocaleUpperCase("fr")
      : how === "lower" ? text.toLocaleLowerCase("fr")
      : text.replace(/\p{L}[\p{L}\p{M}'’-]*/gu, (w) => w[0].toLocaleUpperCase("fr") + w.slice(1).toLocaleLowerCase("fr"));
    if (next === text) return;
    editor.chain().focus().insertContentAt({ from, to }, next).run();
  }, [editor]);

  // Strip every mark the dialect knows about. TipTap's unsetAllMarks misses the ones
  // carried as node attributes, so alignment is cleared separately.
  const clearFormatting = useCallback(() => {
    editor?.chain().focus().unsetAllMarks().unsetTextAlign().run();
  }, [editor]);

  const setAlign = useCallback((align) => {
    // Toggling the active one back off returns to the default rather than writing an
    // explicit "left", which would put a redundant <div> in the markdown.
    if (!editor) return;
    if (editor.isActive({ textAlign: align })) editor.chain().focus().unsetTextAlign().run();
    else editor.chain().focus().setTextAlign(align).run();
  }, [editor]);

  const setColor = useCallback((hex) => {
    if (!editor) return;
    if (hex) editor.chain().focus().setColor(hex).run();
    else editor.chain().focus().unsetColor().run();
  }, [editor]);

  const setHighlight = useCallback((hex) => {
    if (!editor) return;
    if (hex) editor.chain().focus().setHighlight({ color: hex }).run();
    else editor.chain().focus().unsetHighlight().run();
  }, [editor]);

  // Links round-tripped through lessonDoc from the start, but nothing could CREATE
  // one — no button, no menu item, no command — so the feature existed only for
  // markdown that arrived already containing it.
  //
  // window.prompt rather than a bespoke popover: it needs no network, no new surface,
  // and works identically on the tablet. Worth replacing with an inline field if link
  // editing ever becomes common.
  const setLink = useCallback(() => {
    if (!editor) return;
    const current = editor.getAttributes("link")?.href ?? "";
    const href = window.prompt("Adresse du lien (laisser vide pour retirer le lien)", current);
    if (href === null) return; // cancelled
    const url = href.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    // A bare "example.org" would resolve against the school server and 404.
    const safe = /^(https?:|mailto:|\/)/i.test(url) ? url : `https://${url}`;
    editor.chain().focus().extendMarkRange("link").setLink({ href: safe }).run();
  }, [editor]);

  const insertTable = useCallback((rows = 3, cols = 3) => {
    // withHeaderRow always: GFM requires a header, so a table without one could not be
    // written back at all.
    editor?.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
  }, [editor]);

  const tableCmd = useCallback((cmd) => {
    const c = editor?.chain().focus();
    if (!c) return;
    ({
      rowBefore: () => c.addRowBefore().run(),
      rowAfter: () => c.addRowAfter().run(),
      rowDelete: () => c.deleteRow().run(),
      colBefore: () => c.addColumnBefore().run(),
      colAfter: () => c.addColumnAfter().run(),
      colDelete: () => c.deleteColumn().run(),
      delete: () => c.deleteTable().run(),
    })[cmd]?.();
  }, [editor]);

  const inTable = useCallback(() => Boolean(editor?.isActive("table")), [editor]);

  const insertRule = useCallback(() => {
    editor?.chain().focus().setHorizontalRule().run();
  }, [editor]);

  const insertCodeBlock = useCallback(() => {
    editor?.chain().focus().toggleCodeBlock().run();
  }, [editor]);

  const setBlock = useCallback((kind) => {
    if (kind === "p") chain()?.setParagraph().run();
    else if (kind === "h2") chain()?.toggleHeading({ level: 2 }).run();
    else chain()?.toggleHeading({ level: 3 }).run();
  }, [chain]);

  // Select the empty formula that was just inserted. The position has to be found
  // AFTER the insert transaction lands — the pre-transaction offset resolves to the
  // paragraph, not the new node.
  const selectNewMath = useCallback((typeName) => {
    if (!editor) return;
    requestAnimationFrame(() => {
      try {
        let at = null;
        editor.state.doc.descendants((node, pos) => {
          if (at != null) return false;
          if (node.type.name === typeName && !String(node.attrs.tex || "").trim()) at = pos;
          return at == null;
        });
        if (at != null) editor.commands.setNodeSelection(at);
      } catch {
        /* document moved under us — the teacher can still click the formula */
      }
    });
  }, [editor]);

  // Insert a formula AND select it, so the editor opens on it ready to type.
  //
  // It used to drop a node holding the placeholder "x" and leave the selection where
  // it was: the button looked like it had done nothing, and the only way into the new
  // formula was to spot it and click it. Empty rather than "x" for the same reason —
  // the teacher types their formula instead of clearing a stand-in first. An abandoned
  // empty formula costs nothing: blockToMd drops it.
  const insertFormula = useCallback((display) => {
    const typeName = display ? "blockMath" : "inlineMath";
    insertAfterSelection({ type: typeName, attrs: { tex: "" } });
    selectNewMath(typeName);
  }, [insertAfterSelection, selectNewMath]);

  const insertFigure = useCallback((kind) => {
    insertAfterSelection({ type: "figure", attrs: { spec: defaultSpec(kind) } });
  }, [insertAfterSelection]);

  // Same node type as a chart — an épure is a `figure` whose spec.type is "epure", so
  // it inherits the ```figure storage, the round-trip gate and the student renderer.
  // Deep-copied: the templates are module constants, and handing one out by reference
  // would let the first edit rewrite the template for every later insert.
  const insertEpure = useCallback((spec) => {
    insertAfterSelection({ type: "figure", attrs: { spec: JSON.parse(JSON.stringify(spec)) } });
  }, [insertAfterSelection]);

  // Through insertAfterSelection, NOT a bare insertContent. An image is inline and
  // does land at the caret — but when the selection is a NodeSelection, insertContent
  // REPLACES the selected node, and on a lesson opened but never clicked into that
  // selection is the épure at the top. Inserting a photo then silently deleted a
  // hand-drawn figure that cannot be rebuilt.
  const insertImage = useCallback((attrs) => {
    if (!attrs?.src) return;
    insertAfterSelection({ type: "image", attrs: { src: attrs.src, alt: attrs.alt ?? "", width: attrs.width ?? null } });
  }, [insertAfterSelection]);

  // Open the full LaTeX editor. On a formula that is already selected it takes over
  // that one; otherwise it starts a display formula and opens on that, so the button
  // does something useful from anywhere in the document rather than being inert until
  // the teacher has guessed they must select a formula first.
  //
  // Selecting the new node is what gives the panel something to edit, and — as in the
  // "$" input rule — the position has to be found AFTER the insert transaction lands,
  // because the pre-transaction offset resolves to the paragraph, not the new node.
  // An abandoned empty formula costs nothing: blockToMd drops it.
  const openLatex = useCallback(() => {
    if (mathSel) {
      setLatexOpen(true);
      return;
    }
    if (!editor) return;
    insertAfterSelection({ type: "blockMath", attrs: { tex: "" } });
    setLatexOpen(true);
    requestAnimationFrame(() => {
      try {
        let at = null;
        editor.state.doc.descendants((node, pos) => {
          if (at != null) return false;
          if (node.type.name === "blockMath" && !String(node.attrs.tex || "").trim()) at = pos;
          return at == null;
        });
        if (at != null) editor.commands.setNodeSelection(at);
      } catch {
        /* document moved under us — the teacher can still click the formula */
      }
    });
  }, [mathSel, editor, insertAfterSelection]);

  // Drop Copilot output in at the caret rather than at the end of the document.
  // The markdown goes through mdToDoc so formulas arrive as real math nodes, not
  // literal "$x^2$" text. If the AI emitted something markdown-first editing cannot
  // model (a table), mdToDoc reports it and the caller falls back to appending the
  // source — silently dropping it would be worse than a visible mode switch.
  const insertMarkdown = useCallback((md) => {
    if (!editor || !md?.trim()) return false;
    const { doc, unsupported } = mdToDoc(md);
    if (unsupported.length || !doc.content?.length) return false;
    insertAfterSelection(doc.content);
    return true;
  }, [editor, insertAfterSelection]);

  // Write a node's attrs by position, and deliberately NOT .focus(): the teacher is
  // typing in a panel, and pulling focus back to the document would send their next
  // keystroke — and their Enter — into the lesson text.
  //
  // The latch is what keeps the panel open: this transaction re-maps the selection, and
  // without it onSelectionUpdate would read the result as "the teacher selected
  // something else" and shut the panel after every single symbol they press.
  const updateNodeAt = useCallback((pos, typeNames, attrs) => {
    if (!editor || pos == null) return;
    writingBack.current = true;
    try {
      editor.commands.command(({ tr }) => {
        // Bounds FIRST: doc.nodeAt throws RangeError for a position past the end, it
        // does not return null, so the `!node` guard below never sees that case.
        //
        // A panel holds the position its node was at when it opened. Anything that
        // shortens the document without moving the selection — an undo, a Copilot
        // insert that replaces a block, reloading the lesson from the server — leaves
        // that position dangling, and the next keystroke in the panel threw. The épure
        // panel made it easy to hit because it writes on every drag frame.
        if (pos < 0 || pos >= tr.doc.content.size) return false;
        const node = tr.doc.nodeAt(pos);
        if (!node || !typeNames.includes(node.type.name)) return false;
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
        return true;
      });
    } finally {
      writingBack.current = false;
    }
  }, [editor]);

  /**
   * The formula the teacher is pointing at, for Copilot to work on.
   *
   * "Simplifie ça" means the formula they selected, not the whole lesson — and the
   * selection in a visual editor is a NodeSelection on a maths node, not a text range,
   * so there is nothing to slice out of the markdown the way the source editor does.
   */
  const getSelectedTex = useCallback(() => mathSel?.tex ?? "", [mathSel?.tex]);

  /**
   * Put a formula Copilot wrote into the document: over the selected one if there is
   * one, otherwise as a new display formula at the caret. Replacing is what the teacher
   * asked for when they selected a formula and typed "simplifie ça" — inserting a
   * second copy beside it would be a strange reading of that.
   */
  const applyFormula = useCallback((tex) => {
    const t = String(tex ?? "").trim();
    if (!t || !editor) return;
    if (mathSel) { updateMathRef.current?.(t); return; }
    insertAfterSelection({ type: "blockMath", attrs: { tex: t } });
  }, [editor, mathSel, insertAfterSelection]);

  // updateMath is declared below; a ref keeps applyFormula from depending on
  // declaration order without hoisting a useCallback out of its logical place.
  const updateMathRef = useRef(null);

  const updateMath = useCallback((tex) => {
    setMathSel((s) => (s ? { ...s, tex } : { tex }));
    updateNodeAt(mathSel?.pos, ["inlineMath", "blockMath"], { tex });
  }, [mathSel?.pos, updateNodeAt]);
  updateMathRef.current = updateMath;

  const updateFigure = useCallback((spec) => {
    setFigSel((f) => (f ? { ...f, spec } : f));
    updateNodeAt(figSel?.pos, ["figure"], { spec });
  }, [figSel?.pos, updateNodeAt]);

  // Inserting a symbol when a formula is open appends into it; otherwise it starts a
  // new inline formula, so a symbol key is never a dead press.
  const insertSymbol = useCallback((sym) => {
    const tex = sym.insert.trim();
    if (mathSel) {
      updateMath(`${mathSel.tex} ${tex}`.trim());
      return;
    }
    // Guarded like every other insert: `mathSel` covers a selected FORMULA, but a
    // selected épure or figure is a NodeSelection too, and a bare insertContent would
    // replace it. On a lesson opened and not yet clicked into, that selection is the
    // first node — so the first symbol pressed would delete the figure at the top.
    insertAfterSelection({ type: "inlineMath", attrs: { tex } });
  }, [mathSel, updateMath, insertAfterSelection]);

  return {
    editor, mode, setMode, gate,
    ctx, exitCtx,
    mathSel, figSel, latexOpen,
    setMathSel, setFigSel, setLatexOpen,
    chain, active, setBlock,
    insertFormula, insertFigure, insertEpure, insertImage, openLatex, insertSymbol, insertMarkdown,
    getSelectedTex, applyFormula,
    changeCase, clearFormatting, setAlign, setColor, setHighlight,
    setLink, insertRule, insertCodeBlock, insertTable, tableCmd, inTable,
    updateMath, updateFigure,
    emitted,
  };
}
