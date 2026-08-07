import { describe, it, expect } from "vitest";
import { mdToDoc, docToMd, canEditVisually } from "../lessonDoc";
import { MATH_GROUPS, CHEM_GROUPS, STRUCT_GROUPS } from "../symbols";

// canEditVisually() is what stands between a teacher and silent content loss: the
// visual editor only opens when markdown → document → markdown is provably lossless.
// These tests pin BOTH halves of that promise — the constructs that must survive, and
// the constructs that must be refused rather than quietly dropped.

// A lesson is safe when it round-trips byte for byte through the editor.
const roundTrips = (md: string) => docToMd(mdToDoc(md).doc) === md;

describe("round trip — constructs the editor emits", () => {
  const cases: [string, string][] = [
    ["paragraph", "Une phrase simple."],
    ["heading 2", "## Titre de section"],
    ["heading 3", "### Sous-titre"],
    ["bold", "Un mot **important** ici."],
    ["italic", "Un mot *souligné* ici."],
    ["strike", "Un mot ~~retiré~~ ici."],
    ["inline code", "La variable `x` vaut 3."],
    ["link", "Voir [le manuel](https://example.org)."],
    ["inline math", "On pose $x^2 + 1$ comme point de départ."],
    ["block math", "$$\\frac{a}{b}$$"],
    ["bullet list", "- premier\n- deuxième"],
    ["ordered list", "1. premier\n2. deuxième"],
    ["blockquote", "> Une citation."],
    ["thematic break", "---"],
    ["code block", "```python\nprint(1)\n```"],
    ["heading + paragraph", "## Titre\n\nUn paragraphe."],
    ["math inside a list", "- On a $a^2$\n- Puis $b^2$"],
    ["multiple blocks", "## Titre\n\nTexte.\n\n$$x = 1$$\n\n- a\n- b"],
  ];

  for (const [name, md] of cases) {
    it(`survives: ${name}`, () => {
      expect(docToMd(mdToDoc(md).doc)).toBe(md);
      expect(canEditVisually(md).ok).toBe(true);
    });
  }
});

describe("round trip — multi-line LaTeX", () => {
  // Only the fenced form survives; blockToMd() branches on tex.includes("\n").
  it("keeps a multi-line array fenced", () => {
    const md = "$$\n\\begin{array}{c}\na \\\\\nb\n\\end{array}\n$$";
    expect(docToMd(mdToDoc(md).doc)).toBe(md);
  });
});

describe("the gate refuses what it cannot represent", () => {
  const refused: [string, string, string][] = [
    // A plain image round-trips now (see "round trip — images"). These are the shapes
    // that would LOSE something: the link has nowhere to live on an atom, and a mark
    // around an image has no "**" position that survives the trip.
    ["a linked image", "[![une figure](/img/a.png)](/lecon/2)", "image"],
    ["a marked image", "**![une figure](/img/a.png)**", "image"],
  ];

  for (const [name, md, expectedWord] of refused) {
    it(`refuses: ${name}`, () => {
      const gate = canEditVisually(md);
      expect(gate.ok).toBe(false);
      expect(gate.reason).toContain(expectedWord);
    });
  }

  it("refuses a malformed figure rather than dropping it", () => {
    const gate = canEditVisually("```figure\n{ not json\n```");
    expect(gate.ok).toBe(false);
    expect(gate.reason).toMatch(/figure/i);
  });

  // A ragged table cannot be written back without inventing columns or dropping
  // cells, so it is refused rather than guessed at. The OCR'd sign tables in the
  // maths books are full of these.
  it("reports a ragged table as unsupported", () => {
    const ragged = "| x | y |\n| --- | --- |\n| 1 | 2 | 3 | 4 |";
    expect(mdToDoc(ragged).unsupported).toContain("table");
    expect(canEditVisually(ragged).ok).toBe(false);
  });

  it("accepts a well-formed table", () => {
    expect(canEditVisually("| a | b |\n| --- | --- |\n| 1 | 2 |").ok).toBe(true);
  });
});

describe("figures round-trip as fenced blocks", () => {
  const md = '```figure\n{"type":"function","expr":"x^2","xmin":-5,"xmax":5}\n```';

  it("parses to a figure node and back", () => {
    const { doc, unsupported } = mdToDoc(md);
    expect(unsupported).toHaveLength(0);
    expect(doc.content?.[0].type).toBe("figure");
    expect(roundTrips(docToMd(doc))).toBe(true);
  });

  it("opens visually", () => {
    expect(canEditVisually(md).ok).toBe(true);
  });
});

