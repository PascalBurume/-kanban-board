// Markdown ⇄ editor-document conversion for the WYSIWYG lesson editor.
//
// Lessons are STORED as markdown + LaTeX — the student renderer, the RAG index, the
// formula checker and Copilot all read that. So the visual editor is a view over
// markdown, and every keystroke has to survive the round trip back to it.
//
// The rule that matters: never silently lose content. `mdToDoc` reports every mdast
// node it does not know how to represent, and the editor refuses to open visually
// when anything is unsupported (tables, images, raw HTML — the inline SVG épures in
// book lessons are exactly this case). The teacher keeps the source editor instead.

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import { parseFigure, figureToJson, type FigureSpec } from "./figures";
import { repairTex } from "./latexRepair";

type Pos = { start?: { offset?: number }; end?: { offset?: number } };
type MdNode = { type: string; value?: string; depth?: number; ordered?: boolean; lang?: string; url?: string; alt?: string | null; align?: (string | null)[]; children?: MdNode[]; position?: Pos };

// Parsing needs the original source: remark-math reports a single-line "$$x$$" as an
// INLINE math node, so the only way to know the author meant display math is to look
// at the delimiter they actually typed.
type Ctx = { md: string; bad: string[] };

export type PMMark = { type: string; attrs?: Record<string, unknown> };
export type PMNode = { type: string; attrs?: Record<string, unknown>; content?: PMNode[]; marks?: PMMark[]; text?: string };

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

// ─────────────────────────── markdown → document ───────────────────────────

export function mdToDoc(md: string): { doc: PMNode; unsupported: string[] } {
  const tree = parser.parse(md || "") as unknown as MdNode;
  const ctx: Ctx = { md: md || "", bad: [] };
  const content = blocks(tree.children ?? [], ctx);
  const unsupported = ctx.bad;
  return {
    doc: { type: "doc", content: content.length ? content : [{ type: "paragraph" }] },
    unsupported: [...new Set(unsupported)],
  };
}

function blocks(nodes: MdNode[], ctx: Ctx): PMNode[] {
  const out: PMNode[] = [];
  // An alignment div wraps the blocks BETWEEN its open and close tags, so the state
  // has to live out here rather than inside block().
  let align: string | null = null;
  let lastHtmlEnd: number | null = null;
  for (const n of nodes) {
    if (n.type === "html") {
      const raw = (n.value ?? "").trim();
      const opened = raw.match(ALIGN_OPEN);
      if (opened) { align = opened[1]; continue; }
      if (ALIGN_CLOSE.test(raw)) { align = null; continue; }
      // A resized image alone in its block. `<img>` is not one of CommonMark's
      // block-level tag names, so a lone one lands here as an HTML block rather than
      // in a paragraph — without this it would be swallowed by the rawHtml atom below
      // and stop being resizable. Wrapping it in a paragraph makes it the same node
      // `![alt](src)` alone produces, so both spellings agree on the shape.
      const loneImg = imgNode(raw);
      if (loneImg) { out.push({ type: "paragraph", content: [loneImg] }); lastHtmlEnd = null; continue; }
      // Anything else block-level is kept VERBATIM in a rawHtml atom — in practice a
      // geometry épure. Sliced from the original source rather than taken from
      // n.value, so what comes back out is byte-for-byte what went in; these figures
      // were drawn by hand against the printed book and cannot be rebuilt.
      const from = n.position?.start?.offset;
      const to = n.position?.end?.offset;
      const verbatim = from != null && to != null ? ctx.md.slice(from, to) : (n.value ?? "");
      if (!verbatim.trim()) continue;
      if (DANGEROUS_HTML.test(verbatim) || /\son[a-z]+\s*=/i.test(verbatim)) {
        ctx.bad.push("html");
        continue;
      }
      // A figure containing a blank line is several mdast html blocks. Re-join them
      // when nothing but whitespace separates them in the SOURCE, or the round trip
      // would insert the "\n\n" that docToMd puts between blocks and drift forever.
      // The end offset is tracked in a local, NOT on the node: anything stored in
      // attrs becomes part of the document's identity, and offsets shift between
      // passes — which turned every merged figure into permanent round-trip drift.
      const prev = out[out.length - 1];
      if (prev?.type === "rawHtml" && from != null && lastHtmlEnd != null && !ctx.md.slice(lastHtmlEnd, from).trim()) {
        prev.attrs = { html: String(prev.attrs?.html ?? "") + ctx.md.slice(lastHtmlEnd, from) + verbatim };
        lastHtmlEnd = to ?? null;
        continue;
      }
      out.push({ type: "rawHtml", attrs: { html: verbatim } });
      lastHtmlEnd = to ?? null;
      continue;
    }
    lastHtmlEnd = null;
    const b = block(n, ctx);
    if (!b) continue;
    for (const node of Array.isArray(b) ? b : [b]) {
      if (align && (node.type === "paragraph" || node.type === "heading")) {
        node.attrs = { ...(node.attrs ?? {}), textAlign: align };
      }
      out.push(node);
    }
  }
  return mergeLists(out);
}

