const CACHE_NAME = "blackhole-v3";
const ASSETS = [
  "/",
  "/index.html",
  "/css/game.css",
  "/js/game.js",
  "/js/input.js",
  "/js/entities.js",
  "/js/render.js",
  "/js/audio.js",
  "/js/save.js",
  "/js/living-world.js",
  "/manifest.json"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
});
