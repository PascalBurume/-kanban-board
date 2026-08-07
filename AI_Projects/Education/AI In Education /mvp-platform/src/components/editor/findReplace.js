import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { findMatches, matchAfter, matchBefore } from "@/lib/findMatches";

// Find & replace over the document.
//
// Written here rather than taken from @tiptap-pro/extension-search-and-replace, which
// is paid and needs a registry token — impossible to install onto an offline school
// image. The matching rules live in lib/findMatches so they can be tested without an
// editor; this file is only the ProseMirror wiring.
//
// Positions are collected by walking text nodes, so formulas and figures are skipped
// for free: they are atoms whose tex lives in an attribute, not in the text content.
// That is the behaviour you want — replacing "x" everywhere must not silently rewrite
// the inside of every equation.

export const findKey = new PluginKey("mwalimuFind");

const EMPTY = { term: "", caseSensitive: false, matches: [], index: 0 };

// Every text node in the document, with its absolute start position.
function scan(doc, term, caseSensitive) {
  if (!term) return [];
  const out = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    for (const m of findMatches(node.text || "", term, caseSensitive)) {
      out.push({ from: pos + m.from, to: pos + m.to });
    }
    return true;
  });
  return out;
}

function decorate(state) {
  const { matches, index } = state;
  if (!matches.length) return DecorationSet.empty;
  return DecorationSet.create(
    state.doc,
    matches.map((m, i) =>
      Decoration.inline(m.from, m.to, { class: i === index ? "lw-find-hit lw-find-cur" : "lw-find-hit" })
    )
  );
}

export const FindReplace = Extension.create({
  name: "findReplace",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: findKey,
        state: {
          init: (_, editorState) => ({ ...EMPTY, doc: editorState.doc, decorations: DecorationSet.empty }),
          apply(tr, prev, _old, editorState) {
            const meta = tr.getMeta(findKey);
            // Re-scan when the search changes OR when the document does — otherwise a
            // replace leaves stale highlights pointing at moved text.
            if (!meta && !tr.docChanged) return prev;
            const next = { ...prev, ...(meta ?? {}) };
            if (meta?.term !== undefined || meta?.caseSensitive !== undefined || tr.docChanged) {
              next.matches = scan(editorState.doc, next.term, next.caseSensitive);
              next.index = Math.min(next.index, Math.max(next.matches.length - 1, 0));
            }
            next.doc = editorState.doc;
            next.decorations = decorate({ ...next, doc: editorState.doc });
            return next;
          },
        },
        props: {
          decorations: (state) => findKey.getState(state)?.decorations ?? DecorationSet.empty,
        },
      }),
    ];
  },

  addCommands() {
    const get = (state) => findKey.getState(state) ?? EMPTY;

    const select = (index) => ({ state, dispatch, view }) => {
      const s = get(state);
      const m = s.matches[index];
      if (!m) return false;
      if (dispatch) {
        const tr = state.tr.setMeta(findKey, { index });
        dispatch(tr);
        // Scroll the hit into view without stealing the caret from the search field.
        view?.dispatch(view.state.tr.setMeta("addToHistory", false).scrollIntoView());
      }
      return true;
    };

    return {
      setSearch:
        (term, caseSensitive = false) =>
        ({ state, dispatch }) => {
          if (dispatch) dispatch(state.tr.setMeta(findKey, { term, caseSensitive, index: 0 }));
          return true;
        },

      findNext:
        () =>
        (props) => {
          const s = get(props.state);
          if (!s.matches.length) return false;
          const from = s.matches[s.index]?.to ?? props.state.selection.from;
          return select(matchAfter(s.matches, from))(props);
        },

      findPrevious:
        () =>
        (props) => {
          const s = get(props.state);
          if (!s.matches.length) return false;
          const from = s.matches[s.index]?.from ?? props.state.selection.from;
          return select(matchBefore(s.matches, from))(props);
        },

      replaceCurrent:
        (replacement) =>
        ({ state, dispatch }) => {
          const s = get(state);
          const m = s.matches[s.index];
          if (!m) return false;
          if (dispatch) dispatch(state.tr.insertText(replacement, m.from, m.to));
          return true;
        },

      // ONE transaction, so one Ctrl+Z undoes the whole sweep. Replacing 40 occurrences
      // and then having to press undo 40 times is how a teacher loses trust in the
      // button. Applied last-to-first so earlier positions stay valid as text shifts.
      replaceAll:
        (replacement) =>
        ({ state, dispatch }) => {
          const s = get(state);
          if (!s.matches.length) return false;
          if (dispatch) {
            const tr = state.tr;
            for (let i = s.matches.length - 1; i >= 0; i--) {
              const m = s.matches[i];
              tr.insertText(replacement, m.from, m.to);
            }
            dispatch(tr);
          }
          return true;
        },
    };
  },
});

/** Read the current search state — the panel needs the hit count. */
export function findState(editor) {
  if (!editor) return EMPTY;
  return findKey.getState(editor.state) ?? EMPTY;
}
