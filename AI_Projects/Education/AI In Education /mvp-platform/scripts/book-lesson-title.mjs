// Titles for the illustrated book lessons.
//
// These lessons used to be called "Manuel illustré (1)…(14)", which told a teacher
// nothing about what was inside. The book's own section headings are right there in the
// text — normalizeHeadings() has already promoted the numbered ones to "## 1.2 …" — so a
// lesson can be named after the section it opens with.
//
// Two things make that harder than it sounds, and both are handled here:
//
//  * The book shouts its top-level sections: "1.1. THEORIE ATOMIQUE". Lower-casing that
//    gives "theorie" — the accents are gone from the scan, not merely from the case. So
//    accents (and proper nouns, and acronyms) are restored by asking the book itself:
//    the same words appear thousands of times in the body text, correctly spelled. The
//    corpus votes; nothing is hard-coded per book.
//
//  * The greedy packer cuts wherever the caps allow, so about a fifth of the lessons
//    start mid-section, on "Résolution" or "Exercices". Those inherit the previous
//    lesson's title with "(suite)" rather than being named after a fragment.

import fs from "node:fs";
import path from "node:path";

const WORD = /[A-Za-zÀ-ÿ]+/g;

export function stripAccents(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Count every word of the book, keeping its case, keyed by its accent-free lowercase
 * form. SHOUTED words are skipped: they are the damaged spelling we are trying to undo,
 * so letting them vote would just re-elect the damage.
 */
export function buildLexicon(text) {
  const counts = new Map();
  for (const w of String(text).match(WORD) ?? []) {
    if (w.length < 2 || w === w.toUpperCase()) continue;
    const key = stripAccents(w).toLowerCase();
    let forms = counts.get(key);
    if (!forms) counts.set(key, (forms = new Map()));
    forms.set(w, (forms.get(w) ?? 0) + 1);
  }
  // Collapse to the winning spelling per key, and — separately — the winning
  // *lower-case* spelling. The gap between them is what identifies a proper noun: this
  // book writes "Propriétés" 18 times and "propriétés" 14, but "Taylor" 16 times and
  // "taylor" never. So a word with no lower-case life of its own keeps its capital
  // wherever it appears; everything else is lower-cased mid-title.
  const best = new Map();
  for (const [key, forms] of counts) {
    let top = null, topN = 0, low = null, lowN = 0;
    for (const [form, n] of forms) {
      if (n > topN) { top = form; topN = n; }
      if (form[0] === form[0].toLowerCase() && n > lowN) { low = form; lowN = n; }
    }
    best.set(key, { form: top, count: topN, lower: low, lowerCount: lowN });
  }
  return best;
}

let pooled = null;

/**
 * One lexicon for every book on the shelf.
 *
 * French spelling is not per-book, and the evidence for a word is thin in isolation: a
 * maths book prints "Généralités" as a shouted heading and almost never in prose, so on
 * its own it cannot repair itself. Pooled with the chemistry books, which use the word
 * in sentences, it can. The pool is read once per process.
 */
export function pooledLexicon(dir) {
  if (pooled) return pooled;
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".md")) : [];
  const text = files.map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
  pooled = buildLexicon(text);
  return pooled;
}

// A word is only replaced when the books have real evidence for another spelling. Below
// this, an unrecognised token — a symbol, a one-off — is left exactly as printed.
const MIN_EVIDENCE = 3;

function entry(key, lexicon) {
  const hit = lexicon.get(key);
  if (hit && hit.count >= MIN_EVIDENCE) return hit;
  // "DEVELOPPEMENTS" is only ever shouted in this book, but "développement" fills its
  // pages. Try the singular and put the plural back.
  if (key.endsWith("s")) {
    const sing = lexicon.get(key.slice(0, -1));
    if (sing && sing.count >= MIN_EVIDENCE) {
      return {
        form: `${sing.form}s`,
        count: sing.count,
        lower: sing.lower ? `${sing.lower}s` : null,
        lowerCount: sing.lowerCount,
      };
    }
  }
  return null;
}

