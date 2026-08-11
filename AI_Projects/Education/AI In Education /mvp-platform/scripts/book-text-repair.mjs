// Repairs for what a page scan leaves in the text once the pages are gone.
//
// A printed book carries furniture that only makes sense on paper: the title repeated
// across the top of every page, and a caption like "Fig. 7" printed under a drawing.
// Flatten the pages into one stream and both become debris — the running head lands in
// the middle of a proof, and the caption sits alone with nothing beside it, reading
// exactly like a figure that failed to arrive.
//
// Neither is guesswork: a running head is identified by repeating across the book, and a
// caption by the figure it names.

const FIG_LABEL = /^\s*(?:Fig\.?|FIG\.?|Figure)\s*\.?\s*(\d{1,3})\s*\.?\s*$/;
const FIGURE_BLOCK = /<figure class="ai-figure">[\s\S]*?<\/figure>/g;

/**
 * Standalone lines that repeat across the whole book are its running head.
 *
 * Frequency is the whole test, and it has to be measured over the book rather than the
 * chapter: "TRIGONOMÉTRIE" tops 82 pages, while a real heading is written once. Lines
 * introduced by "#" are exempt — those are headings the transcription already
 * recognised, and "EXERCICES" is printed once per chapter for a reason.
 *
 * @param {string} text  the whole book
 * @param {number} min   how many repeats before a line counts as furniture
 * @returns {Set<string>} the lines to drop
 */
export function findRunningHeads(text, min = 5) {
  const lines = String(text).split("\n");

  // What the book uses as a title somewhere. Frequency alone is not enough to identify
  // page furniture: the EXETAT item bank tags each question with the sitting it came
  // from — "(EXETAT 2020)", fifteen times over — and those are the provenance of the
  // question, not decoration. A running head reproduces a heading; a tag never is one.
  const asHeading = new Set();
  for (const raw of lines) {
    const m = /^#{1,6}\s+(.*\S)\s*$/.exec(raw);
    if (m) asHeading.add(norm(m[1]));
  }

  const counts = new Map();
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("<") || line.startsWith(">")) continue;
    if (line.length > 60) continue;
    // Only the shouted lines: a running head is set in caps, and requiring that keeps a
    // repeated ordinary sentence ("On a donc :") out of it.
    const letters = line.replace(/[^A-Za-zÀ-ÿ]/g, "");
    if (letters.length < 4) continue;
    if (letters.replace(/[^A-ZÀ-Þ]/g, "").length / letters.length < 0.9) continue;
    // A bracketed line, or one carrying a year, is a provenance tag — "(EXETAT 2019)"
    // against a question. Some of those are also written as headings in that book, so
    // the heading test alone does not separate them. Losing a running head costs a
    // repeated title; losing a tag costs the reader the session the question came from.
    if (/^[^A-Za-zÀ-ÿ]*[([]/.test(line) || /\b(?:1[89]|20)\d{2}\b/.test(line)) continue;
    if (!asHeading.has(norm(line))) continue;
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, n]) => n >= min).map(([l]) => l));
}

const norm = (s) =>
  String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Drop the running heads from a chapter. */
export function stripRunningHeads(text, heads) {
  if (!heads?.size) return text;
  return String(text)
    .split("\n")
    .filter((l) => !heads.has(l.trim()))
    .join("\n");
}

/**
 * Drop headings left dangling at the end of a chapter.
 *
 * A part title is printed on its own page before the chapter it opens — "DEUXIÈME
 * PARTIE / FONCTIONS CIRCULAIRES" sits ten lines ahead of "CHAPITRE II" — so slicing at
 * the chapter marker leaves it hanging off the end of the chapter before, announcing a
 * section that never arrives. A chapter never really ends on a heading with nothing
 * under it.
 */
