"use client";

// Local-first save loop: every edit goes to IndexedDB immediately, then a
// debounced push to the server. If the push fails the doc simply stays dirty
// and a backoff timer retries — nothing is ever lost by a dropped connection.
//
// Deliberately does NOT trust navigator.onLine as the source of truth: on a
// school LAN the Wi-Fi is usually up while the server itself is unreachable,
// which onLine reports as "online". A failed fetch is what actually means
// offline here; onLine is only used as an early hint and a wake-up signal.

import { useCallback, useEffect, useRef, useState } from "react";
import { saveDoc, loadDoc, markSynced, listDirty, requestPersistence } from "./localDocs";

const DEBOUNCE_MS = 1500;
const BACKOFF_MS = [5000, 15000, 60000];

/** Push outcome: { ok } | { ok:false, auth:true } | { ok:false, conflict:doc } */
async function attempt(push, doc) {
  try {
    return await push(doc);
  } catch {
    return { ok: false };
  }
}

export function useOfflineDoc({ kind, id, push, enabled = true }) {
  // saved-local | syncing | synced | offline | conflict | auth
  const [status, setStatus] = useState("synced");
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [conflict, setConflict] = useState(null);

  const pushRef = useRef(push);
  pushRef.current = push;
  const timer = useRef(null);
  const retry = useRef(null);
  const failures = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    requestPersistence();
  }, []);

  const clearTimers = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (retry.current) clearTimeout(retry.current);
    timer.current = null;
    retry.current = null;
  }, []);

  const sync = useCallback(async () => {
    if (!enabled || !id || inFlight.current) return;
    const doc = await loadDoc(kind, id);
    if (!doc || !doc.dirty) return;

    inFlight.current = true;
    setStatus("syncing");
    const version = doc.updatedAt;
    const res = await attempt(pushRef.current, doc);
    inFlight.current = false;

    if (res?.ok) {
      failures.current = 0;
      const cleared = await markSynced(kind, id, version);
      if (cleared) {
        setStatus("synced");
        setLastSyncedAt(Date.now());
      } else {
        // Edited mid-push — it is still dirty, so go round again.
        setStatus("saved-local");
        scheduleSync(0);
      }
      return;
    }

    if (res?.conflict) {
      setConflict(res.conflict);
      setStatus("conflict");
      return;
    }
    if (res?.auth) {
      setStatus("auth");
      return;
    }

    setStatus("offline");
    const wait = BACKOFF_MS[Math.min(failures.current, BACKOFF_MS.length - 1)];
    failures.current += 1;
    if (retry.current) clearTimeout(retry.current);
    retry.current = setTimeout(() => sync(), wait);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id, enabled]);

  const scheduleSync = useCallback(
    (delay = DEBOUNCE_MS) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => sync(), delay);
    },
    [sync],
  );

  /** Persist an edit to the device now, then queue the server push. */
  const saveLocal = useCallback(
    async (fields) => {
      if (!enabled || !id) return;
      await saveDoc({ kind, id, ...fields });
      setStatus((s) => (s === "conflict" || s === "auth" ? s : "saved-local"));
      scheduleSync();
    },
    [kind, id, enabled, scheduleSync],
  );

  const forceSync = useCallback(() => {
    failures.current = 0;
    clearTimers();
    return sync();
  }, [sync, clearTimers]);

  const resolveConflict = useCallback(() => {
    setConflict(null);
    setStatus("saved-local");
  }, []);

  // Reconnect signals: the browser's online event, and coming back to the tab
  // (a tablet waking from sleep never fires `online`).
  useEffect(() => {
    if (!enabled) return undefined;
    const wake = () => {
      failures.current = 0;
      scheduleSync(0);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") wake();
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, scheduleSync]);

  useEffect(() => clearTimers, [clearTimers]);

  return { status, lastSyncedAt, conflict, saveLocal, forceSync, resolveConflict };
}

/** Flush every dirty doc of a kind — used on reconnect from list views. */
export async function syncAllDirty(kind, push) {
  const docs = await listDirty(kind);
  let pushed = 0;
  for (const doc of docs) {
    const version = doc.updatedAt;
    const res = await attempt(push, doc);
    if (res?.ok) {
      await markSynced(kind, doc.id, version);
      pushed += 1;
    }
  }
  return pushed;
}

/** Human-readable French save state for the editor chip. */
export function saveLabel(status, lastSyncedAt) {
  switch (status) {
    case "saved-local":
      return "Enregistré sur l'appareil";
    case "syncing":
      return "Synchronisation…";
    case "synced":
      return lastSyncedAt
        ? `Synchronisé · ${new Date(lastSyncedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
        : "Synchronisé";
    case "offline":
      return "Hors ligne — sera synchronisé";
    case "conflict":
      return "Version plus récente sur le serveur";
    case "auth":
      return "Session expirée — reconnectez-vous";
    default:
      return "";
  }
}
