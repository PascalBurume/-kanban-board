// Repair OCR/conversion LaTeX artifacts across ALL refined books so every math span
// renders. KaTeX (throwOnError:false in <Markdown/>) otherwise shows red source or
// raw text. Observed broken shapes (book-agnostic):
//   • a stray $$ glued INSIDE a formula                 ( S_{2}$$O_{8}^{2-} )
//   • $$ stuck to text → mis-paired display spans that swallow whole sections
//   • sub/superscripts trapped in \text{…}               ( \text{e^-}, \text{^11} )
//   • incomplete fractions                               ( \frac{X} — denom lost )
//   • the middot U+00B7 "·"  → KaTeX maps it to undefined \cdotp
//   • prime after a bare super/subscript                 ( A^H'  → "Double superscript" )
//   • invented element macros                            ( \Na, \Cl → undefined )
//   • \iinfty typo for \infty
//   • & / \\ alignment used OUTSIDE an aligned/cases env  ( \lim … &= … )
//
// CRUCIAL: parses with the SAME remark-parse + remark-math the reader uses, so the
// validated math nodes are EXACTLY what KaTeX renders in the app (a naive $-pairing
// regex disagrees with micromark and misses these). Each failing node is repaired
// (and re-validated), UNWRAPPED when it swallowed markdown structure, or degraded to
// readable Unicode. Then bare LaTeX left in PROSE is cleaned. Loops until the real
// parser reports 0. Idempotent → safe on every reseed.
// Env: FIX_BOOKS=a,b limits to those book slugs; DRY=1 reports only.
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";
import { visit } from "unist-util-visit";
import katex from "katex";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const REFINED = path.join(ROOT, "public/content/refined");
const DRY = (globalThis.process?.env?.DRY) === "1";
const ONLY = (globalThis.process?.env?.FIX_BOOKS || "").split(",").map((s) => s.trim()).filter(Boolean);

const proc = unified().use(remarkParse).use(remarkMath);
export const renders = (tex, display) => { try { katex.renderToString(tex, { throwOnError: true, strict: false, displayMode: display }); return true; } catch { return false; } };
export function mathNodes(md) {
  const tree = proc.parse(md); proc.runSync(tree);
  const out = [];
  visit(tree, (n) => { if ((n.type === "math" || n.type === "inlineMath") && n.position) out.push(n); });
  return out;
}

// Valid short capital-initial KaTeX commands that must NOT be wrapped in \mathrm.
const KEEP_CMD = /^(Pi|Xi|Pr|Re|Im)$/;

