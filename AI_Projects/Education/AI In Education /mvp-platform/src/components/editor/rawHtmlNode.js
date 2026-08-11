import { Node } from "@tiptap/core";
import { sanitizeHtmlString } from "@/lib/mdSanitize";

// A block of hand-authored HTML — in practice, a geometry épure: <figure><svg>…</svg>
// <figcaption>…</figcaption></figure>. 91 seeded lessons carry one.
//
// An ATOM holding the source verbatim rather than a parsed subtree, because the whole
// requirement is that it comes back out byte-identical. The moment ProseMirror models
// the SVG as nodes, every attribute it does not know about is a silent loss — and
// these figures were drawn by hand against the printed book.
//
// So: not editable in place. Selectable, deletable, movable; edited as text in the
// Markdown or Côte à côte view. That is the honest trade — the alternative is an
// editor that quietly degrades the one thing it cannot rebuild.
export const RawHtml = Node.create({
  name: "rawHtml",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return { html: { default: "" } };
  },

  // Never parsed from the DOM: these nodes only ever come from lessonDoc, which has
  // the original markdown to slice from. Letting the DOM parser build them would mean
  // round-tripping through the browser's own HTML serialiser and losing fidelity.
  parseHTML() {
    return [];
  },

  renderHTML() {
    return ["div", { class: "lw-rawhtml" }];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      dom.className = "lw-rawhtml";
      dom.setAttribute("contenteditable", "false");
      dom.innerHTML = sanitizeHtmlString(node.attrs.html);
      const tag = document.createElement("span");
      tag.className = "lw-rawhtml-tag";
      tag.textContent = "Figure — modifiable en mode Markdown";
      dom.appendChild(tag);
      return { dom };
    };
  },
});
