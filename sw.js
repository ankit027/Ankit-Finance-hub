const CACHE_NAME = "afh-v4"; // Version bumped to kill old cache
const SHELL = ["./", "./index.html", "./style.css", "./app.js"];

self.addEventListener("install", (e) => {
  self.skipWaiting(); // Force new service worker to take over immediately
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k))) // DELETE ALL OLD CACHES
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.hostname.includes("script.google.com") || url.hostname.includes("jsdelivr")) return;
  if (e.request.method === "GET") {
    e.respondWith(caches.match(e.request).then((cached) => cached || fetch(e.request)));
  }
});
