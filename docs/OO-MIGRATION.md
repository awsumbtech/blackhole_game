# Vast: object-oriented migration

Docs only. This is the checklist for Brian's direction: every behaviour is an object, and every visual is a real picture that object draws. No code-painted sprites, no code-drawn effects, and no code tints or gradients.

Live tree this list was taken from: `e93b0f2` (v9.7.3). Nothing here is started.

Checkboxes stay open until that item's PR lands on `main`. Each conversion is its own PR, based on `main`, not stacked on the one before it.

Phone for the size column: 390×844 CSS pixels, device pixel ratio 3 (the S25 Ultra). The hole's on-screen radius is `HOLE_PX` (13) times a fit factor. On this phone the factor is about 0.93, so the hole radius is about **12 CSS px / 36 device px**. A sprite's on-screen width is roughly `extent × 2 × (its radius ÷ the hole's radius) × 12` CSS pixels, then ×3 for device pixels. "Asset px" is the frame we should paint, about twice the device size, so it stays sharp. A big catch is about 1.3× the hole when the gold cue is on (up to about 2.2× while it is still too big to eat).

The gold cue today is a filled disc (`js/render.js` around lines 168–183). It does not become its own traced outline. The artist paints that gold edge **into** each catchable object's sheet, as its own frame. The object draws that frame. Code does not dilate, tint, or blur it.

## Already real images

These stay. They are not conversion work, except where code still composites them.

- [x] Galaxy backdrops, one JPEG per biome. `js/core/Backdrop.js` 10–32. Files: `assets/backdrop_reef.jpg`, `current`, `nursery`, `armada`, `void`, `meadow`, `forge`. Full screen, 390×844 CSS, so **1170×2532 device px**. Owner stays `Backdrop`.
- [x] Golden sky veil. `js/core/GoldenVeil.js` 6–7. `assets/sky/golden_veil.jpg`, full screen, screen blend at 0.35. Same pixel size as a backdrop.
- [x] Eat-shard masks, four PNGs. `js/core/DebrisField.js` 25. `assets/fx/shard_mask_1.png` through `_4.png`, plus the source sheet `assets/fx/source/shard_masks_sheet.jpg`. The masks are pictures. The way they are cut onto a sprite is still code (see B17).
- [x] App icons. `icons/icon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`. Not gameplay.

---

## A. Code that is not yet an object

Loose functions, module-level `let`/`Map`s, and god-functions. A file that already has a class is listed only for the part that is still loose.

### A1. Boot and the composition root

- [ ] `js/game.js` 24–143. Builds every system by hand, defines `impact()` (39–43) as a loose function, and publishes `window.__bh` (130–141) for tests.
- **Moves into:** `Game`, a class whose constructor does this wiring. `impact` becomes `Game.impact`. `__bh` stays a debug view of that one instance.
- **Depends on:** every system below, `save`, `audio`, `wisp`, `living-world`, `worlds`.

### A2. The state bag

- [ ] `js/core/GameState.js` 11–59. `createState()` returns one plain object. Save, the loop, and every system read and write its fields.
- **Moves into:** keep one `GameState` object, but as a class with grouped fields (run, camera, settings) instead of a flat literal. Not a rewrite of the save format.
- **Depends on:** `save.js` (which persists part of it).

### A3. Drawing god-function

- [ ] `js/render.js` 13–27 module colour state (`TOO_BIG_RGB`, `BIG_HALO_FROM`, `setHaloFrom`, `setSoftPalette`).
- [ ] `js/render.js` 31–197 `drawEntities`. One loop paints every food type, the gold disc, the too-big ring, heat streaks, and the swallow stretch.
- [ ] `js/render.js` 199–211 `swallowGlow` plus a module canvas.
- [ ] `js/render.js` 219–267 `drawPowerupPickup`.
- [ ] `js/render.js` 269–275 `drawBlackHole` (a wrapper around `art/hole.js`).
- [ ] `js/render.js` 278–324 `drawParticles`, `drawRipples`.
- [ ] `js/render.js` 333–459 minimap, edge arrows, mouse cursor, and the `TRAIL_STYLES` / `edgeE` module caches.
- **Moves into:** each type's object draws itself. `Scene` keeps only the order. The gold disc and the too-big ring leave this file when the catchable objects own those frames (B20, B21).
- **Depends on:** `art/sprites.js`, `ships.js`, `CometTail`, `depth.js`.

### A4. Ships are functions, not a Ship

- [ ] `js/ships.js` 21–57 `shipExtent`, `shipClassFor`, `adoptShip`, `setWreck`, `upgradeShip`, and the module `bounce` / `lightKey` (54–57).
- [ ] `js/ships.js` 91–199 `design()` plus the `designs` Map. Module-level RNG builds a parts list per class and look.
- [ ] `js/ships.js` 226–421 `paintShip`. Code-draws the hull.
- [ ] `js/ships.js` 423–464 `glow()` and `piecesFor()`. Module canvases for the engine glow and the four break-apart plates.
- [ ] `js/ships.js` 466–509 `drawShip`. Heading, the vertical flip when a living ship faces left, engine glow, and the eaten-ship plates.
- **Moves into:** `Ship` (the first PR). One instance per craft entity. Art comes from a sheet, not `paintShip`.
- **Depends on:** `art/sprites.js` (today), later `SpriteSheet`. Callers: `render.js` 130–132, `living-world.js` `adoptShip`, `worlds.js` `addHull` / crumbs, `depth.js` samples.

