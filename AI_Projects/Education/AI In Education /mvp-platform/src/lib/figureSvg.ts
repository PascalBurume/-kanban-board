// The 76 reference figures, drawn.
//
// The catalogue's LaTeX gives the relation that accompanies a figure; this gives the
// figure. They are inline SVG because that is the format the platform already renders
// in lessons — the same <figure class="ai-figure"><svg>…</svg></figure> the geometry
// épures use, passed through rehype-raw and the narrow sanitiser in Markdown.js. So a
// figure inserted from the catalogue is displayable by students on day one, with no
// new pipeline and no compiler.
//
// Colours follow the catalogue's own « conventions graphiques » (page 2):
//   noir  objet principal, contour, texte     rouge élément clé, construction, angle
//   bleu  objet second, champ, grandeur       vert  matière vivante, frottement
//   ocre  énergie, angle repère, minéral      gris  trait de rappel, légende, axe
//
// Proportions are chosen for legibility, not metric accuracy — the catalogue says so
// itself. A reference figure is for recognising and naming; an exercise figure is for
// measuring.

export const C = {
  k: "#1a1a1a", // noir
  r: "#b0342c", // rouge
  b: "#2c5aa0", // bleu
  v: "#3d7a4a", // vert
  o: "#b8860b", // ocre
  g: "#9a9a9a", // gris
};

const W = 360;
const H = 240;

// ── primitives ──
const at = (n: number) => Math.round(n * 10) / 10;
const dash = (d?: string) => (d ? ` stroke-dasharray="${d}"` : "");

export const L = (x1: number, y1: number, x2: number, y2: number, c = C.k, w = 1.6, d?: string) =>
  `<line x1="${at(x1)}" y1="${at(y1)}" x2="${at(x2)}" y2="${at(y2)}" stroke="${c}" stroke-width="${w}"${dash(d)}/>`;

export const P = (path: string, c = C.k, w = 1.6, fill = "none", d?: string) =>
  `<path d="${path}" fill="${fill}" stroke="${c}" stroke-width="${w}"${dash(d)}/>`;

export const CI = (cx: number, cy: number, r: number, c = C.k, w = 1.6, fill = "none", d?: string) =>
  `<circle cx="${at(cx)}" cy="${at(cy)}" r="${at(r)}" fill="${fill}" stroke="${c}" stroke-width="${w}"${dash(d)}/>`;

export const EL = (cx: number, cy: number, rx: number, ry: number, c = C.k, w = 1.6, fill = "none", d?: string) =>
  `<ellipse cx="${at(cx)}" cy="${at(cy)}" rx="${at(rx)}" ry="${at(ry)}" fill="${fill}" stroke="${c}" stroke-width="${w}"${dash(d)}/>`;

export const R = (x: number, y: number, w_: number, h_: number, c = C.k, w = 1.6, fill = "none", rx = 0) =>
  `<rect x="${at(x)}" y="${at(y)}" width="${at(w_)}" height="${at(h_)}" rx="${rx}" fill="${fill}" stroke="${c}" stroke-width="${w}"/>`;

export const D = (cx: number, cy: number, c = C.k, r = 3.2) =>
  `<circle cx="${at(cx)}" cy="${at(cy)}" r="${r}" fill="${c}"/>`;

// Labels are authored prose and routinely contain "<" (a homothety of ratio k < 1) or
// "&". Unescaped, those close the <text> element early and the whole figure collapses
// into unbalanced markup — which is how MA-GP-04 first shipped broken.
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const T = (x: number, y: number, s: string, c = C.k, size = 12, anchor: "start" | "middle" | "end" = "middle", italic = false) =>
  `<text x="${at(x)}" y="${at(y)}" fill="${c}" font-size="${size}" text-anchor="${anchor}" font-family="Georgia, serif"${italic ? ' font-style="italic"' : ""}>${esc(s)}</text>`;

/** A segment with an arrowhead at (x2,y2). */
export const A = (x1: number, y1: number, x2: number, y2: number, c = C.k, w = 1.8) => {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const s = 7;
  const p1 = [x2 - s * Math.cos(ang - 0.42), y2 - s * Math.sin(ang - 0.42)];
  const p2 = [x2 - s * Math.cos(ang + 0.42), y2 - s * Math.sin(ang + 0.42)];
  return L(x1, y1, x2, y2, c, w) + P(`M${at(x2)} ${at(y2)} L${at(p1[0])} ${at(p1[1])} L${at(p2[0])} ${at(p2[1])} Z`, c, 1, c);
};

/** A right-angle square at the corner (cx,cy), opening towards (dx,dy) unit directions. */
export const RA = (cx: number, cy: number, ux: number, uy: number, vx: number, vy: number, s = 11, c = C.r) =>
  P(`M${at(cx + ux * s)} ${at(cy + uy * s)} L${at(cx + ux * s + vx * s)} ${at(cy + uy * s + vy * s)} L${at(cx + vx * s)} ${at(cy + vy * s)}`, c, 1.3);

/** An arc from angle a0 to a1 (degrees, screen coords) at radius r about (cx,cy). */
export const ARC = (cx: number, cy: number, r: number, a0: number, a1: number, c = C.r, w = 1.4) => {
  const p = (a: number) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
  const [x1, y1] = p(a0);
  const [x2, y2] = p(a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return P(`M${at(x1)} ${at(y1)} A${at(r)} ${at(r)} 0 ${large} ${sweep} ${at(x2)} ${at(y2)}`, c, w);
};

/** A pair of axes with arrowheads and x / y labels. */
export const AXES = (ox = 60, oy = 190, x1 = 330, y1 = 40) =>
  A(ox - 12, oy, x1, oy, C.k, 1.5) + A(ox, oy + 14, ox, y1, C.k, 1.5) + T(x1 - 4, oy + 18, "x", C.k, 12, "middle", true) + T(ox - 14, y1 + 8, "y", C.k, 12, "middle", true);

/** Wrap drawn parts into the figure markup the lesson renderer already understands. */
export const svg = (parts: string[]): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">` +
  `<rect width="${W}" height="${H}" fill="#fff"/>` +
  parts.join("") +
  `</svg>`;

/** The insertable block — identical in shape to the épures already in the lessons. */
export const figureBlock = (code: string, title: string, body: string): string =>
  `<figure class="ai-figure">${body}<figcaption>${title} <span class="ai-badge">Figure de référence · ${code}</span></figcaption></figure>`;
