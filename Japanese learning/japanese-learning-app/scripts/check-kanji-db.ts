import { PrismaClient } from "@prisma/client";
async function main() {
  const p = new PrismaClient();
  const k = await p.kanji.findMany({ take: 5, select: { character: true, meaning: true, onYomi: true, kunYomi: true, radicals: true, mnemonic: true, jlptLevel: true }});
  console.log(JSON.stringify(k, null, 2));
  await p.$disconnect();
}
main();
