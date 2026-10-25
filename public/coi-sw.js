// LibreRoom web service worker. Two jobs, both for the site's OWN files only:
//  1. Cross-origin isolation on static hosts that cannot send HTTP headers (GitHub Pages):
//     responses are re-served with COOP/COEP headers, which lets the browser enable
//     SharedArrayBuffer, hence multi-threaded AI.
//  2. Offline use: the app shell is pre-cached at install; requests go to the network first
//     (so updates arrive immediately) and fall back to the cache when there is no connection.
// It never touches other origins (the AI model download is cached separately by the app,
// in "libreroom-models-v1", which this worker never deletes), and it sends nothing anywhere.
// The build replaces the two placeholders below (build/plugins.ts).
const BUILD = "__LIBREROOM_BUILD__";
const PRECACHE = /*__LIBREROOM_PRECACHE__*/ [];
const PREFIX = "libreroom-app-";
const CACHE = PREFIX + BUILD;

self.addEventListener("install", (event) => {
  const scope = self.registration.scope;
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((path) => new URL(path, scope).href)))
      .catch(() => {}) // offline pre-cache is best effort; runtime caching still applies
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isolated(response) {
  if (response.status === 0) return response;
  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (request.method === "GET" && response.ok && response.type === "basic") {
      const copy = response.clone();
      // A retired worker (after an update) must not re-create its deleted cache.
      caches.has(CACHE).then((exists) => exists && caches.open(CACHE).then((cache) => cache.put(request, copy)));
    }
    return isolated(response);
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: request.mode === "navigate" });
    if (cached) return isolated(cached);
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (new URL(request.url).origin !== self.location.origin) return;
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") return;
  event.respondWith(networkFirst(request));
});