### A5. Sprite cache and painters

- [ ] `js/art/sprites.js` 14–20 module cache, frame counter, and paint budget. `spriteFor` (79) and `paint` (110) pick a painter and draw a canvas.
- [ ] `js/art/kit.js`. Shared code paints: shade, craters, blobs, rings, atmosphere. Every painter below uses it.
- [ ] `js/art/dust.js`, `rocks.js`, `comets.js`, `planets.js`, `stars.js`, `deepsky.js`. One painter function per type.
- [ ] `js/art/quality.js` 3–26. `artCache()`, `quality`, `cacheGen`, `bucketFor`. This registry can stay; it is already a small object. Painters must stop calling it to store generated canvases.
- **Moves into:** `SpriteSheet` (load and draw a picture) plus one class per type. `kit.js` goes away as each painter is deleted.
- **Depends on:** the entity's `type`, `look`, `variant`, `seed`.

### A6. The hole is module state

- [ ] `js/art/hole.js` 16–230 `colAt`, `diskTexture`, `arcSprite`, `dopplerSprite`, `bloomFor`, `holeSprites`. Caches and module spin angles (140–142).
- [ ] `js/art/hole.js` 232–355 `drawDisk`, `drawDoppler`, `drawBlackHoleArt`.
- [ ] `js/art/hole.js` 252–255 `shadowRadius`. 357–394 `drawRevealFx`, `warmHole`.
- **Moves into:** `BlackHole`. `shadowRadius` stays a method other systems may call (the debris field uses it).
- **Depends on:** `Camera` zoom, `breathPhase`, gulp, settings (magnet, breath guide, reduce motion, skin).

### A7. Entities are plain objects with loose functions

- [ ] `js/entities.js` 16–105 factories: `rand`, `pickRandom`, `weightedType`, `createEntity`, `getBiome`.
- [ ] `js/entities.js` 114–159 `updateEntities`. Moves, drifts, and bounces every entity in one loop. Ships steer here (121–126) instead of on a Ship.
- **Moves into:** `Entity` as the base, with `Ship`, `Planet`, and the rest overriding `update`. `BiomeTable` owns `getBiome`. `createEntity` becomes a factory on that table.
- **Depends on:** `js/data/objects.js`, `js/data/biomes.js`.

### A8. Worlds is one module-level universe

- [ ] `js/worlds.js` 105–126 `initWorlds` / `buildSet`. A module `W` holds the current reefs, rivers, cradle, aurora, flagship.
- [ ] `js/worlds.js` 328–356 `updateWorlds` and the helpers under it (orbits, rivers, beams, buds).
- [ ] `js/worlds.js` 250–260 `addHull` (Armada big-catch wrecks). 625–657 `onWorldBump` (crumbs).
- [ ] `js/worlds.js` 733–1006 drawing: `glow`, `lmSprite`, `drawGlow`, `drawWorldsBG`, `drawWorldsOverlay`. Code-drawn rivers, beams, cradles, meadows, auroras.
- [ ] `js/worlds.js` 1013–1075 `drawWorldsMinimap`.
- **Moves into:** `World`, with one small class per mechanic (`River`, `Reef`, `Cradle`, `Aurora`, `Meadow`, `Pulsar`). `Flagship` already exists and stays.
- **Depends on:** `entities`, `ships`, `Flagship`, `art/sprites.js`.

### A9. Living world and events

- [ ] `js/living-world.js` 63–111 module `world`, `initLivingWorld`, `updateLivingWorld`, `drawLivingWorldFG`.
- [ ] `js/living-world.js` 204–267 `spawnScaled`, `spawnFood`, `spawnBigFish`. This is where most `bigFish` flags are set (261).
- [ ] `js/living-world.js` 640–658 the stellar-birth big star (`star.bigFish = true`).
- [ ] The event table and `fireEvent` further down the same file. Events are data plus closures, not objects.
- **Moves into:** `LivingWorld`. Each event becomes a small class with `update` and `draw`. Spawning goes through the entity factory.
- **Depends on:** `entities`, `ships`, `tiers`, `powerups`, `audio`.

### A10. Discoveries

- [ ] `js/discoveries.js` 61–121 `initDiscoveries`, `plantAhead`, `updateDiscoveries`.
- [ ] `js/discoveries.js` 123–196 `findSprite` and `tail`. A `Map` and a module canvas, painted from the find's id.
- [ ] `js/discoveries.js` 198–243 `drawDiscoveries`, `drawDiscoveryCue`.
- **Moves into:** `Discovery`, one per planted find. The 21 definitions stay data.
- **Depends on:** `CometTail` today. After the comet art PR, the find uses its own sheet, including the tail frame.

### A11. Wisp

- [ ] `js/wisp.js` 29–38 `makeRadial` paints the glow with a gradient. The class `Wisp` (40) is real, but the body is still a code drawing, and 291–295 re-export a module singleton.
- **Moves into:** keep `Wisp`. Replace `makeRadial` with a sheet. The singleton becomes the one `Wisp` the game owns.
- **Depends on:** `state.asc` (Companion perk), breath, `discoveries` (lean toward a find).