// Two bullet lists separated only by a blank line are ONE list in markdown — that is
// what re-parsing our own output gives back. remark reports them separately when the
// source used a different bullet character or spacing, so without this the document
// changes shape on the first round trip and the gate refuses it.
function mergeLists(nodes: PMNode[]): PMNode[] {
  const out: PMNode[] = [];
  for (const n of nodes) {
    const prev = out[out.length - 1];
    const isList = n.type === "bulletList" || n.type === "orderedList";
    if (isList && prev?.type === n.type) prev.content = [...(prev.content ?? []), ...(n.content ?? [])];
    else out.push(n);
  }
  return out;
}

function block(n: MdNode, ctx: Ctx): PMNode | PMNode[] | null {
  switch (n.type) {
    case "paragraph": {
      const content = inlines(n.children ?? [], ctx);
      // A paragraph that is nothing but "$$…$$" is display maths, not a sentence.
      if (content.length === 1 && content[0].type === "inlineMath" && content[0].attrs?.display) {
        return { type: "blockMath", attrs: { tex: content[0].attrs.tex } };
      }
      return { type: "paragraph", content };
    }
    case "heading": {
      // Lessons use ## / ###; a stray # is clamped so it stays inside the toolbar's range.
      const level = Math.min(Math.max(n.depth ?? 2, 1), 3);
      return { type: "heading", attrs: { level }, content: inlines(n.children ?? [], ctx) };
    }
    case "list":
      return {
        type: n.ordered ? "orderedList" : "bulletList",
        content: (n.children ?? []).map((li) => ({ type: "listItem", content: blocks(li.children ?? [], ctx) })),
      };
    case "blockquote":
      return { type: "blockquote", content: blocks(n.children ?? [], ctx) };
    case "code": {
      // ```figure blocks carry a chart spec — they are pictures, not source code.
      if ((n.lang ?? "") === "figure") {
        const spec = parseFigure(n.value ?? "");
        if (spec) return { type: "figure", attrs: { spec } };
        ctx.bad.push("figure"); // malformed spec: refuse rather than silently drop
        return null;
      }
      return { type: "codeBlock", attrs: { language: n.lang ?? null }, content: n.value ? [{ type: "text", text: n.value }] : [] };
    }
    case "table": {
      // GFM pipe tables only, never HTML ones. The header row is mandatory in GFM, so
      // the first mdast row becomes tableHeader cells and the rest tableCell.
      const align = n.align ?? [];
      // A RAGGED table — rows with different cell counts — cannot be written back
      // without either inventing columns or dropping cells. The OCR'd sign tables in
      // the maths books are full of them. Refuse rather than choose which data to
      // lose: the teacher keeps the source editor and every cell survives.
      const widths = (n.children ?? []).map((row) => (row.children ?? []).length);
      if (new Set(widths).size > 1) {
        ctx.bad.push("table");
        return null;
      }
      const rows = (n.children ?? []).map((row, r) => ({
        type: "tableRow",
        content: (row.children ?? []).map((cell, c) => ({
          type: r === 0 ? "tableHeader" : "tableCell",
          // colspan/rowspan stay at 1 for the whole life of this node type: GFM cannot
          // write a merged cell, so offering the command would silently lose data.
          attrs: { colspan: 1, rowspan: 1, colwidth: null, textAlign: align[c] ?? null },
          content: [{ type: "paragraph", content: inlines(cell.children ?? [], ctx) }],
        })),
      }));
      return { type: "table", content: rows };
    }
    case "thematicBreak":
      return { type: "horizontalRule" };
    case "math":
      return { type: "blockMath", attrs: { tex: texOf(n.value) } };
    default:
      ctx.bad.push(n.type);
      return null;
  }
}

