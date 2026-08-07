import crypto from "node:crypto";
import path from "node:path";

// Where a teacher's uploaded pictures live, and what counts as one.
//
// On disk, OUTSIDE public/. Next serves public/ from a manifest built at build time,
// so a file written there after the build is served in `next dev` and missing in
// `next start` — the worst kind of difference to debug on a school server. Everything
// here is served by an explicit route instead. Sibling of backups/ (see admin.ts).
//
// Content-addressed: the name IS the hash of the bytes, so inserting the same photo in
// three lessons costs one file, and the URL can be cached forever because the bytes at
// a given URL can never change.
//
// Not base64 in the markdown: a 200 KB photo becomes ~270 KB of text, copied into
// every LessonVersion and fed to the RAG chunker. Not a Prisma row either — a
// content-addressed path already carries everything a row would.

export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

/** 4 MB per file, 20 MB per lesson. A shrunk classroom photo is ~250 KB. */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_LESSON_BYTES = 20 * 1024 * 1024;

export type ImageKind = { ext: string; mime: string };

// Sniffed from the bytes, never from the declared Content-Type — the declared type is
// supplied by the caller and so proves nothing about what is actually in the file.
//
// SVG is absent ON PURPOSE, and it is the reason this list is a whitelist. An SVG is a
// script host: served from our own origin by /api/uploads it would run with the app's
// privileges, and unlike the épures in lesson markdown it would never pass through
// sanitizeHast. It also has no magic bytes to sniff, being XML. So: never accepted.
const MAGIC: Array<{ ext: string; mime: string; test: (b: Buffer) => boolean }> = [
  { ext: "png", mime: "image/png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: "jpg", mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "gif", mime: "image/gif", test: (b) => b.subarray(0, 6).toString("latin1") === "GIF87a" || b.subarray(0, 6).toString("latin1") === "GIF89a" },
  { ext: "webp", mime: "image/webp", test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
];

/** The image these bytes actually are, or null if they are not one we accept. */
export function sniffImage(bytes: Buffer): ImageKind | null {
  if (bytes.length < 12) return null;
  const hit = MAGIC.find((m) => m.test(bytes));
  return hit ? { ext: hit.ext, mime: hit.mime } : null;
}

/** True when the bytes look like SVG — so the refusal can say why. */
export function looksLikeSvg(bytes: Buffer): boolean {
  const head = bytes.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  return head.startsWith("<?xml") || head.startsWith("<svg");
}

/** `<sha256-16>.<ext>` — the content address. */
export function contentName(bytes: Buffer, ext: string): string {
  return `${crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 16)}.${ext}`;
}

// Lesson ids are cuids, but this is the one place a caller-supplied string becomes a
// directory name, so it is checked rather than trusted.
const SEGMENT_OK = /^[A-Za-z0-9_-]{1,64}$/;

export function lessonDir(lessonId: string): string | null {
  return SEGMENT_OK.test(lessonId) ? path.join(UPLOAD_DIR, "lessons", lessonId) : null;
}

/**
 * The absolute path a request for `/api/uploads/<segments>` may read, or null.
 *
 * Two independent checks, because either alone has a hole: rejecting ".." misses an
 * absolute segment or a symlink-ish path, and a prefix test alone would accept
 * "/uploads-secret" as being inside "/uploads". The trailing separator closes that.
 */
export function resolveUploadPath(segments: string[]): string | null {
  if (!segments.length || segments.some((s) => !SEGMENT_OK.test(s.replace(/\.[A-Za-z0-9]{1,8}$/, "")))) return null;
  const full = path.resolve(UPLOAD_DIR, ...segments);
  const root = path.resolve(UPLOAD_DIR) + path.sep;
  return full.startsWith(root) ? full : null;
}

/** The public URL for a stored file. Must match SAFE_IMG in mdSanitize.ts. */
export const uploadUrl = (lessonId: string, name: string) => `/api/uploads/lessons/${lessonId}/${name}`;
