import { describe, it, expect } from "vitest";
import { auditDocument, auditQuiz } from "../lessonAudit";

// The audit merges what used to be two half-views: the Rédiger page listed broken
// formulas only, the LaTeX atelier listed formulas plus broken figures. The figure half
// is the one that matters most — a broken ```figure renders as a red slab of its own
// JSON, so it is the problem a teacher can actually SEE.

describe("a healthy lesson reports nothing", () => {
  it("finds no problems", () => {
    const md = "## Titre\n\nUn texte avec $x^2$ dedans.\n\n- un point\n- un autre";
    expect(auditDocument(md).problems).toHaveLength(0);
  });
});

describe("broken figures", () => {
  const bad = '## Titre\n\n```figure\n{ pas du json\n```';

  it("reports a figure whose JSON no longer parses", () => {
    const [p] = auditDocument(bad).problems;
    expect(p.kind).toBe("figure");
    expect(p.why).toMatch(/JSON invalide/);
  });

  // The overwhelmingly common cause, and the one worth naming.
  it("names a formula spliced into the payload as the cause", () => {
    // Spliced into a VALUE, which is what actually breaks the payload — the same text
    // inside a quoted key would still be legal JSON.
    const spliced = '```figure\n{"type":"line","grid":tr$$x$$ue}\n```';
    const [p] = auditDocument(spliced).problems;
    expect(p.kind).toBe("figure");
    expect(p.why).toMatch(/formule a été insérée/i);
  });

  it("reports the line the block starts on", () => {
    expect(auditDocument(bad).problems[0].line).toBe(3);
  });

  it("leaves a well-formed figure alone", () => {
    const good = '```figure\n{"type":"function","expr":"x^2","xmin":-5,"xmax":5}\n```';
    expect(auditDocument(good).problems).toHaveLength(0);
    expect(auditDocument(good).stats.figures).toBe(1);
  });
});

// The 423 épures in the seeded books are hand-drawn `<figure><svg>`, not ```figure
// fences. Counting fences alone told a teacher "0 figures" on a page showing one.
describe("counting the figures a teacher can see", () => {
  const epure = '<figure class="ai-figure">\n<svg viewBox="0 0 10 10"></svg>\n<figcaption>Thalès</figcaption>\n</figure>';

  it("counts a hand-drawn épure", () => {
    expect(auditDocument(epure).stats.figures).toBe(1);
  });

  it("counts both kinds together", () => {
    const both = `${epure}\n\n\`\`\`figure\n{"type":"function","expr":"x^2","xmin":-5,"xmax":5}\n\`\`\``;
    expect(auditDocument(both).stats.figures).toBe(2);
  });

  it("counts each of several épures", () => {
    expect(auditDocument(`${epure}\n\n${epure}\n\n${epure}`).stats.figures).toBe(3);
  });

  // A lesson *about* HTML shows the markup as prose. That is not a figure.
  it("ignores a figure tag quoted inside a code fence", () => {
    expect(auditDocument("```html\n<figure>exemple</figure>\n```").stats.figures).toBe(0);
  });

  it("does not mistake other tags for a figure", () => {
    expect(auditDocument("<figcaption>seule</figcaption>").stats.figures).toBe(0);
  });
});

describe("broken formulas", () => {
  it("reports one that cannot render", () => {
    const problems = auditDocument("Texte $\\frac{$ suite").problems;
    expect(problems.some((p) => p.kind === "formula")).toBe(true);
  });
});

describe("problems are ordered by line", () => {
  it("interleaves formulas and figures", () => {
    const md = ['```figure', "{ cassé", "```", "", "Puis $\\frac{$ ici."].join("\n");
    const lines = auditDocument(md).problems.map((p) => p.line);
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
  });
});

describe("stats", () => {
  it("counts words without letting formulas inflate them", () => {
    const { stats } = auditDocument("Un deux trois $\\alpha + \\beta + \\gamma$ quatre");
    expect(stats.words).toBe(4);
    expect(stats.formulas).toBe(1);
  });

  it("counts headings", () => {
    expect(auditDocument("# A\n\n## B\n\ntexte").stats.headings).toBe(2);
  });

  it("survives empty input", () => {
    const a = auditDocument("");
    expect(a.problems).toHaveLength(0);
    expect(a.stats.words).toBe(0);
    expect(a.plan).toEqual([]);
  });
});

describe("the plan comes back with the audit", () => {
  it("carries the outline so the pane needs one pass", () => {
    expect(auditDocument("## Un\n\n## Deux").plan.map((h) => h.text)).toEqual(["Un", "Deux"]);
  });
});

// A quiz breaks in ways nobody sees until a pupil is sitting in front of it: two
// identical options, an empty distractor, a short answer with nothing accepted. None
// of them throw and none look wrong in the editor.
describe("auditQuiz", () => {
  const q = (over = {}) => ({ type: "qcm", q: "Combien font 2+2 ?", opts: ["4", "5"], correct: 0, expl: "2+2=4", ...over });

  it("passes a well-formed question", () => {
    expect(auditQuiz([q()])).toHaveLength(0);
  });

  it("catches an empty question", () => {
    expect(auditQuiz([q({ q: "  " })]).some((p) => /question est vide/i.test(p.why))).toBe(true);
  });

  it("catches an empty option", () => {
    expect(auditQuiz([q({ opts: ["4", ""] })]).some((p) => /proposition est vide/i.test(p.why))).toBe(true);
  });

  it("catches duplicate options, case-insensitively", () => {
    expect(auditQuiz([q({ opts: ["Quatre", "quatre"] })]).some((p) => /identiques/i.test(p.why))).toBe(true);
  });

  it("catches a correct index pointing nowhere", () => {
    expect(auditQuiz([q({ correct: 7 })]).some((p) => /bonne réponse/i.test(p.why))).toBe(true);
  });

  it("catches a short answer with nothing accepted", () => {
    expect(auditQuiz([q({ type: "court", opts: [""] })]).some((p) => /réponse acceptée/i.test(p.why))).toBe(true);
  });

  // Advisory, not blocking: a quiz without explanations still works.
  it("flags a missing explanation as a suspect, not an error", () => {
    const found = auditQuiz([q({ expl: "" })]).filter((p) => /explication/i.test(p.why));
    expect(found).toHaveLength(1);
    expect(found[0].suspect).toBe(true);
  });

  it("reports which question is at fault", () => {
    expect(auditQuiz([q(), q({ q: "" })])[0].question).toBe(1);
  });

  it("survives an empty quiz", () => {
    expect(auditQuiz([])).toEqual([]);
  });
});
