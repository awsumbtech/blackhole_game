# Black Hole: Galaxy Eater — Design & Handoff

Read this first if you're the bot picking up this game. It records what the game is for, the
rules it follows, how it works, and how to ship changes. Current version: **v6.0.1**
(`VERSION` in `js/game.js`, `CACHE_NAME = "blackhole-v6.0.1"` in `sw.js`, `SAVE_VERSION = 6` in `js/save.js`).
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
7. **Calm is the default and he loves it.** Since v7.2 the clock, par and time-record code is gone. Ascension has no clock, and bumping costs nothing. Never add them back.
8. A slow 10s breathing pulse (~6 breaths/min) runs through the drone, the biome glow and the hole halo. There's an optional breathing-guide ring.
9. Settings to respect: Reduce Motion, soft palette, breathing guide, visual quality (Auto/High/Lite), touch style.

## 3. Art direction

**Soft and painterly: glows and gradients.** All art is drawn in code (`js/art.js`), with no image assets beyond the icons.
- Lit planets with cloud bands, atmospheres, rings and moons. Stars have coronas, meteors have soft craters, wrecks are muted hulls with warm windows, comets have tapered tails.
- The black hole has a tilted swirling accretion disk, a photon ring, a lensed arc and star lensing.
- Particles are spiral glow streaks. Bloom is used instead of flashes.
- Sprites are painted once into cached canvases (by type, variant and size), with a ~2.5 ms/frame paint budget. Auto quality drops to Lite when frames run long.
- The sky is a four-layer parallax backdrop (`js/backdrop.js`) using each biome's nebula colours.
- **v8 Painterly.** Keep the look premium but calm. Light comes from the upper left.
  - **Planets and moons:** a terminator, limb darkening and an atmospheric crescent (`litSphere`). Hard shapes get a rim light (`rimLight`).
  - **The hole:** doppler beaming on the left side of the disk, a lensed ring that is brighter on the left, wide bloom and a faint shimmer.
  - **Clouds:** painterly puffs with dust lanes. Stars span colour temperatures and twinkle slowly (never blink).
  - **Grade:** vignette plus biome grade as a CSS layer (`#grade`, `js/grade.js`).
  - **UI:** glass panels (`--glass`).
  - **Rules:**
    - Paint every new effect into a cache at paint time; per frame it may only stamp sprites.
    - Keep extras High-only (Lite gets the cheap version), and switch movement off with Reduce Motion.
    - Full-screen effects go in CSS, not canvas: a full-screen canvas blit tipped headless Auto into Lite.
  - **The wisp draws last in the world.** In Zen it stays beside the hole.
- **v8.1 (bolder).**
  - **The hole:** an Interstellar-style thin, wide disk (`DISK_IN` 1.45, `DISK_OUT` 3.6, `TILT` 0.17), with lensed arcs over and under the shadow (`arcSprite`). It must read clearly at phone size.
  - **Skies:** each biome has a painted sky in `js/sky.js` (a style per biome name). New biomes need a style there.
  - **Rivals** use `rivalSprite`; **discoveries** have per-find sprites; **landmarks** use `lmSprite` in worlds.js.
  - **Rules:**
    - Every new visual is painted once and stamped.
    - The sky replaces the background fill (no extra full-screen layer).
    - Glow and extra passes are High only; motion is off under Reduce Motion.
  - **Icons:** regenerate with `python3 tools/make-icons.py`.

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
- Pacing (v5.1): regular galaxies take ~3–5 min, breathers ~70s. **Brian likes these durations; keep them.** v6 made bites bigger and retuned gains per galaxy (`MEATY.byBiome` in `js/game.js`) so bot clear times match v5.2 within ~10% (bot baseline: Reef 174s, Comet 267s, Nursery 93s, Armada 255s, Void 213s, Meadow 82s). v6 bot result: Reef 176s, Comet 253s, Nursery 97s, Armada 268s, Void 200s, Meadow 85s. Breathers and Armada are bite-ceiling-bound (`MEATY.capBiome`). Re-run the bot after any pacing change (it can start at any galaxy by seeding a save with that galaxy and floorMass).

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

## 7b. v6.0 features ("Next Level")

