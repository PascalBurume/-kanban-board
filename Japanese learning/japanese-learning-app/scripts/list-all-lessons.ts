import { PrismaClient } from "@prisma/client";
async function main() {
  const p = new PrismaClient();
  const courses = await p.course.findMany({
    include: {
      lessons: {
        orderBy: { number: "asc" },
        include: { _count: { select: { grammarPoints: true, vocabulary: true, kanji: true } } }
      }
    },
    orderBy: { id: "asc" }
  });
  for (const c of courses) {
    console.log(`\n=== ${c.title} (${c.level}) ===`);
    for (const l of c.lessons) {
      console.log(`  L${l.number} id=${l.id} | GP=${l._count.grammarPoints} V=${l._count.vocabulary} K=${l._count.kanji} | ${l.titleJp || l.titleEn || '(no title)'}`);
    }
  }
  await p.$disconnect();
}
main();
