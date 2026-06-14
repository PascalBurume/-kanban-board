import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: {
      id: user.userId,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      classId: user.classId ?? null,
      locale: user.locale,
    },
  });
}
