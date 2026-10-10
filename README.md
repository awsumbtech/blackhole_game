# Black Hole: Galaxy Eater

**v5.2** · A calm, ad-free little space game. You're a tiny black hole drifting through space:
eat what's smaller than you, grow, and slowly climb from space dust to the cosmic web.
No ads, no purchases, no timers (in Zen mode), no way to lose.

Play: **https://awsumbtech.github.io/blackhole_game/**

## How to play

- **Move:** on a phone, touch anywhere and drag. A soft thumbstick appears under your finger;
  the further you drag, the faster you drift. Let go to coast. (Settings can switch to
  "follow finger".) On a computer, use the mouse, or WASD / arrow keys.
- **Eat** anything smaller than you (it glows softly when it's edible). Bumping into something
  bigger just nudges you away.
- **Grow through scales.** Each galaxy grows you a little. Cross into a new scale (Asteroids,
  Moons, Planets, Stars, Nebulae, Galaxies...) and the camera slowly pulls back to show the bigger
  universe. Your size carries into the next galaxy.
- **Galaxies** each have their own feel: ride Comet Current's rivers, graze Debris Reef, bloom
  stars in Star Meadow, sit in Neutron Forge's pulsar beams for +50%... Every third galaxy is a
  quick, generous breather. Gentle events (with a soft warning first) are explained in Stats >
  "What's that?".
- **Stardust** from each galaxy buys upgrades between galaxies.
- **Your wisp** drifts along with you and now and then floats toward something worth eating.
- **Star map** (title screen or Stats): a star for every galaxy you've cleared. Tap one.
- **Pause** (top-left button or Esc / P) for Resume, Settings, Title.

## Settings worth knowing

Zen mode (on by default), Reduce Motion, soft palette, breathing guide, visual quality (Auto drops
detail if the phone needs it), touch style, your wisp's name, and **Save backup** (export a code or
file, import it on another device; the game checks it and asks before replacing anything).

## Install on your phone

1. Open the link above in Chrome (Android) or Safari (iPhone).
2. Android: menu (⋮) > **Add to Home screen** / **Install app**. iPhone: Share > **Add to Home Screen**.
3. It then opens full-screen like an app and works offline. Updates arrive automatically the next
   time you open it online (close and reopen once if you don't see a change).

Your progress lives in the browser on that device. Use Settings > Save backup before clearing
browser data or switching phones.

## Run it locally

ES modules need HTTP (`file://` won't work):

```bash
python3 -m http.server 8080   # or: npx serve
```

Open http://localhost:8080. Add `?debug` to the URL (or use localhost) for the `window.__bh` test hook.

No build step and no dependencies: vanilla JavaScript and canvas. All art is drawn in code.

See [CHANGELOG.md](CHANGELOG.md) for version history.

## Project structure

```
index.html        HUD, title, overlays, star map screen
manifest.json     PWA manifest
sw.js             network-first service worker (offline fallback); bump CACHE_NAME each release
css/game.css      all styling
js/game.js        main loop, state, camera, tiers/reveals, saves, wiring
js/tiers.js       the scale ladder (names, sizes, food mix per scale)
js/entities.js    object types and the seven biomes
js/living-world.js  gravity, spawning around the view, gentle events
js/worlds.js      per-galaxy mechanics and landmarks (follow you as you travel)
js/art.js         painterly code-drawn sprites (cached) and the black hole
js/backdrop.js    four-layer parallax sky
js/render.js      particles, ripples, radar
js/wisp.js        the companion wisp
js/starmap.js     the star map screen
js/audio.js       procedural WebAudio drone, music layers and sounds
js/powerups.js    power-ups
js/progression.js upgrades, stardust, galaxy summary
js/save.js        localStorage save, migration, backup codes
js/ui.js          HUD, stats, settings, codex, shop
js/input.js       thumbstick, follow-finger, mouse, keyboard
```

## License

MIT. All art and sound are generated in code.