### A12. Input

- [ ] `js/input.js` 9–180 `createInput`. A closure over keys, mouse, and the thumbstick. Not a class.
- **Moves into:** `Input`.
- **Depends on:** the canvas element, `Display` size. `Player` reads `getMovement`. `ScreenOverlay` draws the stick from this state.

### A13. Audio

- [ ] `js/audio.js` 13–24 and 126–210. Module WebAudio nodes, the bed, the phrase, and the bite note. Functions all the way down (`startDrone`, `blip`, `playSwell`, and the rest).
- **Moves into:** `Audio`. Music bed, bite phrase, and swell are methods. No picture work.
- **Depends on:** biome `sound` data, `breathPhase`, settings volume.

### A14. Save

- [ ] `js/save.js`. `save`, `load`, version migration, and the backup code. Loose functions around `localStorage`.
- **Moves into:** `SaveGame`, used by `Lifecycle` and `Menus`. The save version stays 9 until a real migration needs a bump.
- **Depends on:** `GameState`.

### A15. Progression, tiers, ascension

- [ ] `js/progression.js`. Run records and goal checks as functions.
- [ ] `js/tiers.js`. `TIERS`, `foodWeights`, `bigWeights`, `eventBigType`, `fitType`. Pure data plus loose selectors. The data can stay data. The selectors move onto `TierTable`.
- [ ] `js/ascension.js` 25–242. `dmFor`, `buyPerk`, `ascMods`, `rollGolden`, `rollSupernova`, milestones. No class.
- [ ] `js/core/breath.js` 5–9 `breathPhase`. One function. Fine as a method on `Clock` or left as a pure function if it stays pure. Listed so it is a choice, not an accident.
- **Moves into:** `Ascension` and `TierTable`. `RunTracker` already calls them; it should own the calls, not reach into loose modules.
- **Depends on:** `GameState.asc`, biome goals.

### A16. Depth layers

- [ ] `js/depth.js` 29–193. Module caches (`typesCache`, `blurCache`, `samples`), `blurFor` (paints a blurred copy with `filter`), `drawDepth`, `startMerge`.
- **Moves into:** `DepthField`. Blur copies go away when the far layer uses a pre-softened frame from the sheet.
- **Depends on:** `tiers`, `spriteFor`.

### A17. Rivals

- [ ] `js/rivals.js` and `js/art/rival.js` 9–66 `rivalSprite`. Rival motion is functions. The hole picture is a code-painted canvas, two states (too big, and edible gold).
- **Moves into:** `Rival`, using the same `BlackHole` sheet with a second palette rather than a second painter.
- **Depends on:** `Feeding` (swallow), `Player`.

### A18. Power-ups

- [ ] `js/powerups.js` definitions and timers. `render.js` 219–267 draws the pickup as a code glyph.
- **Moves into:** `PowerUp` with three pictures (magnet, slow, double).
- **Depends on:** `Feeding`, `Hud` timer pills (those pills are DOM in `ui.js` 174–200 and can stay DOM).

### A19. DOM screens that are still loose

- [ ] `js/ui.js` 14–202. `showStats`, the codex string `V6_CODEX` (22), `updatePowerupBar`, backup bindings. No class.
- [ ] `js/logbook.js`. Loose open/draw of the logbook.
- [ ] `js/constellation.js` 12–184. Module `asc`, `nodes`, `dust`, and a canvas `draw` (64) of nodes and a dust field.
- [ ] `js/starmap.js`. Canvas star map, loose functions.
- [ ] `js/grade.js` 9–17 `setGrade`. A code colour grade over the frame.
- **Moves into:** `StatsView`, `Logbook`, `Constellation`, `StarMap`. `Hud` already exists for the DOM bar. `grade.js` is deleted when the backdrops already carry their colour.
- **Depends on:** `Ascension`, `Menus`.

### A20. Service worker

- [ ] `sw.js` 1–140. `CACHE_NAME`, a hand-written `ASSETS` list, install/activate/fetch. Not an object, and the list is how a phone keeps old files.
- **Moves into:** leave it a worker (it cannot be a game object). The change is the policy: precache the shell and the current galaxy only. New art is not added to `ASSETS` by default.
- **Depends on:** every file the game loads.

### A21. Already a class, but still painting or holding module pictures

These are objects. They stay. The picture work inside them is section B.

- `Inflow` (`js/core/Inflow.js` 46–70) builds streak, dot, and bloom canvases in the module.
- `Flagship` (`js/core/Flagship.js` 47–115) lays out and paints a capital wreck in code, then caches it.
- `DebrisField` composites sprites through mask images.
- `CometTail` is a real object. It still blits a code-painted tail from `art/comets.js`.
- `Scene`, `Player`, `Feeding`, `Camera`, `GameLoop`, `Hud`, `ScreenFlow`, `ZenSession`, `CollapseFlow`, `PlayControls`, `Menus`, `Lifecycle`, `Settings`, `PerfMonitor`, `Growth`, `Galaxy`, `GalaxyFlow`, `Fx`, `DevMode`, `Display`, `ScreenOverlay` are classes. They are not in the conversion list except where they call a loose painter.