export function trimTrailingHeadings(text) {
  const lines = String(text).split("\n");
  let end = lines.length;
  while (end > 0) {
    const line = lines[end - 1].trim();
    if (!line) { end--; continue; }
    // Page markers and rules sit between the part title and the chapter marker; if they
    // stopped the scan the title above them would survive, which is the whole bug.
    if (/^<!--[\s\S]*-->$/.test(line) || /^-{3,}$/.test(line)) { end--; continue; }
    // A bare page number is furniture too, and it was stopping the scan one line short
    // of the part title it precedes.
    if (!/[A-Za-zÀ-ÿ]/.test(line) && line.length <= 8) { end--; continue; }
    const isHeading = /^#{1,6}\s+\S/.test(line);
    // A bare shouted line is the same thing without its "#": part titles are often
    // transcribed as plain text.
    const letters = line.replace(/[^A-Za-zÀ-ÿ]/g, "");
    const shouted = line.length <= 60 && letters.length >= 4
      && letters.replace(/[^A-ZÀ-Þ]/g, "").length / letters.length >= 0.9;
    if (isHeading || shouted) { end--; continue; }
    break;
  }
  return lines.slice(0, end).join("\n");
}

const TEXT_IN_SVG = /<text[^>]*>([^<]*)<\/text>/g;
const GEOMETRY = /<circle|<ellipse|<line |<polyline|<polygon|<img/;

/**
 * Is this "figure" a crop of the page that carries nothing?
 *
 * The transcription cuts the scan into regions, and some of those catch only the page
 * number and the scanner's watermark — a figure whose whole content is "277 Scanned by
 * CamScanner". It draws nothing and says nothing.
 *
 * A figure with no text at all is NOT this: an unlabelled diagram is still a diagram.
 */
export function carriesNothing(block) {
  const texts = [...String(block).matchAll(TEXT_IN_SVG)].map((m) => m[1]);
  if (!texts.length) return false;
  const joined = texts.join(" ");
  const watermark = /scanned\s*(?:by|with)\s*camscanner/i.test(joined);
  const words = joined
    .replace(/scanned\s*(?:by|with)\s*camscanner/gi, "")
    .replace(/[\d\s.,;:—–\-()]/g, "");
  if (words) return false;                       // real words: keep it
  // The watermark belongs to the scanner, never to the book, so a crop carrying it and
  // nothing else is page furniture however many strokes it contains — this one draws a
  // rule under the watermark, which was enough to look like a diagram.
  if (watermark) return true;
  return !GEOMETRY.test(block) && (block.match(/<path/g) ?? []).length <= 2;
}

/**
 * Drop figures that repeat, and figures that carry nothing.
 *
 * Only byte-identical repeats. Figures that merely LOOK alike are routinely distinct —
 * "a ≠ b ≠ c" and "a = b ≠ c" are two crystal systems, "B(x₂,y₂)" and "B(x₁,y₁)" two
 * different points — and 17 pairs across the corpus sit above 90% similarity while
 * saying different things. Dropping on resemblance would delete real content.
 */
export function dropRedundantFigures(text) {
  const src = String(text);
  if (!src.includes('<figure class="ai-figure"')) return src;
  const seen = new Set();
  let dropped = 0;
  const out = src.replace(FIGURE_BLOCK, (block) => {
    if (carriesNothing(block)) { dropped++; return ""; }
    const key = block.replace(/\s+/g, " ").trim();
    if (seen.has(key)) { dropped++; return ""; }
    seen.add(key);
    return block;
  });
  return dropped ? out.replace(/\n{3,}/g, "\n\n") : src;
}

const svgTexts = (block) => {
  const out = [];
  for (const m of String(block).matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
    const a = m[1], v = m[2].trim();
    if (!v) continue;
    const n = (k) => {
      const g = new RegExp(`\\b${k}="(-?[\\d.]+)"`).exec(a);
      return g ? Number.parseFloat(g[1]) : 0;
    };
    out.push({ x: n("x"), y: n("y"), size: n("font-size") || 16, value: v });
  }
  return out;
};

/**
 * Is this figure only a picture of printed text — no drawing in it at all?
 *
 * The question matters because the same strokes mean different things. A short horizontal
 * line is a fraction bar in a maths book and an orbital box in a chemistry one; a
 * four-point path is a radical sign or an arrow. So the test is deliberately strict: no
 * shape primitives, no curves, no long paths, and every line must be doing the one job a
 * fraction bar does — carrying text above it and text below it.
 */
