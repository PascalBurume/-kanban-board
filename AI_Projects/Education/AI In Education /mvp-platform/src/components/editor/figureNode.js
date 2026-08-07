import { Node } from "@tiptap/core";
import { renderFigure, parseFigure, figureToJson } from "@/lib/figures";

// A figure is a block object in the document, drawn as SVG from a small JSON spec.
// Like the maths nodes it is an atom: the caret cannot land inside the drawing, so a
// teacher edits it through the figure panel rather than by mangling JSON in place.
//
// It serialises to a ```figure fenced block, which is why it survives the markdown
// round trip and why a student's lesson page can draw the same picture.

export const Figure = Node.create({
  name: "figure",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return { spec: { default: null } };
  },

  parseHTML() {
    return [{ tag: "div[data-figure]", getAttrs: (el) => ({ spec: parseFigure(el.getAttribute("data-figure") || "") }) }];
  },

  renderHTML({ node }) {
    return ["div", { "data-figure": figureToJson(node.attrs.spec || {}), class: "lw-figure" }];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      dom.className = "lw-figure";
      dom.setAttribute("role", "img");
      dom.setAttribute("tabindex", "0");
      let current = node;
      const draw = () => {
        const spec = current.attrs.spec;
        dom.setAttribute("aria-label", spec?.title ? `Figure : ${spec.title}` : "Figure");
        dom.innerHTML = spec ? renderFigure(spec) : "";
      };
      draw();
      return {
        dom,
        update(updated) {
          if (updated.type.name !== current.type.name) return false;
          current = updated;
          draw();
          return true;
        },
        ignoreMutation: () => true,
      };
    };
  },
});
