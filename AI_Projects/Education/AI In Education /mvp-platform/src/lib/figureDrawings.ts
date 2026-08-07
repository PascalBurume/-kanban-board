// The drawing of each of the 76 reference figures, keyed by catalogue code.
//
// Schematic on purpose. The catalogue states its own standard: "Les proportions sont
// choisies pour la lisibilité, non pour l'exactitude métrique. Une figure de référence
// sert à reconnaître et à nommer ; une figure d'exercice sert à mesurer." So each of
// these fixes the TYPE and the named parts, and nothing here should be measured.
//
// See figureSvg.ts for the primitives and the colour conventions.

import { C, L, P, CI, EL, R, D, T, A, RA, ARC, AXES, svg } from "./figureSvg";

/** Sample a function into an SVG path, in screen coordinates. */
const plot = (f: (x: number) => number, x0: number, x1: number, sx: (x: number) => number, sy: (y: number) => number, n = 60, c = C.r, w = 2) => {
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const y = f(x);
    if (!Number.isFinite(y)) continue;
    pts.push(`${i && pts.length ? "L" : "M"}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`);
  }
  return P(pts.join(" "), c, w);
};

// Declared above PARTS on purpose: a `const` arrow does not hoist, and PARTS is a
// module-level object literal — referencing them below would be a temporal-dead-zone
// crash at import, not a lint warning. (The `function` declarations further down are
// hoisted and may stay there.)
const gx = (x: number) => 60 + 34 * x;
const gy = (y: number) => 190 - 30 * y;

/** A coil hanging from (x, y0), `n` turns. */
const spring = (x: number, y0: number, n: number) => {
  let d = `M${x} ${y0 - 44}`;
  for (let i = 0; i < n; i++) d += ` L${x - 13} ${y0 + i * 8 + 4} L${x + 13} ${y0 + i * 8 + 8}`;
  return d + ` L${x} ${y0 + n * 8 + 4}`;
};

