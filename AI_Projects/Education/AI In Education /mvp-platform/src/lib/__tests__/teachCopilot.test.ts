import { describe, it, expect } from "vitest";
import { resolveTarget, canCompose, teacherTurns, parseBrief, verifyLesson, extractLesson, lessonExcerpt, COMPOSE_MIN_TURNS } from "../teachCopilot";

// The pure parts of « Copilot Enseigner ». Everything else in that file is Prisma and
// Ollama I/O; these four functions are where a wrong answer is silent rather than loud.

const book = { id: "l1", title: "Raisonnement par contraposition", canEdit: false, subjectSlug: "maths-5-scientifique" };
const own = { id: "l2", title: "Ma leçon", canEdit: true, subjectSlug: "maths-5-scientifique" };

describe("resolveTarget", () => {
  // 481 of ~485 seeded lessons are book content. If this branch were wrong the
  // generate button would be dead on almost the whole corpus.
  it("sends a book lesson to a complément, carrying what the creation needs", () => {
    const t = resolveTarget(book);
    expect(t.kind).toBe("complement");
    if (t.kind !== "complement") throw new Error("unreachable");
    expect(t.sourceId).toBe("l1");
    expect(t.sourceTitle).toBe("Raisonnement par contraposition");
    expect(t.subjectSlug).toBe("maths-5-scientifique");
  });

  it("writes straight into a lesson the teacher owns", () => {
    expect(resolveTarget(own).kind).toBe("inline");
  });

  it("survives a lesson with no subject rather than emitting undefined", () => {
    const t = resolveTarget({ ...book, subjectSlug: null });
    if (t.kind !== "complement") throw new Error("unreachable");
    expect(t.subjectSlug).toBe("");
  });
});

describe("the unlock rule", () => {
  const turn = (role: string) => ({ role });
  // Assistant replies are not the teacher asking for more detail — only user turns
  // count, or a single question would unlock the button on the model's own reply.
  it("counts teacher turns, not messages", () => {
    const convo = [turn("user"), turn("assistant"), turn("user"), turn("assistant")];
    expect(teacherTurns(convo)).toBe(2);
    expect(convo.length).toBe(4);
  });

  it("stays locked below the threshold and opens at it", () => {
    const convo: { role: string }[] = [];
    expect(canCompose(convo)).toBe(false);
    for (let i = 1; i < COMPOSE_MIN_TURNS; i++) {
      convo.push({ role: "user" }, { role: "assistant" });
      expect(canCompose(convo)).toBe(false);
    }
    convo.push({ role: "user" }, { role: "assistant" });
    expect(canCompose(convo)).toBe(true);
  });

  it("stays open as the conversation grows", () => {
    const long = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? "assistant" : "user" }));
    expect(canCompose(long)).toBe(true);
    expect(teacherTurns(long)).toBe(10);
  });
});

describe("parseBrief", () => {
  const full = [
    "<<<TITRE",
    "Les logarithmes par la mesure du son",
    "<<<ANGLE",
    "Partir du décibel, que les élèves entendent tous les jours.",
    "<<<OBJECTIFS",
    "- Lire une échelle logarithmique",
    "- Passer de log à exponentielle",
    "<<<PIEGES",
    "- Confondre log(a+b) et log a + log b",
    "<<<EXEMPLES",
    "- Le marché de Kinshasa à 85 dB",
    "<<<FIN",
  ].join("\n");

  it("reads every block", () => {
    const b = parseBrief(full, "secours");
    expect(b.title).toBe("Les logarithmes par la mesure du son");
    expect(b.angle).toContain("décibel");
    expect(b.objectives).toHaveLength(2);
    expect(b.pitfalls[0]).toContain("log(a+b)");
    expect(b.examples[0]).toContain("Kinshasa");
  });

  it("strips the bullet markers so the writer prompt is not doubly bulleted", () => {
    expect(parseBrief(full, "x").objectives[0]).toBe("Lire une échelle logarithmique");
  });

  // A 2B model truncated mid-generation is the common failure, not the exotic one.
  it("degrades on a truncated response instead of throwing", () => {
    const cut = full.slice(0, full.indexOf("<<<PIEGES"));
    const b = parseBrief(cut, "secours");
    expect(b.title).toBe("Les logarithmes par la mesure du son");
    expect(b.objectives.length).toBeGreaterThan(0);
    expect(b.pitfalls).toEqual([]);
    expect(b.examples).toEqual([]);
  });

  it("falls back to the lesson title when the model returns nothing usable", () => {
    expect(parseBrief("", "Titre de secours").title).toBe("Titre de secours");
    expect(parseBrief("bavardage sans marqueurs", "Titre de secours").title).toBe("Titre de secours");
  });

  it("caps the lists so one runaway generation cannot flood the writer prompt", () => {
    const many = "<<<OBJECTIFS\n" + Array.from({ length: 12 }, (_, i) => `- objectif ${i}`).join("\n") + "\n<<<FIN";
    expect(parseBrief(many, "x").objectives).toHaveLength(3);
  });
});

