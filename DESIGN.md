# Black Hole: Galaxy Eater — Design & Handoff

Read this first if you're the bot picking up this game. It records what the game is for, the
rules it follows, how it works, and how to ship changes. Current version: **v5.2**
(`VERSION` in `js/game.js`, `CACHE_NAME = "blackhole-v5.2"` in `sw.js`, `SAVE_VERSION = 5` in `js/save.js`).
Live: https://awsumbtech.github.io/blackhole_game/ (GitHub Pages, built from `main` / root).

## 1. Purpose

- This is Brian's **personal** game. It's ad-free, a time-waster he plays to refocus, lower anxiety and bring his heart rate down.
- **It will never be published.** No Play Store, no monetization, no analytics, no accounts. "Production ready" means it feels finished to him, not that it's ready to ship.
- He plays it on a **Samsung Galaxy S25 Ultra**, installed as a PWA from Chrome (Add to Home screen).

## 2. Design rules (non-negotiable)

1. **Calm.** No startles: no screen shake, no white flashes, no sudden loud sounds, no punishing fail states.
2. **Gentle pacing.** Lots of small bites and slow, fine growth.
3. **Clear cues.** Every event gets a ~2.5s soft telegraph (edge glow, breathing ring or gathering light) and a calm caption the first time. Explain anything new in the Stats > "What's that?" codex.
4. **Themed environments.** Each galaxy (biome) has its own palette, nebula, drone chord, pentatonic eat-sound key, signature event and mechanic.
5. **Breather levels.** Every 3rd galaxy (Planet Nursery, Star Meadow) is a short, generous breather.
6. **Polish before adding features.** Brian has said "keep polishing what we have before we build more". Ask him before starting a new feature, and give him numbered options.
7. **Zen mode is on by default and he loves it.** It has no clock, no par or time records, and bumping costs nothing. Never weaken it.
8. A slow 10s breathing pulse (~6 breaths/min) runs through the drone, the biome glow and the hole halo. There's an optional breathing-guide ring.
9. Settings to respect: Reduce Motion, soft palette, breathing guide, visual quality (Auto/High/Lite), touch style.

## 3. Art direction

**Soft and painterly: glows and gradients.** All art is drawn in code (`js/art.js`), with no image assets beyond the icons.
- Lit planets with cloud bands, atmospheres, rings and moons. Stars have coronas, meteors have soft craters, wrecks are muted hulls with warm windows, comets have tapered tails.
- The black hole has a tilted swirling accretion disk, a photon ring, a lensed arc and star lensing.
- Particles are spiral glow streaks. Bloom is used instead of flashes.
- Sprites are painted once into cached canvases (by type, variant and size), with a ~2.5 ms/frame paint budget. Auto quality drops to Lite when frames run long.
- The sky is a four-layer parallax backdrop (`js/backdrop.js`) using each biome's nebula colours.

## 4. Controls

- **Default:** a floating virtual thumbstick. It appears under the thumb anywhere on screen, and dragging further means a faster drift. Let go to coast. This keeps the whole screen visible, which is why Brian asked for it.
- Option: "follow finger" (Settings). Desktop: mouse, or WASD/arrow keys. Pause with Esc/P or the top-left button.
- Code: `js/input.js`.

## 5. Growth system — v5 "Vast"

- **Scale-tier ladder** (`js/tiers.js`, `TIER_STEP = 2.6`): Space Dust → Grit & Pebbles → Asteroids → Comets & Ice → Moons → Planets → Giant Worlds → Stars → Star Systems → Nebulae → Star Clusters → Galaxies → Galaxy Groups → Cosmic Web (and on). Each step is 2.6× the hole radius.
- **Continuous journey.** Each galaxy starts again as fine dust around you, but your size is carried over: the **previous peak is the floor**. A regular galaxy gives about one tier, a breather about half a tier.
- **Tier reveal.** The camera slowly pulls back (~2.5s) while you keep moving. A soft chime plays and a quiet line names the new scale. The music adds one layer per tier, up to six.
- **No edges.** Objects spawn in a band just outside the view and recycle at about 2 view radii, keeping a steady density (~25–40 visible, ~60 nearby).
- Radar is centred on you, with a trail and rim markers for out-of-range landmarks.
- Pacing (v5.1): regular galaxies take ~3–5 min, breathers ~70s.

## 6. The 7 galaxy mechanics (`js/worlds.js`)

| Galaxy | Mechanic | Paired event |
|---|---|---|
| Debris Reef | Teal reefs of rock clusters that regrow after grazing | Meteor Shower reseeds the reefs |
| Comet Current | Rivers of light carry you and comets along | Comet Stream pours comets in upstream |
| Planet Nursery (breather) | The Cradle: a young sun with orbiting planets that leave orbit as you near | Stellar Birth adds worlds |
| Ruined Armada | Brittle hulls crumble when bumped, shedding food | Derelict Flotilla |
| Void Rift | An aurora ribbon where small food keeps appearing | Void Gift draws food toward you |
| Star Meadow (breather) | Star buds bloom over ~30s, and patient bites are bigger | Stellar Birth blooms the nearest meadow |
| Neutron Forge | Sweeping pulsar beams; food eaten inside one gives +50% mass | Gravity Wave widens the beams |

