// Tidies a Copilot answer before it is rendered.
//
// The system prompt asks for a bold one-liner, a few bullets, and an optional
// "Sur le modèle" note. A small local model obeys that most of the time and not
// always: it opens with "Bien sûr !", restates the question, adds a heading, or
// closes with "N'hésitez pas à demander". Those are the failures that make an
// answer look sloppy in a narrow panel, and none of them need a model to fix.
//
// Runs on the client, on the accumulated text, on every streamed chunk — so it
// has to be cheap and it must never mangle a half-arrived sentence. Everything
// here is anchored to the start or the end of the text for that reason.

/** Openers that carry no information. Anchored, case-insensitive, one pass. */
const PREAMBLE =
  /^\s*(?:bien s[ûu]r\s*!?|d'accord\s*!?|voici\s*(?:une?\s+)?(?:r[ée]ponse|explication)?\s*:?|excellente?\s+question\s*!?|en tant qu[e']\s*[^.\n]*[.\n]|je vais\s+[^.\n]*[.\n])\s*/i;

/** Sign-offs a student does not need in a 340px column. */
const SIGNOFF =
  /\n+\s*(?:n'h[ée]sitez?\s+pas[^]*|si (?:tu|vous) (?:as|avez|voulez|veux)[^]*|j'esp[èe]re que[^]*|dites-moi[^]*)$/i;

export function tidyAnswer(text) {
  if (!text) return "";
  let out = text;
  // Preambles stack — "Bien sûr ! Voici une explication :" is two of them — so
  // strip repeatedly rather than once. Bounded, because a pattern that matched
  // the empty string would otherwise spin.
  for (let i = 0; i < 3; i++) {
    const next = out.replace(PREAMBLE, "");
    if (next === out) break;
    out = next;
  }

  // A markdown heading is never wanted here — the panel already has one. Demote
  // it to bold so the emphasis survives without the type jump.
  out = out.replace(/^#{1,6}\s*(.+)$/gm, "**$1**");

  // Normalise bullet glyphs to "-" so the renderer sees one list, not three.
  out = out.replace(/^[ \t]*[•*·–—]\s+/gm, "- ");

  // Numbered lists arrive as "1. " or "1) "; the renderer only knows the first.
  out = out.replace(/^[ \t]*(\d+)\)\s+/gm, "$1. ");

  // A list needs a blank line before it or Markdown folds it into the paragraph
  // above. Only before the FIRST item though: a blank line between items makes
  // it a "loose" list, which Markdown renders with each item in its own <p> and
  // twice the leading. Hence the lookbehind for a line that is not itself an item.
  out = out.replace(/^(?![ \t]*(?:- |\d+\. ))(.+)\n(?=[ \t]*(?:- |\d+\. ))/gm, "$1\n\n");

  // And a blank line after the last item, or a following line is swallowed as a
  // continuation of it — which is how the "Sur le modèle" note ended up inside
  // the third bullet instead of standing under the list.
  out = out.replace(/^([ \t]*(?:- |\d+\. ).*)\n(?![ \t]*(?:- |\d+\. )|[ \t]*$)/gm, "$1\n\n");

  out = out.replace(/\n{3,}/g, "\n\n");
  // Only strip a sign-off once the sentence has actually finished, so it is not
  // removed while it is still being typed out.
  if (/[.!?]\s*$/.test(out)) out = out.replace(SIGNOFF, "");

  return out.trimStart();
}