describe("lessonExcerpt", () => {
  // The shape of a real illustrated lesson: an épure, then the prose that matters.
  const figure =
    '<figure class="ai-figure"><svg viewBox="0 0 720 480">' +
    '<path d="M12 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0z"/>'.repeat(60) +
    '</svg><figcaption>Tableau de variation de la fonction logarithme</figcaption></figure>';
  const prose = "## Mise en situation\n\nÀ Bukavu, un commerçant compare deux offres.\n";

  it("drops the path data and keeps the caption", () => {
    const out = lessonExcerpt(`${figure}\n\n${prose}`);
    expect(out).not.toMatch(/<svg|<path|d="M/);
    expect(out).toContain("Tableau de variation");
    expect(out).toContain("Bukavu");
  });

  // The order is the bug that shipped: 55 of the 91 figure-bearing lessons open with a
  // figure, so clipping FIRST spent the model's whole budget on coordinates. One
  // « Manuel illustré » was 94% path data.
  it("strips before truncating, so a figure-first lesson still yields prose", () => {
    const heavy = [figure, figure, prose].join("\n\n");
    expect(heavy.slice(0, 3000)).toMatch(/<path/); // raw head really is path data
    const out = lessonExcerpt(heavy);
    expect(out).not.toMatch(/<path/);
    expect(out).toContain("Bukavu");
  });

  it("still caps a very long lesson", () => {
    const long = "## Titre\n\n" + "du texte bien réel. ".repeat(1000);
    expect(lessonExcerpt(long).length).toBeLessThanOrEqual(3001);
  });

  it("survives an empty or figure-only lesson", () => {
    expect(lessonExcerpt("")).toBe("");
    expect(lessonExcerpt(figure).trim()).toBe("Tableau de variation de la fonction logarithme");
  });
});

describe("extractLesson", () => {
  const lesson = "## Mise en situation\n\nÀ Kinshasa, une famille…\n\n## À retenir\n\nLe point clé.";

  it("passes clean markdown through untouched", () => {
    expect(extractLesson(lesson)).toBe(lesson);
  });

  // The real failure that shipped: asked for a <<<TITRE block, the 2B model wrote
  // `<<<Le Raisonnement par Contraposition` — the title substituted INTO the marker —
  // and a perfectly good lesson parsed to nothing.
  it("recovers a lesson the model wrapped in a mangled marker", () => {
    expect(extractLesson(`<<<Le Raisonnement par Contraposition\n${lesson}`)).toBe(lesson);
  });

  it("drops a chatty preamble before the first heading", () => {
    expect(extractLesson(`Voici la leçon que vous m'avez demandée :\n\n${lesson}`)).toBe(lesson);
  });

  it("drops a trailing terminator", () => {
    expect(extractLesson(`${lesson}\n<<<FIN`)).toBe(lesson);
    expect(extractLesson(`${lesson}\n>>>`)).toBe(lesson);
  });

  it("returns empty for a response with nothing in it", () => {
    expect(extractLesson("")).toBe("");
    expect(extractLesson("   \n  ")).toBe("");
  });
});

describe("verifyLesson", () => {
  const good = "## Mise en situation\n\nUn texte.\n\n## À retenir\n\nUn autre.\n";

  it("passes a well-formed lesson", () => {
    expect(verifyLesson(good)).toEqual([]);
  });

  // The one that matters: a lesson the word processor refuses would drop the teacher
  // into a raw markdown textarea — the exact experience « Rédiger » exists to remove.
  it("warns when the lesson would not open in the visual editor", () => {
    const w = verifyLesson("## Titre\n\n<video src='x'></video>\n");
    expect(w.join(" ")).toMatch(/Markdown/);
  });

  it("catches leftover placeholders", () => {
    expect(verifyLesson(`${good}\n[à compléter]\n`).join(" ")).toMatch(/compléter/);
  });

  it("catches a lesson with no sections at all", () => {
    expect(verifyLesson("Juste un paragraphe.").join(" ")).toMatch(/##/);
  });
});
