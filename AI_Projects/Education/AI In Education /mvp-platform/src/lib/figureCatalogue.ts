// The 76 reference figures of the « Catalogue des figures scientifiques », as an
// insertable, searchable catalogue.
//
// The catalogue's own stated purpose is to be a CLASSIFICATION VOCABULARY: each figure
// carries a three-segment code (discipline · domaine · rang) meant to label a scanned
// plate, and each entry fixes the type, the constituent elements and the words that go
// with that family of figure. It is a reference, not a picture library.
//
// So what the editor inserts is not a drawing — it is the LaTeX that belongs BESIDE
// that figure: the defining relation a teacher writes under a diagram, or, where the
// figure has no relation (a cell, a neuron), the labelled legend of its parts. Every
// entry here renders in KaTeX. That is deliberate and it is checked by a test that
// walks all 76: an entry that could not display would be exactly the silent, invisible
// failure this editor was built to remove.
//
// Where a figure IS reproducible with the chart renderer (a parabola, a histogram, a
// scatter with its regression line), `chart` carries the ```figure spec too, so the
// teacher can insert the picture as well as the formula.

export type Discipline = "MA" | "PH" | "CH" | "SV";

export type CatalogueFigure = {
  code: string; // MA-GP-01 — the label that goes on a scanned plate
  title: string;
  keywords: string; // the vocabulary the figure fixes; also the search terms
  latex: string; // KaTeX-renderable — the relation or legend that accompanies it
  chart?: string; // optional ```figure spec, when the app can draw the figure itself
};

export const DISCIPLINES: { id: Discipline; label: string; short: string }[] = [
  { id: "MA", label: "Mathématiques", short: "Maths" },
  { id: "PH", label: "Physique", short: "Physique" },
  { id: "CH", label: "Chimie", short: "Chimie" },
  { id: "SV", label: "Sciences de la vie et de la Terre", short: "SVT" },
];

export const DOMAINS: Record<string, string> = {
  "MA-GP": "Géométrie plane",
  "MA-GA": "Géométrie analytique",
  "MA-GE": "Géométrie de l'espace et descriptive",
  "MA-TR": "Trigonométrie",
  "MA-AN": "Analyse",
  "MA-SP": "Statistiques et probabilités",
  "MA-CX": "Nombres complexes",
  "PH-ME": "Mécanique et forces",
  "PH-CN": "Cinématique",
  "PH-OP": "Optique",
  "PH-EL": "Électricité et magnétisme",
  "PH-TH": "Thermodynamique et ondes",
  "CH-ST": "Structure de la matière",
  "CH-RE": "Réactions et solutions",
  "CH-OR": "Chimie organique",
  "SV-CE": "Cellule et microscopie",
  "SV-PY": "Physiologie humaine",
  "SV-EC": "Écologie et cycles",
  "SV-GL": "Géologie",
};

// A legend cell is PROSE by default, and maths when the author wraps it in $…$.
//
// The escape is not decoration. KaTeX refuses \mathrm, a subscript or a superscript
// inside \text{}, so "Q_1" and "R-OH" as bare prose are parse errors — which is how
// five of these entries first shipped broken and were caught by the walk in
// __tests__/figureCatalogue.test.ts. Being explicit per cell keeps that decision
// visible at the point of authoring instead of hidden in a heuristic.
const cell = (s: string) => (s.startsWith("$") && s.endsWith("$") ? s.slice(1, -1) : `\\text{${s}}`);

// A legend, typeset as a two-column array. Used for the figures that have no defining
// relation — a cell, a neuron, a stratigraphic section. Naming the parts IS what those
// reference figures exist to do, so the legend is the useful thing to insert.
const legend = (rows: [string, string][]): string =>
  "\\begin{array}{ll}\n" + rows.map(([a, b]) => `${cell(a)} & ${cell(b)}`).join(" \\\\\n") + "\n\\end{array}";

const chart = (o: Record<string, unknown>) => "```figure\n" + JSON.stringify(o, null, 2) + "\n```";

