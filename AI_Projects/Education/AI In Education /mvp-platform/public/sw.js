// Offline-capable service worker.
// Strategy: network-first for navigations / data (always fresh when the LAN
// server is reachable, falls back to cache only when offline), cache-first for
// Next.js content-hashed static assets (immutable, safe to serve from cache).
// Network-first avoids the stale-while-revalidate "click twice" problem where
// the first click served stale HTML and only the second click saw fresh data.
const CACHE = "mwalimu-v4";

// Writing surfaces must open with no network at all: the document itself lives in
// IndexedDB (src/lib/localDocs.ts), so all these shells need is to exist in cache.
// Pre-fetched on activate rather than waiting for a first online visit, because the
// visit that needs them is by definition the one with no Wi-Fi.
const SHELLS = ["/student/carnet/", "/teacher/studio/rediger/"];

// Immutable, content-hashed assets — safe and fast to serve cache-first.
function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:js|css|woff2?|ttf|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)
  );
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => caches.open(CACHE))
      // Best effort: a shell that fails to precache still works once visited online.
      .then((cache) => Promise.all(SHELLS.map((p) => cache.add(p).catch(() => {}))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // don't touch cross-origin

  // The anatomy atlas ships ~96 MB of assets: 81 MB of GLB specimens under
  // /models/anatomy/ and 15 MB of illustration plates under /anatomy/. Never put
  // either in Cache Storage. "Offline" here means no internet, not no server —
  // the LAN box that serves this page also serves these files, so caching them
  // buys nothing and risks blowing the origin's storage quota, which would evict
  // the carnet and studio shells that genuinely cannot refetch. The HTTP cache
  // still spares the repeat download within a session.
  //
  // Note the plates would otherwise be caught by isStaticAsset() below, which
  // matches .webp — hence the explicit bypass rather than relying on the
  // extension rules.
  if (url.pathname.startsWith("/models/") || url.pathname.startsWith("/anatomy/")) return;

  // Cache-first for immutable static assets.
  if (isStaticAsset(url)) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res && res.status === 200 && res.type === "basic") cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // Network-first for everything else (navigations, RSC payloads, API, content).
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      try {
        const res = await fetch(req);
        if (res && res.status === 200 && res.type === "basic") cache.put(req, res.clone());
        return res;
      } catch {
        const cached = await cache.match(req);
        if (cached) return cached;
        // Editor URLs carry the document id in the query (?id=…), so an exact
        // match almost never hits — every notebook would look uncached offline.
        // The shell is identical for every id; the content comes from IndexedDB.
        if (req.mode === "navigate") {
          const shell = await cache.match(req, { ignoreSearch: true });
          if (shell) return shell;
        }
        throw new Error("offline and not cached");
      }
    })
  );
});
