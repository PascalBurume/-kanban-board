// Insertable maths and chemistry notation for the lesson editor.
//
// Teachers here write in LaTeX inside markdown, and most of them are not going to
// remember that a square root is \sqrt{} or that a reversible reaction is
// \rightleftharpoons. The palette is searchable in FRENCH — "racine", "fraction",
// "réversible" — because that is the word a teacher reaches for, not the command.
//
// `insert` is the text placed at the cursor. When it contains a placeholder, `select`
// gives the offset/length of the first thing to overtype, so the caret lands where
// the teacher needs to type rather than at the end of the snippet.
//
// Those offsets are declared as the placeholder TEXT, not as numbers. They used to be
// hand-counted, and four of them were wrong in ways nobody could see from the source:
// "sum" selected "=1}" instead of "i=1", "angle" selected "BC}" instead of "ABC". The
// teacher clicked a button and typed over the wrong characters. Searching for the
// token removes the arithmetic, and with it the entire class of bug.

export type Symbol = {
  id: string;
  label: string; // shown under the preview
  keywords: string; // extra search terms (accent-free)
  tex: string; // rendered as the button preview, via KaTeX
  insert: string;
  select?: [number, number]; // [offset, length] inside `insert`
  short?: string; // one-glyph caption for compact toolbars (the quiz ƒx bar)
};

export type SymbolGroup = { id: string; label: string; items: Symbol[] };

// `token` is the literal placeholder inside `insert`.
//
// A plain indexOf is not enough: the placeholder is often a single letter, and
// indexOf("a") on "\begin{pmatrix} a & b …" finds the "a" in "pmatrix", so the caret
// would land inside the command name and the teacher's first keystroke would break
// it. Requiring non-alphanumeric neighbours pins the match to the standalone token.
//
// A token that is not found is a coding mistake, not a runtime condition — throwing
// surfaces it in the test run instead of silently dropping the caret placement.
const locate = (insert: string, token?: string): [number, number] | undefined => {
  if (!token) return undefined;
  const esc = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const at = insert.search(new RegExp(`(?<![A-Za-z0-9])${esc}(?![A-Za-z0-9])`));
  if (at < 0) throw new Error(`symbols: placeholder "${token}" not found in "${insert}"`);
  return [at, token.length];
};

const m = (id: string, label: string, keywords: string, tex: string, insert: string, token?: string, short?: string): Symbol =>
  ({ id, label, keywords, tex, insert, select: locate(insert, token), short });

