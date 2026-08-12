// Figures a student can move.
//
// Everything else in this platform draws once and stops: `figures.ts` emits an SVG on
// the server, `epure.ts` emits an SVG on the server, and the picture a pupil sees is
// the picture the teacher fixed. That is right for most of the curriculum and wrong for
// exactly one part of it. « Le cosinus de l'arc α est l'abscisse de M » is a sentence
// about a point that MOVES; a still of one particular α is the least useful frame of it.
//
// So: a narrow, named set of widgets, not an embedding of a graphing library. The stored
// spec is a widget name and a handful of numbers — never a construction script, never
// code. That matters three ways. Lesson JSON stays reviewable and diffable. The RAG
// index gets a caption instead of four hundred coordinates. And a ```figure fence
// arriving from an import or a Copilot draft cannot execute anything, because there is
// nothing in the format that could be executed.
//
// The drawing itself is JSXGraph (MIT/LGPL, self-hosted from node_modules — the school
// server has no internet). It renders SVG rather than WebGL, which is what makes this
// viable on the phones this is actually read on.

export type InteractiveWidget =
  // Trigonométrie
  | "cercle-trigonometrique"
  | "arcs-associes"
  | "sinusoide"
  | "triangle-quelconque"
  | "triangle-rectangle"
  // Analyse — « Étude d'une fonction », « Dérivées », « Limites », « Asymptotes »
  | "fonction"
  | "tangente"
  | "asymptotes"
  | "second-degre"
  | "suite"
  // Géométrie — « Le cercle », « Coniques », « Espaces vectoriels », « Nombres complexes »
  | "angle-inscrit"
  | "conique"
  | "vecteurs"
  | "complexe";

/** Which part of the curriculum a widget belongs to — the grouping in the teacher's menu. */
export type WidgetFamily = "trigonométrie" | "analyse" | "géométrie";

export type InteractiveSpec = {
  type: "interactive";
  widget: InteractiveWidget;
  title?: string;
  caption?: string;
  /** Starting angle in degrees, for the three circle widgets. */
  angle?: number;
  /** Which readings to draw. Defaults per widget; an empty list is honoured, not ignored. */
  show?: string[];
  /** Starting coefficients — what a, b and c mean depends on the widget. */
  a?: number;
  b?: number;
  c?: number;
  /** Whether the sinusoid widget plots cosine instead of sine. */
  fn?: "sin" | "cos";
  /**
   * The curve, for the analysis widgets, in the same syntax as a ```figure function
   * block — so a teacher who has written one graph already knows how to write this one.
   * It may use a, b and c on top of x; those become the draggable sliders.
   */
  expr?: string;
  /** The visible window for the analysis widgets. */
  xmin?: number;
  xmax?: number;
  ymin?: number;
  ymax?: number;
  /** Which conic the conic widget draws. */
  conic?: "ellipse" | "hyperbole" | "parabole";
  height?: number;
};

type WidgetDef = {
  label: string;
  hint: string;
  family: WidgetFamily;
  /** Name from lib/icons.js, for the figure menu. */
  icon: string;
  /** Modules this figure belongs to, shown in the teacher's picker so the menu is not a guess. */
  modules: readonly string[];
  /** Readings this widget knows how to draw — anything else in `show` is dropped. */
  shows: readonly string[];
  defaultShow: readonly string[];
  /** Defaults for the fields this widget actually reads, merged before normalisation. */
  preset?: Partial<InteractiveSpec>;
  /**
   * What the figure would say if it could not move.
   *
   * Not decoration. It is the alt text, it is what a printed lesson falls back to, and
   * it is what the RAG indexer and the Copilot see in place of the widget — so it has to
   * describe the mathematics, not the interaction ("cliquez et glissez" helps nobody
   * reading a chunk of retrieved text).
   */
  still: string;
};