// Multi-line display maths is what the LaTeX editor writes — a derivation is an
// \begin{aligned} block spanning six lines, not a one-liner. It only survives in the
// fenced "$$\n…\n$$" form (see blockToMd), so a teacher who writes one and reloads
// must get their derivation back rather than be thrown into the source editor.
describe("multi-line display maths round-trips", () => {
  const derivation = [
    "\\begin{aligned}",
    "I^2 &= \\left(\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx\\right)^2 \\\\",
    "&= \\int_0^{2\\pi}\\!\\!\\int_0^{\\infty} e^{-r^2} r\\,dr\\,d\\theta \\\\",
    "&= \\pi",
    "\\end{aligned}",
  ].join("\n");
  const md = `$$\n${derivation}\n$$`;

  it("parses to a blockMath node and back", () => {
    const { doc, unsupported } = mdToDoc(md);
    expect(unsupported).toHaveLength(0);
    expect(doc.content?.[0].type).toBe("blockMath");
    expect(doc.content?.[0].attrs?.tex).toBe(derivation);
    expect(roundTrips(docToMd(doc))).toBe(true);
  });

  it("keeps the fenced form so the newlines survive", () => {
    expect(docToMd(mdToDoc(md).doc)).toBe(md);
  });

  it("opens visually", () => {
    expect(canEditVisually(md).ok).toBe(true);
  });

  // A single-line $$…$$ is display maths too, and remark reports it as INLINE math —
  // the delimiter the teacher typed is the only evidence of their intent.
  it("keeps a one-line $$…$$ on one line", () => {
    const one = "$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$";
    expect(mdToDoc(one).doc.content?.[0].type).toBe("blockMath");
    expect(docToMd(mdToDoc(one).doc)).toBe(one);
  });
});

describe("empty formulas are dropped, not emitted as bare delimiters", () => {
  // A teacher who inserts a formula and has not typed in it yet must not push the
  // document into source mode — "$$" alone would fail the gate on the next keystroke.
  it("drops an empty inline formula", () => {
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "a" }, { type: "inlineMath", attrs: { tex: "" } }] }],
    };
    expect(docToMd(doc)).toBe("a");
  });

  it("drops an empty block formula", () => {
    const doc = { type: "doc", content: [{ type: "blockMath", attrs: { tex: "  " } }] };
    expect(docToMd(doc)).toBe("");
  });
});

describe("mark serialisation edge cases", () => {
  it("pushes whitespace outside bold markers", () => {
    // "**gras **" is not bold in markdown — a closing delimiter may not follow a
    // space. The trailing space has to end up OUTSIDE the markers. A document-final
    // space would be trimmed away by docToMd, so the assertion needs a following
    // word to keep the space observable.
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "gras ", marks: [{ type: "bold" }] },
            { type: "text", text: "suite" },
          ],
        },
      ],
    };
    const md = docToMd(doc);
    expect(md).toBe("**gras** suite");
    expect(md).not.toMatch(/\s\*\*/); // no space immediately before a closing marker
    expect(roundTrips(md)).toBe(true);
  });

  it("merges adjacent text nodes sharing marks", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "a", marks: [{ type: "bold" }] },
            { type: "text", text: "b", marks: [{ type: "bold" }] },
          ],
        },
      ],
    };
    expect(docToMd(doc)).toBe("**ab**");
  });
});

describe("no palette button can push the editor into source mode", () => {
  // The failure this guards against: a teacher clicks a symbol, its LaTeX does not
  // survive docToMd → mdToDoc, canEditVisually() flips to false, and the editor drops
  // out of visual mode mid-sentence. Multi-line structures ("\\\\" row separators,
  // \left…\right pairs) are the realistic offenders, so every entry is checked.
  const items = [...MATH_GROUPS, ...STRUCT_GROUPS, ...CHEM_GROUPS].flatMap((g) =>
    g.items.map((s) => ({ group: g.id, s }))
  );

  for (const { group, s } of items) {
    it(`${group}/${s.id} survives inline`, () => {
      const md = `Texte avant $${s.insert.trim()}$ texte après.`;
      expect(docToMd(mdToDoc(md).doc)).toBe(md);
      expect(canEditVisually(md).ok).toBe(true);
    });

    it(`${group}/${s.id} survives as display maths`, () => {
      const md = `$$${s.insert.trim()}$$`;
      expect(docToMd(mdToDoc(md).doc)).toBe(md);
      expect(canEditVisually(md).ok).toBe(true);
    });
  }
});