export const MATH_GROUPS: SymbolGroup[] = [
  {
    id: "base",
    label: "Opérations",
    items: [
      m("frac", "Fraction", "fraction diviser quotient rapport sur", "\\frac{a}{b}", "\\frac{a}{b}", "a", "a/b"),
      m("sqrt", "Racine carrée", "racine carree radical", "\\sqrt{x}", "\\sqrt{x}", "x", "√"),
      m("nthroot", "Racine n-ième", "racine nieme cubique", "\\sqrt[n]{x}", "\\sqrt[n]{x}", "x"),
      m("pow", "Puissance", "puissance exposant carre cube", "x^{2}", "x^{2}", "2", "x²"),
      m("sub", "Indice", "indice suite terme", "x_{n}", "x_{n}", "n"),
      m("times", "Multiplié par", "multiplication fois produit", "\\times", "\\times ", undefined, "×"),
      m("div", "Divisé par", "division diviser", "\\div", "\\div "),
      m("pm", "Plus ou moins", "plus moins incertitude", "\\pm", "\\pm "),
    ],
  },
  {
    id: "rel",
    label: "Relations",
    items: [
      m("neq", "Différent de", "different pas egal inegal", "\\neq", "\\neq "),
      m("leq", "Inférieur ou égal", "inferieur egal plus petit", "\\leq", "\\leq ", undefined, "≤"),
      m("geq", "Supérieur ou égal", "superieur egal plus grand", "\\geq", "\\geq "),
      m("approx", "Environ égal", "environ approximativement proche", "\\approx", "\\approx "),
      m("equiv", "Équivalent", "equivalent congruent", "\\equiv", "\\equiv "),
      m("propto", "Proportionnel à", "proportionnel proportionnalite", "\\propto", "\\propto "),
      m("implies", "Implique", "implique donc alors consequence", "\\Rightarrow", "\\Rightarrow "),
      m("iff", "Équivaut à", "equivaut si et seulement si", "\\Leftrightarrow", "\\Leftrightarrow "),
    ],
  },
  {
    id: "analyse",
    label: "Analyse",
    items: [
      m("sum", "Somme", "somme sigma addition serie", "\\sum_{i=1}^{n}", "\\sum_{i=1}^{n} ", "i=1"),
      m("prod", "Produit", "produit pi", "\\prod_{i=1}^{n}", "\\prod_{i=1}^{n} ", "i=1"),
      m("int", "Intégrale", "integrale primitive aire", "\\int_{a}^{b}", "\\int_{a}^{b} ", "a"),
      m("lim", "Limite", "limite tend vers", "\\lim_{x \\to 0}", "\\lim_{x \\to 0} ", "0"),
      m("deriv", "Dérivée", "derivee taux variation", "\\frac{dy}{dx}", "\\frac{dy}{dx}"),
      m("partial", "Dérivée partielle", "derivee partielle rond", "\\frac{\\partial f}{\\partial x}", "\\frac{\\partial f}{\\partial x}"),
      m("infty", "Infini", "infini illimite", "\\infty", "\\infty "),
      m("delta", "Delta", "delta variation discriminant", "\\Delta", "\\Delta "),
      // The bounds a teacher actually writes on the board are ±∞, and typing
      // "\int_{-\infty}^{\infty}" by hand is where the backslashes get lost.
      m("intinf", "Intégrale de −∞ à +∞", "integrale infini bornes gauss", "\\int_{-\\infty}^{\\infty}", "\\int_{-\\infty}^{\\infty} "),
      // No placeholder: the "x" here sits against the "d", and locate() only matches a
      // standalone token — the caret would otherwise land inside "dx" and split it.
      m("dx", "Élément différentiel", "dx element differentiel integrale espace", "\\, dx", "\\, dx"),
    ],
  },
  {
    id: "ens",
    label: "Ensembles & logique",
    items: [
      m("in", "Appartient à", "appartient element dans", "\\in", "\\in "),
      m("notin", "N'appartient pas", "appartient pas exclu", "\\notin", "\\notin "),
      m("subset", "Inclus dans", "inclus sous ensemble partie", "\\subset", "\\subset "),
      m("cup", "Union", "union reunion ou", "\\cup", "\\cup "),
      m("cap", "Intersection", "intersection et commun", "\\cap", "\\cap "),
      m("emptyset", "Ensemble vide", "vide nul aucun", "\\emptyset", "\\emptyset "),
      m("reals", "Réels", "reels nombres ensemble R", "\\mathbb{R}", "\\mathbb{R} "),
      m("forall", "Pour tout", "pour tout quel que soit universel", "\\forall", "\\forall "),
      m("exists", "Il existe", "il existe existentiel", "\\exists", "\\exists "),
    ],
  },
  {
    id: "geo",
    label: "Géométrie & trigo",
    items: [
      m("angle", "Angle", "angle sommet", "\\widehat{ABC}", "\\widehat{ABC}", "ABC"),
      m("degree", "Degré", "degre angle temperature", "^{\\circ}", "^{\\circ}"),
      m("vec", "Vecteur", "vecteur fleche", "\\vec{u}", "\\vec{u}", "u", "→"),
      m("parallel", "Parallèle à", "parallele", "\\parallel", "\\parallel "),
      m("perp", "Perpendiculaire", "perpendiculaire orthogonal", "\\perp", "\\perp "),
      m("triangle", "Triangle", "triangle", "\\triangle", "\\triangle "),
      m("pi", "Pi", "pi cercle perimetre", "\\pi", "\\pi ", undefined, "π"),
      m("theta", "Thêta", "theta angle inconnue", "\\theta", "\\theta "),
      m("alpha", "Alpha", "alpha angle", "\\alpha", "\\alpha "),
      m("beta", "Bêta", "beta angle", "\\beta", "\\beta "),
    ],
  },
];