- **Meatier bites:** food 12–30% of your radius (was 8–22%), ~44 objects around the view (was 60; breathers 52). Each bite swells the hole a touch (`gulp`). Per-galaxy gain factors keep clear times unchanged.
- **Big catches:** bigger fish get a soft gold halo from 82% of their size (`BIG_HALO_FROM` in `js/render.js`), steady once edible. Eating one is a ~1s smoothstep swirl (`e.swallow`) with a warm chime in the biome key. No shake.
- **Discoveries** (`js/discoveries.js`): 21 finds, 3 per biome. Planted at ~35s and ~120s (breathers: one at ~22s) just off-screen ahead of you, re-planted ahead if you wander >4.5 view radii away (they follow the player). Cue: soft edge glow fading in over ~2.5s, the wisp leaning toward it, and a one-time caption. Not food. Saved in `records.discoveries` (SAVE_VERSION 6; older saves migrate with `{}`).
- **Logbook** (`js/logbook.js`): opened from the title screen or Stats. Found entries show name, line and when; unfound show "???" per biome.
- **Wisp:** `wispReact(state, "catch"|"discovery")` twirls it; in breathers it rests close with a slow curl and gives no hints; it perks up near a discovery (`state.discoveryNear`).
- **Melodic bites** (`js/audio.js`): an 8-note pentatonic phrase in the biome key, one note per bite, one note drifts every 12 bites, restarts after a 2.5s pause, new phrase per galaxy (`newPhrase`). Bite volume lowered.
- **End-of-galaxy ritual:** new transition phase `ritual` between `implode` and `summary`. The star map opens in ritual mode: the newest star drifts up and settles (Reduce Motion: fades in place), one line about discoveries or best catch, a low slow chord. Tap after 1.2s or wait ~7.5s.
- Codex: four new "What's that?" entries (golden halo, shimmer, wisp, a new star).

## 7c. v7.0 — two modes, each with one job

**Ascension (the game).** Purpose: a deep, satisfying long-term climb. You always have a next
goal (the next galaxy, the next star rating, the next constellation node, the next milestone),
and every collapse makes you visibly stronger. It is still calm: no clock, no loss, nothing
punishes. Ascension replaced the old non-Zen mode and absorbs the old journey (saves migrate).

**Zen session (the refocus tool).** Purpose: 3, 5 or 10 minutes to reset attention, then get
back to real life. It must never trap Brian. No rewards, streaks, Dark Matter, "one more" button
or saves. It ends with three slow breaths and "What's the one thing you're doing next?" (optional,
kept locally only), then a send-off back to the title.

### Prestige design (`js/ascension.js`, `js/rivals.js`, `js/constellation.js`)
- **Run depth** = galaxy number in the current run. Per depth d:
  - growth needed ×`1.18^(d-1)` (`DEPTH.CLIMB_GROWTH`; breathers ×0.85 of that with Cradle).
  - food density `1 - 0.035(d-1)`, floor 0.62.
  - calm rival holes from depth 3: 1 + floor((d-3)/2), max 3, size 1.5 + 0.12(d-3) × yours.
    Rivals eat food and ease you aside. They never take mass. Once outgrown they turn gold and
    can be swallowed.
- **Collapse** (pause menu or summary, from 3 cleared). Resets the run to Galaxy 1 and the stardust
  shop. Dark Matter = `3·cleared^1.5 + 2·peakTier` + finds bonus (f6) + 5/golden galaxy, × Fortune.
  Depth 6 ≈ 58 DM, depth 10 ≈ 115, depth 15 ≈ 205.
- **Constellation:** 27 nodes in three branches (Reach, Appetite, Fortune). There are 7 tiers per
  branch. Tiers 3 and 5 are forks: the two options pull different ways, so buying one is a real
  choice. Tier costs are 8 / 16 / 28 / 45 / 70 / 100 / 150. There are also 7 galaxy perks, earned
  with 3 stars on that galaxy's goal.
- **Stardust stays** as the in-run currency for the 6 shop upgrades. The shop is the short-term
  "this run" layer and resets on collapse. Dark Matter is the permanent layer. Keeping both gives
  every galaxy a reward and every collapse a bigger one. Milestones and Fortune let some
  upgrades survive a collapse.
- **Galaxy goals:** each biome has its own goal (graze reefs, ride rivers, eat orbiting worlds,
  hull crumbs, aurora bites, full blooms, bites in beams), rated 1–3 stars. The best rating is kept.
- **Milestones** by collapse count:

  | Collapses | Unlock |
  |---|---|
  | 1 | golden galaxies (8%, ×3 stardust) + Ember skin |
  | 2 | keep Seed Mass |
  | 3 | supernova runs (12% of runs, bites ×1.5) + Aurora skin |
  | 4 | deep variants |
  | 5 | head start |
  | 6 | Pearl skin |
  | 8 | keep all upgrades |