// Repair BEFORE trimming, and this order is the whole point.
//
// A model that writes "\text{D}" into a JSON string emits a bare \t, so JSON.parse
// hands back a real TAB and the formula arrives as "<TAB>ext{D}". repairLatex knows
// how to turn that back into "\text{D}" — but only while the TAB is still there.
// Trimming first deletes the one piece of evidence that a repair is possible and
// leaves "ext{D}", which KaTeX cheerfully typesets as three italic variables e·x·t.
// That turned a recoverable corruption into a permanent one.
const texOf = (raw: string | undefined) => repairTex(raw ?? "").trim();

const MARK_FOR: Record<string, string> = { strong: "bold", emphasis: "italic", inlineCode: "code", delete: "strike" };

// Marks nest, and markdown records the nesting in its delimiters: "~~**mot**~~" and
// "**~~mot~~**" are different source but the SAME styled text. Left alone, each one
// parses to a differently-ordered marks array, the serialiser emits the other spelling,
// and the round-trip gate — which compares documents — sees two documents that differ
// only in array order and shuts the visual editor. So both halves agree on one
// canonical order: outermost first here, and the serialiser wraps in reverse.
const MARK_ORDER = ["link", "textStyle", "highlight", "underline", "subscript", "superscript", "bold", "italic", "strike", "code"];
const markRank = (t: string) => {
  const i = MARK_ORDER.indexOf(t);
  return i === -1 ? MARK_ORDER.length : i;
};
const sortMarks = (marks: PMMark[]): PMMark[] => [...marks].sort((a, b) => markRank(a.type) - markRank(b.type));

// The marks whose markdown delimiters may not sit next to a space: "**gras **" is not
// bold. wrapMark() already pushes edge whitespace outside them when serialising, so the
// parser has to do the same or the two halves disagree — "*Un **mot** dedans*" parses
// with the space INSIDE the italic, serialises with it outside, and the gate refuses a
// document a teacher writes every day. Splitting the whitespace off here is what makes
// the two halves describe the same document.
const WRAP_MARKS = new Set(["bold", "italic", "strike"]);

// ── the inline-HTML dialect ──
//
// Markdown cannot say "this word is blue", "underlined", or "a subscript". Those are
// written as a CLOSED whitelist of HTML instead, in exactly one spelling each, so the
// serialiser's output is the only thing the parser has to recognise. Anything outside
// this grammar — a named colour, a three-digit hex, attributes in another order, an
// unclosed tag — falls through to ctx.bad and the gate refuses, which is the
// pre-existing safe path.
//
// The student renderer needs no changes for any of it: Markdown.js already runs
// rehype-raw before a deliberately permissive sanitiser, because the geometry épures
// are raw <figure><svg> too.
const HTML_OPEN: Array<[RegExp, (m: RegExpMatchArray) => PMMark]> = [
  [/^<u>$/, () => ({ type: "underline" })],
  [/^<sub>$/, () => ({ type: "subscript" })],
  [/^<sup>$/, () => ({ type: "superscript" })],
  [/^<mark>$/, () => ({ type: "highlight" })],
  [/^<mark style="background-color:(#[0-9a-f]{6})">$/, (m) => ({ type: "highlight", attrs: { color: m[1] } })],
  [/^<span style="color:(#[0-9a-f]{6})">$/, (m) => ({ type: "textStyle", attrs: { color: m[1] } })],
];
const HTML_CLOSE = /^<\/(u|sub|sup|mark|span)>$/;
const MARK_FOR_TAG: Record<string, string> = {
  u: "underline",
  sub: "subscript",
  sup: "superscript",
  mark: "highlight",
  span: "textStyle",
};

