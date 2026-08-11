import { prisma } from "./db";

// FR "how to earn" copy, keyed by badge slug. Falls back to the badge's `rule`.
export const BADGE_HINTS: Record<string, string> = {
  "first-module": "Termine ta première leçon",
  "perfect-quiz": "Obtiens 100 % à un quiz",
  "streak-7": "Étudie 7 jours d’affilée",
};

// Grant a badge to a student. Idempotent — safe to call on every completion;
// the unique [studentId, badgeId] constraint means repeats are no-ops.
export async function awardBadge(studentId: string, slug: string): Promise<void> {
  const badge = await prisma.badge.findUnique({ where: { slug } });
  if (!badge) return;
  await prisma.badgeAward.upsert({
    where: { studentId_badgeId: { studentId, badgeId: badge.id } },
    update: {},
    create: { studentId, badgeId: badge.id },
  });
}