/** A regular hexagon, flat-top, about (cx, cy). */
const hexagon = (cx: number, cy: number, r: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (-90 + 60 * i) * (Math.PI / 180);
    return `${i ? "L" : "M"}${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ") + " Z";

/**
 * A labelled callout: text in a right-hand column, a grey leader running left to the
 * part it names, and a dot on the part itself.
 *
 * The label sits in a COLUMN rather than floating beside its target. The first version
 * placed each label next to whatever it pointed at, which put "noyau" on top of the
 * nucleolus and ran three leader lines straight through their own text. Stacking the
 * labels and ordering the targets by height keeps the leaders parallel and stops them
 * crossing each other or the words.
 */
const tag = (tx: number, ty: number, px: number, py: number, label: string, c = C.k) =>
  L(tx - 6, ty - 3, px, py, C.g, 1.1) + D(px, py, c, 2.8) + T(tx, ty, label, c, 9.5, "start");

/** Three small stacked axis frames, for the MRUA triptych. */
const triptych = () => [
  ...[24, 142, 260].map((x) => A(x - 6, 84, x + 78, 84, C.k, 1.3) + A(x, 96, x, 30, C.k, 1.3)),
];

const PARTS: Record<string, string[]> = {
  // ═══════════════════════ MA · Mathématiques ═══════════════════════
  "MA-GP-01": [
    CI(180, 130, 88, C.g, 1.2, "none", "5 4"),
    T(180, 232, "cercle circonscrit", C.g, 10),
    P("M104 182 L256 182 L215 47 Z", C.k, 2),
    L(215, 47, 180, 182, C.r, 1.5, "6 4"),
    L(215, 47, 215, 182, C.b, 1.5, "3 3"),
    RA(215, 182, 0, -1, -1, 0, 9, C.b),
    D(104, 182), D(256, 182), D(215, 47), D(180, 182, C.r),
    T(97, 196, "A", C.k, 12, "middle", true),
    T(263, 196, "B", C.k, 12, "middle", true),
    T(215, 38, "C", C.k, 12, "middle", true),
    T(176, 196, "M", C.r, 11, "middle", true),
    T(120, 108, "médiane", C.r, 10, "start"),
    T(228, 120, "hauteur", C.b, 10, "start"),
  ],
  "MA-GP-02": [
    CI(180, 128, 82, C.k, 2),
    D(180, 46), D(112, 168), D(248, 168), D(180, 128),
    P("M112 168 L180 46 L248 168", C.r, 1.8),
    L(112, 168, 248, 168, C.k, 1.6),
    P("M112 168 L180 128 L248 168", C.b, 1.6),
    ARC(180, 46, 26, 68, 112, C.r),
    ARC(180, 128, 22, 200, 340, C.b),
    T(180, 37, "P", C.k, 12, "middle", true),
    T(103, 182, "A", C.k, 12, "middle", true),
    T(257, 182, "B", C.k, 12, "middle", true),
    T(180, 145, "O", C.k, 11, "middle", true),
    T(180, 84, "α", C.r, 12),
    T(180, 116, "2α", C.b, 11),
    T(180, 226, "angle inscrit / angle au centre", C.g, 10),
  ],
  "MA-GP-03": [
    D(56, 196),
    P("M56 196 L296 108", C.k, 2),
    P("M56 196 L272 64", C.k, 2),
    L(160, 152, 141, 111, C.r, 2),
    L(296, 108, 272, 64, C.k, 2),
    D(160, 152, C.r), D(141, 111, C.r), D(296, 108), D(272, 64),
    T(48, 204, "S", C.k, 12, "middle", true),
    T(160, 168, "B′", C.r, 11, "middle", true),
    T(130, 104, "C′", C.r, 11, "middle", true),
    T(306, 112, "B", C.k, 12, "middle", true),
    T(280, 54, "C", C.k, 12, "middle", true),
    T(180, 226, "droites sécantes et parallèles", C.g, 10),
  ],
  "MA-GP-04": [
    P("M60 176 L96 128 L152 140 L152 190 L96 200 Z", C.r, 1.8, "none", "5 4"),
    P("M212 118 L248 70 L304 82 L304 132 L248 142 Z", C.k, 2, "#efeae2"),
    P("M214 150 L232 126 L260 132 L260 157 L232 162 Z", C.b, 1.4, "none", "3 3"),
    D(186, 176),
    ARC(186, 176, 58, 200, 250, C.r),
    A(150, 146, 206, 124, C.r, 1.5),
    T(186, 190, "O", C.k, 11, "middle", true),
    T(196, 130, "θ", C.r, 12),
    T(66, 66, "rotation", C.r, 10, "start"),
    T(66, 82, "homothétie  k < 1", C.b, 10, "start"),
    T(180, 226, "transformations du plan", C.g, 10),
  ],
  "MA-GA-01": [
    ...grid(),
    AXES(),
    plot((x) => 0.85 * x + 1.2, -1.6, 3.1, gx, gy, 2, C.r, 2.2),
    L(gx(1), gy(2.05), gx(2.4), gy(2.05), C.b, 1.3, "4 3"),
    L(gx(2.4), gy(2.05), gx(2.4), gy(3.24), C.b, 1.3, "4 3"),
    D(gx(0), gy(1.2), C.r),
    T(gx(1.7), gy(1.85), "Δx", C.b, 11),
    T(gx(2.62), gy(2.7), "Δy", C.b, 11),
    T(gx(0) - 12, gy(1.2) + 4, "p", C.r, 12, "end", true),
    T(gx(2.6), gy(3.9), "y = ax + p", C.r, 12, "start"),
    T(gx(2.6), gy(3.35), "a = Δy/Δx", C.g, 10, "start"),
  ],
  "MA-GA-02": [
    ...grid(),
    AXES(),
    CI(gx(1.1), gy(2.1), 52, C.r, 2.2),
    D(gx(1.1), gy(2.1), C.r),
    A(gx(1.1), gy(2.1), gx(1.1) + 37, gy(2.1) - 37, C.b, 1.6),
    L(gx(1.1), gy(2.1), gx(1.1), gy(0), C.g, 1.1, "3 3"),
    L(gx(1.1), gy(2.1), gx(0), gy(2.1), C.g, 1.1, "3 3"),
    T(gx(1.1) + 30, gy(2.1) + 14, "Ω(a, b)", C.r, 11, "start", true),
    T(gx(1.1) + 32, gy(2.1) - 30, "r", C.b, 12, "middle", true),
    T(180, 232, "(x − a)² + (y − b)² = r²", C.k, 11),
  ],
  "MA-GA-03": [
    AXES(56, 176, 330, 40),
    plot((x) => 0.34 * x * x, -3.6, 3.6, (x) => 56 + 38 * x + 130, (y) => 176 - 30 * y, 50, C.r, 2.2),
    L(70, 202, 320, 202, C.b, 2),
    T(300, 216, "directrice", C.b, 10, "end"),
    D(186, 146, C.b),
    D(258, 108, C.k),
    L(258, 108, 186, 146, C.g, 1.2, "4 3"),
    L(258, 108, 258, 202, C.g, 1.2, "4 3"),
    L(220, 122, 226, 132, C.k, 1.2),
    L(255, 152, 263, 152, C.k, 1.2),
    T(178, 158, "F", C.b, 11, "middle", true),
    T(268, 100, "M", C.k, 11, "start", true),
    T(96, 60, "MF = d(M, 𝒟)", C.k, 11, "start"),
  ],
  "MA-GA-04": [
    AXES(40, 132, 330, 34),
    EL(186, 132, 96, 56, C.r, 2.2),
    D(128, 132, C.b), D(244, 132, C.b), D(224, 88, C.k),
    L(128, 132, 224, 88, C.g, 1.4),
    L(244, 132, 224, 88, C.g, 1.4),
    L(186, 132, 186, 76, C.g, 1.2, "3 3"),
    A(186, 150, 244, 150, C.g, 1.2),
    T(120, 146, "F′", C.b, 11, "middle", true),
    T(250, 146, "F", C.b, 11, "middle", true),
    T(232, 78, "M", C.k, 11, "start", true),
    T(178, 104, "b", C.g, 10, "end", true),
    T(214, 164, "a", C.g, 10, "middle", true),
    T(186, 212, "MF + MF′ = 2a", C.k, 11),
  ],
  "MA-GE-01": [
    // cube
    P("M28 108 L74 108 L74 154 L28 154 Z", C.k, 1.7),
    P("M28 108 L44 92 L90 92 L74 108", C.k, 1.7),
    P("M74 154 L90 138 L90 92", C.k, 1.7),
    L(44, 92, 44, 138, C.g, 1.1, "3 3"), L(44, 138, 90, 138, C.g, 1.1, "3 3"), L(44, 138, 28, 154, C.g, 1.1, "3 3"),
    T(58, 176, "cube", C.g, 10),
    // pyramide
    P("M116 154 L182 154 L149 88 Z", C.k, 1.7),
    P("M116 154 L138 166 L204 166 L182 154", C.k, 1.7),
    P("M204 166 L149 88", C.k, 1.7),
    L(138, 166, 182, 154, C.g, 1.1, "3 3"),
    T(158, 188, "pyramide", C.g, 10),
    // cylindre
    EL(248, 96, 26, 9, C.k, 1.7), L(222, 96, 222, 150, C.k, 1.7), L(274, 96, 274, 150, C.k, 1.7),
    P("M222 150 A26 9 0 0 0 274 150", C.k, 1.7), P("M222 150 A26 9 0 0 1 274 150", C.g, 1.1, "none", "3 3"),
    T(248, 176, "cylindre", C.g, 10),
    // sphère
    CI(320, 122, 27, C.k, 1.7), EL(320, 122, 27, 9, C.g, 1.1, "none", "3 3"),
    T(320, 176, "sphère", C.g, 10),
  ],
  "MA-GE-02": [
    L(40, 122, 326, 122, C.k, 2),
    T(336, 126, "LT", C.k, 11, "middle"),
    T(96, 40, "plan vertical", C.g, 10, "start"),
    T(96, 216, "plan horizontal", C.g, 10, "start"),
    L(200, 62, 200, 182, C.g, 1.2, "4 3"),
    D(200, 62, C.r), D(200, 182, C.b), D(200, 122, C.k),
    A(168, 122, 168, 62, C.k, 1.2), A(168, 62, 168, 122, C.k, 1.2),
    A(232, 122, 232, 182, C.k, 1.2), A(232, 182, 232, 122, C.k, 1.2),
    T(212, 58, "a′", C.r, 12, "start", true),
    T(212, 192, "a", C.b, 12, "start", true),
    T(158, 96, "cote", C.k, 10, "end"),
    T(244, 158, "éloign.", C.k, 10, "start"),
  ],
  "MA-GE-03": [
    L(40, 122, 326, 122, C.k, 2),
    T(336, 126, "LT", C.k, 11, "middle"),
    P("M64 92 L300 54", C.r, 2.2),
    P("M64 190 L300 152", C.b, 2.2),
    L(130, 81, 130, 179, C.g, 1.1, "3 3"), L(244, 63, 244, 161, C.g, 1.1, "3 3"),
    D(130, 81, C.r), D(244, 63, C.r), D(130, 179, C.b), D(244, 161, C.b),
    T(308, 50, "d′", C.r, 12, "start", true),
    T(308, 156, "d", C.b, 12, "start", true),
    T(96, 34, "plan vertical", C.g, 10, "start"),
    T(96, 216, "plan horizontal", C.g, 10, "start"),
  ],
  "MA-GE-04": [
    L(40, 122, 326, 122, C.k, 2),
    T(336, 126, "LT", C.k, 11, "middle"),
    P("M96 46 L196 122", C.r, 2.2),
    P("M196 122 L300 200", C.b, 2.2),
    D(196, 122),
    ARC(196, 122, 34, 0, 37, C.g),
    T(88, 40, "α′", C.r, 12, "middle", true),
    T(308, 206, "α", C.b, 12, "middle", true),
    T(96, 214, "traces d'un plan quelconque", C.g, 10, "start"),
  ],
  "MA-TR-01": [
    L(50, 128, 320, 128, C.k, 1.4), L(186, 226, 186, 30, C.k, 1.4),
    CI(186, 128, 80, C.k, 2),
    L(186, 128, 247, 76, C.r, 2),
    D(247, 76, C.r),
    L(247, 76, 247, 128, C.b, 1.5, "4 3"),
    L(186, 76, 247, 76, C.b, 1.5, "4 3"),
    L(266, 128, 266, 78, C.o, 2.2),
    L(186, 128, 266, 78, C.g, 1.1, "3 3"),
    ARC(186, 128, 32, 0, -40, C.r),
    T(206, 116, "θ", C.r, 12),
    T(212, 66, "sin θ", C.b, 10),
    T(216, 146, "cos θ", C.b, 10),
    T(288, 96, "tan θ", C.o, 10),
  ],
  "MA-TR-02": [
    P("M62 190 L282 190 L282 58 Z", C.k, 2.2),
    RA(282, 190, -1, 0, 0, -1, 12, C.k),
    ARC(62, 190, 40, 0, -31, C.r),
    T(104, 178, "θ", C.r, 12),
    T(54, 200, "A", C.k, 12, "middle", true),
    T(290, 200, "B", C.k, 12, "middle", true),
    T(290, 50, "C", C.k, 12, "middle", true),
    T(160, 116, "hypoténuse", C.g, 10),
    T(172, 206, "adjacent", C.g, 10),
    T(300, 128, "opposé", C.g, 10, "start"),
  ],
  "MA-TR-03": [
    AXES(40, 128, 336, 40),
    plot((x) => Math.sin(x), 0, 6.6, (x) => 40 + 43 * x, (y) => 128 - 56 * y, 70, C.r, 2.2),
    plot((x) => Math.cos(x), 0, 6.6, (x) => 40 + 43 * x, (y) => 128 - 56 * y, 70, C.b, 1.8),
    L(40, 62, 310, 62, C.g, 1.1, "4 3"),
    T(175, 52, "période  2π", C.g, 10),
    T(175, 152, "π", C.k, 11, "middle", true),
    T(310, 152, "2π", C.k, 11, "middle", true),
    T(226, 78, "sin x", C.r, 10, "start"),
    T(262, 100, "cos x", C.b, 10, "start"),
  ],
  "MA-TR-04": [
    P("M56 186 L296 200 L214 60 Z", C.k, 2.2),
    ARC(56, 186, 34, -3, -40, C.r), ARC(296, 200, 34, 180, 228, C.r), ARC(214, 60, 30, 60, 130, C.r),
    T(96, 178, "A", C.r, 11), T(258, 188, "B", C.r, 11), T(214, 100, "C", C.r, 11),
    T(122, 112, "b", C.k, 11, "middle", true),
    T(266, 122, "a", C.k, 11, "middle", true),
    T(174, 208, "c", C.k, 11, "middle", true),
    T(180, 232, "triangle quelconque", C.g, 10),
  ],
  "MA-AN-01": [
    AXES(46, 176, 330, 34),
    plot((x) => 0.3 * (x - 1.6) * (x - 1.6) - 2.4, -1.6, 4.8, (x) => 46 + 42 * x + 68, (y) => 176 - 24 * y, 60, C.r, 2.2),
    L(46 + 42 * 1.6 + 68, 44, 46 + 42 * 1.6 + 68, 200, C.b, 1.3, "5 4"),
    D(46 + 42 * 1.6 + 68, 176 + 24 * 2.4, C.r),
    D(46 + 42 * (1.6 - 2.83) + 68, 176), D(46 + 42 * (1.6 + 2.83) + 68, 176),
    T(46 + 42 * 1.6 + 68, 38, "axe", C.b, 10),
    T(196, 244 - 12, "S", C.r, 11, "start", true),
    T(300, 60, "Δ = b² − 4ac", C.k, 11, "end"),
  ],
  "MA-AN-02": [
    AXES(56, 176, 330, 36),
    L(150, 44, 150, 196, C.b, 1.6, "5 4"),
    L(66, 92, 320, 92, C.b, 1.6, "5 4"),
    plot((x) => 1.4 + 2.2 / (x - 1.4), 1.62, 5.6, (x) => 56 + 44 * x, (y) => 176 - 24 * y, 50, C.r, 2.2),
    plot((x) => 1.4 + 2.2 / (x - 1.4), -1.6, 1.16, (x) => 56 + 44 * x, (y) => 176 - 24 * y, 50, C.r, 2.2),
    T(150, 34, "A.V.", C.b, 10),
    T(330, 86, "A.H.", C.b, 10, "end"),
  ],
  "MA-AN-03": [
    AXES(50, 186, 330, 40),
    plot((x) => 0.26 * x * x + 0.6, 0.2, 4.9, (x) => 50 + 54 * x, (y) => 186 - 22 * y, 60, C.k, 2.2),
    L(96, 200, 322, 62, C.r, 2),
    D(174, 152, C.r),
    L(292, 96, 292, 152, C.b, 1.3, "4 3"), L(174, 152, 292, 152, C.b, 1.3, "4 3"),
    D(292, 96, C.b),
    T(168, 166, "a", C.r, 11, "end", true),
    T(232, 166, "h", C.b, 10),
    T(230, 60, "tangente", C.r, 10, "start"),
    T(300, 128, "sécante", C.b, 10, "start"),
  ],
  "MA-AN-04": [
    AXES(50, 186, 330, 40),
    P("M110 156 L110 186 L262 186 L262 108 " + samplePath(), C.r, 2, "#e8d7d5"),
    plot((x) => 0.2 * x * x + 0.5, 0.3, 5.2, (x) => 50 + 50 * x, (y) => 186 - 22 * y, 60, C.k, 2.2),
    L(110, 186, 110, 200, C.k, 1.3), L(262, 186, 262, 200, C.k, 1.3),
    T(110, 214, "a", C.k, 11, "middle", true),
    T(262, 214, "b", C.k, 11, "middle", true),
    T(186, 166, "aire", C.r, 10),
  ],
  "MA-SP-01": [
    AXES(52, 190, 330, 40),
    ...[[0, 40], [1, 78], [2, 110], [3, 66], [4, 34]].map(([i, h]) =>
      R(64 + (i as number) * 50, 190 - (h as number), 46, h as number, C.k, 1.4, "#dfe3ee"),
    ),
    P("M87 150 L137 112 L187 80 L237 124 L287 156", C.r, 2),
    ...[[87, 150], [137, 112], [187, 80], [237, 124], [287, 156]].map(([x, y]) => D(x as number, y as number, C.r, 2.8)),
    T(180, 224, "distribution des effectifs", C.g, 10),
  ],
  "MA-SP-02": [
    L(60, 150, 300, 150, C.g, 1.2),
    L(96, 150, 130, 150, C.k, 1.6), L(240, 150, 284, 150, C.k, 1.6),
    L(96, 136, 96, 164, C.k, 1.6), L(284, 136, 284, 164, C.k, 1.6),
    R(130, 122, 110, 56, C.k, 1.8, "#eef1f7"),
    L(178, 122, 178, 178, C.r, 2.4),
    T(130, 196, "Q₁", C.k, 11), T(178, 196, "Me", C.r, 11), T(240, 196, "Q₃", C.k, 11),
    T(96, 112, "min", C.g, 10), T(284, 112, "max", C.g, 10),
    T(180, 226, "quartiles, médiane, étendue", C.g, 10),
  ],
  "MA-SP-03": [
    AXES(52, 186, 330, 40),
    ...[[80, 168], [110, 150], [136, 156], [162, 132], [190, 118], [216, 122], [244, 96], [272, 84], [296, 74]].map(([x, y]) => D(x as number, y as number, C.b, 3.2)),
    L(70, 176, 310, 66, C.r, 2.2),
    T(268, 108, "droite de régression", C.r, 10, "end"),
    T(180, 226, "corrélation", C.g, 10),
  ],
  "MA-SP-04": [
    D(56, 122),
    L(56, 122, 148, 70, C.k, 1.6), L(56, 122, 148, 174, C.k, 1.6),
    D(148, 70), D(148, 174),
    L(148, 70, 250, 44, C.k, 1.4), L(148, 70, 250, 96, C.k, 1.4),
    L(148, 174, 250, 148, C.k, 1.4), L(148, 174, 250, 200, C.k, 1.4),
    ...[[250, 44], [250, 96], [250, 148], [250, 200]].map(([x, y]) => D(x as number, y as number, C.k, 2.8)),
    T(96, 84, "P(A)", C.r, 10), T(96, 160, "P(Ā)", C.r, 10),
    T(206, 40, "P_A(B)", C.b, 10), T(206, 92, "P_A(B̄)", C.b, 10),
    T(206, 144, "P_Ā(B)", C.b, 10), T(206, 196, "P_Ā(B̄)", C.b, 10),
    T(266, 48, "A ∩ B", C.k, 10, "start"),
  ],
  "MA-CX-01": [
    AXES(56, 176, 330, 36),
    D(238, 88, C.r),
    L(56, 176, 238, 88, C.r, 2),
    L(238, 88, 238, 176, C.b, 1.3, "4 3"), L(56, 88, 238, 88, C.b, 1.3, "4 3"),
    ARC(56, 176, 46, 0, -26, C.o),
    T(112, 164, "θ", C.o, 12),
    T(150, 118, "r", C.r, 11, "middle", true),
    T(246, 78, "M(z)", C.k, 11, "start", true),
    T(238, 194, "a", C.b, 11, "middle", true),
    T(44, 92, "b", C.b, 11, "end", true),
    T(180, 226, "module et argument", C.g, 10),
  ],
  "MA-CX-02": [
    L(56, 122, 316, 122, C.k, 1.3), L(186, 226, 186, 26, C.k, 1.3),
    CI(186, 122, 76, C.g, 1.3, "none", "4 3"),
    ...[0, 1, 2, 3, 4].map((k) => {
      const a = (-90 + (360 * k) / 5) * (Math.PI / 180);
      return D(186 + 76 * Math.cos(a), 122 + 76 * Math.sin(a), C.r, 4);
    }),
    P(
      [0, 1, 2, 3, 4]
        .map((k) => {
          const a = (-90 + (360 * k) / 5) * (Math.PI / 180);
          return `${k ? "L" : "M"}${(186 + 76 * Math.cos(a)).toFixed(1)} ${(122 + 76 * Math.sin(a)).toFixed(1)}`;
        })
        .join(" ") + " Z",
      C.r,
      1.8,
    ),
    T(180, 230, "polygone régulier inscrit (n = 5)", C.g, 10),
  ],
  "MA-CX-03": [
    AXES(50, 186, 330, 36),
    A(50, 186, 168, 118, C.b, 2),
    A(50, 186, 148, 190 - 84, C.r, 2),
    L(168, 118, 266, 56, C.g, 1.3, "4 3"),
    L(148, 106, 266, 56, C.g, 1.3, "4 3"),
    A(50, 186, 266, 56, C.k, 2.2),
    T(176, 112, "z₁", C.b, 11, "start", true),
    T(140, 98, "z₂", C.r, 11, "end", true),
    T(276, 50, "z₁ + z₂", C.k, 11, "start", true),
    T(180, 226, "règle du parallélogramme", C.g, 10),
  ],
  "MA-CX-04": [
    L(56, 132, 316, 132, C.k, 1.3), L(186, 226, 186, 30, C.k, 1.3),
    CI(186, 132, 42, C.g, 1.1, "none", "3 3"),
    A(186, 132, 186 + 42 * Math.cos(-0.5), 132 + 42 * Math.sin(-0.5), C.b, 1.8),
    A(186, 132, 186 + 62 * Math.cos(-1.1), 132 + 62 * Math.sin(-1.1), C.r, 1.8),
    A(186, 132, 186 + 92 * Math.cos(-1.6), 132 + 92 * Math.sin(-1.6), C.k, 2.2),
    ARC(186, 132, 26, 0, -29, C.b), ARC(186, 132, 32, -29, -63, C.r),
    T(240, 118, "θ₁", C.b, 10), T(216, 88, "θ₂", C.r, 10),
    T(196, 40, "z₁z₂", C.k, 11, "start", true),
    T(180, 226, "modules ×, arguments +", C.g, 10),
  ],

  // ═══════════════════════════ PH · Physique ═══════════════════════════
  "PH-ME-01": [
    P("M40 194 L300 194 L300 68 Z", C.k, 2, "#f4f2ee"),
    R(196, 118, 40, 26, C.k, 1.8, "#e4e6ee"),
    A(216, 144, 216, 200, C.k, 2),
    A(216, 131, 250, 110, C.b, 2),
    A(216, 131, 178, 154, C.v, 2),
    ARC(300, 194, 46, 180, 214, C.o),
    T(258, 182, "α", C.o, 12),
    T(216, 214, "P", C.k, 11, "middle", true),
    T(260, 100, "N", C.b, 11, "start", true),
    T(168, 162, "f", C.v, 11, "end", true),
    T(180, 232, "poids, réaction normale, frottement", C.g, 10),
  ],
  "PH-ME-02": [
    CI(180, 56, 20, C.k, 2),
    D(180, 56, C.k, 2.5),
    P("M160 56 L160 130", C.k, 1.8), P("M200 56 L200 168", C.k, 1.8),
    R(138, 130, 44, 30, C.k, 1.8, "#e4e6ee"),
    R(178, 168, 44, 30, C.k, 1.8, "#d8dbe6"),
    A(160, 118, 160, 84, C.r, 1.8), A(200, 156, 200, 120, C.r, 1.8),
    T(148, 100, "T", C.r, 11, "end", true), T(212, 138, "T", C.r, 11, "start", true),
    T(160, 150, "m₁", C.k, 11), T(200, 188, "m₂", C.k, 11),
    T(180, 226, "poulie, tension du fil", C.g, 10),
  ],
  "PH-ME-03": [
    L(50, 150, 310, 150, C.k, 2.6),
    P("M180 150 L166 178 L194 178 Z", C.k, 2, "#e4e6ee"),
    A(96, 146, 96, 96, C.b, 2), A(258, 146, 258, 108, C.r, 2),
    L(96, 158, 180, 158, C.g, 1.2, "4 3"), L(180, 158, 258, 158, C.g, 1.2, "4 3"),
    L(96, 152, 96, 164, C.g, 1.2), L(258, 152, 258, 164, C.g, 1.2),
    T(96, 86, "F₁", C.b, 11, "middle", true), T(258, 98, "F₂", C.r, 11, "middle", true),
    T(138, 174, "d₁", C.g, 10), T(220, 174, "d₂", C.g, 10),
    T(180, 210, "F₁d₁ = F₂d₂", C.k, 11),
  ],
  "PH-ME-04": [
    L(70, 40, 70, 200, C.k, 2.4),
    P(spring(70, 84, 6), C.k, 1.8),
    R(52, 150, 36, 26, C.k, 1.8, "#e4e6ee"),
    L(150, 40, 150, 200, C.k, 2.4),
    P(spring(150, 108, 6), C.k, 1.8),
    R(132, 174, 36, 26, C.k, 1.8, "#e4e6ee"),
    A(200, 174, 200, 200, C.r, 2),
    L(196, 150, 250, 150, C.g, 1.2, "4 3"), L(196, 174, 250, 174, C.g, 1.2, "4 3"),
    A(240, 150, 240, 174, C.b, 1.6),
    T(258, 166, "Δx", C.b, 11, "start", true),
    T(212, 194, "F", C.r, 11, "start", true),
    T(180, 226, "allongement et force de rappel", C.g, 10),
  ],
  "PH-CN-01": [
    ...triptych(),
    plot((t) => 0.5 * t * t, 0, 3.1, (t) => 24 + 22 * t, (y) => 84 - 12 * y, 30, C.r, 2),
    plot((t) => t, 0, 3.1, (t) => 142 + 22 * t, (y) => 84 - 18 * y, 2, C.b, 2),
    L(260, 60, 328, 60, C.o, 2),
    T(58, 108, "x(t)", C.r, 10), T(176, 108, "v(t)", C.b, 10), T(294, 108, "a(t)", C.o, 10),
    T(180, 200, "position, vitesse, accélération", C.g, 10),
  ],
  "PH-CN-02": [
    AXES(50, 190, 336, 40),
    plot((x) => -0.021 * x * x + 0.98 * x, 0, 46.6, (x) => 50 + 5.9 * x, (y) => 190 - 9.4 * y, 60, C.r, 2.2),
    A(50, 190, 92, 152, C.b, 2),
    ARC(50, 190, 34, 0, -42, C.o),
    L(188, 190, 188, 82, C.g, 1.2, "4 3"),
    T(96, 176, "α", C.o, 11),
    T(88, 142, "v₀", C.b, 11, "start", true),
    T(202, 130, "flèche", C.g, 10, "start"),
    T(198, 208, "portée", C.g, 10),
  ],
  "PH-CN-03": [
    CI(180, 124, 74, C.g, 1.4, "none", "5 4"),
    D(180, 124),
    D(254, 124, C.k, 4),
    A(254, 124, 254, 62, C.b, 2),
    A(254, 124, 194, 124, C.r, 2),
    L(180, 124, 254, 124, C.k, 1.4),
    T(262, 58, "v", C.b, 11, "start", true),
    T(206, 112, "a_c", C.r, 11, "middle", true),
    T(214, 140, "R", C.k, 11, "middle", true),
    T(180, 226, "vitesse tangentielle, accélération centripète", C.g, 10),
  ],
  "PH-CN-04": [
    L(60, 40, 60, 210, C.k, 2),
    ...[0, 1, 2, 3, 4].map((k) => D(110, 46 + 0.5 * 9.6 * k * k * 0.9, C.k, 5)),
    ...[0, 1, 2, 3].map((k) => {
      const y0 = 46 + 0.5 * 9.6 * k * k * 0.9;
      const y1 = 46 + 0.5 * 9.6 * (k + 1) * (k + 1) * 0.9;
      return A(150, y0, 150, y1, C.r, 1.5) + T(166, (y0 + y1) / 2 + 4, `Δx${"₁₂₃₄"[k]}`, C.r, 10, "start", true);
    }),
    T(110, 226, "positions à intervalles égaux", C.g, 10),
  ],
  "PH-OP-01": [
    L(60, 160, 300, 160, C.k, 2.6),
    ...Array.from({ length: 9 }, (_, i) => L(66 + i * 28, 160, 56 + i * 28, 174, C.g, 1.2)),
    L(180, 160, 180, 50, C.g, 1.4, "5 4"),
    A(80, 62, 180, 160, C.r, 2), A(180, 160, 280, 62, C.b, 2),
    ARC(180, 160, 46, -90, -136, C.r), ARC(180, 160, 46, -44, -90, C.b),
    T(146, 108, "i", C.r, 11, "middle", true), T(214, 108, "r", C.b, 11, "middle", true),
    T(180, 42, "normale", C.g, 10),
  ],
  "PH-OP-02": [
    L(50, 128, 316, 128, C.k, 2),
    R(50, 128, 266, 82, C.g, 0, "#e8eef7"),
    L(180, 128, 180, 26, C.g, 1.4, "5 4"), L(180, 128, 180, 214, C.g, 1.4, "5 4"),
    A(84, 46, 180, 128, C.r, 2), A(180, 128, 258, 208, C.b, 2),
    ARC(180, 128, 44, -90, -140, C.r), ARC(180, 128, 44, 76, 90, C.b),
    T(146, 88, "i₁", C.r, 11, "middle", true), T(198, 176, "i₂", C.b, 11, "middle", true),
    T(300, 116, "n₁", C.g, 10), T(300, 148, "n₂", C.g, 10),
  ],
  "PH-OP-03": [
    L(50, 128, 320, 128, C.k, 1.4),
    EL(186, 128, 14, 62, C.b, 2, "#e8eef7"),
    A(186, 66, 186, 190, C.b, 1),
    D(126, 128), D(246, 128), D(186, 128),
    T(126, 142, "F", C.o, 10), T(246, 142, "F′", C.o, 10), T(186, 142, "O", C.k, 10),
    A(86, 128, 86, 86, C.r, 2),
    P("M86 86 L186 86 L286 170", C.r, 1.8),
    P("M86 86 L186 128 L286 170", C.r, 1.8),
    A(286, 128, 286, 170, C.b, 2),
    T(78, 78, "AB", C.r, 10, "end"), T(298, 176, "A′B′", C.b, 10, "start"),
  ],
  "PH-OP-04": [
    P("M150 190 L214 70 L278 190 Z", C.k, 2, "#eef1f7"),
    A(56, 118, 168, 142, C.k, 2),
    ...[["#c0392b", 0], ["#e0a020", 5], ["#3d7a4a", 10], ["#2c5aa0", 15]].map(([col, dy]) =>
      A(240, 150, 322, 150 + (dy as number) - 8, col as string, 1.8),
    ),
    P("M168 142 L240 150", C.k, 1.6),
    T(96, 108, "lumière blanche", C.g, 10, "start"),
    T(330, 128, "rouge", "#c0392b", 9, "end"),
    T(330, 176, "bleu", "#2c5aa0", 9, "end"),
  ],
  "PH-EL-01": [
    // série
    P("M40 66 L64 66", C.k, 1.8), R(64, 56, 34, 20, C.k, 1.6, "#fff"), P("M98 66 L128 66", C.k, 1.8),
    R(128, 56, 34, 20, C.k, 1.6, "#fff"), P("M162 66 L186 66 L186 96 L40 96 L40 66", C.k, 1.8),
    T(112, 40, "série", C.g, 10),
    T(81, 70, "R₁", C.k, 10), T(145, 70, "R₂", C.k, 10),
    // parallèle
    P("M212 82 L236 82", C.k, 1.8),
    P("M236 54 L236 110", C.k, 1.8), P("M320 54 L320 110", C.k, 1.8),
    R(254, 44, 34, 20, C.k, 1.6, "#fff"), R(254, 100, 34, 20, C.k, 1.6, "#fff"),
    P("M236 54 L254 54 M288 54 L320 54 M236 110 L254 110 M288 110 L320 110", C.k, 1.8),
    P("M320 82 L340 82", C.k, 1.8),
    T(278, 30, "parallèle", C.g, 10),
    T(271, 58, "R₁", C.k, 10), T(271, 114, "R₂", C.k, 10),
    T(180, 176, "R_s = R₁ + R₂", C.k, 11),
    T(180, 200, "1/R_p = 1/R₁ + 1/R₂", C.k, 11),
  ],
  "PH-EL-02": [
    AXES(56, 186, 320, 40),
    L(56, 186, 300, 60, C.r, 2.4),
    L(180, 186, 180, 122, C.b, 1.3, "4 3"), L(56, 122, 180, 122, C.b, 1.3, "4 3"),
    D(180, 122, C.r),
    T(320 - 6, 204, "I (A)", C.k, 10, "end"),
    T(46, 40, "U (V)", C.k, 10, "end"),
    T(250, 96, "pente = R", C.r, 10, "end"),
  ],
  "PH-EL-03": [
    D(120, 124, C.r, 8), D(252, 124, C.b, 8),
    T(120, 129, "+", "#fff", 12), T(252, 129, "−", "#fff", 13),
    ...[0, 1, 2, 3].map((k) => {
      const s = [-60, -26, 26, 60][k];
      return P(`M128 ${124 + s * 0.35} C168 ${124 + s} 204 ${124 + s} 244 ${124 + s * 0.35}`, C.g, 1.4);
    }),
    A(140, 124, 232, 124, C.k, 1.6),
    T(180, 200, "lignes de champ d'un dipôle", C.g, 10),
  ],
  "PH-EL-04": [
    ...Array.from({ length: 8 }, (_, i) => EL(96 + i * 24, 124, 9, 30, C.k, 1.8)),
    L(96, 94, 264, 94, C.k, 1.6), L(96, 154, 264, 154, C.k, 1.6),
    A(120, 124, 250, 124, C.b, 2.2),
    T(186, 116, "B", C.b, 11, "middle", true),
    P("M60 124 L86 124 M274 124 L306 124", C.k, 1.6),
    T(180, 202, "B = μ₀ n I", C.k, 11),
  ],
  "PH-TH-01": [
    AXES(50, 190, 336, 40),
    P("M50 178 L96 132 L166 132 L206 88 L286 88 L322 56", C.r, 2.4),
    L(96, 132, 96, 196, C.g, 1.1, "4 3"), L(166, 132, 166, 196, C.g, 1.1, "4 3"),
    T(130, 122, "fusion", C.g, 10), T(246, 78, "vaporisation", C.g, 10),
    T(40, 44, "T", C.k, 11, "end", true), T(330, 208, "t", C.k, 11, "middle", true),
  ],
  "PH-TH-02": [
    AXES(56, 190, 330, 40),
    P("M100 160 C130 96 200 74 270 84 C288 108 250 168 100 160 Z", C.r, 2.2, "#f2e7e6"),
    A(150, 96, 190, 84, C.r, 1.6),
    T(46, 44, "P", C.k, 11, "end", true), T(324, 208, "V", C.k, 11, "middle", true),
    T(186, 128, "W", C.r, 11, "middle", true),
    T(180, 226, "cycle et travail échangé", C.g, 10),
  ],
  "PH-TH-03": [
    AXES(40, 122, 336, 36),
    plot((x) => Math.sin(x), 0, 9.4, (x) => 40 + 31 * x, (y) => 122 - 48 * y, 80, C.r, 2.2),
    A(40 + 31 * 1.57, 60, 40 + 31 * 7.85, 60, C.b, 1.5),
    L(40 + 31 * 1.57, 74, 40 + 31 * 1.57, 56, C.b, 1.2), L(40 + 31 * 7.85, 74, 40 + 31 * 7.85, 56, C.b, 1.2),
    A(300, 122, 300, 74, C.o, 1.5),
    T(190, 50, "λ", C.b, 12, "middle", true),
    T(312, 96, "A", C.o, 11, "start", true),
    T(180, 214, "v = λ f", C.k, 11),
  ],
  "PH-TH-04": [
    D(70, 88, C.k, 5), D(70, 160, C.k, 5),
    ...[26, 46, 66, 86, 106].map((r) => P(`M70 88 m-${r} 0 a${r} ${r} 0 0 1 ${2 * r} 0`, C.g, 1.1) + P(`M70 88 m-${r} 0 a${r} ${r} 0 0 0 ${2 * r} 0`, C.g, 1.1)),
    ...[26, 46, 66, 86, 106].map((r) => CI(70, 160, r, C.g, 1.1)),
    L(280, 34, 280, 214, C.k, 2),
    ...[52, 90, 124, 158, 196].map((y, i) => L(272, y, 288, y, i % 2 ? C.b : C.r, i % 2 ? 3 : 5)),
    T(300, 60, "franges", C.k, 10, "start"),
    T(150, 226, "deux sources cohérentes", C.g, 10),
  ],

  // ════════════════════════════ CH · Chimie ════════════════════════════
  "CH-ST-01": [
    D(180, 124, C.r, 9),
    ...[36, 62, 88].map((r, i) => CI(180, 124, r, C.g, 1.2, "none", i ? "4 3" : "")),
    ...[[180, 88], [180, 160]].map(([x, y]) => D(x as number, y as number, C.b, 4)),
    ...[[128, 92], [232, 92], [128, 156], [232, 156], [118, 124], [242, 124]].map(([x, y]) => D(x as number, y as number, C.b, 4)),
    ...[[180, 36], [128, 56], [232, 56], [110, 178], [250, 178]].map(([x, y]) => D(x as number, y as number, C.b, 4)),
    T(196, 116, "K", C.k, 10, "start"), T(222, 116, "L", C.k, 10, "start"), T(250, 116, "M", C.k, 10, "start"),
    T(180, 226, "couches électroniques", C.g, 10),
  ],
  "CH-ST-02": [
    R(30, 60, 30, 24, C.k, 1.4, "#eae4f5"), R(30, 84, 30, 96, C.k, 1.4, "#eae4f5"),
    R(212, 60, 108, 24, C.k, 1.4, "#dfe6f3"), R(212, 84, 108, 96, C.k, 1.4, "#dfe6f3"),
    R(96, 108, 116, 72, C.k, 1.4, "#f3ecd9"),
    R(60, 156, 200, 24, C.k, 1.4, "#e5f0e6"),
    T(45, 128, "s", C.k, 13, "middle", true), T(266, 128, "p", C.k, 13, "middle", true),
    T(154, 150, "d", C.k, 13, "middle", true), T(160, 172, "f", C.k, 13, "middle", true),
    T(180, 44, "périodes ↓   groupes →", C.g, 10),
    T(180, 210, "organisation en blocs", C.g, 10),
  ],
  "CH-ST-03": [
    CI(96, 118, 30, C.k, 1.8), CI(196, 118, 30, C.k, 1.8),
    A(122, 110, 170, 110, C.r, 2),
    D(126, 118, C.b, 4),
    T(96, 123, "Na", C.k, 12), T(196, 123, "Cl", C.k, 12),
    T(146, 96, "e⁻", C.r, 10),
    T(146, 166, "ionique", C.g, 10),
    CI(276, 118, 22, C.k, 1.8), CI(320, 118, 22, C.k, 1.8),
    D(292, 118, C.b, 4), D(304, 118, C.b, 4),
    T(298, 166, "covalente", C.g, 10),
    T(180, 216, "transfert / mise en commun d'électrons", C.g, 10),
  ],
  "CH-ST-04": [
    ...[
      [56, "AX₂", "linéaire"],
      [146, "AX₂E", "coudée"],
      [236, "AX₃", "trigonale"],
      [316, "AX₄", "tétraédrique"],
    ].map(([x, n, l], i) => {
      const cx = x as number;
      const bonds =
        i === 0 ? [[-30, 0], [30, 0]] : i === 1 ? [[-26, 16], [26, 16]] : i === 2 ? [[0, -30], [-26, 16], [26, 16]] : [[0, -28], [-26, 14], [26, 14], [0, 26]];
      return (
        bonds.map(([dx, dy]) => L(cx, 110, cx + dx, 110 + dy, C.k, 1.7) + D(cx + dx, 110 + dy, C.b, 5)).join("") +
        D(cx, 110, C.r, 7) +
        T(cx, 172, n as string, C.k, 11) +
        T(cx, 190, l as string, C.g, 9)
      );
    }),
    T(180, 226, "géométrie VSEPR", C.g, 10),
  ],
  "CH-RE-01": [
    L(96, 24, 96, 130, C.k, 1.8), L(112, 24, 112, 130, C.k, 1.8),
    R(96, 40, 16, 74, C.b, 0, "#cfe0f2"),
    P("M96 130 L104 146 L112 130", C.k, 1.8),
    ...[52, 70, 88, 106].map((y) => L(112, y, 122, y, C.g, 1.1)),
    T(132, 60, "burette", C.g, 10, "start"),
    P("M156 128 L212 128 L252 208 L116 208 Z", C.k, 2, "#fff"),
    P("M132 180 L236 180 L252 208 L116 208 Z", C.b, 0, "#dbe8f6"),
    T(184, 224, "erlenmeyer", C.g, 10),
    D(104, 152, C.b, 3),
    T(276, 130, "solution à doser", C.g, 10, "middle"),
  ],
  "CH-RE-02": [
    AXES(52, 190, 330, 34),
    plot((v) => 2.4 + 9.2 / (1 + Math.exp(-(v - 14) * 0.9)), 0, 24, (v) => 52 + 11.4 * v, (y) => 190 - 12 * y, 70, C.r, 2.4),
    L(52 + 11.4 * 14, 190, 52 + 11.4 * 14, 46, C.b, 1.3, "5 4"),
    L(52, 190 - 12 * 7, 52 + 11.4 * 14, 190 - 12 * 7, C.b, 1.3, "5 4"),
    D(52 + 11.4 * 14, 190 - 12 * 7, C.b, 4),
    T(42, 40, "pH", C.k, 11, "end"),
    T(322, 208, "V versé", C.k, 10, "end"),
    T(226, 92, "point d'équivalence", C.b, 10, "start"),
  ],
  "CH-RE-03": [
    AXES(52, 190, 330, 34),
    P("M70 140 C120 140 130 56 168 56 C206 56 216 170 288 170", C.r, 2.4),
    L(52, 140, 300, 140, C.g, 1.1, "4 3"), L(52, 170, 300, 170, C.g, 1.1, "4 3"),
    A(120, 140, 120, 58, C.b, 1.8), A(300, 140, 300, 170, C.o, 1.8),
    T(112, 100, "Ea", C.b, 11, "end", true),
    T(312, 158, "ΔH", C.o, 11, "start", true),
    T(70, 130, "réactifs", C.g, 10, "start"), T(288, 186, "produits", C.g, 10, "end"),
    T(42, 40, "H", C.k, 11, "end", true),
  ],
  "CH-RE-04": [
    R(50, 96, 74, 96, C.k, 1.8, "#e7eef8"), R(236, 96, 74, 96, C.k, 1.8, "#f6eee2"),
    R(80, 60, 14, 100, C.k, 1.8, "#d6d9e0"), R(266, 60, 14, 100, C.k, 1.8, "#e5cfa8"),
    P("M100 74 C140 40 220 40 260 74", C.k, 2.4),
    P("M104 78 C142 48 218 48 256 78", "#fff", 1.4),
    L(87, 52, 273, 52, C.k, 1.8),
    A(150, 44, 210, 44, C.r, 1.8),
    T(180, 36, "e⁻", C.r, 10),
    T(87, 208, "anode (−)", C.k, 10), T(273, 208, "cathode (+)", C.k, 10),
    T(180, 92, "pont salin", C.g, 10),
  ],
  "CH-OR-01": [
    P("M60 100 L104 76 L148 100 L192 76", C.k, 2),
    ...[[60, 100], [104, 76], [148, 100], [192, 76]].map(([x, y]) => D(x as number, y as number, C.k, 3.4)),
    T(126, 132, "alcane — liaison simple", C.g, 10),
    P("M60 186 L104 162 L148 186 L192 162", C.k, 2),
    L(104, 170, 148, 194, C.r, 2),
    ...[[60, 186], [104, 162], [148, 186], [192, 162]].map(([x, y]) => D(x as number, y as number, C.k, 3.4)),
    T(126, 218, "alcène — liaison double", C.g, 10),
    T(280, 100, "CₙH₂ₙ₊₂", C.k, 13), T(280, 186, "CₙH₂ₙ", C.k, 13),
  ],
  "CH-OR-02": [
    P(hexagon(180, 120, 62), C.k, 2.2),
    CI(180, 120, 36, C.r, 2),
    ...Array.from({ length: 6 }, (_, i) => {
      const a = (-90 + 60 * i) * (Math.PI / 180);
      return D(180 + 62 * Math.cos(a), 120 + 62 * Math.sin(a), C.k, 3.6);
    }),
    T(180, 210, "délocalisation électronique — C₆H₆", C.g, 10),
  ],
  "CH-OR-03": [
    ...[
      ["alcool", "R—OH", 44],
      ["aldéhyde", "R—CHO", 82],
      ["acide", "R—COOH", 120],
      ["ester", "R—COO—R′", 158],
      ["amine", "R—NH₂", 196],
    ].map(([n, f, y]) => T(96, y as number, n as string, C.g, 11, "end") + T(120, y as number, f as string, C.k, 12, "start")),
    L(104, 30, 104, 208, C.g, 1.1),
    T(180, 232, "groupes fonctionnels", C.g, 10),
  ],
  "CH-OR-04": [
    P("M50 104 L86 82 L122 104 L158 82", C.k, 2),
    ...[[50, 104], [86, 82], [122, 104], [158, 82]].map(([x, y]) => D(x as number, y as number, C.k, 3.4)),
    T(104, 136, "butane", C.g, 10),
    P("M212 104 L248 82 L284 104", C.k, 2), L(248, 82, 248, 44, C.r, 2),
    ...[[212, 104], [248, 82], [284, 104], [248, 44]].map(([x, y]) => D(x as number, y as number, C.k, 3.4)),
    T(248, 136, "2-méthylpropane", C.g, 10),
    T(180, 200, "même formule brute : C₄H₁₀", C.k, 11),
  ],

  // ═════════════════ SV · Sciences de la vie et de la Terre ═════════════════
  "SV-CE-01": [
    EL(140, 118, 96, 66, C.k, 2.4, "#eef4ef"),
    CI(108, 108, 29, C.b, 2, "#dde6f4"),
    D(108, 108, C.b, 5),
    EL(176, 82, 15, 7, C.v, 1.8, "#dcecdf"),
    EL(146, 160, 15, 7, C.v, 1.8, "#dcecdf"),
    EL(78, 154, 13, 6, C.v, 1.8, "#dcecdf"),
    // Targets ordered top-to-bottom to match the label column, so no leader crosses
    // another or passes through a word.
    tag(252, 64, 214, 76, "membrane", C.k),
    tag(252, 98, 191, 82, "mitochondrie", C.v),
    tag(252, 132, 137, 108, "noyau", C.b),
    tag(252, 166, 168, 142, "cytoplasme", C.g),
  ],
  "SV-CE-02": [
    R(44, 54, 196, 132, C.k, 2.6, "#f0f5ee", 4),
    R(54, 64, 176, 112, C.v, 1.6, "#eaf3ea", 3),
    EL(160, 128, 58, 36, C.b, 1.8, "#dfeaf7"),
    CI(92, 100, 22, C.k, 1.8, "#e6e6ee"),
    D(92, 100, C.k, 4),
    ...[[120, 158], [196, 78], [130, 78]].map(([x, y]) => EL(x as number, y as number, 14, 7, C.v, 1.8, "#cfe4d2")),
    // Aimed at the outer wall itself (x = 44 + 196), not at the chloroplast beside it.
    tag(252, 66, 240, 72, "paroi", C.k),
    tag(252, 100, 144, 78, "chloroplaste", C.v),
    tag(252, 134, 114, 100, "noyau", C.k),
    tag(252, 168, 176, 140, "vacuole", C.b),
  ],
  "SV-CE-03": [
    ...[
      ["prophase", 58],
      ["métaphase", 140],
      ["anaphase", 222],
      ["télophase", 304],
    ].map(([n, x], i) => {
      const cx = x as number;
      const inner =
        i === 0
          ? CI(cx, 100, 30, C.b, 1.6, "#eef3fa") + P(`M${cx - 12} 90 L${cx + 6} 108 M${cx - 4} 112 L${cx + 12} 92`, C.r, 2)
          : i === 1
            ? CI(cx, 100, 30, C.k, 1.4, "none", "3 3") + L(cx - 16, 100, cx + 16, 100, C.r, 2.4) + L(cx, 70, cx, 130, C.g, 1.1, "3 3")
            : i === 2
              ? CI(cx, 100, 30, C.k, 1.4, "none", "3 3") + L(cx - 20, 84, cx - 4, 84, C.r, 2.2) + L(cx + 4, 116, cx + 20, 116, C.r, 2.2)
              : EL(cx, 86, 24, 18, C.b, 1.6, "#eef3fa") + EL(cx, 118, 24, 18, C.b, 1.6, "#eef3fa");
      return inner + T(cx, 158, n as string, C.g, 9);
    }),
    T(180, 202, "prophase → télophase", C.g, 10),
  ],
  "SV-CE-04": [
    R(150, 30, 30, 42, C.k, 2, "#e4e6ee", 3),
    T(196, 52, "oculaire", C.g, 10, "start"),
    P("M165 72 L165 108", C.k, 2.4),
    R(140, 108, 50, 22, C.k, 2, "#eef0f6", 3),
    R(154, 130, 22, 30, C.k, 2, "#e4e6ee", 2),
    T(200, 148, "objectif", C.g, 10, "start"),
    R(112, 164, 106, 10, C.k, 2, "#dfe3ea"),
    T(96, 172, "platine", C.g, 10, "end"),
    CI(165, 196, 13, C.o, 2, "#f6ecd6"),
    T(200, 200, "miroir", C.g, 10, "start"),
    P("M112 174 L112 212 L218 212 L218 174", C.k, 2.2),
  ],
  "SV-PY-01": [
    P("M180 44 C120 44 88 104 116 156 C140 200 180 214 180 214 C180 214 220 200 244 156 C272 104 240 44 180 44 Z", C.k, 2.2, "#f6eeee"),
    L(180, 60, 180, 200, C.k, 1.6),
    P("M116 118 L244 118", C.k, 1.6),
    R(126, 74, 46, 40, C.b, 0, "#dbe6f5"), R(190, 74, 46, 40, C.r, 0, "#f5dede"),
    R(126, 122, 46, 74, C.b, 0, "#c9dcf1"), R(190, 122, 46, 74, C.r, 0, "#f1cccc"),
    T(149, 98, "OD", C.b, 10), T(213, 98, "OG", C.r, 10),
    T(149, 162, "VD", C.b, 10), T(213, 162, "VG", C.r, 10),
    T(60, 60, "veines caves", C.b, 9, "start"), T(300, 60, "aorte", C.r, 9, "end"),
  ],
  "SV-PY-02": [
    CI(130, 118, 56, C.k, 2, "#f2f6f2"),
    T(130, 122, "alvéole", C.g, 10),
    P("M186 70 C230 70 230 166 186 166", C.r, 3),
    P("M196 70 C240 70 240 166 196 166", C.b, 3),
    A(176, 100, 218, 100, C.b, 2), A(218, 140, 176, 140, C.k, 2),
    T(240, 96, "O₂ → sang", C.b, 10, "start"),
    T(240, 148, "CO₂ ← sang", C.k, 10, "start"),
    T(180, 214, "diffusion alvéolaire", C.g, 10),
  ],
  "SV-PY-03": [
    CI(96, 120, 26, C.k, 2, "#eef1f7"), D(96, 120, C.k, 6),
    ...[[-40, -34], [-46, 0], [-40, 34]].map(([dx, dy]) => L(96, 120, 96 + (dx as number), 120 + (dy as number), C.v, 2)),
    L(122, 120, 268, 120, C.k, 2.4),
    ...[150, 186, 222].map((x) => EL(x, 120, 15, 10, C.o, 1.6, "#f6ecd6")),
    P("M268 120 L296 100 M268 120 L296 140 M268 120 L300 120", C.k, 1.8),
    T(50, 168, "dendrites", C.v, 10, "start"),
    T(186, 96, "gaine de myéline", C.o, 10),
    T(186, 150, "axone", C.k, 10),
    T(300, 158, "synapses", C.k, 10, "end"),
  ],
  "SV-PY-04": [
    // Colon first, so the coils of the small intestine sit inside its frame.
    P("M92 208 L92 116 L196 116 L196 208", C.k, 3),
    EL(144, 26, 15, 8, C.k, 2, "#fff"),
    P("M144 34 L144 80", C.k, 2.4),
    P("M144 80 C116 86 112 114 134 126 C154 136 176 126 172 106 C170 96 160 92 152 96", C.k, 2.4, "#f6eeee"),
    P("M140 138 C116 146 168 156 138 166 C112 174 168 184 140 194", C.k, 2),
    P("M144 208 L144 224", C.k, 2.4),
    tag(240, 30, 161, 26, "bouche", C.k),
    tag(240, 62, 150, 60, "œsophage", C.k),
    tag(240, 96, 174, 108, "estomac", C.k),
    tag(240, 130, 196, 130, "gros intestin", C.k),
    tag(240, 164, 160, 162, "intestin grêle", C.k),
    T(144, 236, "trajet du bol alimentaire", C.g, 9),
  ],
  "SV-EC-01": [
    ...[
      ["#3d7a4a", 46, "producteur"],
      ["#7a9a3d", 130, "consommateur I"],
      ["#b8860b", 214, "consommateur II"],
      ["#8a6d3b", 298, "décomposeur"],
    ].map(([col, x, n]) => CI(x as number, 100, 26, col as string, 2.2, "#fff") + T(x as number, 152, n as string, C.g, 9)),
    ...[[72, 104], [156, 188], [240, 272]].map(([a, b]) => A(a as number, 100, b as number, 100, C.k, 1.8)),
    T(180, 196, "flux d'énergie", C.k, 10),
    A(298, 130, 46, 130, C.g, 1.4),
  ],
  "SV-EC-02": [
    P("M30 200 L330 200", C.b, 3),
    R(30, 200, 300, 30, C.b, 0, "#dbe8f6"),
    P("M96 60 C96 40 130 34 142 50 C160 38 186 52 182 70 C200 72 200 96 178 96 L106 96 C86 96 84 66 96 60 Z", C.g, 1.8, "#eef1f6"),
    ...[120, 146, 172].map((x) => A(x, 100, x - 4, 140, C.b, 1.8)),
    A(60, 190, 60, 106, C.o, 2),
    A(280, 106, 280, 190, C.b, 2),
    T(46, 148, "évaporation", C.o, 9, "start"),
    T(146, 158, "précipitations", C.b, 9),
    T(296, 148, "ruissellement", C.b, 9, "end"),
    T(140, 118, "condensation", C.g, 9),
  ],
  "SV-EC-03": [
    P("M30 200 L330 200", C.k, 2),
    P("M92 200 L92 150 M84 150 C84 130 100 130 100 150 Z", C.v, 2),
    CI(92, 138, 18, C.v, 2, "#dcecdf"),
    T(92, 214, "photosynthèse", C.v, 9),
    R(196, 150, 52, 50, C.k, 1.8, "#eee"), P("M210 150 L210 120 M234 150 L234 120", C.g, 2),
    T(222, 214, "combustion", C.g, 9),
    CI(300, 158, 20, C.o, 2, "#f6ecd6"), T(300, 214, "respiration", C.o, 9),
    A(140, 92, 96, 118, C.v, 1.8), A(214, 112, 250, 88, C.g, 1.8), A(300, 132, 268, 92, C.o, 1.8),
    T(200, 66, "CO₂ atmosphérique", C.k, 11),
  ],
  "SV-EC-04": [
    AXES(52, 190, 330, 36),
    plot((t) => 210 / (1 + 40 * Math.exp(-0.62 * t)), 0, 16, (t) => 52 + 17 * t, (y) => 190 - 0.62 * y, 60, C.v, 2.4),
    plot((t) => 3.2 * Math.exp(0.29 * t), 0, 14.6, (t) => 52 + 17 * t, (y) => 190 - 0.62 * y, 60, C.r, 2, ),
    L(52, 190 - 0.62 * 210, 320, 190 - 0.62 * 210, C.g, 1.3, "5 4"),
    T(322, 190 - 0.62 * 210 - 6, "K", C.g, 10, "end", true),
    T(120, 60, "exponentielle", C.r, 9, "start"),
    T(250, 110, "logistique", C.v, 9, "start"),
    T(322, 208, "t", C.k, 10, "end", true),
  ],
  "SV-GL-01": [
    ...[
      [96, "#c9a06a", "noyau interne"],
      [80, "#e0b878", "noyau externe"],
      [52, "#b07a4a", "manteau"],
      [20, "#8a5a3a", "croûte"],
    ].map(([r]) => CI(180, 124, r as number, C.k, 1.4, ["#8a5a3a", "#b07a4a", "#e0b878", "#c9a06a"][[96, 80, 52, 20].indexOf(r as number)])),
    CI(180, 124, 96, C.k, 2),
    // Each dot sits at the mid-radius of the band it names — a target on a boundary
    // reads as pointing at either neighbour.
    tag(288, 66, 256, 80, "croûte", C.k),
    tag(288, 104, 244, 107, "manteau", C.k),
    tag(288, 142, 216, 124, "noyau externe", C.k),
    tag(288, 180, 190, 134, "noyau interne", C.k),
  ],
  "SV-GL-02": [
    R(30, 120, 300, 90, C.k, 0, "#e8d9c4"),
    P("M30 120 L140 120 L168 168 L196 120 L330 120", C.k, 2.2),
    P("M140 120 L140 90 L168 76 L196 90 L196 120", C.r, 2, "#f0dcd9"),
    A(120, 66, 96, 66, C.r, 1.8), A(216, 66, 240, 66, C.r, 1.8),
    T(168, 60, "dorsale", C.r, 10),
    P("M260 120 L310 190", C.b, 2.4),
    A(286, 140, 302, 168, C.b, 1.6),
    T(292, 200, "subduction", C.b, 10, "end"),
  ],
  "SV-GL-03": [
    ...[
      [56, "#d9c9a8"],
      [86, "#c2ab84"],
      [116, "#a8905f"],
      [146, "#8f7a4d"],
      [176, "#75633c"],
    ].map(([y, col]) => R(40, y as number, 280, 30, C.k, 1.2, col as string)),
    P("M186 46 L232 216", C.r, 2.4),
    T(244, 120, "faille", C.r, 10, "start"),
    A(30, 200, 30, 60, C.g, 1.6),
    T(24, 130, "plus ancien →", C.g, 9, "end"),
  ],
  "SV-GL-04": [
    ...[
      [180, 50, "magmatique", "#b0342c"],
      [292, 140, "sédimentaire", "#b8860b"],
      [68, 140, "métamorphique", "#3d7a4a"],
    ].map(([x, y, n, col]) => CI(x as number, y as number, 30, col as string, 2.2, "#fff") + T(x as number, (y as number) + 4, (n as string).slice(0, 4) + ".", col as string, 9)),
    ARC(180, 118, 74, -62, 12, C.k, 1.8),
    ARC(180, 118, 74, 52, 128, C.k, 1.8),
    ARC(180, 118, 74, 168, 240, C.k, 1.8),
    T(180, 214, "cycle des roches", C.g, 10),
  ],
};

// A filled area under the sampled curve, closing back along the axis.
function samplePath(): string {
  const pts: string[] = [];
  for (let i = 60; i >= 0; i--) {
    const x = 1.2 + ((4.24 - 1.2) * i) / 60;
    pts.push(`L${(50 + 50 * x).toFixed(1)} ${(186 - 22 * (0.2 * x * x + 0.5)).toFixed(1)}`);
  }
  return pts.join(" ") + " Z";
}

// A faint square grid, for the figures drawn in a coordinate frame.
function grid(): string[] {
  const out: string[] = [];
  for (let x = 60; x <= 330; x += 34) out.push(L(x, 40, x, 200, "#e6e8ee", 1));
  for (let y = 40; y <= 200; y += 30) out.push(L(50, y, 336, y, "#e6e8ee", 1));
  return out;
}
export const DRAWINGS: Record<string, string> = Object.fromEntries(
  Object.entries(PARTS).map(([code, parts]) => [code, svg(parts)]),
);

export const hasDrawing = (code: string) => code in DRAWINGS;
