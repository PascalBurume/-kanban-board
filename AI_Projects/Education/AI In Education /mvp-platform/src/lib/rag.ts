import crypto from "node:crypto";
import { prisma } from "./db";
import { ollamaEmbed, embedModelAvailable } from "./ollama";

// Local RAG over lesson content: chunk → embed (Ollama, nomic-embed-text) →
// cosine retrieval in-process. Vectors are Float32Array stored as Bytes.
//
// Scale ceiling: in-process cosine is fine to ~50k chunks (a few ms per 1k
// vectors at 768 dims). Beyond that, move to sqlite-vec.

const CHUNK_SIZE = 1000; // ≈250 tokens
const CHUNK_OVERLAP = 200;

export type StepEmit = (id: string, status: "running" | "done" | "error", label: string, detail?: string) => void;

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

// Lesson bodies may embed hand-authored SVG épures as raw <figure>…</figure>
// HTML. That markup (path data, coordinates) is meaningless to the embedder and
// would blow the chunk window, so strip figures before chunking. Keep the
// figcaption text — it describes the drawing — but drop the <svg> payload.
export function stripFigures(md: string): string {
  return md
    .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, (fig) => {
      const cap = fig.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i);
      const text = cap ? cap[1].replace(/<[^>]+>/g, " ") : "";
      return text.replace(/\s+/g, " ").trim();
    })
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, "")
    .replace(/[ \t]{2,}/g, " ");
}

// Split by "## " sections first, then window long sections with overlap. Each
// chunk is prefixed with its provenance for better embedding quality.
export function chunkLesson(subjectName: string, lessonTitle: string, contentMd: string): string[] {
  const prefix = `«${subjectName} › ${lessonTitle}» `;
  const clean = stripFigures(contentMd);
  const sections = clean.split(/\n(?=##\s+)/).map((s) => s.trim()).filter((s) => s.length > 60);
  const parts = sections.length > 0 ? sections : [clean.trim()];
  const chunks: string[] = [];
  for (const part of parts) {
    // A lesson that is almost entirely figures strips down to nothing, and the
    // empty-content guard upstream does not catch it: its contentMd is not blank,
    // its text is. Without this, such a lesson contributes a chunk that is only
    // the "«Subject › Title»" prefix — a content-free vector that answers weakly
    // to everything.
    if (part.trim().length < 20) continue;
    if (part.length <= CHUNK_SIZE) {
      chunks.push(prefix + part);
    } else {
      for (let i = 0; i < part.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
        const w = part.slice(i, i + CHUNK_SIZE).trim();
        if (w.length > 80) chunks.push(prefix + w);
        if (i + CHUNK_SIZE >= part.length) break;
      }
    }
  }
  return chunks.slice(0, 40); // sanity cap per lesson
}

function toBuffer(vec: number[]): Buffer {
  return Buffer.from(new Float32Array(vec).buffer);
}

function fromBuffer(buf: Buffer): Float32Array {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

// (Re)index one lesson — cheap no-op when contentMd is unchanged. Fire-and-
// forget safe: throws only propagate to .catch().
export async function indexLesson(lessonId: string): Promise<{ indexed: number } | { skipped: true }> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { module: { include: { subject: true } } },
  });
  if (!lesson || !lesson.contentMd.trim()) return { skipped: true };
  const hash = sha256(lesson.contentMd);
  const existing = await prisma.lessonChunk.findFirst({ where: { lessonId }, select: { contentHash: true } });
  if (existing?.contentHash === hash) return { skipped: true };
  if (!(await embedModelAvailable())) return { skipped: true };

  const subjectName = lesson.module?.subject?.name ?? lesson.subjectSlug ?? "";
  const texts = chunkLesson(subjectName, lesson.title, lesson.contentMd);
  if (texts.length === 0) return { skipped: true };
  const vecs = await ollamaEmbed(texts);

  await prisma.$transaction([
    prisma.lessonChunk.deleteMany({ where: { lessonId } }),
    ...texts.map((text, i) =>
      prisma.lessonChunk.create({
        data: { lessonId, ord: i, text, embedding: toBuffer(vecs[i]), contentHash: hash },
      }),
    ),
  ]);
  return { indexed: texts.length };
}

