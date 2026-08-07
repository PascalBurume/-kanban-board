// Device-local document store (IndexedDB), the source of truth while offline.
//
// The school runs on LAN Wi-Fi that drops constantly, so a document must survive
// a dropped connection, a closed tab and a reboot without ever having reached
// the server. Every keystroke lands here first; syncing to the server is a
// separate, retryable concern (see useOfflineDoc.js).
//
// No wrapper library: IndexedDB is ~80 lines of promise plumbing and the school
// server has no internet to install from.

export type DocKind = "notebook" | "lesson-draft";

export type LocalDoc = {
  key: string; // `${kind}:${id}`
  id: string;
  kind: DocKind;
  title: string;
  subjectSlug?: string | null;
  contentMd: string;
  updatedAt: number; // device clock, ms — drives last-write-wins
  syncedAt: number | null;
  dirty: boolean;
  deleted?: boolean; // pending delete, still to be pushed
};

export type LocalDocInput = Omit<LocalDoc, "key" | "updatedAt" | "syncedAt" | "dirty"> & {
  updatedAt?: number;
};

const DB_NAME = "mwalimu-docs";
const DB_VERSION = 2;
const STORE = "docs";

/**
 * Pictures waiting for the server, added in v2.
 *
 * Kept apart from the text on purpose: a lesson's words are worth more than its
 * illustrations, so the text saves whether or not an image ever uploads, and the image
 * waits here until it can. In the meantime the markdown carries `mwalimu-pending:<key>`
 * where the URL will go.
 */
const BLOBS = "blobs";

export type PendingImage = {
  key: string;
  lessonId: string;
  blob: Blob;
  name: string;
  createdAt: number;
};

export function localDocsAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