---

## B. Visuals that are still drawn in code

Sizes use the phone formula at the top. "Big-catch frame" means the artist paints the gold edge in the sheet. Code never builds it.

### The hole

- [ ] **Accretion disk, photon ring, lensed arc, doppler brightening, outer glow, warm bloom.** `js/art/hole.js` 25–230 (paint), 261–355 (draw). Two palettes, `calm` and `double` (6–10). Spin is two layers. Reduce Motion stops the shimmer.
  - **Looks:** 2 palettes. Not a per-seed shape.
  - **Size:** core radius 12 CSS / 36 device px. Disk out to 3.6 radii, about 94 CSS / 280 device px across. Glow to about 4.6 radii, about 110 CSS / 330 device px.
  - **Asset px:** one hole sheet, 640×640 per palette, the disk filling the frame.
  - **Owner:** `BlackHole`.
  - **Asset:** `hole-calm.webp` and `hole-double.webp`, 8 spin frames each. No code gradient on top.

- [ ] **Shadow and the eat-rim.** `shadowRadius` `js/art/hole.js` 252–255, drawn with the ring sprite at 333–336. Gulps up to about 8% bigger. Reduce Motion skips the gulp.
  - **Size:** about 1.3× the core, 16 CSS / 47 device px radius.
  - **Asset px:** included in the hole sheet (the black centre).
  - **Owner:** `BlackHole`.

- [ ] **Tier-reveal flash.** `drawRevealFx` `js/art/hole.js` 358–393. A ring and a bloom that open and fade. `still` draws a quieter ring.
  - **Size:** up to about 14× core radius, ~170 CSS / 500 device px across.
  - **Asset px:** 512×512, 6 frames.
  - **Owner:** `BlackHole` (reveal state).
  - **Asset:** `hole-reveal.webp`.

- [ ] **Magnet ring and breath-guide ring.** `js/art/hole.js` 285–303. Dashed gold circle, or a faint blue breath circle. Never in Zen.
  - **Size:** magnet at `pullRange` (several hole radii, often most of the width). Breath guide about 4–5 radii, ~100 CSS / 300 device px across.
  - **Asset px:** a 256×256 ring, tiled or one soft circle scaled up.
  - **Owner:** `BlackHole`.
  - **Asset:** `ring-magnet.png`, `ring-breath.png`.

### Ships and the Flagship

- [ ] **Five ship classes, eight looks, live and wreck.** `paintShip` `js/ships.js` 226–421. `drawShip` 466–509. Classes: drone, shuttle, freighter, cruiser, capital (`19`). Extent 1.45–1.55. Wrecks are darker and punched with holes (368–390). Living ships flip vertically when facing left (485–488) and show a breathing engine glow (490–500). Eaten ships split into 4 plates (437–464, 468–482).
  - **Looks:** 5 × 8 × 2 = 80 bodies. Scrap crumbs are a sixth class, one shape (`extent` 1.2), not a big catch.
  - **Size:** a morsel is about 18 CSS / 54 device px long. A big catch at 1.3× is about 50 CSS / 150 device px long.
  - **Asset px:** 320×320 per frame.
  - **Owner:** `Ship`.
  - **Asset:** one sheet per class. Rows: 8 looks. Columns: live, wreck, live gold-edge, wreck gold-edge, 4 break plates, engine glow. The gold edge is the big-catch frame. `Ship` draws it when `bigFish` and the player is past `BIG_HALO_FROM`. Nearly-fits pulses the opacity of that frame on the breath. Fits draws it steady and a little brighter. No second image is generated in code.

- [ ] **Flagship.** `js/core/Flagship.js` 47–115 layout, paint through the class. One capital wreck, 4 hull colours, time-sliced onto a canvas, then one blit. It is a landmark, not food.
  - **Looks:** 4.
  - **Size:** `flagship.size` is 0.16 of the set (`js/data/worlds.js`). On screen it is a large wreck, often 80–140 CSS / 240–420 device px.
  - **Asset px:** 1024×512.
  - **Owner:** `Flagship` (already a class).
  - **Asset:** `flagship.webp`, 4 looks. No gold-edge frame (it is not eaten as a big catch).

### Worlds you eat

Extents are from `js/art/sprites.js` 55–68. Look counts from line 45.

- [ ] **Dust.** `js/art/dust.js`. 8 looks. Soft specks. Extent 1.6.
  - **Size:** morsel about 10 CSS / 30 device px.
  - **Asset px:** 64×64.
  - **Owner:** `Dust`.
  - **Asset:** `dust.webp`, 8 frames. Not a big catch.

- [ ] **Junk.** `js/art/rocks.js` junk painter. 10 looks. Tumbles (a sway, not a spin). Extent 1.3.
  - **Size:** morsel about 8 CSS / 24 device px. Big catch about 42 CSS / 126 device px.
  - **Asset px:** 256×256.
  - **Owner:** `Junk`.
  - **Asset:** `junk.webp`, 10 looks × (body, gold-edge). Junk is a big catch at the first tiers (`tiers.js` 14–16).

