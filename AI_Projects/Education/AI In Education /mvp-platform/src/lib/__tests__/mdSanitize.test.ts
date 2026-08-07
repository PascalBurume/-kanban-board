import { describe, it, expect } from "vitest";
import { fromHtml } from "hast-util-from-html";
import { sanitizeHast } from "../mdSanitize";

// The sanitiser has two jobs that pull against each other: drop anything that can
// execute or phone home, and leave the hand-authored SVG épures and KaTeX markup
// completely alone. rehype-sanitize's default schema strips both, which is why this is
// hand-written — so it needs tests that pin BOTH halves.
//
// These run against hast trees directly rather than through a rendering pipeline: it
// is what the plugin actually receives, and it avoids pulling remark-rehype and
// rehype-stringify into a project that ships to an offline school image.

type Node = { type?: string; tagName?: string; properties?: Record<string, unknown>; children?: Node[]; value?: string };

const clean = (html: string): Node => {
  const tree = fromHtml(html, { fragment: true }) as unknown as Node;
  sanitizeHast()(tree as never);
  return tree;
};

const walk = (node: Node, visit: (n: Node) => void) => {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
};

const tags = (root: Node): string[] => {
  const out: string[] = [];
  walk(root, (n) => {
    if (n.type === "element" && n.tagName) out.push(n.tagName);
  });
  return out;
};

const find = (root: Node, tagName: string): Node | undefined => {
  let hit: Node | undefined;
  walk(root, (n) => {
    if (!hit && n.type === "element" && n.tagName === tagName) hit = n;
  });
  return hit;
};

const props = (root: Node, tagName: string): Record<string, unknown> => find(root, tagName)?.properties ?? {};

const text = (root: Node): string => {
  let out = "";
  walk(root, (n) => {
    if (n.type === "text") out += n.value ?? "";
  });
  return out;
};

describe("drops what can execute or navigate", () => {
  const dropped: [string, string][] = [
    ["script", "<script>alert(1)</script>"],
    ["style", "<style>body{display:none}</style>"],
    ["iframe", '<iframe src="http://evil"></iframe>'],
    ["object", '<object data="x.swf"></object>'],
    ["embed", '<embed src="x.swf">'],
    ["form", '<form action="http://evil"></form>'],
    ["input", '<input name="pin">'],
    ["button", "<button>Envoyer</button>"],
    ["textarea", "<textarea></textarea>"],
    ["select", "<select></select>"],
    ["link", '<link rel="stylesheet" href="http://evil/x.css">'],
    ["meta", '<meta http-equiv="refresh" content="0;url=http://evil">'],
    ["base", '<base href="http://evil/">'],
  ];

  for (const [name, html] of dropped) {
    it(`drops <${name}>`, () => {
      expect(tags(clean(`<div>${html}</div>`))).not.toContain(name);
    });
  }

  it("drops foreignObject, which smuggles HTML back inside a trusted <svg>", () => {
    const t = tags(clean("<svg><foreignObject><b>x</b></foreignObject></svg>"));
    expect(t).toContain("svg");
    expect(t).not.toContain("foreignObject");
  });
});

describe("strips dangerous attributes but keeps the element", () => {
  it("removes on* handlers", () => {
    const root = clean('<p onclick="steal()" onmouseover="x()">Texte</p>');
    expect(props(root, "p")).not.toHaveProperty("onClick");
    expect(Object.keys(props(root, "p")).join(",")).not.toMatch(/^on/i);
    expect(text(root)).toBe("Texte");
  });

  it("removes javascript: and vbscript: URLs", () => {
    expect(props(clean('<a href="javascript:alert(1)">clic</a>'), "a")).not.toHaveProperty("href");
    expect(props(clean('<a href="vbscript:x">clic</a>'), "a")).not.toHaveProperty("href");
  });

  it("sees through whitespace and control characters in a URL", () => {
    expect(props(clean('<a href="  java\tscript:alert(1)">clic</a>'), "a")).not.toHaveProperty("href");
  });

  it("removes srcdoc, formaction and ping", () => {
    const p = props(clean('<a href="/x" ping="http://evil" formaction="http://evil">a</a>'), "a");
    expect(Object.keys(p).map((k) => k.toLowerCase())).not.toContain("ping");
    expect(Object.keys(p).map((k) => k.toLowerCase())).not.toContain("formaction");
    expect(p.href).toBe("/x");
  });

  it("keeps ordinary links", () => {
    expect(props(clean('<a href="/lesson/?id=3">la leçon</a>'), "a").href).toBe("/lesson/?id=3");
  });
});

