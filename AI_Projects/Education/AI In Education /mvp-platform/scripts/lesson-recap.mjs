// The « À retenir » block closing each book lesson.
//
// Written from the lesson and nothing else. The book states its own definitions and
// theorems — "DÉFINITION. — Si l'on considère deux droites…", "THÉORÈME : Un angle de
// droites admet deux bissectrices perpendiculaires" — and those sentences, quoted, are a
// better recap than anything a model would compose about them. Where a lesson states
// none (a run of worked exercises, say), the recap says what the lesson works through,
// taken from its own section headings.
//
// Nothing here writes a sentence the book did not write. That is the point: a pupil
// revising from the recap is revising the manual.

// How the schoolbooks announce a result. The scan shouts them, and the punctuation after
// varies wildly ("DÉFINITION. —", "THÉORÈME :", "PROPRIÉTÉ 2.").
// The trailing boundary is a lookahead, not \b: "PROPRIÉTÉ" ends in a non-ASCII letter,
// and \b does not see a word boundary after one — that marker alone was never matching.
const MARKER = /^\s*(?:\*\*)?\s*(DÉFINITIONS?|DEFINITIONS?|THÉORÈMES?|THEOREMES?|PROPRIÉTÉS?|PROPRIETES?|COROLLAIRES?|RÈGLES?|REGLES?|PROPOSITIONS?|LEMMES?|CONSÉQUENCES?|CONSEQUENCES?)(?![A-Za-zÀ-ÿ])[\s.:—–-]*(.*)$/i;

const HEADING = /^#{2,4}\s+(.+)$/;

// Long enough to be a statement, short enough to stay a bullet.
const MIN_LEN = 25;
const MAX_LEN = 240;

const tidy = (s) =>
  String(s)
    .replace(/<[^>]+>/g, " ")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Brackets and maths delimiters closed — a bullet that stops inside either is a cut. */
function balanced(s) {
  const open = (s.match(/\(/g) ?? []).length;
  const close = (s.match(/\)/g) ?? []).length;
  return open === close && ((s.match(/\$/g) ?? []).length % 2 === 0);
}

// The book runs many statements straight into a displayed formula, so the prose stops
// without a full stop. Say so, rather than presenting the fragment as a whole sentence.
const finish = (s) => (/[.!?]$/.test(s) ? s : `${s}…`);

/**
 * The statement's first sentence.
 *
 * Cutting at a fixed length lands mid-clause — "Si OC est une troisième demi-droite
 * d'origine O," is not something to revise from — so the sentence boundary is found
 * first and length is only the last resort.
 */
function firstSentence(text) {
  const s = tidy(text);
  // A full stop that ends a sentence: followed by a space and a capital, or the end.
  // Not "1.1", not "Fig. 7", not "M. Dupont". The candidate must also be balanced —
  // stopping inside "deux axes (ou de deux vecteurs)" reads as a truncation, and a lone
  // "$" would leave the reader half a formula.
  const end = /[.!?](?=\s+[A-ZÀ-Þ(]|\s*$)/g;
  let m;
  while ((m = end.exec(s))) {
    const cand = s.slice(0, m.index + 1);
    if (cand.length >= MIN_LEN && balanced(cand)) return cand;
    if (m.index > MAX_LEN * 2) break;
  }
  if (s.length <= MAX_LEN) return finish(s.replace(/[\s,;:—–-]+$/, ""));
  // Don't cut inside $…$ — half a formula is worse than a long line.
  const cut = s.slice(0, MAX_LEN);
  const dollars = (cut.match(/\$/g) ?? []).length;
  const safe = dollars % 2 === 0 ? cut : cut.slice(0, cut.lastIndexOf("$"));
  const stop = Math.max(safe.lastIndexOf(", "), safe.lastIndexOf("; "));
  return `${(stop > MIN_LEN ? safe.slice(0, stop) : safe).replace(/[\s,;:—–-]+$/, "")}…`;
}

/**
 * The results the lesson states, in order, as {kind, text}.
 * A marker on its own line carries its statement on the following lines.
 */
export function statements(md) {
  const lines = String(md).split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = MARKER.exec(lines[i]);
    if (!m) continue;
    const kind = m[1].toUpperCase().replace(/S$/, "");
    let body = m[2] ?? "";
    // Take the whole paragraph, then cut it at a sentence. Stopping as soon as the text
    // was "long enough" left statements severed at the first line break.
    for (let j = i + 1; j < lines.length && tidy(body).length < MAX_LEN * 2; j++) {
      const next = lines[j];
      if (!next.trim() || HEADING.test(next) || next.includes("<figure")) break;
      body += ` ${next}`;
    }
    const text = firstSentence(body);
    if (text.length >= MIN_LEN) out.push({ kind, text });
  }
  return out;
}

/** The lesson's own section headings, cleaned of their numbering. */
export function sections(md) {
  const out = [];
  for (const line of String(md).split("\n")) {
    const m = HEADING.exec(line);
    if (!m) continue;
    // The numbering has to be followed by space: "Limites" opens with L, a roman
    // numeral, and was losing its first letter.
    const t = tidy(m[1])
      .replace(/^(?:[IVXLC]+|\d+)(?:\s*\.\s*\d+)*\s*\.?\s+/, "")
      .replace(/^[—–-]\s*/, "")
      .replace(/[.:—–\s]+$/, "");
    if (t.length >= 4 && !out.includes(t)) out.push(t);
  }
  return out;
}

const FRENCH = {
  DÉFINITION: "Définition", DEFINITION: "Définition",
  THÉORÈME: "Théorème", THEOREME: "Théorème",
  PROPRIÉTÉ: "Propriété", PROPRIETE: "Propriété",
  COROLLAIRE: "Corollaire", RÈGLE: "Règle", REGLE: "Règle",
  PROPOSITION: "Proposition", LEMME: "Lemme",
  CONSÉQUENCE: "Conséquence", CONSEQUENCE: "Conséquence",
};

const MAX_BULLETS = 5;

/**
 * Build the block. Returns "" when the lesson gives nothing to build from — a recap
 * padded out of thin air would be worse than no recap.
 *
 * @param {string} md        the lesson body, figures and all
 * @param {string} [title]   the lesson title, so the recap doesn't just repeat it
 */
export function recap(md, title = "") {
  const found = statements(md);
  const lines = [];

  for (const s of found) {
    const label = FRENCH[s.kind] ?? s.kind.toLowerCase();
    const bullet = `- **${label}.** ${s.text}`;
    if (!lines.includes(bullet)) lines.push(bullet);
    if (lines.length >= MAX_BULLETS) break;
  }

  if (!lines.length) {
    // No stated result: say what the lesson works through instead.
    const heads = sections(md).filter((h) => tidy(h).toLowerCase() !== tidy(title).toLowerCase());
    if (heads.length < 2) return "";
    lines.push(`- Cette leçon traite : ${heads.slice(0, 6).join(" · ")}.`);
  }

  return `\n\n## À retenir\n\n${lines.join("\n")}\n`;
}

export const __test__ = { firstSentence, MARKER, tidy };
