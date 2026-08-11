// Extract the "## Objectifs" and "## Notions clés" bullets from a lesson body.
// Shared by the server (getChapter, concept illustration) and the client
// (Copilot suggestion chips) so both read the same notions/objectives.
export function extractHighlights(contentMd = "") {
  const grab = (re) => {
    const m = contentMd.match(re);
    if (!m) return [];
    return m[1]
      .split("\n")
      .map((l) => l.replace(/^\s*[-*]\s+/, "").trim())
      .filter((l) => l && !l.startsWith("#"))
      .slice(0, 6);
  };
  return {
    objectives: grab(/##\s*Objectifs\s*\n([\s\S]*?)(\n##\s|\n#\s|$)/i),
    notions: grab(/##\s*Notions cl[ée]s\s*\n([\s\S]*?)(\n##\s|\n#\s|$)/i),
  };
}