/**
 * The book's spelling, ignoring case — used where the caller re-cases it itself.
 *
 * The lower-case form is asked first, because that is where French keeps its accents:
 * this corpus writes "Etats" 34 times and "états" 21, the capital having lost its mark
 * every time, so the more frequent spelling is the damaged one. Asking the lower-case
 * form for the marks and re-casing gives "États".
 */
function lookup(key, lexicon) {
  const hit = entry(key, lexicon);
  if (!hit) return null;
  return hit.lowerCount >= MIN_EVIDENCE ? hit.lower : hit.form;
}

function respell(word, lexicon) {
  const hit = entry(stripAccents(word).toLowerCase(), lexicon);
  // Mid-title, prefer how the book writes the word in running prose. A word with no
  // lower-case form in the whole book is a name (Taylor, Laurin) and keeps its capital.
  if (hit) return hit.lowerCount >= MIN_EVIDENCE ? hit.lower : hit.form;
  if (word !== word.toUpperCase()) return word;
  // No evidence, and the word is shouting. Every common French word is in the lexicon
  // many times over, so what lands here is either a rare word the scan happened to
  // print only in headings, or an acronym. Length tells them apart well enough: lower
  // the long ones (SHOUTING mid-title is certainly wrong, even if an accent is lost),
  // leave the short ones alone.
  return word.length > 3 ? word.toLowerCase() : word;
}

// "ÉTAGE D'OXYDATION (EO) OU NOMBRE D'OXYDATION (NO)" — the short all-caps group in
// brackets is the symbol being defined, not a word to be lower-cased. Counting the
// lexicon doesn't separate these from real three-letter words (LOI, GAZ, SEL); the
// bracket does.
const ACRONYM_GLOSS = /\(\s*[A-Z][A-Z.\s]{0,5}\)/g;

/**
 * Put back diacritics the scan dropped, without touching anything else.
 *
 * Headings the book prints in mixed case are left as the book has them — except that
 * French typography routinely drops the accent from a capital, so the book's own
 * "Etude", "Equations", "Etats" arrive bare. This restores only the marks: same letters,
 * same capitalisation, same words.
 */
export function restoreDiacritics(s, lexicon) {
  return String(s).replace(WORD, (w) => {
    if (w === w.toUpperCase() && w.length > 1) return w; // shouted words are unshout()'s job
    const hit = lookup(stripAccents(w).toLowerCase(), lexicon);
    if (!hit || stripAccents(hit).toLowerCase() !== stripAccents(w).toLowerCase()) return w;
    if (hit === w) return w;
    // Keep the case the book used here, take only the marks from the lexicon.
    const cased = w[0] === w[0].toUpperCase() ? hit[0].toUpperCase() + hit.slice(1) : hit;
    return stripAccents(cased) === stripAccents(w) ? cased : w;
  });
}

/** Is this heading in the book's shouting style? */
export function isShouted(s) {
  const letters = String(s).replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 3) return false;
  const upper = letters.replace(/[^A-ZÀ-Þ]/g, "").length;
  return upper / letters.length >= 0.75;
}