// The whole reason this file is hand-written. 91 seeded lessons carry these.
describe("leaves the SVG épures untouched", () => {
  const epure =
    '<figure><svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M10 10 L190 110" stroke="#1c1c1e" stroke-width="1.4" fill="none"/>' +
    '<circle cx="20" cy="30" r="3"></circle><text x="24" y="28">A</text>' +
    "</svg><figcaption>Épure 1</figcaption></figure>";

  it("keeps the svg, its geometry and its caption", () => {
    const root = clean(epure);
    const t = tags(root);
    for (const tag of ["figure", "svg", "path", "circle", "text", "figcaption"]) expect(t).toContain(tag);
    expect(props(root, "svg").viewBox).toBe("0 0 200 120");
    expect(props(root, "path").d).toBe("M10 10 L190 110");
    expect(props(root, "path").stroke).toBe("#1c1c1e");
    expect(text(root)).toContain("Épure 1");
  });
});

describe("leaves KaTeX and the editor's own inline HTML untouched", () => {
  it("keeps KaTeX-shaped markup", () => {
    const root = clean('<span class="katex"><span class="katex-html">x²</span></span>');
    expect(tags(root)).toContain("span");
    expect(String(props(root, "span").className)).toContain("katex");
  });

  it("keeps colour, highlight, underline, sub and sup", () => {
    const root = clean('<span style="color:#4f46e5">bleu</span><mark>surligné</mark><u>s</u><sub>1</sub><sup>2</sup>');
    const t = tags(root);
    for (const tag of ["span", "mark", "u", "sub", "sup"]) expect(t).toContain(tag);
    expect(props(root, "span").style).toBe("color:#4f46e5");
  });

  it("keeps block alignment", () => {
    expect(props(clean('<div style="text-align:center"><p>Centré</p></div>'), "div").style).toBe("text-align:center");
  });
});

describe("images may only come from this school's server", () => {
  const kept = ["/api/uploads/lessons/abc/def.png", "/content/modules/x.png", "/img/logo.png", "data:image/png;base64,iVBOR"];
  const rejected = ["http://evil.example/track.gif", "https://cdn.example/x.png", "//evil.example/x.png", "data:text/html,<b>"];

  for (const src of kept) {
    it(`keeps ${src}`, () => {
      expect(tags(clean(`<p><img src="${src}" alt="a"></p>`))).toContain("img");
    });
  }

  for (const src of rejected) {
    it(`drops ${src}`, () => {
      expect(tags(clean(`<p><img src="${src}" alt="a"></p>`))).not.toContain("img");
    });
  }

  it("keeps a queued offline image so it can render a placeholder", () => {
    expect(tags(clean('<p><img src="mwalimu-pending:k1" alt="a"></p>'))).toContain("img");
  });

  it("drops an <img> with no src rather than showing a broken icon", () => {
    expect(tags(clean("<p><img alt='a'></p>"))).not.toContain("img");
  });
});

describe("nested payloads are reached", () => {
  it("drops a script buried inside allowed elements", () => {
    expect(tags(clean("<div><blockquote><p><script>alert(1)</script></p></blockquote></div>"))).not.toContain("script");
  });

  it("strips handlers on deeply nested elements", () => {
    const root = clean('<div><p><em onclick="x()">a</em></p></div>');
    expect(Object.keys(props(root, "em")).join(",")).not.toMatch(/^on/i);
    expect(text(root)).toBe("a");
  });
});
