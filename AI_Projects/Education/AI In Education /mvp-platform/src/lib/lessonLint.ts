// Deterministic quality checks on a generated lesson — no model call, so they cost
// nothing and never fail offline. The point is not to block the teacher (Copilot
// PROPOSES, the teacher decides) but to tell them WHERE to look before they accept
// a draft: a small local model regularly leaves placeholders, unclosed math or a
// truncated ending, and those are invisible in a wall of French prose.

const PLACEHOLDER_PATTERNS: { re: RegExp; msg: string }[] = [
  { re: /\[[^\]\n]{2,40}\]/, msg: "Texte à compléter entre crochets [ ] — remplacez-le par une valeur réelle." },
  { re: /\b(quartier|ville|zone|région|école|village|entreprise|coopérative)\s+[XYZ]\b/i, msg: "Nom générique (« quartier X ») — nommez un lieu réel." },
  { re: /\b(M\.|Mme|Monsieur|Madame)\s+[XYZ]\b/, msg: "Personne anonyme (« M. X ») — donnez un vrai prénom." },
  { re: /XXX|\.\.\.\s*à compléter|à compléter\b/i, msg: "Passage laissé « à compléter »." },
];

// Control chars that survived a JSON round-trip mean LaTeX was eaten (\text → TAB).
// repairLatex() should have caught these; if one reaches here, say so plainly.
const BROKEN_LATEX = /[\t\r\f\x0B\x08]\s*(ext|imes|heta|riangle|rac|eq|abla|otin|ec|eta)/;

export function lintLesson(md: string): string[] {
  const text = String(md ?? "");
  const warnings: string[] = [];
  if (!text.trim()) return warnings;

  if (BROKEN_LATEX.test(text)) {
    warnings.push("Formules abîmées — des commandes LaTeX ont perdu leur barre oblique. Régénérez la leçon.");
  }

  for (const { re, msg } of PLACEHOLDER_PATTERNS) {
    if (re.test(text)) warnings.push(msg);
  }

  // Unclosed math: $$ must pair, and inline $ must be even once display pairs are out.
  const display = (text.match(/\$\$/g) || []).length;
  const singles = (text.replace(/\$\$/g, "").match(/(?<!\\)\$/g) || []).length;
  if (display % 2 !== 0 || singles % 2 !== 0) {
    warnings.push("Formule non fermée — il manque un « $ ». La formule s'affichera comme du texte brut.");
  }

  // Truncation: a lesson cut off mid-sentence is the most common small-model failure.
  const tail = text.trimEnd().slice(-1);
  if (tail && !".!?:»)0123456789".includes(tail)) {
    warnings.push("La leçon semble coupée avant la fin — relisez le dernier paragraphe.");
  }

  if (!/^##\s*À retenir/im.test(text)) {
    warnings.push("Pas de section « ## À retenir » — ajoutez un résumé en fin de leçon.");
  }

  return warnings;
}