export function isTextPicture(block) {
  const s = String(block);
  if (/<circle|<ellipse|<polyline|<polygon|<img|<image|<textPath/.test(s)) return false;
  for (const m of s.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)) {
    if (/[CQAZcqaz]/.test(m[1])) return false;                       // a curve is a drawing
    if ((m[1].match(/[ML]/g) ?? []).length > 6) return false;        // a long path is a shape
  }
  const texts = svgTexts(s);
  if (!texts.length) return false;
  const median = texts.map((t) => t.size).sort((a, b) => a - b)[Math.floor(texts.length / 2)] || 16;
  for (const m of s.matchAll(/<line\b([^>]*)>/g)) {
    const a = m[1];
    const n = (k) => {
      const g = new RegExp(`\\b${k}="(-?[\\d.]+)"`).exec(a);
      return g ? Number.parseFloat(g[1]) : 0;
    };
    const y1 = n("y1"), y2 = n("y2");
    if (Math.abs(y1 - y2) > 2) return false;                          // an axis, not a bar
    const y = (y1 + y2) / 2, lo = Math.min(n("x1"), n("x2")) - 8, hi = Math.max(n("x1"), n("x2")) + 8;
    const span = median * 2.2;
    const above = texts.some((t) => t.x >= lo && t.x <= hi && t.y < y && y - t.y < span);
    const below = texts.some((t) => t.x >= lo && t.x <= hi && t.y > y && t.y - y < span);
    if (!above || !below) return false;                               // nothing to divide
  }
  return true;
}

const bagOfWords = (s) => new Set((String(s).toLowerCase().match(/[a-zà-ÿ0-9]{3,}/g) ?? []));

/**
 * Drop a picture of text whose words the chapter already states in type.
 *
 * The transcription sometimes emits a page region as a figure AND transcribes the same
 * region as text. The reader then meets a blurry crop of a question printed in full just
 * below it — which is what a teacher reported of the asymptotes exercise, where seven
 * crops sat between the statement and its four functions.
 *
 * Judged over the whole chapter, not one lesson: the packer splits a chapter afterwards,
 * and the crop and the text it repeats routinely land in different lessons.
 *
 * `keep` lists captions that must survive regardless — the escape hatch for a figure a
 * teacher has looked at and wants back.
 */
// What the caption says the crop IS. The stroke test cannot tell an orbital box from a
// fraction bar — both are a short horizontal line with letters near it — so the caption
// casts the deciding vote. Of the nine crops the stroke test alone accepted, six turned
// out to be drawings: a probability tree, a projection construction, and orbital diagrams
// for silicon and phosphorus. Every one of them says so in its own caption.
const CALLS_ITSELF_AN_EXERCISE = /\bexercices?\b/i;
const CALLS_ITSELF_A_DRAWING = /\bsch[ée]mas?\b|\bdiagrammes?\b|\bgraphiques?\b|\bprojection\b|\bcourbes?\b|\brepr[ée]sentation\b/i;

/**
 * @param {string} text
 * @param {{keep?: string[]}} [opts]  `keep` — caption fragments that must survive
 * @returns {{text: string, dropped: string[]}}
 */
export function dropFiguresAlreadyInText(text, { keep = [] } = {}) {
  const src = String(text);
  if (!src.includes('<figure class="ai-figure"')) return { text: src, dropped: [] };
  const prose = bagOfWords(src.replace(FIGURE_BLOCK, " "));
  const dropped = [];
  const out = src.replace(FIGURE_BLOCK, (block) => {
    if (!isTextPicture(block)) return block;
    const caption = captionOf(block).replace(/<[^>]+>/g, "").trim();
    if (keep.some((k) => caption.includes(k))) return block;
    if (!CALLS_ITSELF_AN_EXERCISE.test(caption) || CALLS_ITSELF_A_DRAWING.test(caption)) return block;
    const own = bagOfWords(svgTexts(block).map((t) => t.value).join(" "));
    if (own.size < 4) return block;                                   // too little to judge
    const covered = [...own].filter((w) => prose.has(w)).length / own.size;
    if (covered < 0.9) return block;
    dropped.push(caption);
    return "";
  });
  return { text: dropped.length ? out.replace(/\n{3,}/g, "\n\n") : src, dropped };
}

