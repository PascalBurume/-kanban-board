// The sanitiser for rendered lesson HTML.
//
// Lesson bodies embed hand-authored SVG épures (geometry figures) as raw
// <figure><svg>…</svg></figure>, and KaTeX emits its own markup. rehype-sanitize's
// default schema strips BOTH, so this is a narrow hand-written pass instead: drop the
// genuinely dangerous nodes and attributes, leave figures, SVG and maths untouched.
//
// Threat model: lesson content is authored only by staff (admin/teacher) on an offline
// LAN. This is defence in depth, not a boundary against hostile input. It matters more
// now that the visual editor writes HTML into lesson bodies rather than only the
// content pipeline doing so.

// Elements that can execute, navigate, or exfiltrate. `foreignObject` is here because
// it smuggles arbitrary HTML back inside an otherwise-trusted <svg>.
const DROP_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "foreignObject",
  // Nothing in the corpus uses these, and a lesson has no business collecting input
  // or pulling in external resources.
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "link",
  "meta",
  "base",
]);

// Attributes that navigate or load on someone else's terms.
const DROP_ATTRS = new Set(["srcdoc", "formaction", "ping"]);

const URL_ATTRS = /^(href|src|xlinkHref|xlink:href|action|poster)$/i;

// Images may only come from this school's own server. A remote URL on an offline LAN
// is a broken image at best and a beacon at worst.
const SAFE_IMG = /^(\/api\/uploads\/|\/content\/|\/img\/|data:image\/(png|jpe?g|webp|gif);base64,)/i;

// "Pending" images are drafts still queued in IndexedDB; the renderer shows a
// placeholder rather than a broken-image icon.
export const PENDING_IMG = "mwalimu-pending:";

type HastNode = {
  type?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

function isUnsafeUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  // Strip whitespace and control characters first: " javascript:" and "java\tscript:"
  // both still navigate in a browser.
  const flat = value.replace(/[\u0000-\u0020\u007f-\u00a0]/g, "").toLowerCase();
  return flat.startsWith("javascript:") || flat.startsWith("vbscript:") || flat.startsWith("data:text/html");
}

function keep(node: HastNode): boolean {
  if (node.type !== "element") return true;
  if (node.tagName && DROP_TAGS.has(node.tagName)) return false;

  const props = node.properties;
  if (props) {
    for (const key of Object.keys(props)) {
      const value = props[key];
      if (/^on/i.test(key) || DROP_ATTRS.has(key.toLowerCase())) delete props[key];
      else if (URL_ATTRS.test(key) && isUnsafeUrl(value)) delete props[key];
    }
    // An <img> whose source is not local is dropped whole — leaving it with no src
    // would render a broken-image icon in a classroom.
    if (node.tagName === "img") {
      const src = props.src;
      if (typeof src !== "string") return false;
      if (!SAFE_IMG.test(src) && !src.startsWith(PENDING_IMG)) return false;
    }
  }
  return true;
}

function clean(node: HastNode): void {
  if (!node?.children) return;
  node.children = node.children.filter((child) => {
    if (!keep(child)) return false;
    clean(child);
    return true;
  });
}

/** rehype plugin. Mutates the tree in place. */
export function sanitizeHast() {
  return (tree: HastNode) => clean(tree);
}

export const __test__ = { keep, clean, DROP_TAGS, SAFE_IMG };

/**
 * Scrub an HTML string in the browser, for the editor's rawHtml node view.
 *
 * The student side sanitises hast inside the rehype pipeline; the editor has a raw
 * string and a DOM, so it needs its own pass over the same rules. Both must agree —
 * an épure that renders in the editor but is stripped for pupils would be worse than
 * not showing it at all.
 */
export function sanitizeHtmlString(html: string): string {
  if (typeof document === "undefined") return "";
  const tpl = document.createElement("template");
  tpl.innerHTML = String(html ?? "");
  const walk = (root: ParentNode) => {
    for (const el of Array.from(root.querySelectorAll("*"))) {
      if (DROP_TAGS.has(el.tagName.toLowerCase())) {
        el.remove();
        continue;
      }
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (/^on/.test(name) || DROP_ATTRS.has(name)) el.removeAttribute(attr.name);
        else if (URL_ATTRS.test(name) && isUnsafeUrl(attr.value)) el.removeAttribute(attr.name);
      }
    }
  };
  walk(tpl.content);
  return tpl.innerHTML;
}