// Multi-line structures — matrices, systems, braces, auto-sizing delimiters.
//
// These are the constructs a teacher writing 5e/6e maths reaches for and cannot
// produce from a single symbol button: a determinant, a piecewise definition, a
// vector norm. They are ordinary LaTeX inside $…$, so they survive the markdown
// round trip exactly like every other entry here.
//
// Counting caret offsets by hand into a snippet this long is a reliable way to get
// them wrong, so `st` locates the placeholder by searching for it and derives the
// button preview from the snippet itself.
const st = (id: string, label: string, keywords: string, insert: string, token?: string): Symbol =>
  m(id, label, keywords, insert.trimEnd(), insert, token);

export const STRUCT_GROUPS: SymbolGroup[] = [
  {
    id: "mat",
    label: "Matrices et déterminants",
    items: [
      st("pmatrix", "Matrice (parenthèses)", "matrice tableau parentheses", "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}", "a"),
      st("bmatrix", "Matrice (crochets)", "matrice tableau crochets", "\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}", "a"),
      st("matrix3", "Matrice 3 × 3", "matrice trois carree", "\\begin{pmatrix} a & b & c \\\\ d & e & f \\\\ g & h & i \\end{pmatrix}", "a"),
      st("vmatrix", "Déterminant", "determinant matrice barres", "\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}", "a"),
      st("Vmatrix", "Norme d'une matrice", "norme matrice double barre", "\\begin{Vmatrix} a & b \\\\ c & d \\end{Vmatrix}", "a"),
      st("array", "Tableau aligné", "tableau aligne colonnes array", "\\begin{array}{cc} a & b \\\\ c & d \\end{array}", "a"),
    ],
  },
  {
    id: "sys",
    label: "Systèmes et cas",
    items: [
      st("cases", "Définition par cas", "cas accolade si sinon morceaux piecewise", "\\begin{cases} a & \\text{si } x > 0 \\\\ b & \\text{sinon} \\end{cases}", "a"),
      st("system2", "Système de 2 équations", "systeme equations deux inconnues", "\\begin{cases} a x + b y = c \\\\ d x + e y = f \\end{cases}", "a"),
      st("aligned", "Équations alignées", "aligne plusieurs lignes egalites etapes", "\\begin{aligned} a &= b \\\\ &= c \\end{aligned}", "a"),
    ],
  },
  {
    id: "acc",
    label: "Accolades et accents",
    items: [
      st("overbrace", "Accolade au-dessus", "accolade dessus regroupement termes", "\\overbrace{a + b + c}^{n}", "a + b + c"),
      st("underbrace", "Accolade en dessous", "accolade dessous regroupement termes", "\\underbrace{a + b + c}_{n}", "a + b + c"),
      st("overline", "Barre au-dessus", "barre segment conjugue dessus", "\\overline{AB}", "AB"),
      st("widetilde", "Tilde large", "tilde vague approximation", "\\widetilde{ABC}", "ABC"),
      st("bar", "Moyenne", "moyenne barre x barre", "\\bar{x}", "x"),
      st("dot", "Dérivée par rapport au temps", "point derivee temps", "\\dot{x}", "x"),
    ],
  },
  {
    id: "delim",
    label: "Parenthèses et barres",
    items: [
      st("lparen", "Parenthèses ajustées", "parentheses grandes ajustees auto", "\\left( a \\right)", "a"),
      st("lbracket", "Crochets ajustés", "crochets grands ajustes auto", "\\left[ a \\right]", "a"),
      st("lbrace", "Accolades ajustées", "accolades grandes ajustees auto", "\\left\\{ a \\right\\}", "a"),
      st("abs", "Valeur absolue", "valeur absolue module barres", "\\left| a \\right|", "a"),
      st("norm", "Norme", "norme vecteur double barre longueur", "\\left\\| a \\right\\|", "a"),
      st("langle", "Produit scalaire", "produit scalaire crochets angulaires", "\\left\\langle a , b \\right\\rangle", "a"),
      st("ceil", "Partie entière supérieure", "partie entiere superieure plafond", "\\left\\lceil a \\right\\rceil", "a"),
      st("floor", "Partie entière inférieure", "partie entiere inferieure plancher", "\\left\\lfloor a \\right\\rfloor", "a"),
    ],
  },
  {
    id: "big",
    label: "Grands opérateurs",
    items: [
      st("iint", "Intégrale double", "integrale double surface", "\\iint_{D} ", "D"),
      st("oint", "Intégrale curviligne", "integrale circulation contour ferme", "\\oint_{C} ", "C"),
      st("bigcup", "Union généralisée", "union generalisee grande reunion", "\\bigcup_{i=1}^{n} ", "i=1"),
      st("bigcap", "Intersection généralisée", "intersection generalisee grande", "\\bigcap_{i=1}^{n} ", "i=1"),
      st("limsup", "Limite à droite", "limite droite tend vers plus", "\\lim_{x \\to a^{+}} ", "a"),
      st("binom", "Coefficient binomial", "binomial combinaison parmi", "\\binom{n}{k}", "n"),
      st("iintR2", "Intégrale sur le plan", "integrale double plan reels r2", "\\iint_{\\mathbb{R}^{2}} ", "2"),
      st("polar", "Coordonnées polaires", "polaires rayon angle r dr dtheta", "r \\, dr \\, d\\theta", "r"),
    ],
  },
];