- **Tuning numbers** (`tools/collapse-sim.mjs`, run `node tools/collapse-sim.mjs`):
  - Bot time ≈ v6 base × climbK^0.72, a fit to v7 bot runs at depths 1–7. Humans are about 1.2× the bot.
  - The wall is reached when the next galaxy would take more than 9.5 minutes.

  | Cycle | Depth | Min | DM | Perks | Power |
  |---|---|---|---|---|---|
  | 1 | 6 | 30 | 58 | 0 | 1.00 |
  | 2 | 8 | 39 | 103 | 5 | 1.29 |
  | 3 | 10 | 44 | 140 | 9 | 1.57 |
  | 4 | 10 | 37 | 140 | 13 | 1.88 |
  | 5 | 10 | 35 | 183 | 15 | 2.00 |
  | 6 | 13 | 49 | 264 | 18 | 2.27 |
  | 7 | 13 | 46 | 264 | 21 | 2.40 |
  | 8 | 15 | 48 | 450 | 24 | 3.23 |
  | 9 | 17 | 43 | 806 | 27 | 4.75 |

  The tree fills in about 9 collapses (about 6 hours). After that, galaxy stars, milestones and skins carry it.

### Zen design (`js/zen.js`)
- **Arc:**
  - settle: 0–15%, food builds up.
  - flow: 15–75%.
  - wind-down: 75–100%. Food thins, the music layers drop and one held note resolves.
  - A thin arc at the top of the screen is the only clock.
- **Breath pull:** about 6 breaths a minute (`BREATH_MS`). Gravity is ×(1 − 0.6·sin): things drift
  out on the inhale and come in on the exhale. The breathing guide ring is always on.
- **Exit:**
  1. Three guided breaths (4 s in, 6 s out). They can be skipped.
  2. The question, which can be skipped.
  3. "Go do it." / "Go gently."
  4. A single "Back to the title" button.

  The journey is snapshotted before a session and restored after it, untouched.

## 7d. Audio rules (v7.1). Read `docs/AUDIO_RESEARCH.md` before touching sound

Brian got headaches from the v7.0 drone. Follow these rules for any new sound:
- Sine waves only, with no detune, no LFO and no chorus. Overlapping tones must be exact just-intonation
  consonances, at least a fourth apart.
- Music is sparse and slow: one note every 5.5 s or more, with fade-ins of seconds. Leave silence.
- Keep the whole mix under a 1.8 kHz lowpass (ear-sensitive band) and above 150 Hz (phone speakers).
- The bed is brown noise (surf), not a synth drone.
- Effects: fade-in of at least 20 ms, in the key. Don't add new loud cues.
- Music and Effects have separate volumes. Defaults stay low.
- Check every audio change with `tools/audio-analyze.py`: peak, RMS, centroid, 2–5 kHz energy, and
  envelope roughness.

## 7e. Code style (v7.2)

The code should read the way a veteran game programmer would write it: lean and direct.
- No classes, frameworks or build step. Plain modules and plain objects.
- **Hot loops** (`frame`, `updateEntities`, `updateGravityWell`, `tryConsume`, `draw*`) must not
  allocate. That means no array literals, closures, template strings or `splice` per frame.
  - Cache strings on the object (`e._mc`, `lm._mm`).
  - Compact arrays in place.
  - Use the local 2-argument `hypot`.
- **Entities have one shape.** Every field written in hot code is declared in `createEntity`
  with a default that means "unset". Don't add new per-entity fields elsewhere; add them there.
- Use `$()` for `getElementById`.
- Check changes with `/workspace/bhpt/perfbench.py` (frame time, allocation rate and garbage
  collections, plus optional CPU and allocation profiles) and `smoke_all.py` (every screen).
  - Save migration is checked by `migcmp.mjs`, which must produce identical output to the
    previous version.

Measured for v7.2 at Galaxy 5 (Void Rift, depth 5), 412×915 at DPR 2, headless Chromium, 3 runs of 20 s each:

| | v7.1 | v7.2 |
|---|---|---|
| JS frame time, average | 0.95–1.23 ms | 1.12–1.17 ms (same within noise) |
| JS frame time, p95 | 1.3–1.7 ms | 1.4–1.5 ms |
| Allocation rate | 3.5–3.7 MB/s | 1.95–2.1 MB/s |
| Garbage collections per 20 s | 62–73 | 29–32 |
| Load to title | 0.38–0.50 s | 0.37–0.45 s |

## 8. Version history (short; full detail in CHANGELOG.md)

