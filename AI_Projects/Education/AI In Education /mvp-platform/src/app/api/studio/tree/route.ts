import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { studioTree, assignableClasses, classForLessonInScope } from "@/lib/studio";

export const dynamic = "force-dynamic";

// GET /api/studio/tree/?class=<id>&lesson=<id>
// The studio is scoped to one class. Teachers always land on a class (their
// first, unless ?class= or a ?lesson= deep link says otherwise); admins may omit
// it to browse every book.
export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u || (u.role !== "TEACHER" && u.role !== "ADMIN")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const classParam = searchParams.get("class");
  const lessonParam = searchParams.get("lesson");

  const classes = await assignableClasses(u);

  let selected: string | null = classParam;
  if (!selected && lessonParam) selected = await classForLessonInScope(u, lessonParam);
  if (!selected && u.role === "TEACHER") selected = classes[0]?.id ?? null;

  const tree = await studioTree(u, selected);
  if (tree === null) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  return NextResponse.json({ ...tree, classes, selectedClassId: selected ?? null });
}