// Marks nest, and markdown spells the nesting out: "~~**mot**~~" and "**~~mot~~**"
// are different source for the same styled text. Before MARK_ORDER, each parsed to a
// differently-ordered marks array, the serialiser emitted the OTHER spelling, and the
// gate — which compares documents — saw a mismatch and shut the visual editor. Every
// case below failed at one point; a teacher writing a bold link lost the visual editor.
describe("nested marks are canonicalised, not refused", () => {
  const nested = [
    "~~**mot**~~",
    "**~~mot~~**",
    "***mot***",
    "~~*mot*~~",
    "**[lien](https://example.org)**",
    "[**lien**](https://example.org)",
    "*Un **mot** dedans*",
    "**gras et `code` mêlés**",
  ];

  for (const md of nested) {
    it(`opens visually: ${md}`, () => {
      expect(canEditVisually(md).ok).toBe(true);
    });
  }

  it("reaches a fixed point after one pass", () => {
    // The spelling may be rewritten once (~~**a**~~ → **~~a~~**); it must not keep
    // changing, or every save would rewrite the file.
    for (const md of nested) {
      const once = docToMd(mdToDoc(md).doc);
      expect(docToMd(mdToDoc(once).doc)).toBe(once);
    }
  });

  it("orders marks identically however they arrive", () => {
    // The same logical text, marks supplied in both orders, must serialise the same.
    const doc = (marks: { type: string }[]) => ({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "mot", marks }] }],
    });
    const B = { type: "bold" }, S = { type: "strike" }, I = { type: "italic" };
    expect(docToMd(doc([B, S]))).toBe(docToMd(doc([S, B])));
    expect(docToMd(doc([I, S]))).toBe(docToMd(doc([S, I])));
    expect(docToMd(doc([B, I, S]))).toBe(docToMd(doc([S, I, B])));
  });
});

// A teacher typing "<b>" as literal text used to emit raw markdown that parsed back as
// HTML, so the gate refused it and the editor dropped to source mode mid-sentence.
describe("angle brackets typed as text stay text", () => {
  const typed = (text: string) => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });

  const samples = [
    "On écrit <b>gras</b> ainsi.",
    "Si a < b alors c > d.",
    "Le symbole & se lit « et ».",
    "<script>alert(1)</script>",
    "Une balise <figure> dans le texte.",
  ];

  for (const text of samples) {
    it(`survives: ${text}`, () => {
      const md = docToMd(typed(text));
      expect(canEditVisually(md).ok).toBe(true);
      // and the teacher gets their exact characters back
      expect(mdToDoc(md).doc.content?.[0].content?.[0].text).toBe(text);
    });
  }
});

// Hand-rolled rather than reaching for fast-check: this project ships to an offline
// school image, so a devDependency has to earn its place. A seeded PRNG gives the same
// coverage and reproduces failures from the printed seed.
describe("property: generated documents round-trip", () => {
  const rng = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  const WORDS = ["soit", "donc", "a < b", "x_1", "coût", "50 %", "et/ou", "d'où", "R&D", "n°3"];
  const MARKS = ["bold", "italic", "strike", "code", "link"];

  const gen = (r: () => number): string => {
    const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
    const inline = () => {
      const word = pick(WORDS);
      if (r() < 0.45) return word;
      const n = 1 + Math.floor(r() * 2);
      const marks = new Set<string>();
      for (let i = 0; i < n; i++) marks.add(pick(MARKS));
      // code is literal and cannot carry a link's text, so keep it alone
      if (marks.has("code")) return { type: "text", text: word, marks: [{ type: "code" }] } as never;
      return {
        type: "text",
        text: word,
        marks: [...marks].map((type) => (type === "link" ? { type, attrs: { href: "https://ex.org" } } : { type })),
      } as never;
    };

    const blocks = 1 + Math.floor(r() * 4);
    const content: unknown[] = [];
    for (let i = 0; i < blocks; i++) {
      const kind = r();
      // Separated by spaces, the way prose actually reads. Two styled runs jammed
      // together with no separator hit a CommonMark ambiguity — see the known
      // limitation pinned below.
      const runs = Array.from({ length: 1 + Math.floor(r() * 3) }, () => {
        const v = inline();
        return typeof v === "string" ? { type: "text", text: v } : v;
      }).flatMap((run, i) => (i === 0 ? [run] : [{ type: "text", text: " " }, run]));
      if (kind < 0.2) content.push({ type: "heading", attrs: { level: 1 + Math.floor(r() * 3) }, content: runs });
      else if (kind < 0.3) content.push({ type: "blockMath", attrs: { tex: "x^2 + 1" } });
      else if (kind < 0.4) content.push({ type: "horizontalRule" });
      else if (kind < 0.55)
        content.push({ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: runs }] }] });
      else content.push({ type: "paragraph", content: runs });
    }
    return docToMd({ type: "doc", content: content as never });
  };

  it("500 generated documents all open visually and are stable", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const md = gen(rng(seed));
      if (!md.trim()) continue;
      const gate = canEditVisually(md);
      expect(gate.ok, `seed ${seed} refused (${gate.reason}) for:\n${md}`).toBe(true);
      // Fixed point: the first pass may re-spell the source (two adjacent lists are
      // one list; "~~**a**~~" becomes "**~~a~~**"), but it must settle immediately —
      // otherwise every save would rewrite the file and churn version history.
      const once = docToMd(mdToDoc(md).doc);
      expect(docToMd(mdToDoc(once).doc), `seed ${seed} never settled for:\n${md}`).toBe(once);
    }
  });
});

