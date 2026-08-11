"use client";

// Document Settings — wireframe 1e, callout 3.
//
// These are typographic preferences for the WRITING surface, not properties of the
// lesson: the same lesson is read by students on a phone, printed on a handout and
// indexed by RAG, and none of those care what font the teacher likes to compose in.
// So they live in localStorage per teacher, not in the lesson row — which also means
// they survive on a school server with no network and need no migration.
//
// Everything here becomes a CSS custom property on the editor page. A field that
// cannot be honoured is not offered: the wireframe's "Compatibility flags" has no
// referent in this app and is deliberately absent rather than drawn as a dead control.

export const STORAGE_KEY = "mwalimu.docSettings.v1";

export const DEFAULTS = {
  width: 680,
  font: "Lora",
  fontSize: 16,
  lineHeight: 1.55,
  paraSpace: 12,
  mathFont: "Cormorant",
  mathSize: 18,
  subMathFont: "\\mathnormal",
  mathLineHeight: 1.4,
  codeSize: 13,
  spellcheck: "off",
  brackets: "auto",
  dark: false,
  lazyMath: "offscreen",
};

export const FIELDS = [
  { key: "width", label: "Largeur du document", type: "range", min: 520, max: 900, step: 20, unit: "px" },
  { key: "font", label: "Police du texte", type: "select", options: [["Lora", "Lora"], ["Georgia", "Georgia"], ["system-ui", "Système"], ["'Times New Roman'", "Times"]] },
  { key: "fontSize", label: "Taille du texte", type: "range", min: 13, max: 22, step: 1, unit: "px" },
  { key: "lineHeight", label: "Interligne", type: "range", min: 1.2, max: 2, step: 0.05, unit: "×" },
  { key: "paraSpace", label: "Espace entre paragraphes", type: "range", min: 0, max: 28, step: 2, unit: "px" },
  { key: "mathFont", label: "Police des formules", type: "select", options: [["Cormorant", "Cormorant"], ["KaTeX_Main", "KaTeX (défaut)"], ["Georgia", "Georgia"]] },
  { key: "mathSize", label: "Taille des formules", type: "range", min: 14, max: 28, step: 1, unit: "px" },
  { key: "subMathFont", label: "Alphabet mathématique", type: "mathfont" },
  { key: "mathLineHeight", label: "Interligne des formules", type: "range", min: 1.1, max: 2, step: 0.05, unit: "×" },
  { key: "codeSize", label: "Taille du code", type: "range", min: 10, max: 18, step: 1, unit: "px" },
  { key: "spellcheck", label: "Correction orthographique", type: "select", options: [["off", "Aucune"], ["on", "Activée"]] },
  { key: "brackets", label: "Parenthèses", type: "select", options: [["auto", "Ajustées automatiquement"], ["fixed", "Taille fixe"]] },
  { key: "dark", label: "Mode sombre du document", type: "toggle" },
  { key: "lazyMath", label: "Rendu des formules", type: "select", options: [["offscreen", "Hors écran seulement"], ["always", "Toutes, tout de suite"]], wide: true },
];

export function loadSettings() {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    // Merge over the defaults rather than trusting the stored shape: a key added in a
    // later version would otherwise arrive as undefined and land in a CSS variable as
    // the string "undefined", which silently breaks the whole rule it appears in.
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // A full or disabled localStorage must not cost the teacher their settings panel.
  }
}

/** The settings as CSS custom properties, applied to the editor page element. */
export function settingsToVars(s) {
  return {
    "--doc-w": `${s.width}px`,
    "--doc-font": s.font,
    "--doc-size": `${s.fontSize}px`,
    "--doc-lh": String(s.lineHeight),
    "--doc-para": `${s.paraSpace}px`,
    "--doc-math-font": s.mathFont,
    "--doc-math-size": `${s.mathSize}px`,
    "--doc-math-lh": String(s.mathLineHeight),
    "--doc-code-size": `${s.codeSize}px`,
  };
}