- [ ] **Meteor.** `js/art/rocks.js`. 12 looks. Tumbles. Hot entry streak when `e.hot` (`render.js` 80–94, `heatFor` in `rocks.js` 33). Extent 1.4.
  - **Size:** morsel about 8 CSS / 25 device px. Big catch about 45 CSS / 135 device px. Streak about 6–10 radii long.
  - **Asset px:** 256×256 body, streak on the same sheet.
  - **Owner:** `Meteor`.
  - **Asset:** `meteor.webp`, 12 looks × (body, gold-edge, hot streak).

- [ ] **Comet body and tail.** Body `js/art/comets.js`. 6 looks. Tail `CometTail.drawComet` `js/core/CometTail.js` 64–79, pictures from `tailFor` in `comets.js` (dust tail, ion tail, and a hot streak). Extent 2.3. The tail aims from the comet's own world step.
  - **Size:** head about 14 CSS / 42 device px as a morsel, about 70 CSS / 210 device px as a big catch. Tail about 5–9 head-radii long.
  - **Asset px:** 256×256 head, tail 512×128.
  - **Owner:** `Comet`. It keeps a `CometTail`, which becomes a frame index instead of a code blit.
  - **Asset:** `comet.webp`, 6 looks × (head, gold-edge, dust tail, ion tail).

- [ ] **Moon.** `js/art/planets.js` 33. 12 looks (6 kinds). Craters, no air. Extent 1.3.
  - **Size:** big catch about 42 CSS / 126 device px.
  - **Asset px:** 256×256.
  - **Owner:** `Moon`.
  - **Asset:** `moon.webp`, 12 × (body, gold-edge).

- [ ] **Planet and rings.** `js/art/planets.js` 30–end. 30 looks, 4 variants. Rings on some (`ringedPlanet`, line 7). Extent 1.35, or 1.65, or 2.05 with a ring. Variant and look change the silhouette.
  - **Size:** big catch about 44–80 CSS / 130–240 device px across, rings included.
  - **Asset px:** 512×512.
  - **Owner:** `Planet`.
  - **Asset:** `planet.webp` is too big as one file. One sheet per 10 looks. Columns: body, gold-edge. Rings are in the picture, not a code ellipse.

- [ ] **Star.** `js/art/stars.js` 34. 12 looks, one spectral type each (`SPEC_OF`, line 15). Corona and rays. Extent 2.7.
  - **Size:** big catch about 84 CSS / 250 device px across the corona.
  - **Asset px:** 512×512.
  - **Owner:** `Star`.
  - **Asset:** `star.webp`, 12 × (body, gold-edge). The stellar-birth event (`living-world.js` 654) uses this same sheet.

- [ ] **Neutron star.** `js/art/stars.js` 18–30. One shape: a bright core, a glow, a tilted ring. Colour follows `e.color`. Extent 3.1.
  - **Size:** about 100 CSS / 290 device px across the glow when it is the big catch (Neutron Forge signature).
  - **Asset px:** 512×512.
  - **Owner:** `NeutronStar`.
  - **Asset:** `neutron.webp`, body and gold-edge. One shape, not one file per seed.

- [ ] **Star system.** `js/art/stars.js` 85. 8 looks. A sun, orbit lines, small worlds. Extent 2.5.
  - **Size:** big catch about 80 CSS / 230 device px.
  - **Asset px:** 512×512.
  - **Owner:** `StarSystem`.
  - **Asset:** `system.webp`, 8 × (body, gold-edge).

- [ ] **Nebula, cluster, galaxy.** `js/art/deepsky.js`. Nebula 10 looks (5 kinds, two seeds each), cluster 6, galaxy 10. Soft clouds. Extents 1.75, 1.9, 1.75.
  - **Size:** big catch about 55–70 CSS / 160–210 device px.
  - **Asset px:** 512×512.
  - **Owner:** `Nebula`, `Cluster`, `GalaxyBody` (not the `Galaxy` flow class).
  - **Asset:** one sheet each, looks × (body, gold-edge).

### Eat, debris, inflow

- [ ] **Swallow stretch and glow.** `js/render.js` 133–147 and 199–211. A big bite stretches toward the hole and a radial glow fades. About 0.7–1 s.
  - **Size:** the object's own size, stretched to about 3× along the hole's direction.
  - **Asset px:** the break frames already on the object's sheet (ships have plates). Other types use 4 stretch frames on their sheet. The glow is one 128×128 `swallow-glow.png`.
  - **Owner:** the object's `eat` state. `Feeding` only starts it.

- [ ] **Debris field.** `js/core/DebrisField.js` 41-end. Four slices of the eaten sprite, masked by the real shard PNGs, riding the rim outside the shadow. States: in flight, or nothing.
  - **Size:** each shard a fraction of the eaten sprite, at least about 6 CSS px.
  - **Asset px:** the four masks stay. No new art if the mask cut remains the one code composite we still allow. If that composite must go too, each type's sheet gains 4 pre-cut shard frames.
  - **Owner:** `DebrisField` (already a class).

- [ ] **Inflow motes, burst, bloom.** `js/core/Inflow.js` 46–70 paints the dots and streaks. Draw at 181–225. Motes drift upward on a fixed `mvy` (104). Bursts are radial streaks on a big bite or a tier-up. The circling grain cloud is off (`nIn` is 0).
  - **Looks:** 6 streak colours, 1 dot, 1 bloom.
  - **Size:** a mote is a few CSS px. A burst streak is a few hole-radii, about 40 CSS / 120 device px.
  - **Asset px:** `inflow.webp`, 128×32 streaks, 32×32 dot, 256×256 bloom.
  - **Owner:** `Inflow`.

