import { Node, InputRule } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import katex from "katex";

// Maths as first-class document nodes rather than raw "$…$" text.
//
// Both are atoms: the caret cannot land inside the LaTeX, so a teacher can never
// half-delete "\frac{" and silently break the formula. Selecting one opens the
// formula editor, which is the only way to change its source.
//
// Entry is keyboard-first, the way mathcha.io works: type "$" and you are writing
// maths. A teacher writing thirty formulas in a lesson cannot be made to aim at a
// toolbar thirty times.

function mathNodeView(tag, className) {
  return ({ node, editor, getPos }) => {
    const dom = document.createElement(tag);
    dom.className = className;
    // Reachable by keyboard. KaTeX emits MathML alongside its visual output, so a
    // screen reader reads the maths itself — we must not paper over that with an
    // aria-label of raw LaTeX.
    dom.setAttribute("tabindex", "0");
    dom.setAttribute("role", "math");

    let current = node;
    const draw = () => {
      const tex = current.attrs.tex || "";
      dom.removeAttribute("aria-label");
      if (!tex.trim()) {
        dom.textContent = "formule vide";
        dom.classList.add("empty");
        dom.setAttribute("aria-label", "Formule vide, appuyez sur Entrée pour la modifier");
        return;
      }
      dom.classList.remove("empty");
      try {
        katex.render(tex, dom, { throwOnError: true, displayMode: className.includes("block") });
        dom.classList.remove("bad");
      } catch {
        // Keep the broken source visible — hiding it is how a lesson ships wrong.
        dom.textContent = tex;
        dom.classList.add("bad");
        dom.setAttribute("aria-label", `Formule incorrecte : ${tex}`);
      }
    };
    draw();

    // Enter opens the editor, matching what a click does.
    dom.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      const pos = typeof getPos === "function" ? getPos() : null;
      if (pos == null) return;
      const { state, dispatch } = editor.view;
      dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)));
      editor.view.focus();
    });

    return {
      dom,
      update(updated) {
        if (updated.type.name !== current.type.name) return false;
        current = updated;
        draw();
        return true;
      },
      // KaTeX output is generated markup; ProseMirror must not try to parse it.
      ignoreMutation: () => true,
    };
  };
}

// Typing "$" starts a formula and selects it, which opens the formula editor with
// focus already in the LaTeX field — so the next keystroke is maths, not prose.
function dollarInputRule(type, editor) {
  return new InputRule({
    find: /\$$/,
    handler: ({ range, chain }) => {
      chain()
        .deleteRange(range)
        .insertContentAt(range.from, { type: type.name, attrs: { tex: "" } })
        .run();
      // Selecting the new node is what opens the formula editor, so the teacher's
      // next keystroke lands in the LaTeX field instead of back in the prose.
      // It has to happen after the rule's own transaction lands, or the position
      // is computed against a document that no longer exists.
      requestAnimationFrame(() => {
        try {
          // Don't trust the pre-transaction offset — it resolves to the paragraph,
          // not the new node. There is only ever one blank formula (the one just
          // typed), so find it.
          let at = null;
          editor.state.doc.descendants((node, pos) => {
            if (at != null) return false;
            if (node.type.name === type.name && !String(node.attrs.tex || "").trim()) at = pos;
            return at == null;
          });
          if (at != null) editor.commands.setNodeSelection(at);
        } catch {
          /* document moved under us — leave the caret where it is */
        }
      });
    },
  });
}

export const InlineMath = Node.create({
  name: "inlineMath",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      tex: { default: "" },
      // Remembers that the author wrote "$$…$$" inline, so it serialises back the same.
      display: { default: false },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-tex]", getAttrs: (el) => ({ tex: el.getAttribute("data-tex") || "" }) }];
  },
  renderHTML({ node }) {
    return ["span", { "data-tex": node.attrs.tex, class: "lw-math" }, node.attrs.tex];
  },
  addNodeView() {
    return mathNodeView("span", "lw-math");
  },
  addInputRules() {
    return [dollarInputRule(this.type, this.editor)];
  },
  addKeyboardShortcuts() {
    return {
      // Restores the shortcut that existed before the editor moved to ProseMirror.
      "Mod-m": () => this.editor.chain().focus().insertContent({ type: this.name, attrs: { tex: "" } }).run(),
    };
  },
});

export const BlockMath = Node.create({
  name: "blockMath",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return { tex: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "div[data-tex]", getAttrs: (el) => ({ tex: el.getAttribute("data-tex") || "" }) }];
  },
  renderHTML({ node }) {
    return ["div", { "data-tex": node.attrs.tex, class: "lw-math-block" }, node.attrs.tex];
  },
  addNodeView() {
    return mathNodeView("div", "lw-math-block");
  },
  addKeyboardShortcuts() {
    return {
      "Mod-Shift-m": () => this.editor.chain().focus().insertContent({ type: this.name, attrs: { tex: "" } }).run(),
    };
  },
});
