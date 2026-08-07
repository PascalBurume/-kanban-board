"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import { renderFigure, parseFigure } from "@/lib/figures";
import { sanitizeHast } from "@/lib/mdSanitize";

// Exercise statements and worked solutions put each sub-item ("a) …", "b) …")
// on its own line separated by a single newline, which Markdown folds into one
// run-on paragraph. `breaks` turns those soft newlines into hard breaks — but
// never inside $$…$$ blocks, whose newlines are meaningful to KaTeX.
function hardBreaks(md) {
  return md
    .split(/(\$\$[\s\S]*?\$\$)/g)
    .map((part, i) => (i % 2 ? part : part.replace(/(?<! {2})\n(?!\n)/g, "  \n")))
    .join("");
}

// Some AI-refined solutions were truncated mid-formula, leaving an unterminated
// "$…" or "$$…" that renders as raw LaTeX source. Close it so KaTeX typesets
// the fragment instead of leaking `$x^2 + 5x + 11` into the page. Display
// blocks are closed first, then whatever inline math remains open.
function closeDanglingMath(md) {
  let out = md.trimEnd();
  // A trailing lone "$" opens math with no content — drop it rather than close
  // it, which would otherwise form a "$$" display delimiter.
  out = out.replace(/(^|[^$])\$$/, "$1").trimEnd();
  if ((out.split("$$").length - 1) % 2) out += "$$";
  const inline = out.replace(/\$\$[\s\S]*?\$\$/g, "");
  if ((inline.split("$").length - 1) % 2) out += "$";
  return out;
}

// A wide table (e.g. an operation / Cayley table over P(E)) must scroll inside
// its own box rather than overflow and clip the page. Wrapping it keeps the
// surrounding prose full-width while the table itself is horizontally scrollable.
// A ```figure block holds a chart spec, not source code. Students must see the
// picture the teacher drew — the same renderer runs on both sides.
function FigureBlock({ json }) {
  const spec = parseFigure(json);
  if (!spec) return <pre className="md-figure-bad">{json}</pre>;
  return <div className="md-figure" role="img" aria-label={spec.title ? `Figure : ${spec.title}` : "Figure"} dangerouslySetInnerHTML={{ __html: renderFigure(spec) }} />;
}

const components = {
  table: ({ node, ...props }) => (
    <div className="md-table-wrap">
      <table {...props} />
    </div>
  ),
  code: ({ node, className, children, ...props }) => {
    if (className === "language-figure") return <FigureBlock json={String(children ?? "")} />;
    return <code className={className} {...props}>{children}</code>;
  },
};

export default function Markdown({ children, breaks = false }) {
  let src = String(children ?? "");
  if (breaks) src = hardBreaks(closeDanglingMath(src));

  return (
    <div className="prose-reader max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, sanitizeHast, [rehypeKatex, { throwOnError: false, strict: false }]]}
        components={components}
      >
        {src}
      </ReactMarkdown>
    </div>
  );
}
