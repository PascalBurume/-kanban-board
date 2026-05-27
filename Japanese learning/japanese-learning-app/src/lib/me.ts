// Tiny single-user demo helper. Real auth comes later — for now we identify
// the "current user" by a fixed demo email and lazily create the row if
// missing. All server actions in this app go through this function.

import { prisma } from "@/lib/db";

const DEMO_EMAIL = "demo@nihongo.app";

export async function getCurrentUser() {
  let u = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!u) {
    u = await prisma.user.create({
      data: {
        email: DEMO_EMAIL,
        name: "Alex M.",
        level: "N4",
        dailyGoalMin: 30,
        streakCount: 47,
        streakLastAt: new Date(),
        dailyMinutes: 18,
        xp: 2340,
      },
    });
  }
  return u;
}
