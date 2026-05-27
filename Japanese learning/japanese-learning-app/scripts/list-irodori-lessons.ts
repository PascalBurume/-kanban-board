import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  const lessons = await p.lesson.findMany({
    where: { framework: "irodori-starter" },
    orderBy: { number: "asc" },
    select: { id: true, number: true, titleJp: true, topicJp: true },
  });
  for (const l of lessons) {
    console.log(`L${l.number} → id=${l.id} · ${l.topicJp} / ${l.titleJp}`);
  }
  await p.$disconnect();
}
main();
