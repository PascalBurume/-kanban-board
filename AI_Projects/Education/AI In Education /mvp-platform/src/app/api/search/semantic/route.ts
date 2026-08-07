import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStudentClass, accessibleSubjectSlugs } from "@/lib/path";
import { embedModelAvailable } from "@/lib/ollama";
import { retrieveChunks, stripFigures } from "@/lib/rag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Semantic search over ALL published lesson content (DB-wide — includes
// admin-created books the static /manuels bundle doesn't know about).
// Students are scoped to their class's subjects; staff searches everything.
export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const q = String(body.q ?? "").trim().slice(0, 300);
  if (!q) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  if (!(await embedModelAvailable())) {
    return NextResponse.json({ error: "EMBED_MODEL_MISSING", results: [] });
  }

  let subjectSlugs: string[] | undefined;
  let classLevel: string | undefined;
  if (u.role === "STUDENT") {
    const cls = await getStudentClass(u.userId);
    if (!cls) return NextResponse.json({ results: [] });
    subjectSlugs = await accessibleSubjectSlugs(cls.id);
    classLevel = cls.level;
  }

  try {
    const hits = await retrieveChunks(q, { k: 6, subjectSlugs, classLevel });
    return NextResponse.json({
      results: hits
        .filter((h) => h.score > 0.4)
        .map((h) => ({
          lessonId: h.lessonId,
          title: h.lessonTitle,
          subject: h.subjectName,
          moduleTitle: h.moduleTitle,
          // Snippet without the provenance prefix used for embedding quality;
          // stripFigures guards against any legacy chunk still holding raw SVG.
          snippet: stripFigures(h.text.replace(/^«[^»]*»\s*/, "")).slice(0, 180),
          score: Math.round(h.score * 100) / 100,
        })),
    });
  } catch {
    return NextResponse.json({ error: "SEARCH_FAILED", results: [] });
  }
}