// A known, deliberate limitation. Two styled runs with NO separator between them can
// produce a delimiter run markdown cannot disambiguate: bold-italic followed by italic
// emits "****", which CommonMark reads differently than it was written. Switching the
// inner delimiter to "_" is not a fix — "_" cannot close before an alphanumeric, so it
// would emit broken markdown in other positions instead.
//
// The gate is what makes this safe: it refuses, the teacher keeps the source editor,
// and nothing is corrupted. This test pins that behaviour so it stays a visible
// trade-off rather than a silent surprise.
describe("known limitation: adjacent styled runs with no separator", () => {
  const jammed = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "x", marks: [{ type: "bold" }, { type: "italic" }] },
          { type: "text", text: "y", marks: [{ type: "italic" }] },
        ],
      },
    ],
  };

  it("is caught by the gate rather than silently mis-parsed", () => {
    const md = docToMd(jammed);
    expect(md).toBe("***x****y*");
    expect(canEditVisually(md).ok).toBe(false);
  });

  it("is fine as soon as a space separates them", () => {
    const spaced = JSON.parse(JSON.stringify(jammed));
    spaced.content[0].content.splice(1, 0, { type: "text", text: " " });
    const md = docToMd(spaced);
    expect(canEditVisually(md).ok).toBe(true);
  });
});


// ── the inline-HTML dialect (Phase 3) ──
//
// Markdown cannot say "blue", "underlined" or "subscript", so those are written as a
// CLOSED whitelist of HTML with exactly one spelling each. The student renderer needs
// no change for any of it: Markdown.js already runs rehype-raw before a permissive
// sanitiser, because the geometry épures are raw <figure><svg> too.
describe("inline HTML the editor writes", () => {
  const survives = [
    ["underline", "<u>souligné</u>"],
    ["subscript", "H<sub>2</sub>O"],
    ["superscript", "x<sup>2</sup>"],
    ["highlight, default", "<mark>surligné</mark>"],
    ["highlight, coloured", '<mark style="background-color:#fef08a">jaune</mark>'],
    ["text colour", '<span style="color:#4f46e5">bleu</span>'],
    ["colour around bold", '<span style="color:#4f46e5">**gras bleu**</span>'],
    ["a mark spanning several mdast children", "<u>a **b** c</u>"],
    ["several marks in one line", "H<sub>2</sub>O puis x<sup>2</sup> et <u>fin</u>"],
  ];

  for (const [name, md] of survives) {
    it(`round-trips: ${name}`, () => {
      expect(docToMd(mdToDoc(md).doc)).toBe(md);
      expect(canEditVisually(md).ok).toBe(true);
    });
  }

  // Anything the serialiser would not have written is refused rather than guessed at —
  // the pre-existing safe path, now guarding a much larger grammar.
  const refused = [
    ["a named colour", '<span style="color:red">x</span>'],
    ["a three-digit hex", '<span style="color:#fff">x</span>'],
    ["an event handler", '<span onclick="steal()">x</span>'],
    ["an unclosed tag", "<u>pas fermé"],
    ["a tag never opened", "fin</u>"],
    ["a tag outside the whitelist", "<blink>x</blink>"],
    ["a script", "<script>alert(1)</script>"],
    ["a block with an event handler", '<figure onclick="steal()"><svg></svg></figure>'],
    ["an embedded form", "<form><input name=\"pin\"></form>"],
  ];

  for (const [name, md] of refused) {
    it(`refuses: ${name}`, () => {
      expect(canEditVisually(md).ok).toBe(false);
    });
  }
});

