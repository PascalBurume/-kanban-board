import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const where = q ? { OR: [{ action: { contains: q } }, { actorName: { contains: q } }, { targetType: { contains: q } }] } : {};
  const entries = await prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 60 });
  return NextResponse.json({
    entries: entries.map((e) => ({
      id: e.id,
      action: e.action,
      actorName: e.actorName,
      targetType: e.targetType,
      targetId: e.targetId,
      metaJson: e.metaJson,
      createdAt: e.createdAt.toISOString(),
    })),
  });
}