- [ ] **Bite particles and ripples.** `js/render.js` 278–324. Curved additive streaks, and an expanding ring. `Fx` owns the lists.
  - **Size:** particles a few CSS px, a short tail. Ripple grows to a couple of hole radii.
  - **Asset px:** `particle.png` 32×16, `ripple.png` 128×128.
  - **Owner:** `Fx`.

### The two catch cues that are not part of the sprite today

- [ ] **Big-catch gold disc.** `js/render.js` 168–183. A filled gold radial gradient (`HALO_RGB` 255, 214, 140) over any `bigFish` once `nearQ` passes `BIG_HALO_FROM` (0.82, or 0.72 with perk a3a). States: nearly (still too big, the disc breathes with `breath`) and fits (steady, fuller). It covers the object.
  - **Looks:** one disc, every catchable type.
  - **Size:** about 1.35–1.65× the object's radius. On a ship, roughly 60 CSS / 180 device px across.
  - **Owner:** deleted. The frame lives on the catchable object (see each sheet above).
  - **Asset:** none of its own.

- [ ] **Too-big ring.** `js/render.js` 186–194. A thin rose circle (amber if the soft palette is on), pulsing, only while the object is still too big to eat.
  - **Size:** just outside the object's radius, about 2 CSS px of line.
  - **Asset px:** `ring-toobig.png` and `ring-toobig-soft.png`, 128×128.
  - **Owner:** the catchable object, drawn from those two pictures. Not a code `arc`.

### Finds, rivals, world scenery

- [ ] **Discoveries.** `js/discoveries.js` 126–224. 21 finds, 3 per biome. Kinds: orb, comet (Golden Comet, Twin Comets), ring. A code-painted body and, for comets, a code tail. A soft edge cue (`drawDiscoveryCue`, 226).
  - **Looks:** 21.
  - **Size:** `findR` is at least 9 CSS px of radius, so about 40–70 CSS / 120–210 device px across.
  - **Asset px:** 256×256 each, tail on the comet finds' sheets.
  - **Owner:** `Discovery`.
  - **Asset:** `finds.webp`, one row per find. Not food, so no gold-edge frame.

- [ ] **Rival hole.** `js/art/rival.js`. Two states: larger than you (violet) and edible (gold).
  - **Size:** drawn like a small hole, often 20–40 CSS / 60–120 device px.
  - **Asset px:** 256×256 × 2.
  - **Owner:** `Rival`.
  - **Asset:** shares the hole sheet's second palette, plus a gold state.

- [ ] **World scenery still painted in code.** `js/worlds.js` 733–1006.
  - Reefs and rock haze.
  - One river ribbon and slow streaks (Comet Current).
  - Cradle rings and the young sun (Planet Nursery).
  - Aurora ribbons (Void Rift).
  - Pulsar beams (Neutron Forge).
  - Meadow buds and specks (Star Meadow).
  - **Size:** landmarks are a large fraction of the view, often 100–300 CSS / 300–900 device px.
  - **Asset px:** one painted plate per biome mechanic, 1024 on the long side, plus a short streak strip for the river.
  - **Owner:** the mechanic classes in A8.
  - **Asset:** `scenic-reef.webp`, `scenic-river.webp`, `scenic-cradle.webp`, `scenic-aurora.webp`, `scenic-beams.webp`, `scenic-meadow.webp`.

- [ ] **Depth haze.** `js/depth.js` 45–73 `blurFor`, 146 `drawDepth`. Far food is a blurred, dim copy of the play sprite. On a tier-up it sharpens and joins the play layer.
  - **Size:** smaller than the play sprite (`app(k)`).
  - **Asset:** a second, already-soft frame on each type's sheet. `blurFor` goes away.
  - **Owner:** `DepthField`.

### Canvas UI

- [ ] **Minimap.** `js/render.js` 340–420. A 96 CSS px circle, dots, a trail of where you have been, a view rectangle.
  - **Size:** 96 CSS / 288 device px.
  - **Asset px:** a 256×256 frame. Dots can stay 4×4 pictures.
  - **Owner:** `Minimap`.

- [ ] **Off-screen arrows.** `js/render.js` 422–457. Up to 6 chevrons for things you cannot eat yet.
  - **Asset:** `arrow.png`, 32×32, tinted by the object's colour in the sheet (a few colours, not a runtime tint).
  - **Owner:** `EdgeArrows`.

- [ ] **Thumbstick.** `js/core/ScreenOverlay.js` 70–97. A ring and a knob, 56 CSS px of travel (`input.js` 6).
  - **Asset:** `stick-ring.png`, `stick-knob.png`, 128×128.
  - **Owner:** `Input` draws them, or `ScreenOverlay` keeps the draw and only reads `Input`.