- **v1–v2:** core eat-and-grow, stardust upgrade shop (6 upgrades × 5 levels), galaxy summary, stats/records, bigger fish/threats, power-ups (Magnet, Slow-Mo, Double Mass), mid-galaxy saves, PWA fixes.
- **Joystick:** the floating thumbstick became the default.
- **v3.0 Calm & Themed:** Zen default, telegraphed events, Void Gift, biome rhythm with breathers, breathing pulse, codex.
- **v4.0 Feels Finished:** title screen, first-launch intro, drift-in, pause menu, painterly art, new black hole, quality setting.
- **v4.1 Worlds:** the 7 galaxy mechanics, landmarks, pacing.
- **v5.0 Vast:** the tier ladder, no edges, camera reveals, parallax sky, local radar, music layers.
- **v5.1 Polish:** mechanics follow you, regrowth, readable vast food, radar rim markers, pacing.
- **v5.2 Star Map & Wisp:** star map, wisp, save backup, cleanup, README and CHANGELOG. Merged to `main` from `v2-fun-update` (that branch is kept).
- **v8.1 Painterly, bolder:** Interstellar hole, painted per-biome skies, detailed sprites, spaghettification, reveal ring, violet rivals, unique discoveries, richer landmarks, new icon + splash.
- **v8.0 Painterly:** graphics uplift (doppler disk, bloom, painterly nebulae with dust lanes, coloured twinkling stars, planet terminators/scattering, vignette + grade, glass UI); wisp drawn on top, stays beside the hole in Zen.
- **v7.2 Lean:** refactor with no gameplay change. Cut the dead Zen/timed toggle and its timer, par and bump-loss code, Reset All, shake and unused code. Hot loops are allocation-light (about 40% less garbage). Fixed the hidden Settings Done button on the title screen.
- **v7.1 Calm Sound:** research-based audio rebuild (surf bed, sparse just-intonation sines, 1.8 kHz lowpass, Music/SFX sliders). No ring in Zen; the wisp breathes 4 in / 6 out.
- **v7.0 Ascension + Zen:** prestige loop (collapse → Dark Matter → constellation), galaxy goals, rivals, milestones, golden/supernova/rare finds; Zen sessions with breath pull and a clean exit. Save v7.
- **v6.0.1 Softer Sound:** all effects softened (lower bites, slow attacks, sine/triangle only, 1.6 kHz lowpass, compressor and limiter). **Brian wants soft audio: keep new sounds this gentle.**
- **v6.0 Next Level:** from a bot playtest. Meatier bites (same clear times), big-catch halo + slow swallow, discoveries + logbook (save v6), livelier wisp, melodic bites, end-of-galaxy ritual. Built on `main`.

## 9. File layout

```
index.html          HUD, title, overlays, star map + logbook screens
manifest.json       PWA manifest        sw.js   network-first service worker (CACHE_NAME)
css/game.css        all styling         icons/  icon.svg, icon-192.png, icon-512.png
js/game.js          main loop, state, camera, tiers/reveals, saves, wiring, VERSION (~1.5k lines)
js/tiers.js         scale ladder         js/worlds.js       per-galaxy mechanics & landmarks
js/entities.js      object types, 7 biomes js/living-world.js gravity, spawning, gentle events (CFG)
js/art.js           painterly sprites, black hole   js/backdrop.js  parallax sky
js/grade.js         v8 vignette/grade (CSS layer)   js/sky.js  v8.1 painted biome skies
js/render.js        particles, ripples, radar        js/audio.js     WebAudio drone, layers, sounds
js/wisp.js          companion wisp       js/starmap.js     star map + end ritual
js/discoveries.js   rare finds (v6)      js/logbook.js     logbook screen (v6)
js/ascension.js     v7 prestige logic    js/constellation.js perk screen
js/rivals.js        calm rival holes     js/zen.js          Zen sessions + exit
tools/collapse-sim.mjs  collapse-curve model (node)   tools/audio-analyze.py  offline audio render + metrics
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
- Achievements
- Photo mode
- Music (fuller soundtrack)
- Pinch zoom on the star map
- Optional gentle vibration (haptics, off by default, subtle)
- From the v6 playtest (not built yet): quieter combo counter (hide numbers above ×25; combo stardust is overweighted), make upgrades feel visible, fewer repeat events per galaxy (no back-to-back repeats), give Magnet a purpose, slightly bigger/brighter late-tier food on phone
- Discoveries follow-ups: radar marker for a near find, more finds per biome, a logbook "complete a biome" moment