const captionOf = (block) => {
  const m = /<figcaption>([\s\S]*?)<\/figcaption>/.exec(block);
  return m ? m[1] : "";
};

// Some of the drawings carry their own number, lettered into the SVG ("Fig. 57"). That
// is the only reliable way to tell which figure a caption belongs to.
const numberInside = (block) => {
  const m = /<text[^>]*>\s*Fig\.?\s*(\d{1,3})\s*<\/text>/i.exec(block);
  return m ? Number(m[1]) : null;
};

/**
 * Put each figure where the book puts it: under the caption that names it.
 *
 * The transcription emits the caption as a bare "Fig. 7" line, in the flow of the prose
 * where the book printed it, and the drawing itself somewhere later in the section. A
 * reader meets the caption with nothing under it and reasonably concludes the figure is
 * missing — which is what a teacher reported of the trigonometry book, where 63 of these
 * are stranded.
 *
 * Figures that letter their own number are matched by it; the rest are paired with the
 * remaining captions in the order both appear. A caption with no figure to claim is
 * dropped — it names a drawing that is not in this transcription, and an empty label
 * helps nobody. A figure no caption claims is left exactly where it was.
 */
export function anchorFigures(text) {
  const src = String(text);
  const blocks = src.match(FIGURE_BLOCK) ?? [];
  const lines = src.split("\n");
  // No figures at all: every caption here names one this transcription does not have,
  // and a bare "Fig. 12" is precisely what reads as a figure that failed to load.
  if (!blocks.length) {
    const kept = lines.filter((l) => !FIG_LABEL.test(l));
    return kept.length === lines.length ? src : kept.join("\n");
  }
  const labels = [];
  lines.forEach((l, i) => {
    const m = FIG_LABEL.exec(l);
    if (m) labels.push({ line: i, num: Number(m[1]) });
  });
  if (!labels.length) return src;

  const free = blocks.map((block, i) => ({ block, i, num: numberInside(block), taken: false }));
  const claim = new Map(); // line index → figure block

  // First pass: a figure that says which one it is.
  for (const label of labels) {
    const hit = free.find((f) => !f.taken && f.num === label.num);
    if (hit) { hit.taken = true; claim.set(label.line, hit); label.done = true; }
  }
  // Second pass: everything else, in the order both appear.
  for (const label of labels) {
    if (label.done) continue;
    const hit = free.find((f) => !f.taken && f.num === null);
    if (hit) { hit.taken = true; claim.set(label.line, hit); label.done = true; }
  }

  // Rebuild: the claimed figures move to their caption, and are removed from where the
  // transcription had parked them.
  const moved = new Set([...claim.values()].map((f) => f.i));
  let seen = -1;
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isFigure = line.includes('<figure class="ai-figure"');
    if (isFigure) {
      seen++;
      if (moved.has(seen)) continue; // it now lives under its caption
      out.push(line);
      continue;
    }
    const claimed = claim.get(i);
    if (claimed) {
      out.push(withCaptionNumber(claimed.block, FIG_LABEL.exec(line)[1]));
      continue;
    }
    if (FIG_LABEL.test(line)) continue; // stranded caption: nothing to show under it
    out.push(line);
  }
  return out.join("\n");
}

/** Give the figure the number the book printed under it, if its caption lacks one. */
function withCaptionNumber(block, num) {
  const caption = captionOf(block);
  if (/\bFig\.?\s*\d/i.test(caption)) return block;
  if (!caption) {
    return block.replace("</figure>", `<figcaption>Fig. ${num}</figcaption></figure>`);
  }
  return block.replace(caption, `Fig. ${num} — ${caption.replace(/^\s+/, "")}`);
}

export const __test__ = { FIG_LABEL, numberInside, withCaptionNumber };
