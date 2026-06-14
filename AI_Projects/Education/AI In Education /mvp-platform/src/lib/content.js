// Base path helper: works at site root and on subpaths (e.g. GitHub Pages).
export function base() {
  if (typeof window === "undefined") return "";
  // strip trailing slash and any /#... ; content lives under the app origin/base
  return "";
}
export async function loadManifest() {
  const r = await fetch("content/manifest.json");
  if (!r.ok) throw new Error("manifest introuvable");
  return r.json();
}
export async function loadSearchIndex() {
  const r = await fetch("content/search-index.json");
  if (!r.ok) return [];
  return r.json();
}
export async function loadExercises() {
  const r = await fetch("content/exercises.json");
  if (!r.ok) return [];
  return r.json();
}
export async function loadModule(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error("module introuvable: " + path);
  return r.text();
}
// strip YAML front-matter, return { meta, body }
export function splitFrontMatter(txt) {
  if (!txt.startsWith("---")) return { meta: {}, body: txt };
  const end = txt.indexOf("\n---", 3);
  if (end === -1) return { meta: {}, body: txt };
  const raw = txt.slice(3, end);
  const body = txt.slice(end + 4).replace(/^\n/, "");
  const meta = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Za-z_]+):\s*"?([^"]*)"?\s*$/);
    if (m) meta[m[1]] = m[2];
  }
  return { meta, body };
}
export const STATUS_LABELS = {
  complete: { t: "Vérifié", c: "bg-emerald-100 text-emerald-800" },
  "ocr-raw": { t: "OCR brut", c: "bg-amber-100 text-amber-800" },
  scaffold: { t: "Plan", c: "bg-slate-100 text-slate-600" },
};