- [ ] **Tier banner, floaters, combo.** `js/core/ScreenOverlay.js` 50–133. Canvas text: "A WIDER VIEW", the tier name, floater strings, `×` combo.
  - **Size:** banner text about 24–32 CSS px tall.
  - **Asset:** keep the words as text. They are not a painted sprite. The banner plate behind them is `banner.png`, 512×128.
  - **Owner:** `ScreenOverlay` (already a class).

- [ ] **Constellation.** `js/constellation.js` 55–110. Nodes, links, and a painted dust field on a canvas.
  - **Size:** the panel is most of the screen.
  - **Asset:** `constellation-node.png` in 3 states (locked, affordable, owned), 64×64. Links are that picture stretched, not a code stroke. Dust is a tiny star sheet.
  - **Owner:** `Constellation`.

- [ ] **Star map.** `js/starmap.js`. One star per cleared galaxy, lines between them.
  - **Asset:** `starmap-star.png`, one per biome colour (7), 32×32. Lines from a 8×2 picture.
  - **Owner:** `StarMap`.

- [ ] **Mouse cursor.** `js/render.js` 459. A small code reticle. Desktop only.
  - **Asset:** `cursor.png`, 32×32.
  - **Owner:** `Input`.

- [ ] **Frame grade.** `js/grade.js`. A code colour wash per biome.
  - **Owner:** delete. The backdrop JPEG already has the biome colour.

---

## Conversion order

One PR each. Each PR is based on `main`. Do not stack them. Ships are first because they are the vertical slice: a real object, a real loader, and real pictures, including the gold edge.

The test named in each step does not exist yet. The PR adds it. On the parent commit the test fails. On that PR it passes.

1. **Ship and SpriteSheet.** `Ship` owns one craft entity. `SpriteSheet` loads a picture and draws a frame. `paintShip` and `drawShip` stop drawing geometry. The sheet has live, wreck, gold-edge, plates, and the engine glow for all 5 classes and 8 looks.
   - **Done when:** a sandbox Armada run shows a wreck and a living ship from the sheet, the wreck tumbles, the living ship flips when it faces left, and a big-catch ship shows the painted gold edge (breathing, then steady) with no radial gradient.
   - **Test:** `tools/oo-ship.cjs`. Fails while `paintShip` still fills a hull. Passes when the pixels come from an `HTMLImageElement` under `assets/ships/` and the centre of the ship matches the sheet.

2. **Flagship.** Same loader. `Flagship` blits its sheet instead of painting one.
   - **Done when:** the Armada landmark matches the new sheet and no longer builds a canvas over many frames.
   - **Test:** `tools/oo-flagship.cjs`.

3. **Junk, dust, meteor.** Three small classes, one sheet each. Meteor includes the hot streak. Junk and meteor include the gold-edge frame.
   - **Done when:** those types no longer have a painter entry.
   - **Test:** `tools/oo-rocks.cjs`.

4. **Comet.** Body, tail frames, gold-edge. `CometTail` only picks a frame and an angle.
   - **Done when:** `tailFor` is gone and the tail still sits behind the comet's own world step.
   - **Test:** `tools/oo-comet.cjs`, plus the existing world-step check from `tools/v973-tails.cjs` still passes.

5. **Moon and planet.** Rings are in the picture.
   - **Done when:** `PLANET_PAINTERS` is gone.
   - **Test:** `tools/oo-planet.cjs`.

6. **Star, neutron, star system.**
   - **Done when:** `STAR_PAINTERS` is gone.
   - **Test:** `tools/oo-star.cjs`.

7. **Nebula, cluster, galaxy body.**
   - **Done when:** `DEEPSKY_PAINTERS` is gone and `kit.js` has no callers.
   - **Test:** `tools/oo-deepsky.cjs`.

8. **Delete the gold disc.** After steps 3–7 every catchable has a gold-edge frame. Remove `render.js` 168–183.
   - **Done when:** nothing in `render.js` calls `createRadialGradient` for a catch.
   - **Test:** `tools/oo-halo.cjs`. Fails on today's disc. Passes when the only gold is the sheet frame.

9. **Too-big ring.** Two ring pictures. Soft palette swaps the picture, it does not recolour in code.
   - **Done when:** `render.js` 185–193 is a `drawImage`.
   - **Test:** `tools/oo-toobig.cjs`.

10. **Black hole.** Disk, ring, shadow, reveal, magnet ring, breath ring.
    - **Done when:** `js/art/hole.js` no longer fills a gradient.
    - **Test:** `tools/oo-hole.cjs`.

11. **Wisp.** Replace `makeRadial`.
    - **Done when:** the companion is a blit, including the lean toward a find.
    - **Test:** `tools/oo-wisp.cjs`.

12. **Inflow.** Motes, burst, bloom from `inflow.webp`. Leave the grain cloud off.
    - **Done when:** `streakSprite` is gone.
    - **Test:** `tools/oo-inflow.cjs`.

13. **Fx particles, ripples, swallow glow.**
    - **Done when:** `drawParticles` and `swallowGlow` only blit.
    - **Test:** `tools/oo-fx.cjs`.

14. **Debris field.** Keep the mask PNGs. If a pre-cut shard frame is required, add it to each type's sheet here. One PR, after the type sheets exist.
    - **Done when:** a bite still shows shards outside the shadow, and no mask is built with a gradient.
    - **Test:** the existing bite checks, plus `tools/oo-debris.cjs`.

