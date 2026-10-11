/* Simple service worker for PWA install + offline shell */

const CACHE_NAME = "afh-v3";
const SHELL = ["./", "./index.html", "./style.css", "./app.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(SHELL).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Never cache Apps Script API calls
  if (url.hostname.includes("script.google.com")) return;

  // Never cache Chart.js CDN
  if (url.hostname.includes("jsdelivr")) return;

  // Cache-first for static shell
  if (e.request.method === "GET") {
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetch(e.request))
    );
  }
});