The rhythm runs Reef → Comet → *Nursery* → Armada → Void → *Meadow* → Forge → repeat. Landmarks are seeded by galaxy number. Per-biome `gainK`: Comet 0.85, Forge 0.8, Meadow 1.15.

**Mechanics regenerate ahead of the player (v5.1).** When you travel away, a new same-scale set is built ahead of you, and earlier sets return if you go back. This fixed Brian's report that Comet Current rivers only existed near the start. Cradle orbiters and Armada hulls also regrow nearby. Any new mechanic must follow you the same way.

## 7. v5.2 features

- **Star map** (`js/starmap.js`, opened from the title screen or Stats): one drifting star per cleared galaxy, coloured by biome and joined by constellation lines. Tap a star for its name, clear date and peak scale. Older saves are back-filled. It only animates while open.
- **Companion wisp** (`js/wisp.js`): breathes, grows with your tier and now and then drifts toward food worth eating as a hint. **Rename it in Settings.**
- **Save backup** (`js/save.js`): export as a code or a .txt file, and import with a checksum and version check plus a confirmation. Progress otherwise lives in the browser's localStorage, and saves carry forward through every version.
- Cleanup: the `window.__bh` test hook only loads on localhost or with `?debug`. The version is shown in Settings.

## 8. Version history (short; full detail in CHANGELOG.md)

- **v1–v2:** core eat-and-grow, stardust upgrade shop (6 upgrades × 5 levels), galaxy summary, stats/records, bigger fish/threats, power-ups (Magnet, Slow-Mo, Double Mass), mid-galaxy saves, PWA fixes.
- **Joystick:** the floating thumbstick became the default.
- **v3.0 Calm & Themed:** Zen default, telegraphed events, Void Gift, biome rhythm with breathers, breathing pulse, codex.
- **v4.0 Feels Finished:** title screen, first-launch intro, drift-in, pause menu, painterly art, new black hole, quality setting.
- **v4.1 Worlds:** the 7 galaxy mechanics, landmarks, pacing.
- **v5.0 Vast:** the tier ladder, no edges, camera reveals, parallax sky, local radar, music layers.
- **v5.1 Polish:** mechanics follow you, regrowth, readable vast food, radar rim markers, pacing.
- **v5.2 Star Map & Wisp:** star map, wisp, save backup, cleanup, README and CHANGELOG. Merged to `main` from `v2-fun-update` (that branch is kept).

## 9. File layout

```
index.html          HUD, title, overlays, star map screen
manifest.json       PWA manifest        sw.js   network-first service worker (CACHE_NAME)
css/game.css        all styling         icons/  icon.svg, icon-192.png, icon-512.png
js/game.js          main loop, state, camera, tiers/reveals, saves, wiring, VERSION (~1.5k lines)
js/tiers.js         scale ladder         js/worlds.js       per-galaxy mechanics & landmarks
js/entities.js      object types, 7 biomes js/living-world.js gravity, spawning, gentle events (CFG)
js/art.js           painterly sprites, black hole   js/backdrop.js  parallax sky
js/render.js        particles, ripples, radar        js/audio.js     WebAudio drone, layers, sounds
js/wisp.js          companion wisp       js/starmap.js     star map
js/powerups.js      power-ups            js/progression.js upgrades, stardust, summary, BREATHER_TARGET
js/save.js          localStorage, migration, backup codes   js/ui.js  HUD, stats, settings, codex, shop
js/input.js         thumbstick, follow-finger, mouse, keyboard
```

Vanilla JS ES modules on canvas, with no build step and no dependencies. Run it locally with `python3 -m http.server 8080`. Add `?debug` to the URL for `window.__bh`, which includes `__bh.perf()`.

## 10. Deploy workflow

1. Work on a branch or on `main`. The box has `gh` logged in as **awsumbtech**. The repo is at `/workspace/repos/blackhole_game`.
2. **Bump `CACHE_NAME` in `sw.js` every version** (and `VERSION` in `js/game.js`). Otherwise the phone keeps serving the old files.
3. Update CHANGELOG.md, and README.md if anything player-facing changed.
4. Push to `main`. Pages rebuilds in about a minute.
5. Verify the live URL serves the new `sw.js` cache name.
6. Take **phone-size screenshots** (about 412×915 portrait, like the S25 Ultra) in the box browser and show them to Brian. Older screenshots are in `/workspace/blackhole_*.png`.
7. Tell Brian to close and reopen the installed app once to pick up the update.

## 11. Lessons

- **Commit and push early and often.** Executor runs got interrupted several times mid-work. Small commits meant nothing was lost. After an interruption, check `git status`/`git log` before redoing anything.
- Confirm scope with Brian before building. Once, "a c and e" was misread, and he wanted the star map, not app polish. Repeat back what you think he picked.
- Test pacing with the bot or `__bh` before handing over. Balance complaints have come up often.
- Keep messages to Brian short, warm and phone-scannable. He has ADD-style focus, so give one clear next step.

## 12. Backlog (awaiting Brian's pick; don't start without asking)

- **App polish** (parked by Brian): proper icon, splash screen, keep screen awake, landscape support.
- Discoveries / logbook
- Achievements and skins
- Photo mode
- Music (fuller soundtrack)
- Pinch zoom on the star map
- Optional gentle vibration (haptics, off by default, subtle)
