import { PrismaClient } from "@prisma/client";
import { gradeCard } from "../src/app/srs/actions.ts";

const prisma = new PrismaClient();

const cards = await prisma.sRSCard.findMany({ orderBy: { id: "asc" }, take: 5 });
console.log("Grading 3 'good' and 2 'easy'...");
await gradeCard(cards[0].id, "good");
await gradeCard(cards[1].id, "good");
await gradeCard(cards[2].id, "good");
await gradeCard(cards[3].id, "easy");
await gradeCard(cards[4].id, "easy");

const today = new Date();
today.setHours(0, 0, 0, 0);
for (let d = 0; d < 6; d++) {
  const start = new Date(today.getTime() + d * 86400000);
  const end = new Date(start.getTime() + 86400000);
  const n = await prisma.sRSCard.count({
    where: { dueDate: { gte: start, lt: end } },
  });
  console.log(`Day +${d}: ${n} cards due`);
}

await prisma.$disconnect();
