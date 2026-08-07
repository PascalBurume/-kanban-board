"use client";
import { useMemo } from "react";
import katex from "katex";

// A symbol drawn as maths rather than named in words. Used by every surface that shows
// a palette entry — the desktop palette, the tablet symbol keyboard, the flyouts.
//
// throwOnError is off: these are fixed strings from symbols.ts, and a button that
// renders its own LaTeX source is more useful than one that renders an exception.
export default function TexPreview({ tex, className = "lw-tex" }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, { throwOnError: false });
    } catch {
      return tex;
    }
  }, [tex]);
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