export const CATALOGUE: CatalogueFigure[] = [
  // ─────────────────────────── MA · Mathématiques ───────────────────────────
  {
    code: "MA-GP-01",
    title: "Triangle et droites remarquables",
    keywords: "médiane, hauteur, cercle circonscrit",
    latex: "R = \\dfrac{abc}{4\\mathcal{A}} \\qquad \\mathcal{A} = \\dfrac{1}{2}\\,b \\times h",
  },
  {
    code: "MA-GP-02",
    title: "Angle inscrit et angle au centre",
    keywords: "cercle, cordes, arcs",
    latex: "\\widehat{APB} = \\dfrac{1}{2}\\,\\widehat{AOB}",
  },
  {
    code: "MA-GP-03",
    title: "Théorème de Thalès",
    keywords: "droites sécantes et parallèles",
    latex: "\\dfrac{SB'}{SB} = \\dfrac{SC'}{SC} = \\dfrac{B'C'}{BC}",
  },
  {
    code: "MA-GP-04",
    title: "Rotation et homothétie",
    keywords: "transformations du plan",
    latex: "h(O,k) : \\overrightarrow{OM'} = k\\,\\overrightarrow{OM} \\qquad r(O,\\theta) : \\widehat{(\\overrightarrow{OM},\\overrightarrow{OM'})} = \\theta",
  },
  {
    code: "MA-GA-01",
    title: "Équation d'une droite",
    keywords: "pente, ordonnée à l'origine",
    latex: "y = ax + p \\qquad a = \\dfrac{\\Delta y}{\\Delta x}",
    chart: chart({ type: "function", expr: "2*x - 1", xmin: -4, xmax: 4, xlabel: "x", ylabel: "y", grid: true, ticks: 4 }),
  },
  {
    code: "MA-GA-02",
    title: "Cercle dans un repère",
    keywords: "centre, rayon, équation cartésienne",
    latex: "(x - a)^2 + (y - b)^2 = r^2",
  },
  {
    code: "MA-GA-03",
    title: "Parabole",
    keywords: "foyer et directrice",
    latex: "MF = d(M, \\mathcal{D}) \\qquad y = \\dfrac{x^2}{4p}",
    chart: chart({ type: "function", expr: "x^2/4", xmin: -6, xmax: 6, xlabel: "x", ylabel: "y", grid: true, ticks: 4 }),
  },
  {
    code: "MA-GA-04",
    title: "Ellipse",
    keywords: "foyers, demi-axes",
    latex: "MF + MF' = 2a \\qquad \\dfrac{x^2}{a^2} + \\dfrac{y^2}{b^2} = 1",
  },
  {
    code: "MA-GE-01",
    title: "Solides usuels",
    keywords: "cube, pyramide, cylindre, sphère",
    // Written out rather than built with legend(): the right column here is maths, not
    // prose, so it must not be wrapped in \text{}.
    latex: [
      "\\begin{array}{ll}",
      "\\text{cube} & V = a^3 \\\\",
      "\\text{pyramide} & V = \\tfrac{1}{3}\\,\\mathcal{B}h \\\\",
      "\\text{cylindre} & V = \\pi r^2 h \\\\",
      "\\text{sphère} & V = \\tfrac{4}{3}\\pi r^3",
      "\\end{array}",
    ].join("\n"),
  },
  {
    code: "MA-GE-02",
    title: "Épure — représentation du point",
    keywords: "double projection de Monge",
    latex: legend([
      ["a'", "projection verticale — la cote"],
      ["a", "projection horizontale — l'éloignement"],
      ["LT", "ligne de terre"],
    ]),
  },
  {
    code: "MA-GE-03",
    title: "Épure — représentation de la droite",
    keywords: "projections horizontale et verticale",
    latex: legend([
      ["d'", "projection verticale de la droite"],
      ["d", "projection horizontale de la droite"],
      ["LT", "ligne de terre"],
    ]),
  },
  {
    code: "MA-GE-04",
    title: "Épure — traces d'un plan",
    keywords: "dièdres et plans de projection",
    latex: legend([
      ["$\\alpha'$", "trace verticale du plan"],
      ["$\\alpha$", "trace horizontale du plan"],
      ["LT", "ligne de terre"],
    ]),
  },
  {
    code: "MA-TR-01",
    title: "Cercle trigonométrique",
    keywords: "sinus, cosinus, tangente",
    latex: "\\cos^2\\theta + \\sin^2\\theta = 1 \\qquad \\tan\\theta = \\dfrac{\\sin\\theta}{\\cos\\theta}",
  },
  {
    code: "MA-TR-02",
    title: "Rapports dans le triangle rectangle",
    keywords: "opposé, adjacent, hypoténuse",
    latex: "\\sin\\theta = \\dfrac{o}{h} \\qquad \\cos\\theta = \\dfrac{a}{h} \\qquad \\tan\\theta = \\dfrac{o}{a}",
  },
  {
    code: "MA-TR-03",
    title: "Courbes des fonctions circulaires",
    keywords: "période et amplitude",
    latex: "f(x) = A\\sin(\\omega x + \\varphi) \\qquad T = \\dfrac{2\\pi}{\\omega}",
    chart: chart({ type: "function", expr: "sin(x)", xmin: 0, xmax: 6.28, xlabel: "x", ylabel: "y", grid: true, ticks: 4 }),
  },
  {
    code: "MA-TR-04",
    title: "Loi des sinus et loi des cosinus",
    keywords: "triangle quelconque",
    latex: "\\dfrac{a}{\\sin A} = \\dfrac{b}{\\sin B} = \\dfrac{c}{\\sin C} \\qquad a^2 = b^2 + c^2 - 2bc\\cos A",
  },
  {
    code: "MA-AN-01",
    title: "Fonction du second degré",
    keywords: "sommet, axe, discriminant",
    latex: "\\Delta = b^2 - 4ac \\qquad x = \\dfrac{-b \\pm \\sqrt{\\Delta}}{2a} \\qquad S\\left(-\\dfrac{b}{2a},\\, -\\dfrac{\\Delta}{4a}\\right)",
    chart: chart({ type: "function", expr: "x^2 - 2*x - 3", xmin: -3, xmax: 5, xlabel: "x", ylabel: "y", grid: true, ticks: 4 }),
  },
  {
    code: "MA-AN-02",
    title: "Limites et asymptotes",
    keywords: "asymptote verticale et horizontale",
    latex: "\\lim_{x \\to a} f(x) = \\pm\\infty \\quad (\\text{A.V. } x = a) \\qquad \\lim_{x \\to \\pm\\infty} f(x) = \\ell \\quad (\\text{A.H. } y = \\ell)",
  },
  {
    code: "MA-AN-03",
    title: "Dérivée et tangente",
    keywords: "taux d'accroissement, sécante",
    latex: "f'(a) = \\lim_{h \\to 0} \\dfrac{f(a+h) - f(a)}{h} \\qquad y = f'(a)(x - a) + f(a)",
  },
  {
    code: "MA-AN-04",
    title: "Intégrale définie",
    keywords: "aire sous la courbe, sommes de Riemann",
    latex: "\\int_a^b f(x)\\,dx = \\lim_{n \\to \\infty} \\sum_{i=1}^{n} f(x_i)\\,\\Delta x",
  },
  {
    code: "MA-SP-01",
    title: "Histogramme et polygone",
    keywords: "distribution des effectifs",
    latex: "\\bar{x} = \\dfrac{1}{N}\\sum_{i=1}^{k} n_i x_i \\qquad N = \\sum_{i=1}^{k} n_i",
    chart: chart({ type: "bar", labels: ["[0;5[", "[5;10[", "[10;15[", "[15;20]"], values: [4, 11, 15, 6], xlabel: "classes", ylabel: "effectif", grid: true, ticks: 4 }),
  },
  {
    code: "MA-SP-02",
    title: "Diagramme en boîte",
    keywords: "quartiles, médiane, étendue",
    latex: legend([
      // Escaped: a bare % opens a LaTeX comment and swallows the rest of the line,
      // which closes \text{} nowhere and takes the whole array down with it.
      ["$Q_1$", "premier quartile — 25\\% des valeurs"],
      ["$Me$", "médiane — 50\\%"],
      ["$Q_3$", "troisième quartile — 75\\%"],
      ["$Q_3 - Q_1$", "écart interquartile"],
    ]),
  },
  {
    code: "MA-SP-03",
    title: "Nuage de points et ajustement",
    keywords: "corrélation, droite de régression",
    latex: "y = ax + b \\qquad a = \\dfrac{\\operatorname{cov}(x,y)}{V(x)} \\qquad b = \\bar{y} - a\\bar{x}",
    chart: chart({ type: "scatter", points: [{ x: 1, y: 2.1 }, { x: 2, y: 3.9 }, { x: 3, y: 6.2 }, { x: 4, y: 7.8 }, { x: 5, y: 10.1 }], xlabel: "x", ylabel: "y", grid: true, ticks: 4 }),
  },
  {
    code: "MA-SP-04",
    title: "Arbre pondéré",
    keywords: "probabilités conditionnelles",
    latex: "P(A \\cap B) = P(A) \\times P_A(B) \\qquad P(B) = \\sum_i P(A_i)\\,P_{A_i}(B)",
  },
  {
    code: "MA-CX-01",
    title: "Plan de Gauss",
    keywords: "module, argument, forme trigonométrique",
    latex: "z = a + ib = r(\\cos\\theta + i\\sin\\theta) = re^{i\\theta} \\qquad r = |z| = \\sqrt{a^2 + b^2}",
  },
  {
    code: "MA-CX-02",
    title: "Racines n-ièmes de l'unité",
    keywords: "polygone régulier inscrit",
    latex: "z_k = e^{\\frac{2ik\\pi}{n}}, \\quad k = 0, 1, \\dots, n-1",
  },
  {
    code: "MA-CX-03",
    title: "Somme de deux complexes",
    keywords: "règle du parallélogramme",
    latex: "(a + ib) + (c + id) = (a + c) + i(b + d)",
  },
  {
    code: "MA-CX-04",
    title: "Produit de deux complexes",
    keywords: "modules multipliés, arguments ajoutés",
    latex: "|z_1 z_2| = |z_1|\\,|z_2| \\qquad \\arg(z_1 z_2) = \\arg z_1 + \\arg z_2",
  },

  // ───────────────────────────── PH · Physique ─────────────────────────────
  {
    code: "PH-ME-01",
    title: "Plan incliné",
    keywords: "poids, réaction normale, frottement",
    latex: "P_x = mg\\sin\\alpha \\qquad N = mg\\cos\\alpha \\qquad f = \\mu N",
  },
  {
    code: "PH-ME-02",
    title: "Machine d'Atwood",
    keywords: "poulie, tension du fil",
    latex: "a = \\dfrac{(m_1 - m_2)g}{m_1 + m_2} \\qquad T = \\dfrac{2m_1m_2\\,g}{m_1 + m_2}",
  },
  {
    code: "PH-ME-03",
    title: "Levier et moments",
    keywords: "bras de levier, équilibre",
    latex: "\\mathcal{M} = F \\times d \\qquad F_1 d_1 = F_2 d_2",
  },
  {
    code: "PH-ME-04",
    title: "Ressort — loi de Hooke",
    keywords: "allongement et force de rappel",
    latex: "\\vec{F} = -k\\,\\Delta x\\;\\vec{u} \\qquad E_p = \\dfrac{1}{2}k\\,\\Delta x^2",
  },
  {
    code: "PH-CN-01",
    title: "Graphiques du MRUA",
    keywords: "position, vitesse, accélération",
    latex: "x = x_0 + v_0 t + \\dfrac{1}{2}at^2 \\qquad v = v_0 + at \\qquad v^2 - v_0^2 = 2a(x - x_0)",
  },
  {
    code: "PH-CN-02",
    title: "Mouvement de projectile",
    keywords: "portée, flèche, vitesse initiale",
    latex: "y = x\\tan\\alpha - \\dfrac{g\\,x^2}{2v_0^2\\cos^2\\alpha} \\qquad P = \\dfrac{v_0^2\\sin 2\\alpha}{g}",
  },
  {
    code: "PH-CN-03",
    title: "Mouvement circulaire uniforme",
    keywords: "vitesse tangentielle, accélération centripète",
    latex: "v = \\omega R \\qquad a_c = \\dfrac{v^2}{R} = \\omega^2 R \\qquad T = \\dfrac{2\\pi}{\\omega}",
  },
  {
    code: "PH-CN-04",
    title: "Chronophotographie d'une chute",
    keywords: "positions à intervalles égaux",
    latex: "\\Delta x_n = x_{n+1} - x_n \\qquad \\Delta x_{n+1} - \\Delta x_n = g\\,\\tau^2",
  },
  {
    code: "PH-OP-01",
    title: "Réflexion sur un miroir plan",
    keywords: "normale, angles d'incidence et de réflexion",
    latex: "\\widehat{i} = \\widehat{r}",
  },
  {
    code: "PH-OP-02",
    title: "Réfraction — Snell-Descartes",
    keywords: "changement de milieu, indices",
    latex: "n_1 \\sin i_1 = n_2 \\sin i_2 \\qquad \\sin i_{\\text{lim}} = \\dfrac{n_2}{n_1}",
  },
  {
    code: "PH-OP-03",
    title: "Lentille convergente",
    keywords: "construction de l'image, foyers",
    latex: "\\dfrac{1}{\\overline{OA'}} - \\dfrac{1}{\\overline{OA}} = \\dfrac{1}{f'} \\qquad \\gamma = \\dfrac{\\overline{OA'}}{\\overline{OA}}",
  },
  {
    code: "PH-OP-04",
    title: "Dispersion par un prisme",
    keywords: "décomposition de la lumière blanche",
    latex: "n = n(\\lambda) \\qquad D = i_1 + i_2 - A",
  },
  {
    code: "PH-EL-01",
    title: "Circuits série et parallèle",
    keywords: "résistances équivalentes",
    latex: "R_s = R_1 + R_2 + \\dots \\qquad \\dfrac{1}{R_p} = \\dfrac{1}{R_1} + \\dfrac{1}{R_2} + \\dots",
  },
  {
    code: "PH-EL-02",
    title: "Caractéristique U–I",
    keywords: "loi d'Ohm, pente et résistance",
    latex: "U = R\\,I \\qquad R = \\dfrac{\\Delta U}{\\Delta I}",
    chart: chart({ type: "function", expr: "4.7*x", xmin: 0, xmax: 2, xlabel: "I (A)", ylabel: "U (V)", grid: true, ticks: 4 }),
  },
  {
    code: "PH-EL-03",
    title: "Lignes de champ d'un dipôle",
    keywords: "charges ponctuelles opposées",
    latex: "\\vec{E} = \\dfrac{1}{4\\pi\\varepsilon_0}\\,\\dfrac{q}{r^2}\\,\\vec{u}",
  },
  {
    code: "PH-EL-04",
    title: "Champ d'un solénoïde",
    keywords: "bobine parcourue par un courant",
    latex: "B = \\mu_0\\,n\\,I \\qquad n = \\dfrac{N}{\\ell}",
  },
  {
    code: "PH-TH-01",
    title: "Changements d'état",
    keywords: "paliers de fusion et de vaporisation",
    latex: "Q = m\\,c\\,\\Delta T \\quad (\\text{échauffement}) \\qquad Q = m\\,L \\quad (\\text{palier})",
  },
  {
    code: "PH-TH-02",
    title: "Diagramme pression–volume",
    keywords: "cycle et travail échangé",
    latex: "W = -\\int_{V_1}^{V_2} P\\,dV \\qquad PV = nRT",
  },
  {
    code: "PH-TH-03",
    title: "Onde périodique",
    keywords: "longueur d'onde, amplitude, célérité",
    latex: "v = \\lambda f = \\dfrac{\\lambda}{T} \\qquad y(x,t) = A\\sin\\!\\left(2\\pi\\left(\\dfrac{t}{T} - \\dfrac{x}{\\lambda}\\right)\\right)",
  },
  {
    code: "PH-TH-04",
    title: "Interférences",
    keywords: "deux sources cohérentes, franges",
    latex: "\\delta = k\\lambda \\;(\\text{constructive}) \\qquad \\delta = \\left(k + \\tfrac{1}{2}\\right)\\lambda \\;(\\text{destructive})",
  },

  // ────────────────────────────── CH · Chimie ──────────────────────────────
  {
    code: "CH-ST-01",
    title: "Modèle de Bohr",
    keywords: "couches électroniques K, L, M",
    latex: "E_n = -\\dfrac{13{,}6}{n^2}\\ \\mathrm{eV} \\qquad K\\,(2)\\;\\; L\\,(8)\\;\\; M\\,(18)",
  },
  {
    code: "CH-ST-02",
    title: "Classification périodique",
    keywords: "organisation en blocs s, p, d, f",
    latex: legend([
      ["période", "numéro de la couche externe"],
      ["groupe", "nombre d'électrons de valence"],
      ["bloc s, p, d, f", "sous-couche en cours de remplissage"],
    ]),
  },
  {
    code: "CH-ST-03",
    title: "Liaison ionique et covalente",
    keywords: "transfert et mise en commun d'électrons",
    latex: "\\mathrm{Na} + \\mathrm{Cl} \\rightarrow \\mathrm{Na^{+}} + \\mathrm{Cl^{-}} \\qquad \\mathrm{H} \\cdot + \\cdot \\mathrm{H} \\rightarrow \\mathrm{H{:}H}",
  },
  {
    code: "CH-ST-04",
    title: "Géométrie des molécules",
    keywords: "linéaire, coudée, tétraédrique (VSEPR)",
    latex: legend([
      ["$AX_2$", "$\\text{linéaire} \\;-\\; 180^\\circ$"],
      ["$AX_2E$", "$\\text{coudée} \\;-\\; 120^\\circ$"],
      ["$AX_3$", "$\\text{trigonale plane} \\;-\\; 120^\\circ$"],
      ["$AX_4$", "$\\text{tétraédrique} \\;-\\; 109{,}5^\\circ$"],
    ]),
  },
  {
    code: "CH-RE-01",
    title: "Montage de titrage",
    keywords: "burette, erlenmeyer, solution à doser",
    latex: "C_A V_A = C_B V_B \\qquad n = C \\times V",
  },
  {
    code: "CH-RE-02",
    title: "Courbe de titrage pH",
    keywords: "saut de pH, point d'équivalence",
    latex: "\\mathrm{pH} = -\\log[\\mathrm{H_3O^{+}}] \\qquad \\text{à l'équivalence : } n_A = n_B",
    chart: chart({ type: "line", labels: ["0", "5", "10", "12", "14", "16", "20"], values: [2.4, 3.1, 4.3, 5.2, 8.9, 10.8, 11.6], xlabel: "V versé (mL)", ylabel: "pH", grid: true, ticks: 4 }),
  },
  {
    code: "CH-RE-03",
    title: "Diagramme d'énergie",
    keywords: "énergie d'activation, réaction exothermique",
    latex: "\\Delta H = H_{\\text{produits}} - H_{\\text{réactifs}} \\qquad E_a = H_{\\text{complexe}} - H_{\\text{réactifs}}",
  },
  {
    code: "CH-RE-04",
    title: "Pile électrochimique",
    keywords: "anode, cathode, pont salin",
    latex: "E = E_{\\text{cathode}} - E_{\\text{anode}} \\qquad \\text{anode : oxydation} \\quad \\text{cathode : réduction}",
  },
  {
    code: "CH-OR-01",
    title: "Alcane et alcène",
    keywords: "liaison simple, liaison double",
    latex: "\\text{alcane : } \\mathrm{C}_n\\mathrm{H}_{2n+2} \\qquad \\text{alcène : } \\mathrm{C}_n\\mathrm{H}_{2n}",
  },
  {
    code: "CH-OR-02",
    title: "Cycle benzénique",
    keywords: "délocalisation électronique",
    latex: "\\mathrm{C_6H_6} \\qquad \\text{6 électrons } \\pi \\text{ délocalisés}",
  },
  {
    code: "CH-OR-03",
    title: "Groupes fonctionnels",
    keywords: "alcool, aldéhyde, acide, ester, amine",
    latex: legend([
      ["alcool", "$R{-}\\mathrm{OH}$"],
      ["aldéhyde", "$R{-}\\mathrm{CHO}$"],
      ["acide carboxylique", "$R{-}\\mathrm{COOH}$"],
      ["ester", "$R{-}\\mathrm{COO}{-}R'$"],
      ["amine", "$R{-}\\mathrm{NH_2}$"],
    ]),
  },
  {
    code: "CH-OR-04",
    title: "Isomérie de chaîne",
    keywords: "même formule brute, squelettes différents",
    latex: "\\mathrm{C_4H_{10}} : \\quad \\text{butane} \\quad \\text{et} \\quad \\text{2-méthylpropane}",
  },

  // ──────────────── SV · Sciences de la vie et de la Terre ────────────────
  {
    code: "SV-CE-01",
    title: "Cellule animale",
    keywords: "noyau, mitochondries, membrane",
    latex: legend([
      ["membrane plasmique", "limite de la cellule, échanges"],
      ["noyau", "contient l'ADN"],
      ["cytoplasme", "milieu interne"],
      ["mitochondrie", "respiration cellulaire"],
    ]),
  },
  {
    code: "SV-CE-02",
    title: "Cellule végétale",
    keywords: "paroi, vacuole, chloroplastes",
    latex: legend([
      ["paroi pectocellulosique", "rigidité, propre au végétal"],
      ["vacuole", "réserve d'eau, turgescence"],
      ["chloroplaste", "photosynthèse"],
      ["noyau", "contient l'ADN"],
    ]),
  },
  {
    code: "SV-CE-03",
    title: "Phases de la mitose",
    keywords: "prophase à télophase",
    latex: legend([
      ["prophase", "condensation des chromosomes"],
      ["métaphase", "alignement à l'équateur"],
      ["anaphase", "séparation des chromatides"],
      ["télophase", "reconstitution des noyaux"],
    ]),
  },
  {
    code: "SV-CE-04",
    title: "Microscope optique",
    keywords: "oculaire, objectif, platine",
    latex: "G = G_{\\text{oculaire}} \\times G_{\\text{objectif}}",
  },
  {
    code: "SV-PY-01",
    title: "Cœur et circulation",
    keywords: "oreillettes, ventricules, gros vaisseaux",
    latex: legend([
      ["oreillette droite", "reçoit le sang des veines caves"],
      ["ventricule droit", "envoie le sang aux poumons"],
      ["oreillette gauche", "reçoit le sang des poumons"],
      ["ventricule gauche", "envoie le sang dans l'aorte"],
    ]),
  },
  {
    code: "SV-PY-02",
    title: "Échanges alvéolaires",
    keywords: "diffusion de l'oxygène et du dioxyde de carbone",
    latex: "\\mathrm{O_2} : \\text{alvéole} \\rightarrow \\text{sang} \\qquad \\mathrm{CO_2} : \\text{sang} \\rightarrow \\text{alvéole}",
  },
  {
    code: "SV-PY-03",
    title: "Neurone",
    keywords: "dendrites, axone myélinisé, synapses",
    latex: legend([
      ["dendrites", "reçoivent le message nerveux"],
      ["corps cellulaire", "contient le noyau"],
      ["axone myélinisé", "conduit le message"],
      ["synapse", "transmet au neurone suivant"],
    ]),
  },
  {
    code: "SV-PY-04",
    title: "Appareil digestif",
    keywords: "trajet du bol alimentaire",
    latex: "\\text{bouche} \\rightarrow \\text{œsophage} \\rightarrow \\text{estomac} \\rightarrow \\text{intestin grêle} \\rightarrow \\text{gros intestin}",
  },
  {
    code: "SV-EC-01",
    title: "Chaîne alimentaire",
    keywords: "niveaux trophiques, flux d'énergie",
    latex: "\\text{producteur} \\rightarrow \\text{consommateur I} \\rightarrow \\text{consommateur II} \\rightarrow \\text{décomposeur}",
  },
  {
    code: "SV-EC-02",
    title: "Cycle de l'eau",
    keywords: "évaporation, condensation, précipitations",
    latex: "\\text{évaporation} \\rightarrow \\text{condensation} \\rightarrow \\text{précipitations} \\rightarrow \\text{ruissellement}",
  },
  {
    code: "SV-EC-03",
    title: "Cycle du carbone",
    keywords: "photosynthèse, respiration, combustion",
    latex: "6\\,\\mathrm{CO_2} + 6\\,\\mathrm{H_2O} \\rightleftharpoons \\mathrm{C_6H_{12}O_6} + 6\\,\\mathrm{O_2}",
  },
  {
    code: "SV-EC-04",
    title: "Dynamique de population",
    keywords: "croissance exponentielle et logistique",
    latex: "\\dfrac{dN}{dt} = rN\\left(1 - \\dfrac{N}{K}\\right)",
  },
  {
    code: "SV-GL-01",
    title: "Structure interne de la Terre",
    keywords: "croûte, manteau, noyau",
    // "km" needs no \mathrm here: inside \text{} it is already upright.
    latex: legend([
      ["croûte", "0 à 70 km"],
      ["manteau", "70 à 2900 km"],
      ["noyau externe", "2900 à 5100 km — liquide"],
      ["noyau interne", "5100 à 6370 km — solide"],
    ]),
  },
  {
    code: "SV-GL-02",
    title: "Limites de plaques",
    keywords: "dorsale, subduction",
    latex: legend([
      ["dorsale", "divergence — création de croûte"],
      ["subduction", "convergence — destruction de croûte"],
      ["faille transformante", "coulissage"],
    ]),
  },
  {
    code: "SV-GL-03",
    title: "Coupe stratigraphique",
    keywords: "superposition des couches, faille",
    latex: legend([
      ["superposition", "la couche du dessous est la plus ancienne"],
      ["recoupement", "une faille est postérieure aux couches"],
      ["continuité", "une même couche a le même âge"],
    ]),
  },
  {
    code: "SV-GL-04",
    title: "Cycle des roches",
    keywords: "magmatique, sédimentaire, métamorphique",
    latex: "\\text{magmatique} \\rightarrow \\text{sédimentaire} \\rightarrow \\text{métamorphique} \\rightarrow \\text{magmatique}",
  },
];