// 91 seeded lessons carry a hand-drawn geometry épure. They used to force the whole
// lesson into source mode; now they survive the visual editor as an opaque block that
// comes back byte-for-byte, because these figures were drawn against the printed book
// and cannot be rebuilt from a parsed subtree.
describe("raw HTML blocks are kept verbatim", () => {
  const epure =
    '<figure class="ai-figure"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120">' +
    '<path d="M10 10 L190 110" stroke="#1c1c1e" stroke-width="1.4"/></svg>' +
    "<figcaption>Épure 1</figcaption></figure>";

  it("round-trips byte for byte", () => {
    expect(docToMd(mdToDoc(epure).doc)).toBe(epure);
    expect(canEditVisually(epure).ok).toBe(true);
  });

  it("parses to a single rawHtml node", () => {
    const doc = mdToDoc(epure).doc;
    expect(doc.content).toHaveLength(1);
    expect(doc.content?.[0].type).toBe("rawHtml");
    expect(doc.content?.[0].attrs?.html).toBe(epure);
  });

  it("keeps surrounding prose separate", () => {
    const md = `Avant.\n\n${epure}\n\nAprès.`;
    expect(docToMd(mdToDoc(md).doc)).toBe(md);
    expect(mdToDoc(md).doc.content?.map((n) => n.type)).toEqual(["paragraph", "rawHtml", "paragraph"]);
  });

  // The node stores its source verbatim, so the GATE has to be what refuses a script —
  // not a sanitiser downstream. Storing one and calling the lesson clean would be a lie.
  it("still refuses dangerous markup rather than storing it", () => {
    expect(canEditVisually("<figure><script>alert(1)</script></figure>").ok).toBe(false);
    expect(canEditVisually('<div onload="x()">a</div>').ok).toBe(false);
  });
});

describe("block alignment", () => {
  // A <div> and not a <p>: "<p style=…>Texte $x^2$</p>" on one line is a CommonMark
  // HTML *block*, whose content is never parsed as markdown — the maths inside would
  // reach the student as a literal "$x^2$".
  const aligned = [
    ["a paragraph", '<div style="text-align:center">\n\nCentré\n\n</div>'],
    ["a heading", '<div style="text-align:center">\n\n## Titre centré\n\n</div>'],
    ["right", '<div style="text-align:right">\n\nÀ droite\n\n</div>'],
    ["justified", '<div style="text-align:justify">\n\nJustifié\n\n</div>'],
  ];

  for (const [name, md] of aligned) {
    it(`round-trips: ${name}`, () => {
      expect(docToMd(mdToDoc(md).doc)).toBe(md);
      expect(canEditVisually(md).ok).toBe(true);
    });
  }

  // The case the <div> decision exists for.
  it("keeps maths parsed as maths inside an aligned block", () => {
    const md = '<div style="text-align:center">\n\nTexte $x^2$ centré\n\n</div>';
    const para = mdToDoc(md).doc.content?.[0];
    expect(para?.attrs?.textAlign).toBe("center");
    expect(para?.content?.some((n) => n.type === "inlineMath")).toBe(true);
  });

  it("writes no wrapper for the default alignment", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "text", text: "a" }] }] };
    expect(docToMd(doc)).toBe("a");
  });
});

describe("empty and whitespace input", () => {
  it("yields a single empty paragraph", () => {
    expect(mdToDoc("").doc.content).toEqual([{ type: "paragraph" }]);
    expect(canEditVisually("").ok).toBe(true);
  });

  it("never throws on odd input", () => {
    for (const md of ["$", "$$", "\\", "```", "- ", "#"]) {
      expect(() => canEditVisually(md)).not.toThrow();
    }
  });
});

