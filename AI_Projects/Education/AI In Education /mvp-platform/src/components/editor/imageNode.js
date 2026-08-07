import { Node } from "@tiptap/core";
import { MAX_EDGE } from "@/lib/imageUpload";
import { PENDING_IMG } from "@/lib/mdSanitize";
import { getPendingImage } from "@/lib/localDocs";

// A picture in a lesson.
//
// INLINE, not a block, because that is the shape markdown gives: `![alt](src)` is an
// inline node inside a paragraph, and lessonDoc parses both spellings into
// paragraph > image. A block node here would disagree with the serialiser and the
// round-trip gate would refuse every lesson containing a picture.
//
// `width` is the whole reason this is a custom node rather than a stock one. Markdown
// has no width syntax, so a resized image serialises as <img src alt width> — see
// IMG_TAG in lessonDoc. null means "no explicit width", which is the markdown form.

// Below this a drag is a mis-click, not a resize, and the picture would vanish.
const MIN_WIDTH = 60;

export const Image = Node.create({
  name: "image",
  inline: true,
  group: "inline",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: "" },
      alt: { default: "" },
      // Stored as a number or null. Kept out of the DOM when null so the rendered
      // markup matches what the student page produces from `![alt](src)`.
      width: {
        default: null,
        parseHTML: (el) => {
          const w = Number(el.getAttribute("width"));
          return Number.isFinite(w) && w > 0 ? Math.round(w) : null;
        },
        renderHTML: (attrs) => (attrs.width ? { width: attrs.width } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "img[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", HTMLAttributes];
  },

  addCommands() {
    return {
      setImage: (attrs) => ({ commands }) => commands.insertContent({ type: this.name, attrs }),
      setImageWidth: (width) => ({ commands }) => commands.updateAttributes(this.name, { width }),
    };
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement("span");
      dom.className = "lw-img";

      const img = document.createElement("img");
      img.alt = node.attrs.alt || "";
      // A queued picture has no URL yet — its bytes are on the device. Drawing it from
      // the local blob is what makes "insert a photo with the server down" feel like
      // inserting a photo rather than inserting a broken box.
      if (String(node.attrs.src ?? "").startsWith(PENDING_IMG)) {
        dom.classList.add("pending");
        getPendingImage(String(node.attrs.src).slice(PENDING_IMG.length)).then((row) => {
          if (!row?.blob) return;
          const url = URL.createObjectURL(row.blob);
          img.src = url;
          // Revoked when the view goes, or a lesson of photos leaks every one of them.
          dom._revoke = () => URL.revokeObjectURL(url);
        });
      } else {
        img.src = node.attrs.src;
      }
      if (node.attrs.width) img.style.width = `${node.attrs.width}px`;
      // A picture that fails to load is worth saying out loud: on a school LAN it
      // usually means the server is the thing that is down, not the lesson.
      img.addEventListener("error", () => { dom.classList.add("broken"); });
      dom.appendChild(img);

      const grip = document.createElement("span");
      grip.className = "lw-img-grip";
      grip.title = "Redimensionner";
      grip.setAttribute("contenteditable", "false");
      dom.appendChild(grip);

      // Pointer capture, so a drag that leaves the handle — which every real drag does
      // — keeps sending events here instead of to whatever is under the cursor.
      let startX = 0;
      let startW = 0;
      const onMove = (e) => {
        const next = Math.round(Math.max(MIN_WIDTH, Math.min(MAX_EDGE, startW + (e.clientX - startX))));
        img.style.width = `${next}px`;
      };
      const onUp = () => {
        grip.removeEventListener("pointermove", onMove);
        grip.removeEventListener("pointerup", onUp);
        const width = Math.round(img.getBoundingClientRect().width);
        if (typeof getPos === "function") {
          // Written straight to the node rather than through a command: the selection
          // is on the handle, not the image, so updateAttributes would miss it.
          editor.view.dispatch(editor.view.state.tr.setNodeMarkup(getPos(), undefined, { ...node.attrs, width }));
        }
      };
      grip.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        if (!editor.isEditable) return;
        startX = e.clientX;
        startW = img.getBoundingClientRect().width;
        grip.setPointerCapture(e.pointerId);
        grip.addEventListener("pointermove", onMove);
        grip.addEventListener("pointerup", onUp);
      });

      return {
        dom,
        // Re-render on any attribute change EXCEPT one this view already applied, so a
        // drag does not fight the node view rebuilding mid-gesture.
        update: (updated) => {
          if (updated.type.name !== "image") return false;
          if (updated.attrs.src !== node.attrs.src) return false;
          img.alt = updated.attrs.alt || "";
          img.style.width = updated.attrs.width ? `${updated.attrs.width}px` : "";
          return true;
        },
        destroy: () => dom._revoke?.(),
      };
    };
  },
});