export const INTERACTIVE_WIDGETS: Record<InteractiveWidget, WidgetDef> = {
  "cercle-trigonometrique": {
    label: "Cercle trigonométrique",
    hint: "déplacer M, lire cos, sin et tan",
    family: "trigonométrie",
    icon: "compass",
    modules: ["Fonctions circulaires", "Arcs et angles orientés"],
    shows: ["cos", "sin", "tan", "cot", "angle", "coords"],
    defaultShow: ["cos", "sin", "angle"],
    still: "Cercle trigonométrique de centre O et de rayon 1, avec un point M mobile sur le cercle : son abscisse donne cos α, son ordonnée sin α, et la tangente en A donne tan α.",
  },
  "arcs-associes": {
    label: "Arcs associés",
    hint: "M et ses symétriques M₁, M₂, M₃",
    family: "trigonométrie",
    icon: "geoCircumcircle",
    modules: ["Fonctions circulaires", "Rapports trigonométriques d'angles associés"],
    shows: ["cos", "sin", "labels"],
    defaultShow: ["cos", "sin", "labels"],
    still: "Cercle trigonométrique portant un point M et ses symétriques par rapport à l'axe des abscisses, à l'axe des ordonnées et au centre : les arcs −α, π−α et π+α.",
  },
  sinusoide: {
    label: "Sinusoïde déroulée",
    hint: "le cercle à gauche, la courbe à droite",
    family: "trigonométrie",
    icon: "chartLine",
    modules: ["Fonctions circulaires", "Fonctions trigonométriques"],
    shows: ["cercle", "grille"],
    defaultShow: ["cercle", "grille"],
    still: "Le cercle trigonométrique et, à sa droite, la courbe obtenue en portant l'arc en abscisse et son sinus en ordonnée : la sinusoïde y = sin x.",
  },
  "triangle-quelconque": {
    label: "Résolution d'un triangle",
    hint: "déplacer les sommets, lire la loi des sinus",
    family: "trigonométrie",
    icon: "geoTriangle",
    modules: ["Résolution des triangles — cas classiques", "Triangles quelconques"],
    shows: ["cotes", "angles", "sinus"],
    defaultShow: ["cotes", "angles", "sinus"],
    still: "Triangle ABC quelconque dont les sommets peuvent être déplacés, avec la mesure de ses trois côtés, de ses trois angles et la vérification de la loi des sinus a/sin A = b/sin B = c/sin C.",
  },
  "triangle-rectangle": {
    label: "Triangle rectangle",
    hint: "sinus, cosinus et tangente comme rapports de côtés",
    family: "trigonométrie",
    icon: "geoRightTriangle",
    modules: ["Résolution des triangles rectangles", "Rapports trigonométriques d'angles associés"],
    shows: ["cotes", "rapports", "angle"],
    defaultShow: ["cotes", "rapports", "angle"],
    still: "Triangle rectangle dont un sommet est mobile, avec la longueur de l'hypoténuse, du côté opposé et du côté adjacent, et les rapports qui définissent le sinus, le cosinus et la tangente de l'angle aigu.",
  },

  fonction: {
    label: "Courbe à paramètres",
    hint: "des curseurs a, b, c qui déforment la courbe",
    family: "analyse",
    icon: "chartFunction",
    modules: ["Étude d'une fonction", "Généralités sur les fonctions numériques", "Fonctions"],
    shows: ["grille", "racines", "extremums"],
    defaultShow: ["grille", "racines"],
    preset: { expr: "a*x^2+b*x+c", a: 1, b: 0, c: -2, xmin: -6, xmax: 6, ymin: -8, ymax: 8 },
    still: "Courbe d'une fonction dont les coefficients a, b et c sont réglables : chaque valeur des coefficients donne une courbe différente dans le même repère.",
  },
  tangente: {
    label: "Tangente et nombre dérivé",
    hint: "déplacer le point, lire la pente",
    family: "analyse",
    icon: "trend",
    modules: ["Dérivées", "Étude d'une fonction"],
    shows: ["grille", "pente", "accroissement"],
    defaultShow: ["grille", "pente"],
    preset: { expr: "x^3/3-x", a: 1, xmin: -3.2, xmax: 3.2, ymin: -3, ymax: 3 },
    still: "Courbe d'une fonction et sa tangente en un point mobile : le coefficient directeur de la tangente est le nombre dérivé de la fonction en ce point.",
  },
  asymptotes: {
    label: "Limites et asymptotes",
    hint: "approcher le pôle, voir la courbe filer",
    family: "analyse",
    icon: "chartCombo",
    modules: ["Asymptotes", "Limites", "Continuité"],
    shows: ["grille", "verticale", "oblique", "ecart"],
    defaultShow: ["grille", "verticale", "oblique"],
    preset: { expr: "(x^2+1)/(x-1)", xmin: -6, xmax: 8, ymin: -12, ymax: 16 },
    still: "Courbe d'une fonction rationnelle avec son asymptote verticale et son asymptote oblique : près du pôle la courbe s'écarte indéfiniment, et loin de l'origine elle se confond avec la droite oblique.",
  },
  "second-degre": {
    label: "Trinôme du second degré",
    hint: "a, b, c réglables — discriminant, racines, sommet",
    family: "analyse",
    icon: "chartArea",
    modules: ["Le second degré", "Compléments sur le second degré"],
    shows: ["grille", "racines", "sommet", "discriminant", "axe"],
    defaultShow: ["grille", "racines", "sommet", "discriminant"],
    preset: { a: 1, b: -1, c: -2, xmin: -5, xmax: 5, ymin: -6, ymax: 8 },
    still: "Parabole d'équation y = ax² + bx + c dont les coefficients sont réglables, avec son discriminant, ses racines lorsqu'elles existent, son sommet et son axe de symétrie.",
  },
  suite: {
    label: "Suite récurrente",
    hint: "la construction en escalier de u(n+1) = f(u(n))",
    family: "analyse",
    icon: "chartHistogram",
    modules: ["Suites numériques"],
    shows: ["grille", "escalier", "termes"],
    defaultShow: ["grille", "escalier", "termes"],
    preset: { expr: "a*x*(1-x)", a: 2.6, b: 0.15, xmin: 0, xmax: 1, ymin: 0, ymax: 1 },
    still: "Construction en escalier d'une suite définie par récurrence : la courbe de f et la droite y = x permettent de placer chaque terme à partir du précédent et de voir vers quoi la suite tend.",
  },

  "angle-inscrit": {
    label: "Angle inscrit et angle au centre",
    hint: "l'angle inscrit vaut la moitié de l'angle au centre",
    family: "géométrie",
    icon: "geoInscribed",
    modules: ["Le cercle", "Généralités sur la géométrie orientée"],
    shows: ["mesures", "arc"],
    defaultShow: ["mesures", "arc"],
    still: "Cercle portant une corde AB, l'angle au centre qui l'intercepte et un angle inscrit de sommet mobile sur le cercle : l'angle inscrit garde la même mesure, égale à la moitié de l'angle au centre.",
  },
  conique: {
    label: "Conique",
    hint: "ellipse, hyperbole ou parabole, foyers et excentricité",
    family: "géométrie",
    icon: "geoAxes",
    modules: ["Courbes du second degré (coniques)", "Éléments d'étude d'une conique", "Étude des coniques particulières"],
    shows: ["foyers", "directrice", "axes", "excentricite"],
    defaultShow: ["foyers", "axes", "excentricite"],
    preset: { conic: "ellipse", a: 4, b: 2.4 },
    still: "Conique tracée à partir de ses demi-axes réglables, avec ses foyers, sa directrice et son excentricité : la même construction donne une ellipse, une hyperbole ou une parabole.",
  },
  vecteurs: {
    label: "Somme de deux vecteurs",
    hint: "déplacer u et v, lire la règle du parallélogramme",
    family: "géométrie",
    icon: "arrowR",
    modules: ["Espaces vectoriels euclidiens", "La droite"],
    shows: ["parallelogramme", "composantes", "norme", "scalaire"],
    defaultShow: ["parallelogramme", "composantes", "norme"],
    still: "Deux vecteurs de même origine dont les extrémités sont mobiles, leur somme construite par la règle du parallélogramme, leurs composantes, leurs normes et leur produit scalaire.",
  },
  complexe: {
    label: "Plan complexe",
    hint: "module, argument, conjugué et carré de z",
    family: "géométrie",
    icon: "target",
    modules: ["Le corps C des nombres complexes"],
    shows: ["module", "argument", "conjugue", "carre"],
    defaultShow: ["module", "argument", "conjugue"],
    still: "Point mobile d'affixe z dans le plan complexe, avec son module, son argument, le point d'affixe conjuguée et le point d'affixe z².",
  },
};

