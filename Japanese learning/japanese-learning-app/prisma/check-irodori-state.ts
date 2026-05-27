import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const courses = await prisma.course.findMany({
    include: {
      lessons: {
        orderBy: { number: "asc" },
        include: { _count: { select: { grammarPoints: true } } },
      },
    },
    where: { title: { startsWith: "Irodori" } },
    orderBy: { id: "asc" },
  });
  for (const c of courses) {
    const withGram = c.lessons.filter(l => l._count.grammarPoints > 0);
    const without  = c.lessons.filter(l => l._count.grammarPoints === 0);
    console.log(c.title, "→", c.lessons.length, "lessons,", withGram.length, "with grammar,", without.length, "without");
    if (without.length) console.log("  0-GP:", without.map(l => "L"+l.number+"("+l.titleJp+")").join(", "));
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