/** "THEORIE ATOMIQUE" → "Théorie atomique", using the book as the dictionary. */
export function unshout(s, lexicon) {
  // Lift the acronym glosses out, respell everything else, put them back.
  const kept = [];
  let out = String(s).replace(ACRONYM_GLOSS, (m) => `￼${kept.push(m) - 1}￼`);
  out = out.replace(WORD, (w) => respell(w, lexicon));
  out = out.replace(/￼(\d+)￼/g, (_, i) => kept[Number(i)]);
  // Elided articles: the scan writes "ETAGE D'OXYDATION", and "D" is too short to carry
  // evidence of its own. Any single letter before an apostrophe is an elision.
  out = out.replace(/(^|[^A-Za-zÀ-ÿ])([A-Z])(['’])/g, (m, pre, letter, apo) => `${pre}${letter.toLowerCase()}${apo}`);
  // A lone "A" is either the preposition à — the book drops the accent from capitals,
  // giving "INÉQUATIONS DU PREMIER DEGRÉ A UNE INCONNUE" — or the name of a point. What
  // follows tells them apart: the preposition introduces a noun phrase, a point label
  // does not. "TANGENTE EN A ET EN B" is left alone.
  out = out.replace(
    /(\S\s+)[AÀ](\s+(?:une?|l[ea]s?|des?|du|deux|trois|quatre|plusieurs|cette?|ces|partir|[ld]['’]))/gi,
    (m, before, after) => `${before}à${after}`,
  );
  // Capitalise the opening word — unless the book's own spelling of it is deliberately
  // lower-case, as in "pH des solutions". A title opening on an ordinal keeps its
  // suffix lower-case: "3e méthode", never "3E méthode".
  // "3e méthode" already opens on its first word; capitalising past the ordinal would
  // put a stray capital mid-title.
  if (/^\s*\d+\s*(?:e|er|re|ère|ème|eme|ᵉ|°)(?=[\s.,;:)]|$)/i.test(out)) return out;
  const first = out.match(/[A-Za-zÀ-ÿ]+/);
  if (first && first[0] === first[0].toLowerCase()) return out.replace(/[a-zà-ÿ]/, (c) => c.toUpperCase());
  return out;
}

// Debris left by plainHeading() after it unwraps $…$: "(z in mathbfC)". The formula is
// unreadable once stripped of its markup, and a title is no place for it.
const MATH_DEBRIS = /math(?:bf|bb|rm|cal)|\b(?:frac|sqrt|cdot|leq|geq|neq|infty|forall|exists|Rightarrow|Leftrightarrow)\b/;
const SEC_NUM = /^((?:[IVXLC]+|\d+)(?:\s*\.\s*\d+)*)\s*\.?\s+(.*)$/;

/** Strip the section number and any maths wreckage; returns "" if nothing is left. */
export function cleanHeading(raw) {
  let t = String(raw ?? "").trim();
  t = t.replace(/\$[^$]*\$/g, " ");                       // whole formulas, if still marked
  t = t.replace(/[*_`]{1,3}/g, "");                       // the scan bolds whole headings
  const m = SEC_NUM.exec(t);
  if (m) {
    // "98.3 e MÉTHODE" is article 98 and its 3ᵉ method: the scan ran the two numbers
    // together. Taking "98.3" as the section number leaves "e MÉTHODE", so when what
    // survives opens on an ordinal ending, strip only the first number and keep the
    // second where it belongs.
    // The boundary is a lookahead, not \b: "°" is not a word character, so \b never
    // fires after it and "164.4 ° EXEMPLE" slipped straight through.
    if (/^\s*(?:e|er|re|ère|ème|eme|ᵉ|°)(?=[\s.,;:)]|$)/i.test(m[2])) {
      t = t.replace(/^\s*\d+\s*\.\s*/, "")
        .replace(/^(\d+)\s*(e|er|re|ère|ème|eme|ᵉ|°)(?=[\s.,;:)]|$)\.?/i, "$1$2");
    } else {
      t = m[2];
    }
  }
  t = t.replace(/\([^()]*\)/g, (p) => (MATH_DEBRIS.test(p) ? " " : p));
  // "d) Éléments directeurs …" — the letter labels a sub-point within a section and
  // carries nothing once the section is gone. Numeric ordinals stay: "4° exemple" and
  // "2° Méthode de Volhard-Charpentier" mean the fourth and the second.
  t = t.replace(/^[a-zA-Z]\s*[).]\s+(?=\S)/, "");
  t = t.replace(/\s{2,}/g, " ").replace(/\s+([,;:])/g, "$1").trim();
  t = t.replace(/\b([dlnjcstDLNJCST])['’]\s+/g, "$1'");    // "d' auto" — the scan's spacing
  t = t.replace(/^[\s:.\-—–]+/, "").replace(/[\s:.\-—–]+$/, "");
  // A heading that was only its own number names nothing. Say so, and let the caller
  // fall through to the continuation chain rather than shipping "1.2" as a title.
  if (!/[A-Za-zÀ-ÿ]{2}/.test(t)) return "";
  return t;
}

// Long enough for a real section name, short enough to stay a title.
const MAX_LEN = 80;

function truncate(t) {
  if (t.length <= MAX_LEN) return t;
  const cut = t.slice(0, MAX_LEN);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > MAX_LEN * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:]+$/, "")}…`;
}

// The book's own section numbering, as normalizeHeadings leaves it: "1.2", "III.4",
// "7." — but not "a)" or "2°", which label sub-points inside a section.
const NUMBERED = /^(?:[IVXLC]+|\d+)(?:\s*\.\s*\d+)*\s*\.\s+\S/;

/**
 * Headings that name a section of the book, best first.
 *
 * @param {{major?: string[], minor?: string[]}} arg  "## " and "### " headings of a group
 * @returns {string[]}
 */
export function titleCandidates({ major = [], minor = [] }) {
  // A "## " heading is a section the book itself numbered at the top level. Only when a
  // group has none — normalizeHeadings only promotes multi-part numbers like "1.2", so
  // a plain "2. Equations" stays at "### " — do the numbered sub-headings get a turn.
  return [...major, ...minor.filter((h) => NUMBERED.test(h.trim()))];
}

// Headings that label a step inside a section rather than naming one. A lesson called
// "Résolution" tells a teacher nothing; continuing the previous title tells them more.
const GENERIC = new Set([
  "resolution", "resolutions", "remarque", "remarques", "solution", "solutions",
  "exemple", "exemples", "reponse", "reponses", "corrige", "corriges", "suite",
  "demonstration", "preuve", "note", "notes", "application", "applications",
  "conclusion", "introduction", "definition", "definitions", "propriete", "proprietes",
  "theoreme", "theoremes", "consequence", "consequences", "exercice", "exercices",
  "resolus", "exercices resolus", "objectifs", "notions cles",
]);

/**
 * Headings that name something in their own right, even unnumbered.
 *
 * The last chapter of a book absorbs its back matter, and those sections carry real
 * names — "ANNEXE", "QUELQUES QUESTIONS DES EXAMENS D'ÉTAT", "BIBLIOGRAPHIE" — but no
 * numbering, so the ranked candidates missed them and seven lessons in a row were called
 * "Introduction (suite 1…6)". A heading that is not one of the step labels above, and is
 * long enough to be a name, is worth more than another "(suite)".
 */
// Labels for a step inside a single worked item — the answer to one exercise, a note on
// one result. These open nothing, so they must not become the section a later piece is
// said to continue: a run of exercises reading "Résolution (suite 5)" is no better than
// the section title it replaced. "Exercices résolus" is NOT one of these — that heading
// does open a section, and naming its pieces after it is exactly right.
const STEP = new Set([
  "resolution", "resolutions", "solution", "solutions", "remarque", "remarques",
  "reponse", "reponses", "corrige", "corriges", "demonstration", "preuve", "note", "notes",
]);

/** Does this heading open a section a later piece could be said to continue? */
export function opensSection(heading) {
  const t = cleanHeading(heading);
  if (!t) return false;
  return !STEP.has(stripAccents(t).toLowerCase().replace(/[^a-z ]/g, "").trim());
}

/** @param {{major?: string[], minor?: string[]}} arg @returns {string[]} */
export function namedHeadings({ major = [], minor = [] }) {
  return [...major, ...minor].filter((h) => {
    const t = cleanHeading(h);
    if (t.length < 8) return false;
    return !GENERIC.has(stripAccents(t).toLowerCase().replace(/[^a-z ]/g, "").trim());
  });
}

/**
 * Headings to fall back on when a chapter numbers nothing at all.
 *
 * Two of the trigonometry chapters carry only their own title and "EXERCICES", so the
 * numbered-section rule found nothing and the opening lesson was called "Extrait du
 * manuel". The chapter's own title names it far better; this is only ever reached
 * when the ranked candidates and the continuation chain have both come up empty.
 */
export function anyHeading({ major = [], minor = [] }) {
  return [...major, ...minor];
}

/**
 * Title one lesson from the headings of the sections packed into it.
 *
 * @param {{numbered?: string[], lexicon: Map<string, any>, carry?: string|null}} arg
 *   `numbered` — headings that name a section, best first;
 *   `lexicon`  — from buildLexicon()/pooledLexicon();
 *   `carry`    — the previous lesson's title, for continuation pieces.
 * @returns {string|null}
 */
export function lessonTitle({ numbered = [], lexicon, carry = null }) {
  for (const h of numbered) {
    const cleaned = cleanHeading(h);
    if (!cleaned) continue;
    return truncate(isShouted(cleaned) ? unshout(cleaned, lexicon) : restoreDiacritics(cleaned, lexicon));
  }
  // No section of its own: this is the tail of the one before it.
  if (!carry) return null;
  const base = carry.replace(/\s*\(suite(?:\s+\d+)?\)$/, "");
  const m = /\(suite(?:\s+(\d+))?\)$/.exec(carry);
  if (!m) return `${base} (suite)`;
  return `${base} (suite ${m[1] ? Number(m[1]) + 1 : 2})`;
}

// The module usually already holds a written-up lesson on the same section — the
// summary the curriculum team authored. Both are legitimately called "Rappels", and a
// teacher looking at two identical rows cannot tell which is which. The book's own text
// takes the qualifier, since that is what distinguishes it.
const MANUAL = "manuel";

function qualify(title) {
  const m = /^(.*?)\s*\(suite(?:\s+(\d+))?\)$/.exec(title);
  if (!m) return `${title} — ${MANUAL}`;
  return `${m[1]} — ${MANUAL} (suite${m[2] ? ` ${m[2]}` : ""})`;
}

/**
 * Name every lesson of a chapter, threading the "(suite)" chain and keeping every title
 * distinct — from its siblings, and from the lessons the module already has.
 *
 * @param {string[][]} groups   per lesson, its section headings (best first)
 * @param {Map<string, any>} lexicon  from buildLexicon()/pooledLexicon()
 * @param {{taken?: string[], fallback?: string, spare?: string[][], named?: string[][], context?: string[]}|string} [opts]
 *   `taken` — titles already used in this module; `named` — per group, headings that
 *   name something even unnumbered; `context` — per group, the last heading opened at
 *   or before it; `spare` — per group, any heading at
 *   all, used only when nothing is numbered and there is nothing to continue;
 *   `fallback` — when even that is empty. A bare string is read as `fallback`.
 * @returns {string[]}
 */
export function titleGroups(groups, lexicon, opts = {}) {
  const { taken = [], fallback = "Extrait du manuel", spare = [], named = [], context = [] } =
    typeof opts === "string" ? { fallback: opts } : opts;
  const used = new Set(taken.map((t) => String(t).trim().toLowerCase()));
  const out = [];
  let carry = null;
  for (const [gi, numbered] of groups.entries()) {
    // A section the book numbered, else a heading that names something on its own.
    let t = lessonTitle({ numbered, lexicon, carry: null })
      ?? lessonTitle({ numbered: named[gi] ?? [], lexicon, carry: null });

    if (!t) {
      // Nothing of its own: this group continues something. What it continues is the
      // last section OPENED before it — not the section the previous lesson happened to
      // be named after. A chapter's closing exercises, split across several lessons,
      // were reading "Position de la courbe … (suite 5)" when the pieces were an
      // exercise the book states three sections later.
      const opened = cleanHeading(context[gi] ?? "");
      const base = opened ? truncate(isShouted(opened) ? unshout(opened, lexicon) : restoreDiacritics(opened, lexicon)) : null;
      const carriedBase = carry?.replace(/\s*\(suite(?:\s+\d+)?\)$/, "") ?? null;
      // A different section has been opened since: start a fresh chain on its name
      // rather than extending the old one. The first piece takes the name plainly.
      t = base && base !== carriedBase ? base : lessonTitle({ numbered: [], lexicon, carry });
    }
    if (!t) t = lessonTitle({ numbered: spare[gi] ?? [], lexicon, carry: null });
    if (!t) t = carry ? `${carry} (suite)` : fallback;
    if (used.has(t.toLowerCase())) t = qualify(t);
    // Still taken (the module has a "… — manuel" of its own, or two groups opened on
    // the same section): fall back to continuing the previous title.
    while (used.has(t.toLowerCase())) t = lessonTitle({ numbered: [], lexicon, carry: t }) ?? `${t} (suite)`;
    used.add(t.toLowerCase());
    out.push(t);
    carry = t;
  }
  return out;
}
