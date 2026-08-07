import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getEditableLesson } from "@/lib/studio";
import {
  MAX_FILE_BYTES, MAX_LESSON_BYTES,
  contentName, lessonDir, looksLikeSvg, sniffImage, uploadUrl,
} from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // needs the filesystem and node:crypto

// Receive one picture for one lesson.
//
// Authorised exactly like the lesson PUT — getEditableLesson — so a seeded book lesson
// stays closed to writes of every kind, not just to text.

const RATE_WINDOW_MS = 5 * 60_000;
const RATE_MAX = 20;
const hits = new Map<string, number[]>();
function rateLimited(userId: string): boolean {
  const now = Date.now();
  const arr = (hits.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  arr.push(now);
  hits.set(userId, arr);
  return arr.length > RATE_MAX;
}

/** What the lesson's folder already holds — the per-lesson budget is over the folder,
 *  not over this request, or twenty uploads of 4 MB each would pass one at a time. */
async function dirBytes(dir: string): Promise<number> {
  let total = 0;
  for (const name of await fs.readdir(dir).catch(() => [] as string[])) {
    const st = await fs.stat(path.join(dir, name)).catch(() => null);
    if (st?.isFile()) total += st.size;
  }
  return total;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  if (rateLimited(user.userId)) return NextResponse.json({ error: "RATE_LIMITED", message: "Trop d'images envoyées. Réessayez dans quelques minutes." }, { status: 429 });

  const { id } = await params;
  const lesson = await getEditableLesson(user, id);
  if (!lesson) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const dir = lessonDir(id);
  if (!dir) return NextResponse.json({ error: "BAD_LESSON" }, { status: 400 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "NO_FILE", message: "Aucun fichier reçu." }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "TOO_LARGE", message: "Image trop lourde (4 Mo maximum). Réduisez-la avant de l'envoyer." }, { status: 413 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) {
    const message = looksLikeSvg(bytes)
      ? "Les fichiers SVG ne sont pas acceptés. Exportez la figure en PNG."
      : "Ce fichier n'est pas une image PNG, JPEG, GIF ou WebP.";
    return NextResponse.json({ error: "NOT_AN_IMAGE", message }, { status: 415 });
  }

  const name = contentName(bytes, kind.ext);
  const dest = path.join(dir, name);
  await fs.mkdir(dir, { recursive: true });

  // Content-addressed: if these exact bytes are already here, this upload is a no-op
  // and the teacher gets the URL that already works. Checked before the quota so
  // re-inserting a picture never fails for being "over budget".
  const already = await fs.stat(dest).then((s) => s.isFile(), () => false);
  if (!already) {
    if ((await dirBytes(dir)) + bytes.length > MAX_LESSON_BYTES) {
      return NextResponse.json({ error: "LESSON_FULL", message: "Cette leçon a atteint 20 Mo d'images. Supprimez-en avant d'en ajouter." }, { status: 413 });
    }
    await fs.writeFile(dest, bytes);
  }

  return NextResponse.json({ src: uploadUrl(id, name), width: null, bytes: bytes.length, reused: already });
}
