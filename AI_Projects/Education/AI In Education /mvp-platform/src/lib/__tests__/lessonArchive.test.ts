import { describe, it, expect } from "vitest";
import { planLessonRestore, ARCHIVE_VERSION } from "../lessonArchive";

// Where a restored lesson lands. These four rules are the whole risk in a restore:
// the module it belonged to may be gone, a replacement may have taken its slug, and
// a restore from the bin must never silently republish something to a class.

const lesson = (over: Record<string, unknown> = {}) => ({
  id: "l1", moduleId: "m1", slug: "biblio-abc", title: "Statistiques", status: "PUBLISHED", ...over,
});

const ctx = (over: Partial<Parameters<typeof planLessonRestore>[1]> = {}) => ({
  liveModuleIds: new Set(["m1"]),
  takenSlugs: new Set<string>(),
  exact: false,
  suffix: "zzzz",
  ...over,
});

describe("planLessonRestore", () => {
  it("puts the lesson back in its module when the module still exists", () => {
    const r = planLessonRestore(lesson(), ctx());
    expect(r.moduleId).toBe("m1");
    expect(r.reattached).toBe(true);
    expect(r.slug).toBe("biblio-abc");
    expect(r.slugChanged).toBe(false);
  });

  it("falls back to the library when the module has since been deleted", () => {
    const r = planLessonRestore(lesson(), ctx({ liveModuleIds: new Set() }));
    expect(r.moduleId).toBeNull();
    expect(r.reattached).toBe(false);
  });

  it("leaves an already-unattached lesson unattached", () => {
    const r = planLessonRestore(lesson({ moduleId: null }), ctx());
    expect(r.moduleId).toBeNull();
    expect(r.reattached).toBe(false);
  });

  // The unique is [moduleId, slug]: a teacher who deletes a lesson, writes a
  // replacement, then restores the original must not hit a constraint error.
  it("mints a new slug when a replacement has taken it", () => {
    const r = planLessonRestore(lesson(), ctx({ takenSlugs: new Set(["m1::biblio-abc"]) }));
    expect(r.slug).toBe("biblio-abc-zzzz");
    expect(r.slugChanged).toBe(true);
  });

  it("only treats a slug as taken inside the same module", () => {
    // Same slug, different module → no collision, because the unique is scoped.
    const r = planLessonRestore(lesson(), ctx({ takenSlugs: new Set(["m2::biblio-abc"]) }));
    expect(r.slug).toBe("biblio-abc");
    expect(r.slugChanged).toBe(false);
  });

  it("checks the slug against where the lesson actually lands, not where it came from", () => {
    // Module gone → lands in the library, so the collision that matters is the
    // library one ("::slug"), not the one in the module it used to be in.
    const r = planLessonRestore(lesson(), ctx({
      liveModuleIds: new Set(),
      takenSlugs: new Set(["m1::biblio-abc"]),
    }));
    expect(r.moduleId).toBeNull();
    expect(r.slugChanged).toBe(false);

    const r2 = planLessonRestore(lesson(), ctx({
      liveModuleIds: new Set(),
      takenSlugs: new Set(["::biblio-abc"]),
    }));
    expect(r2.slugChanged).toBe(true);
  });

  // The bin is not a republish button.
  it("restores from the bin as a draft even if it was published", () => {
    expect(planLessonRestore(lesson({ status: "PUBLISHED" }), ctx()).status).toBe("DRAFT");
    expect(planLessonRestore(lesson({ status: "DRAFT" }), ctx()).status).toBe("DRAFT");
  });

  // …but undo is a correction of the last few seconds, so it puts back what was there.
  it("restores the exact status when undoing", () => {
    expect(planLessonRestore(lesson({ status: "PUBLISHED" }), ctx({ exact: true })).status).toBe("PUBLISHED");
    expect(planLessonRestore(lesson({ status: "DRAFT" }), ctx({ exact: true })).status).toBe("DRAFT");
  });

  it("is stable — planning twice from the same inputs gives the same answer", () => {
    const a = planLessonRestore(lesson(), ctx());
    const b = planLessonRestore(lesson(), ctx());
    expect(a).toEqual(b);
  });
});

describe("the archive format", () => {
  // The payload is written once and read back possibly much later. A shape change
  // has to be a version bump, or an old bin entry restores into a broken lesson.
  //
  // This pin is meant to fail when the shape changes — it did, when « Copilot
  // Enseigner » added TeachThread/TeachMessage to the payload. Bump it deliberately,
  // and only after confirming an older payload still restores (the restore reads the
  // new arrays with `?? []`, so a v1 entry in a teacher's bin simply has no threads).
  it("carries a version", () => {
    expect(ARCHIVE_VERSION).toBe(2);
  });
});
