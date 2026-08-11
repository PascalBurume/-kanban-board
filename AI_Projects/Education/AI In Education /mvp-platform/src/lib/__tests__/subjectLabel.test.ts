import { describe, it, expect } from "vitest";
import { disciplineOf, disciplinesOf, teachingLabel } from "../subjectLabel";

// The real corpus: every Subject.name in the seed, exactly as stored.
const ALL = [
  "Chimie — 5e",
  "Chimie — 6e",
  "Géométrie descriptive",
  "Mathématiques (littéraire) — 5e",
  "Mathématiques (littéraire) — 6e",
  "Mathématiques — 5e",
  "Mathématiques — 6e",
  "Physique",
  "Révision EXETAT",
];

describe("disciplineOf", () => {
  it("drops the level suffix", () => {
    expect(disciplineOf("Chimie — 5e")).toBe("Chimie");
  });

  it("drops the stream qualifier as well as the level", () => {
    expect(disciplineOf("Mathématiques (littéraire) — 5e")).toBe("Mathématiques");
  });

  it("leaves a name that carries neither", () => {
    expect(disciplineOf("Physique")).toBe("Physique");
    expect(disciplineOf("Révision EXETAT")).toBe("Révision EXETAT");
    expect(disciplineOf("Géométrie descriptive")).toBe("Géométrie descriptive");
  });

  it("accepts an en dash, not only the em dash the seed happens to use", () => {
    expect(disciplineOf("Chimie – 5e")).toBe("Chimie");
  });

  // Never return "" — the sidebar would render a bare « Enseignante · ».
  it("falls back to the original when stripping would empty it", () => {
    expect(disciplineOf("(littéraire)")).toBe("(littéraire)");
    expect(disciplineOf("— 5e")).toBe("— 5e");
  });
});

describe("disciplinesOf", () => {
  // The whole point: Grâce's five books are one discipline plus the revision volume.
  it("collapses the four maths books to one discipline", () => {
    const grace = [
      "Mathématiques (littéraire) — 5e",
      "Mathématiques — 5e",
      "Mathématiques (littéraire) — 6e",
      "Mathématiques — 6e",
      "Révision EXETAT",
    ];
    expect(disciplinesOf(grace)).toEqual(["Mathématiques", "Révision EXETAT"]);
  });

  it("reduces the whole corpus to five distinct disciplines", () => {
    expect(disciplinesOf(ALL)).toEqual([
      "Chimie",
      "Géométrie descriptive",
      "Mathématiques",
      "Physique",
      "Révision EXETAT",
    ]);
  });

  it("handles a teacher with nothing assigned", () => {
    expect(disciplinesOf([])).toEqual([]);
  });
});

describe("teachingLabel", () => {
  it("is one short line for the teacher who broke the sidebar", () => {
    const label = teachingLabel([
      "Mathématiques (littéraire) — 5e",
      "Mathématiques — 5e",
      "Mathématiques (littéraire) — 6e",
      "Mathématiques — 6e",
      "Révision EXETAT",
    ]);
    expect(label).toBe("Mathématiques · Révision EXETAT");
    expect(label.length).toBeLessThan(40);
  });

  // The guarantee that matters: no roster, however large, can lengthen this without
  // bound — that is what pushed « Paramètres » under the userbox.
  it("caps the list and counts the remainder", () => {
    expect(teachingLabel(ALL)).toBe("Chimie · Géométrie descriptive +3");
    expect(teachingLabel(ALL, 1)).toBe("Chimie +4");
  });

  it("stays bounded as books are added", () => {
    const many = Array.from({ length: 40 }, (_, i) => `Matière ${i} — 5e`);
    expect(teachingLabel(many).length).toBeLessThan(40);
  });

  it("returns empty rather than a dangling separator when nothing is assigned", () => {
    expect(teachingLabel([])).toBe("");
  });
});
