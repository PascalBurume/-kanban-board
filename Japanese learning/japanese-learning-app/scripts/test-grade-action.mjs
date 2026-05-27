import { PrismaClient } from "@prisma/client";
import { gradeCard } from "../src/app/srs/actions.ts";

const prisma = new PrismaClient();

const before = await prisma.sRSCard.findFirst({ orderBy: { id: "asc" } });
console.log("Before:", { id: before.id, ease: before.ease, interval: before.interval });

const r1 = await gradeCard(before.id, "good");
console.log("grade('good') →", r1);

const log = await prisma.reviewLog.findFirst({ where: { cardId: before.id }, orderBy: { id: "desc" } });
console.log("Log:", log ? { rating: log.rating, at: log.reviewedAt.toISOString() } : null);

const after = await prisma.sRSCard.findUnique({ where: { id: before.id } });
console.log("DB now:", { ease: after.ease, interval: after.interval, due: after.dueDate.toISOString() });

const r2 = await gradeCard(before.id, "again");
console.log("grade('again') →", { interval: r2.interval, lapsed: r2.lapsed });

const final = await prisma.sRSCard.findUnique({ where: { id: before.id } });
console.log("DB reset:", { ease: final.ease, interval: final.interval });

const logs = await prisma.reviewLog.count({ where: { cardId: before.id } });
console.log("Total logs for this card:", logs);

await prisma.$disconnect();