// Block alignment is a <div> and not a <p>: "<p style=…>Texte $x^2$</p>" on one line
// is a CommonMark HTML *block*, whose content is never parsed as markdown — the maths
// inside would reach the student as literal "$x^2$". The div-plus-blank-lines form is
// the standard remark idiom, and it also avoids the invalid <p><p> nesting that
// react-markdown would otherwise produce.
const ALIGN_OPEN = /^<div style="text-align:(left|center|right|justify)">$/;
const ALIGN_CLOSE = /^<\/div>$/;

// Kept verbatim means kept verbatim, so the gate — not a later sanitiser — has to be
// the thing that refuses a script. Storing one and calling the lesson "clean" would be
// dishonest even though both renderers strip it.
const DANGEROUS_HTML = /<\s*(script|style|iframe|object|embed|form|input|button|textarea|select|link|meta|base)\b/i;

// ── images ──
//
// Two spellings, one per shape. A plain image is markdown. A RESIZED one carries a
// width, which markdown has no syntax for, so it becomes an <img> with exactly these
// three attributes in exactly this order — the tag form exists ONLY to carry the width.
// Any other attribute, or another order, is refused rather than normalised away: a
// silently dropped attribute is the loss this whole module exists to prevent.
const IMG_TAG = /^<img src="([^"]*)" alt="([^"]*)" width="(\d{1,4})"\s*\/?>$/;

// A src has to survive `![alt](src)` untouched. Ours are always /api/uploads/… so this
// rejects nothing we produce; a pasted src with a space or a bracket opens the lesson
// in source mode, where every character of it is safe.
const IMG_SRC_OK = /^[^\s()<>\\"]+$/;

const attrEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const attrUnesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&amp;/g, "&");
// Inside ![…] only the brackets and the escape character itself are special.
const altEsc = (s: string) => s.replace(/([\\[\]])/g, "\\$1");

/** `<img …>` → an image node, or null if it is not our canonical spelling. */
function imgNode(raw: string): PMNode | null {
  const m = raw.trim().match(IMG_TAG);
  if (!m) return null;
  const src = attrUnesc(m[1]);
  if (!IMG_SRC_OK.test(src)) return null;
  return { type: "image", attrs: { src, alt: attrUnesc(m[2]), width: Number(m[3]) } };
}

function imageToMd(n: PMNode): string {
  const src = String(n.attrs?.src ?? "");
  const alt = String(n.attrs?.alt ?? "");
  const width = Number(n.attrs?.width) || null;
  if (width) return `<img src="${attrEsc(src)}" alt="${attrEsc(alt)}" width="${width}">`;
  return `![${altEsc(alt)}](${src})`;
}

function pushText(out: PMNode[], text: string, marks: PMMark[]): void {
  if (!text) return;
  if (!marks.length || !marks.some((m) => WRAP_MARKS.has(m.type))) {
    out.push({ type: "text", text, ...(marks.length ? { marks: sortMarks(marks) } : {}) });
    return;
  }
  const outer = marks.filter((m) => !WRAP_MARKS.has(m.type));
  const [, lead = "", core = "", trail = ""] = text.match(/^(\s*)([\s\S]*?)(\s*)$/) ?? [];
  // An all-whitespace run carries no visible styling — emitting delimiters around it
  // would produce markdown that parses back unmarked.
  const edge = (s: string) => pushText(out, s, outer);
  edge(lead);
  if (core) out.push({ type: "text", text: core, marks: sortMarks(marks) });
  edge(trail);
}

function inlines(nodes: MdNode[], ctx: Ctx, marks: PMMark[] = []): PMNode[] {
  const out: PMNode[] = [];
  // Marks opened by inline HTML persist across SIBLING nodes — "<u>a **b** c</u>" is
  // three mdast children under one underline — so unlike the markdown marks, which
  // nest structurally and can just recurse, these need a stack.
  const open: PMMark[] = [];
  const active = () => [...marks, ...open];

  for (const n of nodes) {
    switch (n.type) {
      case "html": {
        const raw = (n.value ?? "").trim();
        // A resized image mid-sentence. Checked first: it is a complete element, not
        // one half of a mark pair, so it must never reach the open/close stack.
        const img = imgNode(raw);
        if (img) { out.push(img); break; }
        const opened = HTML_OPEN.find(([re]) => re.test(raw));
        if (opened) {
          const [re, make] = opened;
          open.push(make(raw.match(re) as RegExpMatchArray));
          break;
        }
        const closed = raw.match(HTML_CLOSE);
        if (closed) {
          const want = MARK_FOR_TAG[closed[1]];
          const at = open.map((m) => m.type).lastIndexOf(want);
          if (at === -1) ctx.bad.push("html"); // closing something never opened
          else open.splice(at, 1);
          break;
        }
        ctx.bad.push("html");
        break;
      }
      case "text":
        if (n.value) pushText(out, n.value, active());
        break;
      case "inlineCode":
        // Backticks protect their content, so no whitespace splitting here.
        if (n.value) out.push({ type: "text", text: n.value, marks: sortMarks([...active(), { type: "code" }]) });
        break;
      case "strong":
      case "emphasis":
      case "delete":
        out.push(...inlines(n.children ?? [], ctx, [...active(), { type: MARK_FOR[n.type] }]));
        break;
      case "link":
        out.push(...inlines(n.children ?? [], ctx, [...active(), { type: "link", attrs: { href: n.url ?? "" } }]));
        break;
      case "inlineMath": {
        // An empty "$$" carries nothing and the serialiser drops it. Dropping it here
        // too keeps both halves describing the same document — otherwise the text
        // either side merges on the way out and the gate sees a mismatch.
        const tex = texOf(n.value);
        if (!tex) break;
        const at = n.position?.start?.offset ?? -1;
        const display = at >= 0 && ctx.md.slice(at, at + 2) === "$$";
        out.push({ type: "inlineMath", attrs: { tex, display } });
        break;
      }
      case "image": {
        // Marks cannot ride on an image: an atom carrying bold has nowhere to put the
        // "**", so it would round-trip into something else. A linked image is a real
        // markdown construct we simply do not write, so refuse rather than lose the link.
        const src = n.url ?? "";
        if (!IMG_SRC_OK.test(src) || active().length) { ctx.bad.push("image"); break; }
        out.push({ type: "image", attrs: { src, alt: n.alt ?? "", width: null } });
        break;
      }
      case "break":
        out.push({ type: "hardBreak" });
        break;
      default:
        ctx.bad.push(n.type);
    }
  }
  // An unclosed tag means the document says something this grammar cannot express;
  // refuse rather than guess where the author meant it to end.
  if (open.length) ctx.bad.push("html");
  // Adjacent runs sharing marks are one run — the serialiser merges them on the way
  // out, so the parser has to agree.
  return mergeText(out);
}

// ─────────────────────────── document → markdown ───────────────────────────

// Escape only what would otherwise change meaning. LaTeX never passes through here
// (math lives in its own nodes), so backslashes in text are safe to leave alone.
//
// "<" becomes a character reference rather than a backslash escape: a teacher who
// types "<b>" into the visual editor would otherwise produce markdown that parses
// back as raw HTML, which the gate refuses — the editor would drop into source mode
// mid-sentence. "&" has to go first, or it would re-escape the "&" in "&lt;".
// remark decodes references in text nodes, so "<" → "&lt;" → "<" is stable.
function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/([*_`~])/g, "\\$1")
    .replace(/^(\s*)([#>-])/gm, "$1\\$2");
}

// "**gras **" is not bold in markdown — a closing delimiter may not follow a space.
// Push any surrounding whitespace outside the markers instead.
function wrapMark(t: string, open: string, close: string): string {
  const m = t.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!m || !m[2]) return t;
  return m[1] + open + m[2] + close + m[3];
}

const sameMarks = (a: PMNode, b: PMNode) => JSON.stringify(a.marks ?? []) === JSON.stringify(b.marks ?? []);

// Adjacent text nodes sharing marks would otherwise emit "**a****b**".
function mergeText(nodes: PMNode[]): PMNode[] {
  const out: PMNode[] = [];
  for (const n of nodes) {
    const prev = out[out.length - 1];
    if (n.type === "text" && prev?.type === "text" && sameMarks(prev, n)) prev.text = (prev.text ?? "") + (n.text ?? "");
    else out.push({ ...n });
  }
  return out;
}

const MARK_DELIM: Record<string, string> = { bold: "**", italic: "*", strike: "~~" };

function leafToMd(n: PMNode, applied: string[]): string {
  if (n.type === "inlineMath") {
    // A formula the teacher has not filled in yet carries no content. Emitting "$$"
    // for it produces markdown that fails the round-trip gate, which would drop the
    // editor into source mode the instant someone types "$".
    const tex = String(n.attrs?.tex ?? "");
    if (!tex.trim()) return "";
    const d = n.attrs?.display ? "$$" : "$";
    return `${d}${tex}${d}`;
  }
  if (n.type === "hardBreak") return "  \n";
  if (n.type === "image") return imageToMd(n);
  if (n.type !== "text") return "";
  // Inside a code span the backticks already protect everything — escaping would be
  // emitted literally.
  return applied.includes("code") ? n.text ?? "" : escapeText(n.text ?? "");
}

const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/.test(v) ? v : null);

function wrapWith(mark: PMMark, inner: string): string {
  if (mark.type === "code") return `\`${inner}\``;
  if (mark.type === "link") return `[${inner}](${mark.attrs?.href ?? ""})`;
  if (mark.type === "underline") return `<u>${inner}</u>`;
  if (mark.type === "subscript") return `<sub>${inner}</sub>`;
  if (mark.type === "superscript") return `<sup>${inner}</sup>`;
  if (mark.type === "highlight") {
    const c = hex(mark.attrs?.color);
    return c ? `<mark style="background-color:${c}">${inner}</mark>` : `<mark>${inner}</mark>`;
  }
  if (mark.type === "textStyle") {
    // TextStyle with nothing set carries no meaning and must emit nothing, or every
    // caret move would litter the document with empty spans.
    const c = hex(mark.attrs?.color);
    return c ? `<span style="color:${c}">${inner}</span>` : inner;
  }
  const d = MARK_DELIM[mark.type];
  return d ? wrapMark(inner, d, d) : inner;
}

// Wrap a block in its alignment div. The blank lines either side are what keeps the
// content parsed as markdown rather than swallowed whole into an HTML block.
function withAlign(node: PMNode, md: string): string {
  const align = node.attrs?.textAlign;
  if (!align || align === "left" || !md.trim()) return md;
  return `<div style="text-align:${align}">\n\n${md}\n\n</div>`;
}

const sameMark = (a: PMMark, b: PMMark) =>
  a.type === b.type && JSON.stringify(a.attrs ?? null) === JSON.stringify(b.attrs ?? null);

// A mark that continues across several runs must be written as ONE span. Emitting a
// delimiter per run turns italic-text-containing-code into "*`x`**.*" — the "**" is an
// accidental bold delimiter, the document no longer round-trips, and the teacher loses
// the visual editor. So: take the outermost mark still to be written, extend it over
// every following run that carries the same mark, wrap once, and recurse inside.
function runsToMd(nodes: PMNode[], applied: string[] = []): string {
  let out = "";
  let i = 0;
  while (i < nodes.length) {
    const n = nodes[i];
    const pending = sortMarks((n.marks ?? []).filter((m) => !applied.includes(m.type)));
    if (!pending.length) {
      out += leafToMd(n, applied);
      i++;
      continue;
    }
    const mark = pending[0]; // MARK_ORDER puts the outermost first
    let j = i + 1;
    while (j < nodes.length && (nodes[j].marks ?? []).some((m) => sameMark(m, mark))) j++;
    out += wrapWith(mark, runsToMd(nodes.slice(i, j), [...applied, mark.type]));
    i = j;
  }
  return out;
}

function inlineToMd(raw: PMNode[] = []): string {
  return runsToMd(mergeText(raw));
}

// A pipe table. Column alignment lives in the delimiter row, and a literal "|" inside
// a cell has to be escaped or it would end the cell early — that escape is the one
// thing standing between a Cayley table of operations and a mangled document.
const DELIM: Record<string, string> = { left: ":--", center: ":-:", right: "--:" };

function tableToMd(n: PMNode): string {
  const rows = n.content ?? [];
  if (!rows.length) return "";
  const cellText = (cell: PMNode) =>
    (cell.content ?? [])
      .map((block) => inlineToMd(block.content))
      .join(" ")
      .replace(/\|/g, "\\|")
      .trim();

  const body = rows.map((row) => (row.content ?? []).map(cellText));
  const cols = body[0].length; // guaranteed uniform — mdToDoc refuses ragged tables
  const align = (rows[0]?.content ?? []).map((c) => String(c.attrs?.textAlign ?? ""));
  const pad = (r: string[]) => Array.from({ length: cols }, (_, i) => r[i] ?? "");

  const header = `| ${pad(body[0]).join(" | ")} |`;
  const rule = `| ${Array.from({ length: cols }, (_, i) => DELIM[align[i]] ?? "---").join(" | ")} |`;
  const rest = body.slice(1).map((r) => `| ${pad(r).join(" | ")} |`);
  return [header, rule, ...rest].join("\n");
}

function blockToMd(n: PMNode, indent = ""): string {
  switch (n.type) {
    case "paragraph":
      return withAlign(n, indent + inlineToMd(n.content));
    case "heading":
      return withAlign(n, indent + "#".repeat(Number(n.attrs?.level ?? 2)) + " " + inlineToMd(n.content));
    case "blockMath": {
      const tex = String(n.attrs?.tex ?? "");
      if (!tex.trim()) return ""; // empty placeholder — see inlineToMd
      // Multi-line LaTeX (\begin{array}…) only survives in the fenced form.
      return tex.includes("\n") ? `$$\n${tex}\n$$` : `$$${tex}$$`;
    }
    case "rawHtml":
      return String(n.attrs?.html ?? "");
    case "table":
      return tableToMd(n);
    case "horizontalRule":
      return "---";
    case "figure":
      return "```figure\n" + figureToJson((n.attrs?.spec ?? { type: "line" }) as FigureSpec) + "\n```";
    case "codeBlock":
      return "```" + (n.attrs?.language ?? "") + "\n" + (n.content?.[0]?.text ?? "") + "\n```";
    case "blockquote":
      return (n.content ?? []).map((c) => blockToMd(c, indent + "> ")).join("\n>\n");
    case "bulletList":
    case "orderedList": {
      const ordered = n.type === "orderedList";
      return (n.content ?? [])
        .map((li, i) => {
          const bullet = ordered ? `${i + 1}. ` : "- ";
          const pad = " ".repeat(bullet.length);
          const inner = (li.content ?? []).map((c, j) => blockToMd(c, j === 0 ? "" : pad)).join("\n\n");
          return indent + bullet + inner;
        })
        .join("\n");
    }
    default:
      return "";
  }
}

export function docToMd(doc: PMNode): string {
  // No global blank-line collapse here: empty blocks are already filtered out, so the
  // join alone gives exactly one blank line between blocks. A "\n{3,}" sweep would
  // instead reach INSIDE code blocks and multi-line formulas, silently eating the
  // spacing of the EXETAT exam papers that are stored as preformatted text.
  return (doc.content ?? [])
    .map((n) => blockToMd(n))
    .filter((s) => s.trim() !== "")
    .join("\n\n")
    .trim();
}

// The safety gate the editor opens behind.
//
// Rather than guess from node types which documents are safe, prove it for THIS
// document: convert it, convert it back, and check the two documents are identical.
// If anything drifts — an unsupported construct, a mark spanning a formula, a list
// shape we would re-space — the visual editor stays shut and the teacher keeps the
// source editor. Never trade a teacher's content for a nicer editing experience.
export function canEditVisually(md: string): { ok: boolean; reason?: string } {
  const { doc, unsupported } = mdToDoc(md);
  if (unsupported.length) {
    const names: Record<string, string> = {
      html: "du HTML ou une figure SVG",
      table: "un tableau",
      image: "une image",
      footnoteReference: "une note de bas de page",
      figure: "une figure dont les données sont abîmées",
    };
    const what = unsupported.map((u) => names[u] ?? u).join(", ");
    return { ok: false, reason: `Cette leçon contient ${what} — l'éditeur visuel ne sait pas encore le représenter sans risque.` };
  }
  try {
    if (JSON.stringify(mdToDoc(docToMd(doc)).doc) !== JSON.stringify(doc)) {
      return { ok: false, reason: "Une mise en forme de cette leçon ne survivrait pas à l'aller-retour (souvent du gras autour d'une formule)." };
    }
  } catch {
    return { ok: false, reason: "Cette leçon n'a pas pu être analysée." };
  }
  return { ok: true };
}
