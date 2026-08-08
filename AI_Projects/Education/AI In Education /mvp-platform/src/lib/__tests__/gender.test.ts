import { describe, it, expect } from "vitest";
import { civility, withCivility, roleLabel, normalizeGender } from "../gender";

describe("normalizeGender", () => {
  it("keeps the two real values", () => {
    expect(normalizeGender("F")).toBe("F");
    expect(normalizeGender("M")).toBe("M");
  });

  // Anything else means « not specified », which is a value the API must be able to store.
  it("collapses everything else to null rather than throwing or persisting junk", () => {
    for (const v of [null, undefined, "", "f", "autre", 0, {}, []]) {
      expect(normalizeGender(v)).toBeNull();
    }
  });
});

describe("civility", () => {
  it("gives the two French titles", () => {
    expect(civility("F")).toBe("Mme");
    expect(civility("M")).toBe("M.");
  });

  // Empty, not " " or "M./Mme" — callers concatenate it.
  it("gives nothing when unspecified", () => {
    expect(civility(null)).toBe("");
    expect(civility(undefined)).toBe("");
  });
});

describe("withCivility", () => {
  it("prefixes the title", () => {
    expect(withCivility("F", "Grâce Mukendi")).toBe("Mme Grâce Mukendi");
    expect(withCivility("M", "Patrick Lwanzo")).toBe("M. Patrick Lwanzo");
  });

  // No leading space, no dangling title — the sidebar renders this raw.
  it("returns the bare name when there is no title", () => {
    expect(withCivility(null, "Grâce Mukendi")).toBe("Grâce Mukendi");
  });

  it("never returns a lone title when the name has not loaded", () => {
    expect(withCivility("F", "")).toBe("");
  });
});

describe("roleLabel", () => {
  // The bug this field exists to kill: the shells said « Enseignante » for everyone
  // while /profile said « Enseignant » from a lookup table. Both now read this.
  it("agrees the teacher label", () => {
    expect(roleLabel("TEACHER", "F")).toBe("Enseignante");
    expect(roleLabel("TEACHER", "M")).toBe("Enseignant");
    expect(roleLabel("TEACHER", null)).toBe("Enseignant(e)");
  });

  it("agrees the admin label", () => {
    expect(roleLabel("ADMIN", "F")).toBe("Administratrice");
    expect(roleLabel("ADMIN", "M")).toBe("Administrateur");
    expect(roleLabel("ADMIN", null)).toBe("Administrateur(trice)");
  });

  // « Élève » is invariable in French — a pupil's label must not sprout a « (e) ».
  it("leaves the student label alone whatever the gender", () => {
    expect(roleLabel("STUDENT", "F")).toBe("Élève");
    expect(roleLabel("STUDENT", "M")).toBe("Élève");
    expect(roleLabel("STUDENT", null)).toBe("Élève");
  });

  it("returns empty for a role it does not know, rather than undefined", () => {
    expect(roleLabel("PARENT", "F")).toBe("");
    expect(roleLabel("", null)).toBe("");
  });
});
