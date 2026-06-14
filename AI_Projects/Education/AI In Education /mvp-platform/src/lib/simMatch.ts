// Pure keyword router: maps a chapter (subject + module title) to interactive
// simulation keys. Shared by the server (practice.ts) and the client registry
// (components/sims) so both agree on which sims a chapter gets. No React here.

const strip = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Patterns are written WITHOUT accents (the haystack is accent-stripped).
const RULES: { key: string; title: string; re: RegExp }[] = [
  { key: "sets-venn", title: "Ensembles & logique", re: /logique|ensemble|venn|proposition/ },
  { key: "function-plotter", title: "Tracé de fonction", re: /fonction|logarithm|exponentiel|courbe|graphe|limite|derivee|derive/ },
  { key: "second-degree", title: "Second degré", re: /second degre|trinome|parabole|quadratique|second degre/ },
  { key: "unit-circle", title: "Cercle trigonométrique", re: /trigonom|sinus|cosinus|tangente|cercle trigo|angle/ },
  { key: "sequences", title: "Suites numériques", re: /suite|arithmetique|geometrique|progression|recurrence/ },
  { key: "combinatorics", title: "Dénombrement", re: /combinatoire|denombrement|arrangement|permutation|factoriel|binom|probabilite/ },
  { key: "coulomb", title: "Loi de Coulomb", re: /electrostat|coulomb|charge electr/ },
  { key: "ohm-circuit", title: "Loi d'Ohm", re: /electrodynam|courant|ohm|circuit|resistance|tension|electric/ },
  { key: "force-vectors", title: "Vecteurs & forces", re: /vecteur|\bforce|mecanique|cinematique|mouvement|magnet/ },
  { key: "oxidation", title: "Nombre d'oxydation", re: /oxyd|reduction|redox/ },
  { key: "concentration", title: "Concentration & dilution", re: /concentration|dilution|molarite|solution|\bmole|gaz parfait/ },
];

export function matchSimKeys(subjectSlug: string, moduleTitle: string, subjectName = ""): string[] {
  const hay = strip(`${moduleTitle} ${subjectName} ${subjectSlug}`);
  return RULES.filter((r) => r.re.test(hay)).map((r) => r.key);
}

export const SIM_TITLES: Record<string, string> = Object.fromEntries(RULES.map((r) => [r.key, r.title]));
