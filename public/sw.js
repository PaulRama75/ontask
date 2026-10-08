// Minimal service worker for the FER Onboarding PWA.
//
// Goals:
//  - Make the app installable (a registered SW is required for the install prompt).
//  - Provide a graceful offline fallback for navigations.
//
// Deliberately conservative: this app is auth-gated and data-heavy, so we do
// NOT cache API routes, server actions, POSTs, or authenticated pages. We only
// cache static assets opportunistically and serve a cached shell when offline.

const CACHE = "fer-pwa-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/logoblack.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET; never interfere with server actions / API mutations.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache API routes or Next.js data/action endpoints.
  if (url.pathname.startsWith("/api")) return;

  // For page navigations: try the network, fall back to the offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((r) => r || Response.error())
      )
    );
    return;
  }

  // For static assets: serve from cache if present, otherwise fetch and
  // cache a copy (same-origin only).
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok && response.type === "basic") {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
  }
});