/** The widget menu, grouped the way the curriculum is. */
export const WIDGET_FAMILIES: { family: WidgetFamily; label: string; widgets: InteractiveWidget[] }[] = (
  [
    { family: "trigonométrie", label: "Trigonométrie" },
    { family: "analyse", label: "Analyse — fonctions, dérivées, suites" },
    { family: "géométrie", label: "Géométrie et nombres complexes" },
  ] as const
).map((g) => ({
  family: g.family,
  label: g.label,
  widgets: (Object.keys(INTERACTIVE_WIDGETS) as InteractiveWidget[]).filter(
    (w) => INTERACTIVE_WIDGETS[w].family === g.family,
  ),
}));

export const isInteractive = (spec: unknown): spec is InteractiveSpec =>
  !!spec && typeof spec === "object" && (spec as { type?: string }).type === "interactive"
  && typeof (spec as { widget?: string }).widget === "string"
  && (spec as { widget: string }).widget in INTERACTIVE_WIDGETS;

const clampNum = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

/**
 * A spec with every field forced into range.
 *
 * The widget builders read the result of this and nothing else, so a hand-edited fence
 * carrying `"angle": 1e308` or `"height": -4` produces a sane figure instead of a board
 * with NaN bounds — which JSXGraph renders as a blank rectangle with no error.
 */