export function docKey(kind: DocKind, id: string): string {
  return `${kind}:${id}`;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!localDocsAvailable()) return Promise.reject(new Error("IndexedDB unavailable"));
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      // Additive, and never keyed on the version number: a device that has been offline
      // for a term may be on any earlier version, and `if (old === 1)` upgrades break
      // exactly those devices. Creating what is missing works from any starting point.
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "key" });
          store.createIndex("kind", "kind", { unique: false });
        }
        if (!db.objectStoreNames.contains(BLOBS)) {
          const blobs = db.createObjectStore(BLOBS, { keyPath: "key" });
          blobs.createIndex("lessonId", "lessonId", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((e) => {
      // A failed open (private mode, quota, corrupted store) must not poison
      // every later call — let the next one try again.
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

/** Write a local edit. Always marks the doc dirty — only markSynced clears it. */
export async function saveDoc(input: LocalDocInput): Promise<LocalDoc> {
  const existing = await loadDoc(input.kind, input.id);
  const doc: LocalDoc = {
    key: docKey(input.kind, input.id),
    id: input.id,
    kind: input.kind,
    title: input.title,
    subjectSlug: input.subjectSlug ?? null,
    contentMd: input.contentMd,
    updatedAt: input.updatedAt ?? Date.now(),
    syncedAt: existing?.syncedAt ?? null,
    dirty: true,
    deleted: input.deleted ?? existing?.deleted ?? false,
  };
  await run("readwrite", (s) => s.put(doc));
  return doc;
}

export async function loadDoc(kind: DocKind, id: string): Promise<LocalDoc | null> {
  try {
    const doc = await run<LocalDoc | undefined>("readonly", (s) => s.get(docKey(kind, id)));
    return doc ?? null;
  } catch {
    return null;
  }
}

export async function listDocs(kind: DocKind): Promise<LocalDoc[]> {
  try {
    const all = await run<LocalDoc[]>("readonly", (s) => s.index("kind").getAll(kind));
    return all ?? [];
  } catch {
    return [];
  }
}

export async function listDirty(kind: DocKind): Promise<LocalDoc[]> {
  const all = await listDocs(kind);
  return all.filter((d) => d.dirty);
}

/**
 * Clear the dirty flag after a successful push — but only if the document has
 * not been edited since the push started. Without this check, typing during a
 * slow PUT would be marked as synced and then silently never sent.
 */
export async function markSynced(kind: DocKind, id: string, syncedAtVersion: number): Promise<boolean> {
  const doc = await loadDoc(kind, id);
  if (!doc) return false;
  if (doc.updatedAt !== syncedAtVersion) return false;
  await run("readwrite", (s) => s.put({ ...doc, dirty: false, syncedAt: Date.now() }));
  return true;
}

/** Mark for deletion locally; the tombstone is pushed on the next sync. */
export async function markDeleted(kind: DocKind, id: string): Promise<void> {
  const doc = await loadDoc(kind, id);
  if (!doc) return;
  await run("readwrite", (s) => s.put({ ...doc, deleted: true, dirty: true, updatedAt: Date.now() }));
}

/** Drop the local copy outright (delete confirmed by the server, or discarded draft). */
export async function deleteDoc(kind: DocKind, id: string): Promise<void> {
  try {
    await run("readwrite", (s) => s.delete(docKey(kind, id)));
  } catch {
    /* nothing to drop */
  }
}

/** Adopt a server copy verbatim — used when the server is ahead and we are clean. */
export async function putServerDoc(input: LocalDocInput & { updatedAt: number }): Promise<LocalDoc> {
  const doc: LocalDoc = {
    key: docKey(input.kind, input.id),
    id: input.id,
    kind: input.kind,
    title: input.title,
    subjectSlug: input.subjectSlug ?? null,
    contentMd: input.contentMd,
    updatedAt: input.updatedAt,
    syncedAt: Date.now(),
    dirty: false,
    deleted: false,
  };
  await run("readwrite", (s) => s.put(doc));
  return doc;
}

/**
 * Ask the browser to exempt our data from eviction under storage pressure.
 * Safari in particular will drop IndexedDB for "unimportant" origins.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

// ───────────────────────── pending images ─────────────────────────

/** Same transaction plumbing as `run`, against the blobs store. */
function runBlobs<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(BLOBS, mode);
        const req = fn(tx.objectStore(BLOBS));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

/**
 * A key for a queued picture.
 *
 * NOT crypto.randomUUID: that is secure-context only and the school is served over
 * plain http on the LAN, where it is simply undefined. Time plus randomness is enough
 * for a key that only has to be unique within one device's queue.
 */
export function pendingKey(): string {
  return `${stamp().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * A strictly increasing timestamp.
 *
 * Date.now() is not enough on its own: inserting two pictures in the same millisecond
 * — which a loop over a multi-select does easily — gives them the same createdAt, and
 * "oldest first" then depends on however the sort happens to break the tie. The queue
 * promises an order, so it has to have one.
 */
let lastStamp = 0;
function stamp(): number {
  const now = Date.now();
  lastStamp = now > lastStamp ? now : lastStamp + 1;
  return lastStamp;
}

/** Queue a picture for upload. Returns the key the markdown should point at. */
export async function queueImage(lessonId: string, blob: Blob, name: string): Promise<string> {
  const key = pendingKey();
  await runBlobs("readwrite", (s) => s.put({ key, lessonId, blob, name, createdAt: stamp() } satisfies PendingImage));
  return key;
}

export async function getPendingImage(key: string): Promise<PendingImage | null> {
  const row = await runBlobs<PendingImage | undefined>("readonly", (s) => s.get(key)).catch(() => undefined);
  return row ?? null;
}

/** Everything still waiting for this lesson, oldest first — the order they were added. */
export async function listPendingImages(lessonId: string): Promise<PendingImage[]> {
  const rows = await openDb().then(
    (db) =>
      new Promise<PendingImage[]>((resolve, reject) => {
        const tx = db.transaction(BLOBS, "readonly");
        const req = tx.objectStore(BLOBS).index("lessonId").getAll(lessonId);
        req.onsuccess = () => resolve(req.result as PendingImage[]);
        req.onerror = () => reject(req.error);
        tx.onabort = () => reject(tx.error);
      }),
  ).catch(() => [] as PendingImage[]);
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function deletePendingImage(key: string): Promise<void> {
  await runBlobs("readwrite", (s) => s.delete(key)).catch(() => undefined);
}

/** How many pictures are still waiting, across every lesson — for the status bar. */
export async function countPendingImages(): Promise<number> {
  return runBlobs<number>("readonly", (s) => s.count()).catch(() => 0);
}
