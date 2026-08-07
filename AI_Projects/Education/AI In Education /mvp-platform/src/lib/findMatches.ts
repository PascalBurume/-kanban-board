// Where a search term occurs in a string.
//
// Split out of the ProseMirror plugin so the matching rules — the ones with the edge
// cases — can be tested without building an editor: an empty term matches nothing, a
// zero-width or overlapping match must not loop forever, and "É" must find "é" unless
// the teacher asked for case sensitivity.

export type Match = { from: number; to: number };

/**
 * Every occurrence of `term` in `text`, as [from, to) offsets.
 *
 * Deliberately not a RegExp: a teacher searching for "x^2" or "\frac{" is searching for
 * those characters, and treating them as a pattern would either throw or silently
 * match something else. Lessons are full of both.
 */
export function findMatches(text: string, term: string, caseSensitive = false): Match[] {
  if (!term) return [];
  const hay = caseSensitive ? text : text.toLocaleLowerCase("fr");
  const needle = caseSensitive ? term : term.toLocaleLowerCase("fr");
  // Lower-casing can change length in some locales (ẞ → ss). If it has, the offsets
  // would point at the wrong characters, so fall back to an exact search rather than
  // highlighting the wrong span.
  if (hay.length !== text.length || needle.length !== term.length) {
    return findMatches(text, term, true);
  }

  const out: Match[] = [];
  let at = 0;
  while (at <= hay.length - needle.length) {
    const i = hay.indexOf(needle, at);
    if (i === -1) break;
    out.push({ from: i, to: i + needle.length });
    // Step past the whole match: overlapping hits ("aa" in "aaa") would let a
    // replace-all consume its own output.
    at = i + needle.length;
  }
  return out;
}

/** Index of the first match at or after `pos`, wrapping to 0. */
export function matchAfter(matches: Match[], pos: number): number {
  if (!matches.length) return -1;
  const i = matches.findIndex((m) => m.from >= pos);
  return i === -1 ? 0 : i;
}

/** Index of the last match before `pos`, wrapping to the end. */
export function matchBefore(matches: Match[], pos: number): number {
  if (!matches.length) return -1;
  for (let i = matches.length - 1; i >= 0; i--) if (matches[i].to <= pos) return i;
  return matches.length - 1;
}