export const CHEM_GROUPS: SymbolGroup[] = [
  {
    id: "reac",
    label: "Réactions",
    items: [
      m("yields", "Donne (réaction)", "donne produit fleche reaction", "\\rightarrow", "\\rightarrow "),
      m("equilib", "Équilibre réversible", "reversible equilibre double sens", "\\rightleftharpoons", "\\rightleftharpoons "),
      m("heat", "Chauffage", "chaleur chauffage delta triangle", "\\xrightarrow{\\Delta}", "\\xrightarrow{\\Delta} "),
      m("cat", "Avec catalyseur", "catalyseur condition au dessus", "\\xrightarrow{cat.}", "\\xrightarrow{cat.} ", "cat."),
      m("precip", "Précipité", "precipite solide depot bas", "\\downarrow", "\\downarrow "),
      m("gas", "Dégagement gazeux", "gaz degagement monte", "\\uparrow", "\\uparrow "),
    ],
  },
  {
    id: "form",
    label: "Formules & états",
    items: [
      m("h2o", "Eau", "eau h2o molecule", "H_{2}O", "H_{2}O"),
      m("co2", "Dioxyde de carbone", "dioxyde carbone co2 gaz", "CO_{2}", "CO_{2}"),
      m("h2so4", "Acide sulfurique", "acide sulfurique h2so4", "H_{2}SO_{4}", "H_{2}SO_{4}"),
      m("indice", "Indice (nombre d'atomes)", "indice atomes nombre bas", "X_{n}", "X_{n}", "n"),
      m("aq", "En solution aqueuse", "aqueux solution dissous aq", "_{(aq)}", "_{(aq)} "),
      m("solid", "Solide", "solide etat s", "_{(s)}", "_{(s)} "),
      m("liquid", "Liquide", "liquide etat l", "_{(l)}", "_{(l)} "),
      m("gasstate", "Gazeux", "gazeux gaz etat g", "_{(g)}", "_{(g)} "),
    ],
  },
  {
    id: "ions",
    label: "Ions & énergie",
    items: [
      m("cation", "Charge positive", "cation charge positive plus ion", "Na^{+}", "^{+}"),
      m("anion", "Charge négative", "anion charge negative moins ion", "Cl^{-}", "^{-}"),
      m("charge2", "Charge double", "charge deux ion divalent", "Ca^{2+}", "^{2+}"),
      m("ph", "pH", "ph acidite acide base", "\\mathrm{pH}", "\\mathrm{pH} "),
      m("conc", "Concentration", "concentration molaire crochets", "[\\mathrm{H^{+}}]", "[\\mathrm{H^{+}}]"),
      m("mol", "Mole", "mole quantite matiere n", "n\\ (\\mathrm{mol})", "n\\ (\\mathrm{mol})"),
      m("deltah", "Enthalpie", "enthalpie energie chaleur delta h", "\\Delta H", "\\Delta H "),
      m("isotope", "Isotope (A et Z)", "isotope noyau nucleaire masse atomique numero", "{}^{14}_{6}\\mathrm{C}", "{}^{A}_{Z}\\mathrm{X}", "A"),
    ],
  },
];

