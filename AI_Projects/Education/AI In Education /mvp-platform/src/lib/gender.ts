// French agrees its role nouns with the person, and the app had no way to know: the
// shells hard-coded « Mme » and « Enseignante » because the seed teacher is a woman, while
// /profile said « Enseignant » from a lookup table. Both were guesses. `User.gender` makes
// them the same answer.
//
// Three states, and the third is not a fallback for laziness — a school will have staff
// who do not fill this in, and « Enseignant(e) » is the form Congolese administrative
// French already uses for exactly that case.

export type Gender = "F" | "M" | null | undefined;

export function normalizeGender(v: unknown): "F" | "M" | null {
  return v === "F" || v === "M" ? v : null;
}

/** « Mme » / « M. » / nothing. Never returns a bare space to concatenate. */
export function civility(gender: Gender): string {
  return gender === "F" ? "Mme" : gender === "M" ? "M." : "";
}

/** « Mme Grâce Mukendi », or just the name when the civility is unknown. */
export function withCivility(gender: Gender, name: string): string {
  const c = civility(gender);
  return c && name ? `${c} ${name}` : name;
}

// Élève is invariable, so a student's label needs no gender at all — which is why the
// map is keyed by role first.
const ROLE_FORMS: Record<string, { F: string; M: string; X: string }> = {
  STUDENT: { F: "Élève", M: "Élève", X: "Élève" },
  TEACHER: { F: "Enseignante", M: "Enseignant", X: "Enseignant(e)" },
  ADMIN: { F: "Administratrice", M: "Administrateur", X: "Administrateur(trice)" },
};

export function roleLabel(role: string, gender: Gender): string {
  const forms = ROLE_FORMS[role];
  if (!forms) return "";
  return gender === "F" ? forms.F : gender === "M" ? forms.M : forms.X;
}