// ───────────────────────────────── lookup ─────────────────────────────────

export const disciplineOf = (code: string): Discipline => code.slice(0, 2) as Discipline;
export const domainOf = (code: string): string => code.slice(0, 5);

// Accent-insensitive, exactly like searchSymbols — a teacher on a keyboard with no
// French layout types "geometrie" and must still find « Géométrie ».
const strip = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Search the catalogue. Matches the code ("MA-GP", "gp01"), the title, the keywords
 * and the domain name, so a teacher can arrive from the label on a scanned plate or
 * from the word they have in their head.
 */
export function searchCatalogue(query: string, discipline?: Discipline | null): CatalogueFigure[] {
  const q = strip(query.trim());
  const base = discipline ? CATALOGUE.filter((f) => disciplineOf(f.code) === discipline) : CATALOGUE;
  if (!q) return base;
  const bare = q.replace(/[^a-z0-9]/g, "");
  return base.filter((f) => {
    const hay = strip(`${f.code} ${f.title} ${f.keywords} ${DOMAINS[domainOf(f.code)] ?? ""}`);
    return hay.includes(q) || strip(f.code).replace(/[^a-z0-9]/g, "").includes(bare);
  });
}

/** The domains present in a result set, in catalogue order — used to group the list. */
export function groupByDomain(figs: CatalogueFigure[]): { domain: string; label: string; items: CatalogueFigure[] }[] {
  const out: { domain: string; label: string; items: CatalogueFigure[] }[] = [];
  for (const f of figs) {
    const d = domainOf(f.code);
    let g = out.find((x) => x.domain === d);
    if (!g) out.push((g = { domain: d, label: DOMAINS[d] ?? d, items: [] }));
    g.items.push(f);
  }
  return out;
}
