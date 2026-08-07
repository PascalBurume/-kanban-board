import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  saveDoc,
  loadDoc,
  listDocs,
  listDirty,
  markSynced,
  markDeleted,
  deleteDoc,
  putServerDoc,
  docKey,
} from "../localDocs";

const base = { kind: "notebook" as const, title: "Trigonométrie", contentMd: "$\\sin^2 x + \\cos^2 x = 1$" };

async function clear() {
  for (const kind of ["notebook", "lesson-draft"] as const) {
    for (const doc of await listDocs(kind)) await deleteDoc(kind, doc.id);
  }
}

beforeEach(clear);

describe("localDocs", () => {
  it("saves and reloads a document", async () => {
    await saveDoc({ ...base, id: "n1" });
    const doc = await loadDoc("notebook", "n1");
    expect(doc?.title).toBe("Trigonométrie");
    expect(doc?.contentMd).toContain("\\cos^2 x");
    expect(doc?.key).toBe(docKey("notebook", "n1"));
  });

  it("marks every local save dirty", async () => {
    await saveDoc({ ...base, id: "n1" });
    expect((await loadDoc("notebook", "n1"))?.dirty).toBe(true);
    expect(await listDirty("notebook")).toHaveLength(1);
  });

  it("clears dirty on markSynced when the doc has not changed", async () => {
    const saved = await saveDoc({ ...base, id: "n1" });
    expect(await markSynced("notebook", "n1", saved.updatedAt)).toBe(true);
    const doc = await loadDoc("notebook", "n1");
    expect(doc?.dirty).toBe(false);
    expect(doc?.syncedAt).toBeTypeOf("number");
  });

  // The race that would silently lose work: the user keeps typing while a slow
  // PUT is in flight, so the version that reached the server is already stale.
  it("keeps the doc dirty when it was edited during the push", async () => {
    const first = await saveDoc({ ...base, id: "n1" });
    await saveDoc({ ...base, id: "n1", contentMd: "edited mid-flight", updatedAt: first.updatedAt + 10 });
    expect(await markSynced("notebook", "n1", first.updatedAt)).toBe(false);
    const doc = await loadDoc("notebook", "n1");
    expect(doc?.dirty).toBe(true);
    expect(doc?.contentMd).toBe("edited mid-flight");
  });

  it("lists only documents of the requested kind", async () => {
    await saveDoc({ ...base, id: "n1" });
    await saveDoc({ ...base, kind: "lesson-draft", id: "l1" });
    expect(await listDocs("notebook")).toHaveLength(1);
    expect(await listDocs("lesson-draft")).toHaveLength(1);
  });

  it("keeps a pending delete dirty so the tombstone gets pushed", async () => {
    await saveDoc({ ...base, id: "n1" });
    await markDeleted("notebook", "n1");
    const doc = await loadDoc("notebook", "n1");
    expect(doc?.deleted).toBe(true);
    expect(doc?.dirty).toBe(true);
  });

  it("adopts a server copy as clean", async () => {
    await putServerDoc({ ...base, id: "n1", updatedAt: 1234 });
    const doc = await loadDoc("notebook", "n1");
    expect(doc?.dirty).toBe(false);
    expect(doc?.updatedAt).toBe(1234);
  });

  it("returns null for an unknown document", async () => {
    expect(await loadDoc("notebook", "nope")).toBeNull();
  });
});
