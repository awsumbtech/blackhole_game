// Network-first service worker: when online you always get the latest files
// (so edits show up right away); the cache is only the offline fallback.
// Paths are relative so it works at the site root or in a subfolder.
const CACHE_NAME = "blackhole-runtime";
const ASSETS = [
  "./",
  "./index.html",
  "./css/game.css",
  "./js/game.js",
  "./js/input.js",
  "./js/entities.js",
  "./js/render.js",
  "./js/audio.js",
  "./js/save.js",
  "./js/living-world.js",
  "./js/progression.js",
  "./js/powerups.js",
  "./js/ui.js",
  "./manifest.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).catch(() => {})
  );
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!sameOrigin && !isFont) return;

  e.respondWith((async () => {
    try {
      const fresh = await fetch(req, sameOrigin ? { cache: "no-cache" } : undefined);
      if (fresh && (fresh.ok || fresh.type === "opaque")) {
        const copy = fresh.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
      }
      return fresh;
    } catch {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;
      if (req.mode === "navigate") {
        const shell = await caches.match("./index.html");
        if (shell) return shell;
      }
      throw new Error("offline and not cached");
    }
  })());
});