// Images arrived with the upload feature. Markdown has no width syntax, so a RESIZED
// image is the one case that needs a tag — and that tag has exactly one legal spelling.
describe("round trip — images", () => {
  const trip = (md: string) => docToMd(mdToDoc(md).doc);

  const stable = [
    ["a plain image", "![Schéma du circuit](/api/uploads/lessons/abc/deadbeef.jpg)"],
    ["a resized image", '<img src="/api/uploads/lessons/abc/deadbeef.jpg" alt="Schéma" width="480">'],
    ["an image mid-sentence", "Voici ![S](/x.jpg) la suite."],
    ["a resized image mid-sentence", 'Voici <img src="/x.jpg" alt="S" width="480"> la suite.'],
    ["an empty alt", "![](/x.jpg)"],
    ["a resized image with empty alt", '<img src="/x.jpg" alt="" width="200">'],
    ["an image in a list", "- ![A](/a.png)\n- Texte"],
    ["an image in a quote", "> ![A](/a.png)"],
    ["an image in a table cell", "| a | b |\n| --- | --- |\n| ![A](/a.png) | x |"],
    ["an image beside a heading and maths", "## Titre\n\n![A](/a.png)\n\nTexte $x^2$ ici."],
  ];
  for (const [name, md] of stable) {
    it(`keeps ${name} byte-identical`, () => {
      expect(trip(md)).toBe(md);
      expect(canEditVisually(md).ok, canEditVisually(md).reason).toBe(true);
    });
  }

  // Quotes and ampersands go through HTML attribute escaping in the tag form and
  // through bracket escaping in the markdown form. Both have to survive.
  it("escapes an alt containing quotes and ampersands", () => {
    const md = '<img src="/x.jpg" alt="Avec &quot;guillemets&quot; &amp; signes" width="300">';
    expect(trip(md)).toBe(md);
    expect(mdToDoc(md).doc.content?.[0].content?.[0].attrs?.alt).toBe('Avec "guillemets" & signes');
  });

  it("escapes an alt containing brackets", () => {
    const md = "![crochets \\[ici\\]](/x.jpg)";
    expect(trip(md)).toBe(md);
    expect(mdToDoc(md).doc.content?.[0].content?.[0].attrs?.alt).toBe("crochets [ici]");
  });

  it("reads the width off the tag", () => {
    const img = mdToDoc('<img src="/x.jpg" alt="S" width="480">').doc.content?.[0].content?.[0];
    expect(img?.attrs).toMatchObject({ src: "/x.jpg", alt: "S", width: 480 });
  });

  it("gives a plain image no width, so it serialises back as markdown", () => {
    expect(mdToDoc("![S](/x.jpg)").doc.content?.[0].content?.[0].attrs?.width).toBeNull();
  });

  // A lone <img> is an HTML *block* in CommonMark, so without the block-level case it
  // would be swallowed by the rawHtml atom and stop being a resizable image.
  it("makes a lone resized image a paragraph, not a rawHtml atom", () => {
    const doc = mdToDoc('<img src="/x.jpg" alt="S" width="480">').doc;
    expect(doc.content?.[0].type).toBe("paragraph");
    expect(doc.content?.[0].content?.[0].type).toBe("image");
  });

  // Both spellings of "an image alone in its block" must produce the same shape, or
  // the two forms would disagree about what the document is.
  it("agrees on shape between the markdown and tag forms", () => {
    const a = mdToDoc("![S](/x.jpg)").doc;
    const b = mdToDoc('<img src="/x.jpg" alt="S" width="480">').doc;
    expect(a.content?.[0].type).toBe(b.content?.[0].type);
    expect(a.content?.[0].content?.[0].type).toBe(b.content?.[0].content?.[0].type);
  });

  // Anything that is not the canonical spelling keeps its bytes through the rawHtml
  // atom instead of being normalised into a shape that drops an attribute.
  const verbatim = [
    ["a different attribute order", '<img src="/x.jpg" width="480" alt="S">'],
    ["an extra attribute", '<img src="/x.jpg" alt="S" width="480" class="grande">'],
    ["a tag with no width", '<img src="/x.jpg" alt="S">'],
  ];
  for (const [name, md] of verbatim) {
    it(`keeps ${name} verbatim rather than rewriting it`, () => {
      expect(trip(md)).toBe(md);
    });
  }

  it("refuses a src that would not survive the markdown form", () => {
    expect(canEditVisually("![A](</a b.png>)").ok).toBe(false);
  });
});