// Full reindex over published lessons — SSE job for the admin Contenu tab.
export async function reindexAll(emit: StepEmit) {
  emit("scan", "running", "Inventaire des leçons publiées…");
  const lessons = await prisma.lesson.findMany({
    where: { status: "PUBLISHED", moduleId: { not: null } },
    select: { id: true },
  });
  emit("scan", "done", "Inventaire des leçons publiées", `${lessons.length} leçons`);

  if (!(await embedModelAvailable())) {
    emit("embed", "error", "Modèle d'embedding absent", "installez-le : ollama pull nomic-embed-text");
    return { indexed: 0, skipped: 0, reason: "EMBED_MODEL_MISSING" as const };
  }

  emit("embed", "running", "Indexation…", `0/${lessons.length} leçons`);
  let indexed = 0, skipped = 0, failed = 0;
  for (let i = 0; i < lessons.length; i++) {
    try {
      const r = await indexLesson(lessons[i].id);
      if ("indexed" in r) indexed++;
      else skipped++;
    } catch {
      failed++;
    }
    if ((i + 1) % 5 === 0 || i === lessons.length - 1) {
      emit("embed", "running", "Indexation…", `${i + 1}/${lessons.length} leçons`);
    }
  }
  emit("embed", "done", "Indexation terminée", `${indexed} indexées · ${skipped} déjà à jour${failed ? ` · ${failed} échecs` : ""}`);
  return { indexed, skipped, failed };
}

export async function indexStats() {
  const [chunks, lessons] = await Promise.all([
    prisma.lessonChunk.count(),
    prisma.lessonChunk.groupBy({ by: ["lessonId"] }).then((g) => g.length),
  ]);
  return { chunks, lessons, embedModel: await embedModelAvailable() };
}

export interface RetrievedChunk {
  lessonId: string;
  lessonTitle: string;
  subjectName: string;
  moduleId: string;
  moduleTitle: string;
  text: string;
  score: number;
}

// Embed the query and rank chunks by cosine similarity. Filters keep the
// candidate set small (subject scope / level); returns the top-k chunks.
export async function retrieveChunks(
  query: string,
  opts: { k?: number; subjectSlugs?: string[]; classLevel?: string; excludeLessonId?: string } = {},
): Promise<RetrievedChunk[]> {
  const k = opts.k ?? 3;
  if (!query.trim() || !(await embedModelAvailable())) return [];

  const [qvec] = await ollamaEmbed([query.slice(0, 1000)]);
  const q = new Float32Array(qvec);

  const chunks = await prisma.lessonChunk.findMany({
    where: {
      embedding: { not: null },
      lesson: {
        status: "PUBLISHED",
        ...(opts.excludeLessonId ? { id: { not: opts.excludeLessonId } } : {}),
        module: {
          ...(opts.subjectSlugs?.length ? { subjectSlug: { in: opts.subjectSlugs } } : {}),
          // null classLevel = book shared across levels → matches any class
          ...(opts.classLevel ? { OR: [{ classLevel: opts.classLevel }, { classLevel: null }] } : {}),
        },
      },
    },
    include: { lesson: { select: { id: true, title: true, module: { select: { id: true, title: true, subject: { select: { name: true } } } } } } },
  });

  const scored = chunks
    .map((c) => ({
      lessonId: c.lesson.id,
      lessonTitle: c.lesson.title,
      subjectName: c.lesson.module?.subject.name ?? "",
      moduleId: c.lesson.module?.id ?? "",
      moduleTitle: c.lesson.module?.title ?? "",
      text: c.text,
      score: cosine(q, fromBuffer(c.embedding as Buffer)),
    }))
    .sort((a, b) => b.score - a.score);

  // Cap at one chunk per lesson for diversity, then top-k.
  const seen = new Set<string>();
  const out: RetrievedChunk[] = [];
  for (const s of scored) {
    if (seen.has(s.lessonId)) continue;
    seen.add(s.lessonId);
    out.push(s);
    if (out.length >= k) break;
  }
  return out;
}

// Top similar LESSONS for a piece of draft text (authoring assistant).
export async function similarLessons(text: string, k = 5) {
  const hits = await retrieveChunks(text.slice(0, 2000), { k });
  return hits.map((h) => ({ lessonId: h.lessonId, title: h.lessonTitle, subjectName: h.subjectName, moduleTitle: h.moduleTitle, score: Math.round(h.score * 100) / 100 }));
}
