// The starting content of a new lesson, plus the test for "the teacher has not
// written anything yet". Kept free of server imports so the studio editor (a client
// component) can share it with src/lib/studio.ts instead of duplicating the strings.

// A new lesson opens on the APS skeleton rather than a blank page: Situation →
// Savoirs → Compétence is the method this platform teaches, so the editor states it
// instead of leaving the teacher to remember it.
export const BLANK_CONTENT = [
  "## Mise en situation",
  "",
  "Décrivez une situation réelle et concrète, avec des données chiffrées.",
  "",
  "## Notions clés",
  "",
  "Les savoirs mobilisés par la situation, expliqués pas à pas.",
  "",
  "## Exemple résolu",
  "",
  "Un exemple traité en entier, avec les mêmes nombres que la situation.",
  "",
  "## À retenir",
  "",
  "Les points essentiels, mots-clés en **gras**.",
].join("\n");

// Every prompt line of the skeleton, plus the boilerplate lessons created before it.
const PLACEHOLDER_LINES = new Set([
  "Commencez à écrire ici — l'aperçu apparaît à droite.",
  ...BLANK_CONTENT.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")),
]);

// True when the draft is still nothing but headings and prompt text. Copilot then
// REPLACES it instead of appending after it — otherwise every generated lesson kept
// the placeholder paragraphs at the top.
export function isBlankContent(md: string): boolean {
  const lines = String(md ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return true;
  return lines.every((l) => l.startsWith("#") || PLACEHOLDER_LINES.has(l));
}
