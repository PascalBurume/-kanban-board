// Shrink a picture in the browser, before it ever touches the LAN.
//
// This is the piece that decides whether the feature is usable at all. A phone photo is
// 12 megapixels and 4-6 MB; capped at 1600px it is ~250 KB. Thirty teachers uploading
// classroom photos over a school wifi to a server that is often a laptop is the
// difference between "a moment" and "the platform is down".
//
// 1600px is chosen against the reader, not the camera: the lesson page renders a
// figure at ~700 CSS px, so 1600 still has headroom for a 2× screen and for printing a
// handout, and nothing above it is ever visible.

import { PENDING_IMG } from "@/lib/mdSanitize";
import { queueImage, listPendingImages, deletePendingImage } from "@/lib/localDocs";

export const MAX_EDGE = 1600;
export const JPEG_QUALITY = 0.82;

/** Does this bitmap have any pixel that is not fully opaque? */
function hasAlpha(canvas, ctx) {
  const { width, height } = canvas;
  // Sampling, not a full scan: a 12 MP image is 48 MB of RGBA and reading all of it
  // freezes the tab. Transparency in a real diagram is never a single stray pixel.
  const step = Math.max(1, Math.floor(Math.min(width, height) / 64));
  for (let y = 0; y < height; y += step) {
    const row = ctx.getImageData(0, y, width, 1).data;
    for (let x = 3; x < row.length; x += 4 * step) if (row[x] < 255) return true;
  }
  return false;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("DECODE_FAILED")); };
    img.src = url;
  });
}

/**
 * Returns a File no wider or taller than MAX_EDGE.
 *
 * The original is returned unchanged when it is already small enough AND already a
 * format the server accepts — re-encoding a clean 40 KB PNG diagram through JPEG would
 * make it both larger and blurrier.
 */
export async function shrinkImage(file) {
  const passthrough = /^image\/(png|jpeg|gif|webp)$/.test(file.type || "");
  // A GIF may be animated, and drawing it to a canvas keeps exactly one frame. Losing
  // the animation silently is worse than sending the bytes as they are; the 4 MB limit
  // is what stops a huge one.
  if (file.type === "image/gif") return file;

  const img = await loadImage(file).catch(() => null);
  if (!img) return passthrough ? file : null;

  const { naturalWidth: w, naturalHeight: h } = img;
  if (!w || !h) return passthrough ? file : null;
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  if (scale === 1 && passthrough) return file;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return passthrough ? file : null;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // Transparency has to stay PNG: JPEG has no alpha and would fill it with black.
  const alpha = file.type === "image/png" && hasAlpha(canvas, ctx);
  const type = alpha ? "image/png" : "image/jpeg";
  const blob = await new Promise((r) => canvas.toBlob(r, type, JPEG_QUALITY));
  if (!blob) return passthrough ? file : null;

  // Shrinking that made the file bigger is not shrinking. Happens with flat-colour
  // diagrams, where PNG beats JPEG at any quality.
  if (blob.size >= file.size && passthrough && scale === 1) return file;

  const base = (file.name || "image").replace(/\.[^.]+$/, "");
  return new File([blob], `${base}.${alpha ? "png" : "jpg"}`, { type });
}

/** POST a picture to a lesson. Resolves to { src } or throws with a French message. */
export async function uploadImage(lessonId, file) {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`/api/studio/lessons/${lessonId}/images/`, { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || "L'image n'a pas pu être envoyée.");
    // A 4xx is the server saying no — a wrong file type, too big, not your lesson. It
    // will say no again in an hour, so queueing it would be a lie. Only a request that
    // never got an answer is worth keeping.
    err.refused = true;
    throw err;
  }
  return data;
}

/**
 * Put a picture in the lesson, whatever the network is doing.
 *
 * Online it uploads and returns the real URL. Offline it stores the bytes on the device
 * and returns `mwalimu-pending:<key>`, which the editor draws from the local blob and
 * flushPendingImages() rewrites once the server is reachable again.
 *
 * Deliberately NOT symmetrical with a refusal: a server that answered "this is not an
 * image" has decided, and queueing it would leave a placeholder that can never resolve.
 */
export async function addImage(lessonId, file) {
  const small = (await shrinkImage(file).catch(() => null)) ?? file;
  try {
    const { src } = await uploadImage(lessonId, small);
    return { src, pending: false };
  } catch (e) {
    if (e?.refused) throw e;
    const key = await queueImage(lessonId, small, small.name || "image");
    return { src: `${PENDING_IMG}${key}`, pending: true };
  }
}

/** Every `mwalimu-pending:<key>` in a document, in the order they appear. */
export function pendingKeysIn(md) {
  return [...String(md ?? "").matchAll(/mwalimu-pending:([A-Za-z0-9-]+)/g)].map((m) => m[1]);
}

/**
 * Upload whatever is queued for this lesson and rewrite the markdown to point at the
 * real URLs. Returns the new markdown — unchanged when nothing drained.
 *
 * Never throws and never blocks the save: if the server is still unreachable the text
 * goes up with its placeholders intact and the pictures wait for the next attempt. The
 * teacher's words are worth more than their illustrations.
 */
export async function flushPendingImages(lessonId, md) {
  const keys = new Set(pendingKeysIn(md));
  if (!keys.size) return { md, drained: 0, remaining: 0 };

  let out = String(md ?? "");
  let drained = 0;
  for (const item of await listPendingImages(lessonId)) {
    if (!keys.has(item.key)) {
      // Queued, then the teacher deleted the picture from the lesson. Nothing will ever
      // reference it, so the bytes are dropped rather than uploaded to nowhere.
      await deletePendingImage(item.key);
      continue;
    }
    try {
      const file = item.blob instanceof File ? item.blob : new File([item.blob], item.name, { type: item.blob.type });
      const { src } = await uploadImage(lessonId, file);
      out = out.split(`${PENDING_IMG}${item.key}`).join(src);
      await deletePendingImage(item.key);
      drained++;
    } catch (e) {
      // Refused for good: the placeholder can never resolve, so drop the bytes and
      // leave the markdown alone — the audit reports the stranded placeholder.
      if (e?.refused) await deletePendingImage(item.key);
      // Still offline: stop here rather than hammering a server that is not answering.
      else break;
    }
  }
  return { md: out, drained, remaining: pendingKeysIn(out).length };
}