export function normalizeInteractive(spec: InteractiveSpec) {
  const def = INTERACTIVE_WIDGETS[spec.widget];
  // The widget's own preset fills the fields the author left out, so every widget can
  // assume a sensible expression and window without each builder repeating them.
  const s = { ...def.preset, ...stripUndefined(spec) } as InteractiveSpec;
  const show = Array.isArray(s.show)
    ? s.show.filter((v): v is string => typeof v === "string" && def.shows.includes(v))
    : [...def.defaultShow];

  // A window has to be non-empty and the right way round, or the board is blank and
  // nothing says why. Swap BEFORE testing for emptiness: a reversed window is a typo
  // with an obvious intended meaning, and collapsing it to the default instead would
  // throw away the range the author actually asked for.
  const window = (lo: unknown, hi: unknown, dlo: number, dhi: number): [number, number] => {
    let a = clampNum(lo, -1e4, 1e4, dlo);
    let b = clampNum(hi, -1e4, 1e4, dhi);
    if (a > b) [a, b] = [b, a];
    return b - a < 1e-6 ? [dlo, dhi] : [a, b];
  };
  const [xmin, xmax] = window(s.xmin, s.xmax, -6, 6);
  const [ymin, ymax] = window(s.ymin, s.ymax, -8, 8);

  return {
    widget: s.widget,
    title: typeof s.title === "string" ? s.title : "",
    caption: typeof s.caption === "string" ? s.caption : "",
    // Wrapped rather than clamped: 400° is 40°, and a pupil typing it is not wrong.
    angle: ((clampNum(s.angle, -1e6, 1e6, 38) % 360) + 360) % 360,
    show,
    a: clampNum(s.a, -20, 20, 1),
    b: clampNum(s.b, -20, 20, 1),
    c: clampNum(s.c, -20, 20, 0),
    fn: s.fn === "cos" ? ("cos" as const) : ("sin" as const),
    expr: typeof s.expr === "string" && s.expr.trim() ? s.expr.trim() : "x^2",
    conic: s.conic === "hyperbole" || s.conic === "parabole" ? s.conic : ("ellipse" as const),
    xmin, xmax, ymin, ymax,
    height: Math.round(clampNum(s.height, 200, 600, 340)),
  };
}

/** Drop absent keys so a preset is not overwritten by an explicit `undefined`. */
function stripUndefined(o: InteractiveSpec): Partial<InteractiveSpec> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as Partial<InteractiveSpec>;
}

export type NormalizedInteractive = ReturnType<typeof normalizeInteractive>;

/** The sentence that stands in for the figure: its own caption, else the widget's. */
export function interactiveAlt(spec: InteractiveSpec): string {
  const def = INTERACTIVE_WIDGETS[spec.widget];
  return spec.caption?.trim() || def.still;
}

export const defaultInteractive = (widget: InteractiveWidget): InteractiveSpec => ({
  type: "interactive",
  widget,
  caption: "",
});