15. **Discoveries.** 21 painted finds.
    - **Done when:** `findSprite` and the discovery `tail()` canvas are gone.
    - **Test:** `tools/oo-finds.cjs`.

16. **Rivals.** Use the hole sheet.
    - **Done when:** `rivalSprite` is gone.
    - **Test:** `tools/oo-rival.cjs`.

17. **World scenery.** One plate per mechanic.
    - **Done when:** `drawWorldsBG` and `drawWorldsOverlay` only blit.
    - **Test:** `tools/oo-scenic.cjs`.

18. **Depth field.** Soft frame from each sheet. Delete `blurFor`.
    - **Done when:** a tier-up still merges the far layer, with no `ctx.filter`.
    - **Test:** `tools/oo-depth.cjs`.

19. **Canvas UI.** Minimap frame, arrows, thumbstick, banner plate, cursor. Text stays text.
    - **Done when:** those draws are `drawImage` plus `fillText` only for words.
    - **Test:** `tools/oo-hud.cjs`.

20. **Constellation and star map.**
    - **Done when:** nodes and stars are pictures. `grade.js` is deleted.
    - **Test:** `tools/oo-map.cjs`.

21. **Ship's code home, finished.** `entities.updateEntities` no longer special-cases craft steering. `Ship.update` owns it. This is the pattern for the other types.
    - **Done when:** a living ship still turns to face its travel with no branch in `updateEntities`.
    - **Test:** `tools/oo-ship-update.cjs`.

22. **Entity factory.** `createEntity` and `spawnFood` / `spawnBigFish` return the right class.
    - **Done when:** a spawned craft is a `Ship`, not a plain object with `type: "craft"`.
    - **Test:** `tools/oo-spawn.cjs`.

23. **World.** Split `worlds.js` into mechanic classes. Behaviour unchanged.
    - **Done when:** `W` is gone.
    - **Test:** `tools/oo-world.cjs` (reef, river, cradle, aurora, beams still register).

24. **LivingWorld and events.**
    - **Done when:** `fireEvent` constructs an event object.
    - **Test:** `tools/oo-events.cjs`.

25. **Discovery, Rival, Wisp singletons.** Logic only, art already done.
    - **Done when:** no module-level `findSprites` Map and no module wisp singleton.
    - **Test:** `tools/oo-actors.cjs`.

26. **Input.** `createInput` becomes `Input`.
    - **Done when:** stick and keys still steer, from the class.
    - **Test:** `tools/oo-input.cjs`.

27. **Audio.**
    - **Done when:** `audio.js` exports a class. Bite, drone, and swell still play.
    - **Test:** `tools/oo-audio.cjs` (spy on the context; no speakers required).

28. **SaveGame.**
    - **Done when:** a v9 save still loads. No save-version bump.
    - **Test:** `tools/oo-save.cjs`.

29. **Ascension and TierTable.**
    - **Done when:** perk buy, dark matter, and `bigWeights` behave the same.
    - **Test:** `tools/oo-asc.cjs`.

30. **Stats, logbook, menus.** DOM views as objects. No visual change.
    - **Done when:** `ui.js` is a class and the codex still opens.
    - **Test:** `tools/oo-ui.cjs`.

31. **Game.** `game.js` becomes the `Game` class. `__bh` points at it.
    - **Done when:** boot, the sandbox, and a bite still work.
    - **Test:** `tools/oo-boot.cjs`.

32. **Service worker policy.** Stop precaching every new picture.
    - **Done when:** `ASSETS` is the shell plus the current galaxy's sheets, and a sheet that is not in the list still appears after a lazy load.
    - **Test:** `tools/oo-cache.cjs`.

## Asset budget and the cache

Rough library, PNG or WebP, at the asset sizes above:

| Group | Frames, about | MB, about |
|---|---|---|
| Ships, gold edge, plates, glow | 80 bodies × a handful of frames | 8 |
| Flagship | 4 | 2 |
| Dust, junk, meteor, comet | under 50 looks | 3 |
| Moons and planets | about 140 | 8 |
| Stars, neutron, systems, deep sky | about 50 | 6 |
| Hole, wisp, inflow, fx, UI, scenery | — | 6 |
| Finds | 21 | 2 |

About **35 MB** for the whole library if it were all on the phone at once. That is too much to precache.

Strategy:

- Precache the shell only: HTML, CSS, JS, the seven backdrops, the veil, the four shard masks, the hole sheet, the UI plates, and the food sheets for the galaxy you are in.
- Everything else is loaded when that type is about to appear (the next tier's sheet, the next galaxy's scenic plate). `SpriteSheet` starts the load and draws nothing until the picture is in.
- Do not add those files to `sw.js` `ASSETS`. The worker may cache them after the first fetch, as it already does for anything it sees.
- Prefer WebP. A 320×320 sheet frame is usually well under 40 KB.

## Counts

- **Section A:** 21 groups, 52 open checkboxes. The core classes that already exist (Scene, Player, Feeding, and the rest in A21) are not in that 52.
- **Section B:** 34 open checkboxes, plus 4 already-real images marked done (7 backdrops, the golden veil, 4 shard masks, the app icons).
- **Order:** 32 PRs, ships first, each based on `main`.