// Physics. Split out from maths because a physics teacher searching "vitesse" or
// "ohm" should not have to scroll a list of integrals — and because units are the
// thing students get wrong: \mathrm keeps "m/s" upright instead of italicising it
// into a product of three variables.
export const PHYS_GROUPS: SymbolGroup[] = [
  {
    id: "units",
    label: "Unités",
    items: [
      m("unit", "Unité (droite)", "unite grandeur droit romain mesure", "\\mathrm{m}", "\\mathrm{m}", "m"),
      m("speed", "Mètre par seconde", "vitesse metre seconde m/s", "\\mathrm{m/s}", "\\mathrm{m/s}"),
      m("accel", "Accélération", "acceleration metre seconde carre", "\\mathrm{m/s^{2}}", "\\mathrm{m/s^{2}}"),
      m("newton", "Newton (force)", "newton force n", "\\mathrm{N}", "\\mathrm{N}"),
      m("joule", "Joule (énergie)", "joule energie travail j", "\\mathrm{J}", "\\mathrm{J}"),
      m("watt", "Watt (puissance)", "watt puissance w", "\\mathrm{W}", "\\mathrm{W}"),
      m("ohm", "Ohm (résistance)", "ohm resistance omega", "\\Omega", "\\Omega "),
      m("celsius", "Degré Celsius", "degre celsius temperature", "^{\\circ}\\mathrm{C}", "^{\\circ}\\mathrm{C}"),
      m("micro", "Micro (préfixe)", "micro prefixe millionieme mu", "\\mu", "\\mu "),
    ],
  },
  {
    id: "vectors",
    label: "Vecteurs & grandeurs",
    items: [
      // "vec", "norm" and "degree" already live in the maths palette — one id, one
      // definition, so the quiz toolbar keeps resolving them by id.
      m("vecforce", "Vecteur force", "vecteur force vitesse fleche physique", "\\vec{F}", "\\vec{F}", "F"),
      m("unitvec", "Vecteur unitaire", "vecteur unitaire chapeau base", "\\hat{u}", "\\hat{u}", "u"),
      m("dotprod", "Produit scalaire", "produit scalaire travail", "\\vec{F}\\cdot\\vec{d}", "\\vec{F}\\cdot\\vec{d}"),
      m("deltavar", "Variation", "variation delta ecart difference", "\\Delta t", "\\Delta t", "t"),
      m("average", "Valeur moyenne", "moyenne barre valeur", "\\bar{v}", "\\bar{v}", "v"),
    ],
  },
  // Vector calculus. A 6e Math-Physique class meets \nabla in electromagnetism, and
  // nothing in the maths palette reaches it — \nabla \times \mathbf{B} typed by hand
  // is four commands deep and exactly the kind of expression that arrives mangled.
  {
    id: "champs",
    label: "Champs et opérateurs",
    items: [
      m("nabla", "Nabla", "nabla del operateur gradient", "\\nabla", "\\nabla "),
      m("grad", "Gradient", "gradient nabla pente champ", "\\nabla f", "\\nabla f", "f"),
      m("divg", "Divergence", "divergence nabla point flux", "\\nabla \\cdot \\mathbf{E}", "\\nabla \\cdot \\mathbf{E}", "E"),
      m("curl", "Rotationnel", "rotationnel nabla croix circulation", "\\nabla \\times \\mathbf{B}", "\\nabla \\times \\mathbf{B}", "B"),
      m("boldvec", "Vecteur gras", "vecteur gras champ notation physique", "\\mathbf{E}", "\\mathbf{E}", "E"),
      m("partialt", "Dérivée par rapport au temps", "derivee partielle temps champ", "\\frac{\\partial \\mathbf{E}}{\\partial t}", "\\frac{\\partial \\mathbf{E}}{\\partial t}", "E"),
      // Previewed as what it inserts: KaTeX has no \oiint (it lives in the esint
      // package), so the "nicer" glyph would render the button as a parse error.
      m("flux", "Flux à travers une surface", "flux surface integrale fermee", "\\oint_{S} \\mathbf{E} \\cdot d\\mathbf{S}", "\\oint_{S} \\mathbf{E} \\cdot d\\mathbf{S}", "E"),
    ],
  },
  {
    id: "consts",
    label: "Constantes",
    items: [
      m("gravity", "Pesanteur g", "pesanteur gravite g acceleration", "g", "g\\ =\\ 9{,}81\\ \\mathrm{m/s^{2}}"),
      m("lightspeed", "Vitesse de la lumière", "lumiere celerite c", "c", "c\\ =\\ 3\\times10^{8}\\ \\mathrm{m/s}"),
      m("planck", "Constante de Planck", "planck quantique h barre", "\\hbar", "\\hbar "),
      m("permittivity", "Permittivité du vide", "permittivite vide epsilon zero", "\\varepsilon_{0}", "\\varepsilon_{0}"),
      m("permeability", "Perméabilité du vide", "permeabilite vide mu zero", "\\mu_{0}", "\\mu_{0}"),
      m("sci", "Notation scientifique", "notation scientifique puissance dix", "1{,}6\\times10^{-19}", "\\times10^{-19}"),
      m("zeta", "Zêta", "zeta fonction riemann serie", "\\zeta", "\\zeta "),
    ],
  },
];

