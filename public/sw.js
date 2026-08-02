// Offline support for the web/PWA build. Registered by main.ts in production
// browser builds only (never in dev or the Tauri shell).
//
// Strategy:
// - App shell ("./", manifest, basemap styles, logo): precached at install;
//   navigations are network-first with the cached shell as offline fallback.
// - Reference data + visited.json: stale-while-revalidate — served instantly
//   from cache (this is what makes offline work), refreshed in the background
//   so the next open shows newly synced data. The background fetch rides the
//   HTTP cache's validators, so an unchanged 26 MB GeoJSON costs a 304.
// - Hashed /assets/ bundles + fonts: cache-first (immutable by construction).
// - CARTO basemap tiles/glyphs/sprites: cache-first, capped — recently viewed
//   areas keep their basemap detail offline; everything else still renders
//   from the local GeoJSON (fills, outlines, dots).
//
// Bump VERSION whenever the caching logic here changes — it drops old caches.

const VERSION = "v2";
const CACHE = `footprint-${VERSION}`;
const TILE_CACHE = `footprint-tiles-${VERSION}`;
const TILE_LIMIT = 600;

const PRECACHE = [
  "./",
  "./manifest.webmanifest",
  "./logo.svg",
  "./basemap/positron.json",
  "./basemap/dark-matter.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE && k !== TILE_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    // visited.json is fetched with a ?t= cache-buster — key it by pathname so
    // every load updates the same entry instead of growing the cache.
    if (url.pathname.endsWith("/data/visited.json")) {
      event.respondWith(staleWhileRevalidate(event, req, url.pathname));
      return;
    }
    if (url.pathname.endsWith(".geojson") || url.pathname.includes("/basemap/")) {
      event.respondWith(staleWhileRevalidate(event, req, req));
      return;
    }
    if (req.mode === "navigate") {
      event.respondWith(
        fetch(req)
          .then((res) => {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then((cache) => putSafe(cache, "./", copy)));
            return res;
          })
          .catch(() => caches.match("./")),
      );
      return;
    }
    event.respondWith(cacheFirst(req, CACHE));
    return;
  }

  if (url.hostname.endsWith(".basemaps.cartocdn.com")) {
    event.respondWith(tileCacheFirst(req));
  }
});

// Every cache write goes through here. Quota is finite and this app stores a lot
// (states.geojson alone is ~26 MB), so `put` genuinely rejects in the field —
// QuotaExceededError, most often on iOS. Previously these promises were left
// floating: the write failed, the rejection went unhandled, and the app lost
// offline support with nothing to show for it. The response is already served by
// the time we get here, so a failed write costs only offline availability — but
// it should be visible, not silent.
async function putSafe(cache, key, res) {
  try {
    await cache.put(key, res);
    return true;
  } catch (err) {
    console.warn("[sw] cache write failed (storage full?):", key, err);
    return false;
  }
}

async function staleWhileRevalidate(event, req, cacheKey) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(cacheKey);
  const refresh = fetch(req)
    .then(async (res) => {
      if (res.ok) await putSafe(cache, cacheKey, res.clone());
      return res;
    })
    .catch(() => cached);
  // Hold the worker open for the background refresh. Without this the browser is
  // free to shut it down the moment the cached response is returned, which turns
  // "newly synced data shows on the next open" into "the open after that". Only
  // needed on the cache-hit path — on a miss `refresh` is the response itself,
  // and respondWith already keeps the worker alive for it.
  if (cached) event.waitUntil(refresh);
  return cached ?? refresh;
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await putSafe(cache, req, res.clone());
  return res;
}

async function tileCacheFirst(req) {
  const cache = await caches.open(TILE_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && (await putSafe(cache, req, res.clone()))) {
    // Best-effort, never blocks the response — and never rejects into the void.
    trimTiles(cache).catch((err) => console.warn("[sw] tile trim failed:", err));
  }
  return res;
}

async function trimTiles(cache) {
  const keys = await cache.keys();
  if (keys.length <= TILE_LIMIT) return;
  // cache.keys() is insertion-ordered: drop the oldest overflow.
  await Promise.all(keys.slice(0, keys.length - TILE_LIMIT).map((k) => cache.delete(k)));
}