// ---- targeted repairs (run only when a node fails to render) ----
function repairSpan(tex, disp) {
  let t = tex.replace(/\$+/g, "");                            // strip stray inner $ / $$
  t = t.replace(/\\iinfty\b/g, "\\infty");                    // typo
  // middot: KaTeX maps "·" to undefined \cdotp. Split it out of \text{…}, then → \cdot.
  t = t.replace(/\\text\s*\{([^{}]*·[^{}]*)\}/g, (_m, inner) => "\\text{" + inner.replace(/·/g, "}\\cdot\\text{") + "}");
  t = t.replace(/·/g, "\\cdot");
  // prime after a bare super/subscript: A^H' → A^{H'}
  t = t.replace(/\^([A-Za-z0-9])'/g, "^{$1'}").replace(/_([A-Za-z0-9])'/g, "_{$1'}");
  // invented short capital macro (chem element etc.) → \mathrm{…}, sparing real commands
  t = t.replace(/\\([A-Z][a-z]?)(?![a-zA-Z])/g, (m, g) => (KEEP_CMD.test(g) ? m : `\\mathrm{${g}}`));
  // sub/superscripts trapped inside \text{…}
  t = t.replace(/\\text\s*\{([^{}]*[\^_][^{}]*)\}/g, (_m, inner) => {
    let s = inner.replace(/([\^_])\s*\{?([^{}\s^_]+)\}?/g, (_x, op, arg) => `${op}{${arg}}`);
    if (/^\s*[\^_]/.test(s)) s = "{}" + s.trimStart();
    return s;
  });
  t = t.replace(/\\textmu\b/g, "\\mu");
  t = t.replace(/^(\s*)([\^_])/, "$1{}$2").replace(/([,(=]|\\quad|\\;|\\,)\s*([\^_])/g, "$1 {}$2");
  t = t.replace(/\\d?frac\s*(\{(?:[^{}]|\{[^{}]*\})*\})(?!\s*\{)/g, (_m, num) => num.slice(1, -1)); // \frac{X} → X
  // alignment used outside an env: wrap display spans; strip stray \\ from inline.
  if (disp && /[&]|\\\\/.test(t) && !/\\begin\{/.test(t)) t = `\\begin{aligned}${t}\\end{aligned}`;
  else if (!/\\begin\{/.test(t)) t = t.replace(/\\\\/g, " ").replace(/&/g, "");
  t = t.replace(/\\text\s*\{\s*\}/g, "");
  return t.replace(/[ \t]+/g, " ").trim();
}

// ---- degrade to readable Unicode plain text (last resort) ----
const SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "n": "ⁿ", "=": "⁼" };
const SUB = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "=": "₌" };
const uni = (s) => s
  .replace(/\^\{([^{}]*)\}/g, (_, x) => [...x].map((c) => SUP[c] ?? c).join(""))
  .replace(/\^([A-Za-z0-9+=\-])/g, (_, c) => SUP[c] ?? ("^" + c))
  .replace(/_\{([^{}]*)\}/g, (_, x) => [...x].map((c) => SUB[c] ?? c).join(""))
  .replace(/_([A-Za-z0-9+=\-])/g, (_, c) => SUB[c] ?? ("_" + c));

function degrade(tex, inline = false) {
  let t = tex
    .replace(/\$+/g, "").replace(/\\\$/g, "").replace(/\\%/g, "%").replace(/·/g, "·")
    .replace(/\\d?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "$1/$2")
    .replace(/\\d?frac\s*\{([^{}]*)\}/g, "$1")
    .replace(/\\(?:mathrm|text|mathbf|mathit|operatorname|vec|hat|overrightarrow)\s*\{([^{}]*)\}/g, "$1")
    .replace(/\\(?:longrightarrow|xrightarrow|rightarrow|to)(?:\s*\{[^{}]*\})?/g, " → ")
    .replace(/\\(?:leftrightarrow|rightleftharpoons)(?:\s*\{[^{}]*\})?/g, " ⇌ ")
    .replace(/\\leftarrow/g, " ← ")
    .replace(/\\cdot|\\cdotp/g, "·").replace(/\\times/g, "×").replace(/\\div/g, "÷")
    .replace(/\\approx/g, "≈").replace(/\\leq/g, "≤").replace(/\\geq/g, "≥")
    .replace(/\\neq/g, "≠").replace(/\\pm/g, "±").replace(/\\i?infty/g, "∞")
    .replace(/\\(?:alpha|beta|gamma|delta|pi|theta|lambda|mu|omega|sigma|rho|varphi|Delta|Sigma)/g,
      (m) => ({ "\\alpha": "α", "\\beta": "β", "\\gamma": "γ", "\\delta": "δ", "\\pi": "π", "\\theta": "θ", "\\lambda": "λ", "\\mu": "µ", "\\omega": "ω", "\\sigma": "σ", "\\rho": "ρ", "\\varphi": "φ", "\\Delta": "Δ", "\\Sigma": "Σ" }[m] ?? ""))
    .replace(/\\left|\\right/g, "").replace(/\\,|\\;|\\!|\\quad|\\qquad/g, " ")
    .replace(/\\begin\{[^}]*\}|\\end\{[^}]*\}/g, " ").replace(/\\\\/g, " ").replace(/&/g, " ");
  t = uni(t);
  t = t.replace(/\\[a-zA-Z]+/g, "").replace(/[{}$\\]/g, "");
  return inline ? t : t.replace(/[ \t]{2,}/g, " ").trim();
}

// A failing node that swallowed a heading / list / multiple paragraphs / a numbered
// exercise is a mis-paired span — keep its content as markdown instead of degrading.
const hasStructure = (s) => /(^|\n)\s*#{1,6}\s|\n\s*\n|(^|\n)\s*[-*]\s|(^|\n)\s*\d+[.)]\s/.test(s) && s.length > 60;

const stats = { nodes: 0, ok: 0, repaired: 0, unwrapped: 0, degraded: 0 };

function fixContentOnce(md) {
  const nodes = mathNodes(md).sort((a, b) => b.position.start.offset - a.position.start.offset);
  let changed = false;
  for (const n of nodes) {
    stats.nodes++;
    const disp = n.type === "math";
    const val = n.value;
    if (renders(val, disp)) { stats.ok++; continue; }
    const s = n.position.start.offset, e = n.position.end.offset;
    const fixed = repairSpan(val, disp);
    let rep;
    if (renders(fixed, disp)) { rep = disp ? `$$${fixed}$$` : `$${fixed}$`; stats.repaired++; }
    else if (hasStructure(val)) { rep = `\n\n${val.trim()}\n\n`; stats.unwrapped++; }
    else { rep = degrade(val); stats.degraded++; }
    md = md.slice(0, s) + rep + md.slice(e);
    changed = true;
  }
  return { md, changed };
}

// Degrade bare LaTeX (and orphaned $) left in PROSE — text remark-math left outside
// every math node. Protects figures + valid math spans by their exact offsets.
function degradeProse(md) {
  const prot = [];
  for (const m of md.matchAll(/<figure class="ai-figure[\s\S]*?<\/figure>/g)) prot.push([m.index, m.index + m[0].length]);
  for (const n of mathNodes(md)) prot.push([n.position.start.offset, n.position.end.offset]);
  prot.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of prot) { const last = merged[merged.length - 1]; if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push([...r]); }
  const deg = (t) => (/[\\$]/.test(t) ? degrade(t, true) : t);
  let out = "", pos = 0;
  for (const [s, e] of merged) { out += deg(md.slice(pos, s)); out += md.slice(s, e); pos = e; }
  out += deg(md.slice(pos));
  return out;
}

export function fixContent(md) {
  md = md.replace(/\b(de|des|du|la|le|les|et|en|un|une|à)\s+\1\b/gi, "$1");   // OCR-doubled words
  for (let pass = 0; pass < 4; pass++) { const r = fixContentOnce(md); md = r.md; if (!r.changed) break; }
  md = degradeProse(md);
  return md;
}

// CLI: fix every refined lesson's contentMd. Guarded so importing fixContent
// (e.g. from fix-exercises-latex.mjs) does not trigger this pass.
function runCli() {
  if (!fs.existsSync(REFINED)) { console.log("fix-content-latex: refined/ missing — skipping."); return; }
  const books = fs.readdirSync(REFINED)
    .filter((d) => fs.statSync(path.join(REFINED, d)).isDirectory() && (!ONLY.length || ONLY.includes(d)));
  let filesChanged = 0;
  for (const book of books) {
    const dir = path.join(REFINED, book);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const p = path.join(dir, f);
      const mod = JSON.parse(fs.readFileSync(p, "utf8"));
      let touched = false;
      for (const l of mod.lessons || []) {
        const before = l.contentMd || "";
        const after = fixContent(before);
        if (after !== before) { l.contentMd = after; touched = true; }
      }
      if (touched && !DRY) { fs.writeFileSync(p, JSON.stringify(mod, null, 2) + "\n"); filesChanged++; }
    }
  }
  console.log(`fix-content-latex${DRY ? " [DRY]" : ""}: books=${books.length} math-nodes=${stats.nodes} ok=${stats.ok} repaired=${stats.repaired} unwrapped=${stats.unwrapped} degraded=${stats.degraded} files-changed=${filesChanged}`);
}

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) runCli();