// Ids are the lookup key for pickSymbols, so a duplicate silently shadows the
// original and quietly changes what a curated toolbar button inserts — exactly the
// class of bug the `locate` throw exists to prevent. Fail at import instead.
const seenIds = new Set<string>();
for (const g of [...MATH_GROUPS, ...STRUCT_GROUPS, ...CHEM_GROUPS, ...PHYS_GROUPS]) {
  for (const s of g.items) {
    if (seenIds.has(s.id)) throw new Error(`symbols: duplicate id "${s.id}" (group "${g.id}")`);
    seenIds.add(s.id);
  }
}

// The LaTeX alphabets, labelled by what a teacher sees rather than by the command.
// "Ajouré" is the ℝ/ℕ look they know from the blackboard; nobody reaches for a font
// by thinking "\mathbb". `sample` is the preview shown beside the name.
export type MathFont = { cmd: string; label: string; sample: string };

export const MATH_FONTS: MathFont[] = [
  { cmd: "\\mathrm", label: "Droit (romain)", sample: "ABC" },
  { cmd: "\\mathbf", label: "Gras", sample: "ABC" },
  { cmd: "\\mathit", label: "Italique", sample: "ABC" },
  { cmd: "\\boldsymbol", label: "Gras italique", sample: "ABC" },
  { cmd: "\\mathbb", label: "Ajouré (ℝ, ℕ)", sample: "RN" },
  { cmd: "\\mathcal", label: "Calligraphié", sample: "ABC" },
  { cmd: "\\mathscr", label: "Scripte", sample: "ABC" },
  { cmd: "\\mathfrak", label: "Gothique", sample: "ABC" },
  { cmd: "\\mathsf", label: "Sans empattement", sample: "ABC" },
  { cmd: "\\mathtt", label: "Machine à écrire", sample: "ABC" },
  { cmd: "\\mathnormal", label: "Mathématique (défaut)", sample: "ABC" },
  { cmd: "\\text", label: "Texte normal", sample: "abc" },
];

// Wrap `text` in a LaTeX alphabet. Applying a font to an empty selection would
// produce "\mathbb{}", which typesets as nothing and looks like the button did
// something destructive, so the placeholder gives the teacher something to overtype.
export function applyFont(cmd: string, text: string): { latex: string; select: [number, number] } {
  const body = text.trim() || "x";
  const latex = `${cmd}{${body}}`;
  return { latex, select: [cmd.length + 1, body.length] };
}

// Pick specific entries, in the order asked for, for a surface that shows a curated
// handful rather than the whole palette. An unknown id is a coding mistake — throwing
// keeps a renamed symbol from silently emptying a toolbar.
export function pickSymbols(ids: string[]): Symbol[] {
  const all = new Map([...MATH_GROUPS, ...STRUCT_GROUPS, ...CHEM_GROUPS, ...PHYS_GROUPS].flatMap((g) => g.items.map((s) => [s.id, s] as const)));
  return ids.map((id) => {
    const s = all.get(id);
    if (!s) throw new Error(`symbols: unknown id "${id}"`);
    return s;
  });
}

// Accent-insensitive contains-match over label + keywords, so "réversible",
// "reversible" and "equilibre" all find the same entry.
const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function searchSymbols(groups: SymbolGroup[], query: string): SymbolGroup[] {
  const q = strip(query.trim());
  if (!q) return groups;
  return groups
    .map((g) => ({ ...g, items: g.items.filter((s) => strip(s.label).includes(q) || strip(s.keywords).includes(q) || s.insert.toLowerCase().includes(q)) }))
    .filter((g) => g.items.length > 0);
}
