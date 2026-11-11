// Network-first service worker: when online you always get the latest files
// (so edits show up right away); the cache is only the offline fallback.
// Paths are relative so it works at the site root or in a subfolder.
// Bump on each release so phones drop the old offline copy.
const CACHE_NAME = "blackhole-v9.7";
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
  "./js/art.js",
  "./js/ships.js",
  "./js/tiers.js",
  "./js/wisp.js",
  "./js/grade.js",
  "./js/depth.js",
  "./icons/icon-maskable-512.png",
  "./js/starmap.js",
  "./js/worlds.js",
  "./js/discoveries.js",
  "./js/logbook.js",
  "./js/ascension.js",
  "./js/rivals.js",
  "./js/constellation.js",
  "./js/zen.js",
  "./js/core/index.js",
  "./js/core/Camera.js",
  "./js/core/Fx.js",
  "./js/core/GalaxyFlow.js",
  "./js/core/Growth.js",
  "./js/core/DevMode.js",
  "./js/core/Inflow.js",
  "./js/core/Backdrop.js",
  "./js/core/DebrisField.js",
  "./js/core/GoldenVeil.js",
  "./js/core/HudControls.js",
  "./js/core/Flagship.js",
  "./js/core/CollapseFlow.js",
  "./js/core/Display.js",
  "./js/core/Feeding.js",
  "./js/core/Galaxy.js",
  "./js/core/GameLoop.js",
  "./js/core/GameState.js",
  "./js/core/Hud.js",
  "./js/core/Lifecycle.js",
  "./js/core/Menus.js",
  "./js/core/PerfMonitor.js",
  "./js/core/PlayControls.js",
  "./js/core/Player.js",
  "./js/core/RunTracker.js",
  "./js/core/Scene.js",
  "./js/core/ScreenFlow.js",
  "./js/core/ScreenOverlay.js",
  "./js/core/Settings.js",
  "./js/core/ZenSession.js",
  "./js/core/breath.js",
  "./js/art/comets.js",
  "./js/art/deepsky.js",
  "./js/art/dust.js",
  "./js/art/hole.js",
  "./js/art/kit.js",
  "./js/art/planets.js",
  "./js/art/quality.js",
  "./js/art/rival.js",
  "./js/art/rocks.js",
  "./js/art/sprites.js",
  "./js/art/stars.js",
  "./js/data/biomes.js",
  "./js/data/objects.js",
  "./js/data/worlds.js",
  "./manifest.json",
  "./assets/backdrop_reef.jpg",
  "./assets/backdrop_current.jpg",
  "./assets/backdrop_nursery.jpg",
  "./assets/backdrop_armada.jpg",
  "./assets/backdrop_void.jpg",
  "./assets/backdrop_meadow.jpg",
  "./assets/backdrop_forge.jpg",
  "./assets/sky/golden_veil.jpg",
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
