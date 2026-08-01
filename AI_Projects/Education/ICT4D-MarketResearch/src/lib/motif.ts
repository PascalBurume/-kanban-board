// An ORIGINAL geometric lattice: diamond-and-line, constructed from first
// principles rather than traced from cloth. Spec §3.2 is explicit that the
// motif must be an original geometric construction, and specifically must not
// borrow kente/Ashanti (Ghanaian) or Ndebele (South African) forms — Rejista
// is a Nigerian product and getting the region wrong is a credibility loss.
//
// The form here is a diamond lattice with a doubled inner rule and a small
// centre square, reading as a woven grid at low opacity.

const TILE = `<svg xmlns='http://www.w3.org/2000/svg' width='68' height='68' viewBox='0 0 68 68'>
<g fill='none' stroke='%COLOR%' stroke-width='1.4' stroke-linejoin='miter'>
<path d='M34 2 L66 34 L34 66 L2 34 Z'/>
<path d='M34 12 L56 34 L34 56 L12 34 Z'/>
<path d='M0 0 L68 68 M68 0 L0 68' stroke-width='0.7' opacity='0.55'/>
<rect x='29' y='29' width='10' height='10'/>
<path d='M34 0 L34 6 M34 62 L34 68 M0 34 L6 34 M62 34 L68 34' stroke-width='1'/>
</g></svg>`;

/** Inline data URI for the lattice at a given stroke colour. */
export function lattice(color: string): string {
  const svg = TILE.replace(/%COLOR%/g, encodeURIComponent(color));
  return `url("data:image/svg+xml,${svg.replace(/\n/g, "").replace(/#/g, "%23")}")`;
}

export const LATTICE_GOLD = lattice("#E8A33D");
export const LATTICE_INK = lattice("#202124");
export const LATTICE_WHITE = lattice("#FFFFFF");
