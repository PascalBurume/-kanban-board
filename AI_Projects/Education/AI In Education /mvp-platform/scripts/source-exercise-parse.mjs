// Pure parsing rules for lifting exercises out of a transcribed book source.
// Split out of build-source-exercises.mjs so they can be tested: 1700+ published
// exercises depend on these regexes, and a silent change to any of them either
// drops real exercises or invents phantom ones out of prose.

// Scan artefacts that sit inside an exercise body without being part of it.
const NOISE = [
  /^\s*<!--\s*page \d+\s*-->\s*$/i,
  /^\s*Scanned by CamScanner\s*$/i,
  /^\s*-{3,}\s*$/,
  /^\s*\d{1,3}\s*$/,          // a bare page number on its own line
  /^\s*page \d+\s*$/i,
];

// Section headings that open a run of exercises, with or without a `#` prefix —
// the transcriptions are inconsistent about which they use.
export const SEC = /^#{0,4}\s*(Exercices?\s+r[ée]solus?|Exercices?)\s*$/i;
// « Résolution » does NOT close a section: the worked solution belongs to the
// exercise above it. Every other heading does.
export const RESOL = /^#{0,4}\s*(R[ée]solution|Corrig[ée])\s*$/i;
export const HEAD = /^#{1,4}\s+\S/;

export const denoise = (s) =>
  s.split("\n").filter((l) => !NOISE.some((re) => re.test(l))).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

// Figures are embedded as <figure class="ai-figure"> blocks. They belong to the
// lesson, not to an exercise statement, and an AI-recreated diagram must never
// ride along inside something we are calling verbatim book text.
export const stripFigures = (s) =>
  s.replace(/<figure[\s\S]*?<\/figure>/gi, "").replace(/\n{3,}/g, "\n\n").trim();

// The transcriptions mix LaTeX delimiters: `$…$` mostly, but `\(…\)` and `\[…\]`
// in about one item in seven. remark-math only understands the dollar forms, so
// the others would reach the page as literal backslashes. Delimiters only — the
// mathematics inside is untouched.
export const normalizeMath = (s) =>
  s.replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => `$$${m}$$`)
   .replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => `$${m}$`);

// The exercise sections inside one chapter, in book order.
export function sections(chapter) {
  const lines = chapter.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(SEC);
    if (!m) continue;
    const solved = /r[ée]solus?/i.test(m[1]);
    const body = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      if (SEC.test(lines[j])) break;
      if (HEAD.test(lines[j]) && !RESOL.test(lines[j])) break;
      body.push(lines[j]);
    }
    out.push({ solved, label: m[1].trim(), body: body.join("\n") });
    i = j - 1;
  }
  return out;
}

// Split a section into its numbered items. Only a consecutive run counts: a
// stray "1." inside prose would otherwise open a phantom exercise and swallow
// the rest of the section.
export function items(body) {
  const lines = body.split("\n");
  const found = [];
  let cur = null;
  for (const l of lines) {
    const m = l.match(/^(\d{1,3})\.\s+(\S.*)$/);
    if (m) {
      if (cur) found.push(cur);
      cur = { n: Number(m[1]), text: m[2] };
    } else if (cur) {
      cur.text += "\n" + l;
    }
  }
  if (cur) found.push(cur);
  return found.filter((it, k) => (k === 0 ? true : it.n === found[k - 1].n + 1));
}

// « Résolution » separates the statement from the worked solution. Everything
// after the marker is the book's own solution — never a generated one.
export function splitSolution(text) {
  const m = text.match(/^#{0,4}\s*(R[ée]solution|Corrig[ée])\s*:?\s*$/im);
  if (!m) return { statement: text.trim(), solution: "" };
  return {
    statement: text.slice(0, m.index).trim(),
    solution: text.slice(m.index + m[0].length).trim(),
  };
}

// Answer-key lines ("Rép : …") are part of the printed exercise. They stay in
// the statement rather than being promoted to a solution: an answer is not a
// worked solution, and presenting one as the other is the mistake this whole
// pipeline exists to undo.
export const hasAnswer = (s) => /R[ée]p\s*\.?\s*:/i.test(s);
