# Changelog

All notable changes to Black Hole: Galaxy Eater. Saves carry forward through every version.

## v9.1 Systems & a wider view (Oct 2026)

- **Code you can upgrade piece by piece.** The messiest parts of the main loop are now small system classes in `js/core/` — Camera, Growth, GalaxyFlow, Fx — each with a clear public surface. Entities stay plain objects so the hot loops stay allocation-free. Swap or enhance one system without rewriting the rest.
- **Growth feels bigger when a new scale arrives.** On a tier-up the next layer still drifts in from the haze, and now:
  - A soft radial "world opens" pulse lifts around you (calm, no flash; off under Reduce Motion).
  - Things arriving get a warm arrival rim while they sharpen.
  - The banner names what drifted closer ("Asteroids drift closer").
- Saves are unchanged (still v8). Zen, Ascension and the one loop are the same.

## v9.0 One loop (Oct 2026)

- **One loop: born, grow, collapse, reborn stronger.** Growing (tier-ups and new layers arriving) is the progression inside a run. Collapse is the only reset, Dark Matter the only currency, the constellation the only upgrade screen.
- **No more stardust or shop.** What you had (unspent stardust plus everything you'd spent on upgrades) came back as Dark Matter, 25 stardust each. Galaxy perks you'd earned give 8 Dark Matter each. Their best effects now live on the constellation:
  - Solar Wind: +15% speed.
  - Momentum: bigger combos and a longer combo window.
  - Second Helping: power-ups last longer and show up more often.
  - Quiet Cradle: breather galaxies need less growth.
  - Star Reader: goal stars give double Dark Matter.
- **Galaxies flow into each other.** No summary screen: when you outgrow a galaxy, the view softly fades toward the next one while you keep drifting, and it opens around you with its name and a soft chime. The star joins your map quietly. The star map is now also in the pause menu.
- **Collapse when it feels heavy.** When growth clearly slows, a soft "Growth is slowing · Collapse?" appears (also in the pause menu). Collapse shows your Dark Matter, then the constellation, then you are reborn: the newborn beginning plays again ("Collapse 1. Reborn. Grow.").
- **Goal stars are optional.** Each new best star gives +2 Dark Matter and is noted in your logbook. No perks hang on them.
- **Milestones trimmed** to golden galaxies, supernova runs and skins.
- **Everything fits your size.** Events only bring things you can eat or that are one size up. In Space Dust a meteor shower becomes a gentle Dust Drift, and a stellar birth becomes a Soft Bloom.
- **Pacing:** Planet Nursery, Void Rift and Star Meadow are a little quicker. Comet Current and Ruined Armada stay the slow walls. First collapse comes after about half an hour.
- **New art:** every kind of object has its own painted looks. Dust is soft drifting grains, asteroids are lumpy and lit, shower meteors arrive glowing, comets have tails, and moons, planets (10 kinds), stars, nebulae and galaxies all vary.

## v8.6 A real beginning (Oct 2026)

- **Starting over now begins in the dark.** In v8.5, "Start completely over" did play the intro, but it was a few faint words over the galaxy behind the title. It looked like you'd just been dropped into a galaxy.
- **The beginning now:**
  - The screen fades to a dark void and the galaxy is gone.
  - "Black Hole · Galaxy Eater" appears, then "Drift.", "Eat what's smaller." and "Grow."
  - The void slowly lifts, and your newborn hole is born in place, growing from a speck among the dust.
  - Then the controls tip and "You've just been born."
- **Same beginning on first launch.**
- **It can't be lost.** If the app is closed or reloaded before the beginning has played, it plays the next time you open the app.
- **Starting over also closes any open menu or pause screen first.**
- **Updates arrive reliably.** An installed app now checks for a new version every time you return to it. When one arrives, the game saves and reloads at a calm moment (on the title screen or while the app is in the background), then comes back to where you were.

## v8.5 True fresh start (Oct 2026)

- **"Start completely over" on the title screen now really starts from the beginning.** After you confirm, the first-launch intro plays ("Drift. Eat what's smaller. Grow."), then the drift-in. You begin as a newborn hole with only dust, in galaxy 1. Before, it dropped you straight into a galaxy.
- **Every first-time moment comes back:**
  - The controls tip and the "You've just been born" line.
  - Wisp's introduction.
  - The tier and merge captions.
  - Galaxy mechanic captions.
  - The codex "seen" entries.
- **What resets:** your run, Dark Matter, perks, goal stars, collapses and the star map. Any Zen session also ends.
- **What stays:** settings, lifetime records, fastest times, the discovery logbook and Zen notes.

## v8.4 Still tiny (Oct 2026)

Right after your first growth step, the play area no longer shows moon- or planet-sized things you can't eat. Pacing and saves are unchanged.

- **Big objects in play are at most about one tier above you.** Anything two or more tiers up stays in the soft back layers until you grow into it. This also applies to each galaxy's signature object, so for example there are no tiny planets drifting around a pebble-sized hole.
- **"Bigger fish" are now 1.3–2.2× your size** (they were 1.4–2.6×), so they read as things you'll eat soon. At Grit & Pebbles they are rough rocks only.
- **The Debris Reef reefs start as faint haze while you're newborn.** They merge in with their rock when you reach Grit & Pebbles, and their caption waits until then.
- **New opening line** for a fresh game: "You've just been born. Drift and gather the dust."

## v8.3 Growth you can feel (Oct 2026)

The game now puts one thing first: feeling yourself grow. DESIGN.md opens with a North Star section that every change is checked against. Saves from v1 to v8.1 still load, and galaxy clear times are unchanged within normal run-to-run variation.

**A layered world**
- A fresh game starts with only dust in play. You're a newborn, minuscule hole.
- Everything bigger waits in soft background depth layers (new `js/depth.js`). These are blurred, hazy, dimmer, smaller and slower-moving, and you can't touch them. Pebbles sit just behind, meteors and comets further back, then moons, planets and stars.
- When you grow big enough to eat a tier, its layer merges into play. The objects drift forward and sharpen over about 2.5 seconds, along with the usual camera pull-back. The first time, a quiet chime plays with a caption such as "You're big enough now. The pebbles drift closer."
- Each new galaxy starts the same way, with fine food at your scale and the bigger things behind.
- Large things you can't eat yet never appear while you're a newborn (tier 0), and they drift in from the back layer instead of popping in.
- Rivals also drift in from the back. They fade in over about 2.5 seconds and only interact once fully arrived.

**You visibly outgrow your food**
- Between tier-ups, new food is sized from a slowly lagging reference, so the hole grows visibly larger than the crumbs around it. Bite values compensate, so pace is unchanged.

**Calmer level 1**
- Removed the branching, glowing "tendrils" from the Debris Reef. These were the snake-like trails, from both the reef landmark sprite and the reef sky. The reef keeps its soft teal banks, with a few faint glints in their place.

## v8.1 Painterly, bolder (Oct 2026)

A second, much bolder art pass. Gameplay, balance, audio and saves are unchanged, and saves from v1 to v7 still load.

**Black hole**
- The disk is now Interstellar-style. It is a flat, thin, wide band out to 3.6× the hole's radius (it was 2.25×), with layered turbulent bands, dark lanes, and a gradient from white-hot inside through gold and ember to deep red.
- The far side of the disk is lensed into a bright arc over the shadow and a thin arc under it.
- The photon ring is crisp and brighter on the approaching side. Beaming, a warm wide bloom and shimmer (High only) remain.

**Skies**
- Every biome has its own painted sky (new `js/sky.js`), painted once per biome and screen size at half resolution. It replaces the flat background fill, so it costs no extra full-screen blit.
  - Reef: tendrils over teal banks.
  - Comet Current: icy flowing currents.
  - Planet Nursery: green-gold glow with dust pillars.
  - Ruined Armada: violet and amber smoke with heavy dust lanes.
  - Void Rift: a glowing cleft.
  - Star Meadow: golden haze and dense stars.
  - Neutron Forge: shock shells.
- Every sky also gets distant galaxies and dark dust lanes.
- Slow parallax drift, on top of the existing parallax star, cloud and dust layers.

**Objects** (consistent upper-left light)
- Rocks: speckle grit and terminators.
- Comets: an icy nucleus, a glowing coma and sunward jets, plus two tails (a curved dust tail and a straight blue ion tail).
- Gas giants: more bands and storms, a shadow cast by the rings across the globe, the planet's shadow on the rings behind it, and a Cassini gap.
- Stars: granulation, limb darkening and coronal streamers.
- Nebula and galaxy food: more puffs, dust lanes, and more stars in spiral arms.

**Effects**
- Particles are curved, glowing spiral streaks (glow pass on High).
- Big catches stretch toward the hole and glow as they go in (spaghettification); with Reduce Motion they simply shrink.
- Tier reveal: a gentle bloom swell and an expanding dust ring (fixed size under Reduce Motion).
- Rivals: painted violet holes with their own disk, lensed arc and ring. They turn gold once you can eat them.
- Discoveries: each find has its own cached sprite (petals, rings, a comet head with tail, orbiting motes).
- Landmarks:
  - Reefs get painted coral.
  - The Cradle gets a protoplanetary disk.
  - Comet rivers are brighter.
  - Armada hulls are more visible.
  - The aurora gets curtains.
  - Meadows get blossom fields.
  - Pulsar beams get bright cores.
- Wisp: an outer aura with faint rays, plus trailing motes.
- Overlays fade in smoothly.

**App**
- A new icon (192, 512 and maskable 512), rendered from the game's own black hole (`tools/make-icons.py`).
- A splash screen that fades out by itself.

**Perf** (headless, 20 s at galaxy 5, JS ms per frame)
- High: 1.11 avg / 1.6 p95.
- Lite: 0.53 / 0.8.
- Auto stayed on High with 0 drops (2 runs).
- Allocation stays at about 1.8 MB/s. Some per-frame allocations were removed (tail keys, beam side array, particle options).

## v8.0 Painterly (Oct 2026)

A visual pass with no gameplay change. Balance, audio and saves are the same; saves from v1 to v7 still load.

**Wisp**
- In Zen the wisp stays in a close, steady orbit beside the hole and keeps breathing (4 in / 6 out). It no longer drifts off to hint at food or lean toward discoveries.
- In all modes the wisp is drawn last in the world, above every object, particle and the hole, with a soft dark backing so it reads against bright stars.

**Black hole**
- The approaching side of the disk is brighter and whiter (relativistic beaming). The photon ring is brighter and asymmetric, with a wide soft bloom (High only).
- A faint heat shimmer on the photon ring (High only; off with Reduce Motion).

**Sky**
- Nebula clouds are painted from many soft puffs in two biome hues, with a glowing heart and dark dust lanes. There are 5 cloud shapes on High and 3 smaller ones on Lite.
- Stars come in colour temperatures from blue-white to orange-red. Brighter stars get a soft halo (High), and some parallax stars twinkle slowly (High; off with Reduce Motion).
- A soft vignette and a gentle per-biome colour grade. This is a GPU-composited CSS layer, so it costs no canvas time. Lite keeps the vignette and drops the grade.

**Objects**
- Planets and moons have a day/night terminator, limb darkening, a crescent of scattered light on the lit limb and a faint night-side bounce light. Meteors get the terminator (High), and rocky debris gets a rim light (High).
- All of it is painted once into the sprite cache, so nothing extra runs per frame.

**UI**
- Glass panels with a top highlight and blur; refined buttons with a gradient primary; a gradient title wordmark; consistent spacing. Transitions are skipped under Reduce Motion.

**Perf** (headless, 20 s at galaxy 5, JS ms per frame)
- High: 0.95 avg / 1.3 p95 (v7.2: 0.84 / 1.1).
- Lite: 0.48 / 0.6 (v7.2: 0.43 / 0.6).
- Auto stayed on High with 0 drops.
- The per-frame biome-glow gradient is now a cached canvas.

## v7.2 Lean (Oct 2026)

A refactor with no gameplay change. Behaviour, balance, audio and saves are the same, and saves
from v1 to v7 still load.

**Removed**
- The hidden old Zen/timed toggle, along with the timer code that only ran when it was off: the
  hidden Time/Best HUD, the par and speed bonus, "New record" stardust, the 1% bump mass loss,
  and the toggle's hint and CSS.
- The bottom-bar "Reset All" button. Use **Start completely over…** on the title instead.
- Dead screen shake (nothing has triggered it since v3).
- 15 unused functions and constants, plus unused imports.
- A per-entity random id string that was never read.
- A no-op sprite "prerender" hook.
- A duplicate seeded RNG.

**Faster**
- Every entity now has one fixed shape, so position and velocity updates no longer box numbers.
- The edge arrows keep the nearest 6 in fixed slots, with no per-frame array or sort.
- Minimap and arrow colour strings are cached.
- A 2-argument `hypot` in the hot modules.
- Particles and eaten objects are compacted in place instead of `splice`d.
- About 40% less garbage per second and half as many garbage collections; see DESIGN.md §7e.

**Fixed**
- Settings opened from the title screen had its **Done** button hidden under the title buttons.

Service worker cache `blackhole-v7.2`.

## v7.1 Calm Sound (Oct 2026)

Brian said the music gave him a headache and the effects were still harsh. The audio was rebuilt
from research (see `docs/AUDIO_RESEARCH.md` for the sources and rules).

- **New bed.** Soft brown noise, like distant surf, replaces the synth drone. It swells gently with
  the breath (4 s in, 6 s out). The old drone had detuned oscillators, a 2.01× "almost octave", a
  1.498 fifth, triangle overtones and LFO layers. That beating and roughness is the likely headache
  cause.
- **New music.** Sparse single sine notes in just intonation: one every 5.5–9 s, each with a slow
  2.5 s fade-in. Only exact consonances (octave, fifth, fourth, wide third) ever overlap, so nothing
  beats. Scales and tiers only open the note pool a little. They never stack layers.
- **Softer effects.** Every effect is a soft sine "water-drop" pluck in the key, 380–1,000 Hz, with a
  fade-in of at least 20 ms. Rapid bites thin out (90 ms minimum gap), and the combo chime plays only
  every 10th bite.
- **Safer mix.** The whole mix passes a 1.8 kHz lowpass and a 150 Hz highpass (phone speakers can't
  play deep bass cleanly). Default levels are lower.
- **Volume settings.** Settings now has separate **Music** and **Sound effects** sliders with
  on/off switches.
- **Measured.** These come from an offline 30 s render at default volume (`tools/audio-analyze.py`):
  - Peak −22 dBFS, RMS −37 dBFS.
  - Spectral centroid 338 Hz (383 Hz at deeper scales).
  - 0.002% of energy in the 2–5 kHz band.
  - The music's envelope-roughness index is 0.022, against 0.092 for the old Reef drone.
- **Zen visuals.** The breathing ring around the hole is gone. Your wisp is now the breath guide:
  it swells and brightens on the 4 s in-breath and settles on the 6 s out-breath. There is an
  optional, off-by-default "breathe in / breathe out" words setting. Zen's pull now follows the same
  4/6 rhythm.
- Service worker cache `blackhole-v7.1`.

## v7.0 Ascension + Zen (Oct 2026)

Two modes with clear jobs. Save version 7; older saves migrate, so the current journey becomes your
first Ascension run.

**Ascension**: the long, deep climb. It replaces the old Zen/timed toggle and stays calm with no clock.
- **Run depth.**
  - Each galaxy deeper needs 18% more growth than the last, and food thins 3.5% (floor 62%).
  - From Galaxy 3, calm violet rival holes drift and feed. They ease you aside and never take mass.
  - Outgrow a rival and it turns gold, and you can swallow it.
- **Collapse into a singularity.**
  - Available from the pause menu or summary once you've cleared 3 galaxies.
  - The run resets for Dark Matter: `3·cleared^1.5 + 2·peak scale`, plus golden galaxies and finds.
  - A slow, soft singularity screen plays.
- **Constellation**: 27 perks across Reach, Appetite and Fortune.
  - Two forks per branch.
  - Costs: 8 / 16 / 28 / 45 / 70 / 100 / 150.
  - 7 galaxy perks.
- **Galaxy goals.** Each galaxy type has its own 1–3 star goal, shown softly under the galaxy name.
  Three stars unlocks that galaxy's perk.
- **Milestones**: golden galaxies and the Ember skin (1), keep Seed Mass (2), supernova runs and
  Aurora (3), deep variants (4), head start (5), Pearl (6), keep all upgrades (8).
- **Variable rewards**:
  - golden galaxies (×3 stardust)
  - supernova runs (bites ×1.5)
  - shining finds (+3 Dark Matter)
- Stardust and the shop stay as the in-run layer. They reset on collapse.

**Zen session**: a refocus tool.
- Pick 3, 5 or 10 minutes. The session goes settle → flow → wind-down, and food thins as the music
  resolves to one held note.
- The pull breathes at about 6 per minute: things drift out as you breathe in and come to you as
  you breathe out.
- **Clean exit:**
  1. Three guided breaths, which you can skip.
  2. An optional "What's the one thing you're doing next?"
  3. "Go do it." and a single "Back to the title" button.
- No rewards, streaks or "one more". Your Ascension run is untouched.

Also:
- New codex entries.
- Hole skin setting.
- `tools/collapse-sim.mjs` (collapse-curve model).
- New sounds are as soft as v6.0.1.
- Service worker cache `blackhole-v7.0`.

## v6.0.1 Softer Sound (Oct 2026)

Brian found the sounds too sharp. Every sound effect is softer now; the drone and music layers are unchanged.

- Melodic bites play an octave lower, about 40% quieter, with a 50ms fade-in and a longer, gentle
  release. The suction "hush" is now a soft lowpass, eased in instead of clicked on.
- All effects are sine or triangle only. They pass through a warm lowpass filter (1.6 kHz). Every
  chime and cue fades in over at least 45ms and rings out longer.
- Combo chime is less than half as loud and slower. The big-catch chime, tier chime, galaxy-complete
  chord and bump are all quieter and rounder.
- New master chain: a gentle, slow compressor followed by a soft limiter, so stacked bites never poke out.
- Service worker cache `blackhole-v6.0.1`.

## v6.0 Next Level (Oct 2026)

Balance and feel, from a bot playtest. Time per galaxy is unchanged (checked with the playtest bot
against v5.2).

- **Meatier bites.** Food is bigger and a little sparser (food 12-30% of your size, was 8-22%;
  ~44 objects around the view, was 60). Each bite is worth more and the hole visibly swells a touch
  on every bite. Gains are retuned so each galaxy takes the same time as before.
- **Big catches.** Things you've nearly outgrown get a soft gold halo that warms as you close in,
  and turns steady once they fit. Eating one is a slow (~1s) swirling swallow with a warm chime in
  the galaxy's key. The old tiny screen shake on big catches is gone.
- **Discoveries + Logbook.** 21 rare, biome-themed finds (3 per galaxy type: Golden Comet, Lost
  Probe, Whale Nebula, Dandelion Star...). One or two hide in each galaxy (one in breathers), planted
  ahead of you and following you like the mechanics do. A soft edge glow fades in over ~2.5s when
  one is near, with a one-time caption. Drift into it for a gentle rising phrase. The new Logbook
  (title screen or Stats) lists what you've found and when. Save version 6: older saves migrate
  with an empty logbook.
- **Livelier wisp.** It twirls after a big catch, curls up and rests close by during breathers (no
  hints there), and perks up, brighter and leaning that way, when a discovery is near.
- **Melodic bites.** Each bite plays the next note of an 8-note pentatonic phrase in the biome's key,
  so a streak sounds like a tune. The phrase drifts one note every 12 bites, restarts after a pause
  and is new each galaxy. Bite and combo sounds are softer and in key.
- **End-of-galaxy ritual.** Before the summary, the star map opens for a quiet moment: the new star
  drifts up and settles into your sky, with one line about your discoveries or best catch. A low,
  slow chord plays. Tap to move on, or it continues by itself after ~7s. Reduce Motion fades the
  star in place.
- Codex: new "What's that?" entries for the golden halo, the shimmer, the wisp and the new star.
- Service worker cache `blackhole-v6.0`.

## v5.2 Star Map & Wisp (Oct 2026)

- **Star map.** A slowly drifting sky with one star for every galaxy you've cleared, coloured by
  its biome and joined by soft constellation lines. Tap a star for the galaxy's name, the date you
  cleared it and the biggest scale you reached there. Open it from the title screen or from Stats.
  Galaxies cleared before v5.2 are filled in from your save (no date, scale estimated).
  It's its own screen and only animates while it's open.
- **Companion wisp.** A small glowing light drifts beside the hole, breathes with the 10s rhythm,
  grows a little with each scale and every 20-30s floats toward something tasty nearby as a hint.
  It never eats or gets in the way. Name it in Settings (default "Wisp"). Reduce Motion slows it
  and drops its trail.
- **Save backup.** Settings > Save backup: Export copies a backup code and downloads it as a .txt
  file; Import takes a pasted code or a file, checks it (checksum, version), shows what's in it
  and asks before replacing your journey.
- **Cleanup.** The `window.__bh` test hook only loads on localhost or with `?debug`; debug readouts
  trimmed. README rewritten; version history moved here. Version shown in Settings.
- Service worker cache `blackhole-v5.2`.

## v5.1 Polish (Oct 2026)

- **Galaxy mechanics follow you.** Rivers, reefs, the Cradle, hulls, aurora, meadows and pulsars
  used to exist only near where a scale began. Now when you travel away from them a new set is
  built ahead of you at the same scale, and earlier sets come back if you return. Fixes Comet
  Current rivers disappearing after the start.
- Cradle orbiters and Armada hulls regrow while you're nearby.
- Big-scale food (systems, nebulae, clusters, galaxies) is drawn larger so it reads on screen.
- Radar shows landmark icons on its rim when they're out of range.
- Landmark names no longer overlap a tier reveal.
- Pacing retune (regular galaxies ~3-5 min, breathers ~70s; Void Rift and Ruined Armada adjusted).

## v5.0 Vast

The universe now opens up as you grow instead of feeling like a fishbowl.

- **One long journey of scales.** You start as a speck among space dust and climb a ladder:
  Space Dust → Grit & Pebbles → Asteroids → Comets & Ice → Moons → Planets → Giant Worlds →
  Stars → Star Systems → Nebulae → Star Clusters → Galaxies → Galaxy Groups → Cosmic Web (and on).
  Each step is 2.6× in size. The HUD's top-right shows your current scale.
- **Your size carries over.** Each galaxy starts where the last one ended, with fresh fine dust
  around you, and grows you a little further (about one scale step per regular galaxy, half a step
  in a breather). Growth is slower and finer than before: lots of small bites.
- **A wider view.** When you cross into a new scale the camera slowly pulls back (about 2.5s) while
  you keep moving, a soft chime plays, and a quiet line names the new scale. Bigger kinds of
  objects start drifting in.
- **No edge.** Space goes on forever: things appear just outside your view and quietly recycle
  once they're far behind, keeping a steady ~60 objects around you.
- **Layered sky.** Four parallax layers (distant galaxies, nebula clouds, stars, near dust) each
  react to zoom differently, so a pull-back feels deep rather than flat.
- **Landmarks per scale.** Each galaxy's landmarks and mechanic (reefs, rivers, the Cradle, hulls,
  aurora, meadows, pulsars) are rebuilt at every new scale. The old ones stay where they were
  and shrink away behind you.
- **Local radar.** The minimap is now centred on you with a faint trail of where you've been.
- **Smaller disk.** The black hole's glow and accretion disk take up less of the screen.
- **Music grows with you.** Each scale adds one soft layer to the drone (shimmer, low bass, slow
  plucks, air, an open fifth, distant bells), up to six.
- Older saves start at a scale that matches how far they'd got; a half-played galaxy restarts.

## v4.1 Worlds

Every galaxy now has its own gentle mechanic and a few named landmarks (names fade in softly when you arrive, icons on the minimap, and a faint edge hint points to the nearest one when food runs thin). Each galaxy's signature event feeds its mechanic. All of it is in the Stats codex.

| Galaxy | Mechanic | Paired event |
|---|---|---|
| Debris Reef | Teal reefs hold rock clusters and regrow after you graze them (The Shoals, Pebble Reach, Old Reef, Driftstone) | Meteor Shower reseeds the reefs faster |
| Comet Current | Two rivers of light carry you and their comets along (The Long River, Glacier Run) | Comet Stream pours comets in upstream |
| Planet Nursery | A young sun, The Cradle, with planets on slow orbits; they leave orbit when you come close | Stellar Birth adds new worlds to a ring |
| Ruined Armada | Brittle hulls crumble softly when bumped, shedding edible pieces and shrinking (The Flagship, The Broken Line) | Derelict Flotilla brings brittle hulls |
| Void Rift | An aurora ribbon where small food keeps appearing and drifting along (The Aurora, Stillwater) | Void Gift makes it glow and feed faster |
| Star Meadow | Star buds bloom over ~30s; patient bites are bigger (Goldfield, Sunpatch, The Orchard) | Stellar Birth makes the nearest meadow bloom |
| Neutron Forge | Slow pulsar beams sweep the forge; inside one, food gives +50% mass (The Lighthouse, Ember Pulsar) | Gravity Wave makes the beams flare wider |

Landmarks are seeded by galaxy number (same layout after a reload) and scale with the galaxy as you grow.

**Pacing (bot):** regular galaxies keep 26% of a bite's mass (breathers 50%), bite caps 4.2% / 5.6% of your mass, plus a per-galaxy `gainK` (Comet 0.85, Forge 0.8, Meadow 1.15). The greedy bot clears regular galaxies in about 2.5 to 3.8 min and breathers in about 1 to 1.5 min.

## v4.0 Feels Finished

- **Title screen**: the live game is the backdrop, with a slow close-up of your black hole. Continue (shows your galaxy), New Game (asks first; keeps settings, records and codex) and Settings. Shown when the app opens after more than 10 minutes away; otherwise you drop straight back in.
- **First-launch intro**: three quiet lines ("Drift. / Eat what's smaller. / Grow.") over the hole, about 11 seconds, with Skip. Shown once, never again (not even after New Game).
- **Drift-in**: Continue eases the camera into the hole, a breath of dark, then play.
- **Pause menu**: Resume / Settings / Title screen.
- **Painterly art (all code-drawn)**: lit planets with soft cloud bands, atmospheres, rings and moons; stars with coronas and gentle twinkle; cratered meteors; muted wreck hulls with warm windows; comet heads with tapered tails; soft dust.
- **New black hole**: tilted accretion disk that swirls (inner faster than outer), spins up a little when you eat, a photon ring, light bent over the top (lensed arc) and background stars magnified around the edge.
- **Particles**: soft glowing streaks that swirl and spiral into the hole. Reduce Motion keeps them short and fewer.
- **Backgrounds**: two layers of big soft nebula clouds in each biome's colours.
- **Performance**: every object is painted once into a small cached canvas (by type, colour, variant, on-screen size) and stamped each frame; painting is capped at ~2.5 ms per frame. Settings > Visual quality: Auto (default), High, Lite. Auto drops to Lite (1.5x pixel density, one disk layer, no star lensing, fewer particles) if frames run long. `__bh.perf()` reports frame work time.

## v3.0 Calm & Themed

Built to be a calm, centring time-waster: no startling events, no punishing fail states.

- **Zen mode (on by default):** no clock, no par or time records, bumping costs nothing. Toggle with the **Zen** button or in Stats → Settings.
- **Every event is telegraphed:** a 2.5s soft warning (edge glow, a breathing ring, or gathering light) plus a calm caption the first time. Events are spaced 25-40s apart, never in the first 30s, max 5 per galaxy (3 in breathers).
- **Void Gift:** the old Void Pulse now gently draws nearby food *toward* you.
- **Themed galaxies with a rhythm:** Debris Reef → Comet Current → *Planet Nursery* → Ruined Armada → Void Rift → *Star Meadow* → Neutron Forge → … Every 3rd galaxy is a short "breather" (~1-1.5 min) full of big, easy food. Each biome has its own palette, drone chord, eat-sound key (major pentatonic) and signature event.
- **Breathing pulse:** the drone, biome glow and hole halo swell on a slow 10s cycle (~6 breaths/min). Optional breathing guide ring.
- **Softer everything:** eased bumps (no screen shake; combo pauses instead of resetting), bloom instead of a white flash, soft pad cues, power-ups rarer/longer and fading out instead of ending abruptly.
- **Settings:** Zen, breathing guide, soft palette, reduce motion, touch controls. **"What's that?" codex** in Stats explains every event and galaxy you've seen.

Tuning knobs: `CFG` event spacing in `js/living-world.js`, power-up timings in `js/powerups.js`, `BREATHER_TARGET` in `js/progression.js`, `MAX_BITE` / `BREATHER_BITE` / bump constants in `js/game.js`.

## v2.0

- **Upgrade shop + stardust**: every cleared galaxy pays out stardust (galaxy bonus, objects eaten, best combo, big catches, speed bonus, new records). Spend it on 6 permanent upgrades x 5 levels: Seed Mass, Thrusters, Event Horizon, Gravity Well, Momentum and Power Surge.
- **Galaxy summary screen**: clear time, best combo, objects eaten, big catches, "NEW BEST" badges and a stardust breakdown, with the shop and a Continue button.
- **Stats & Records view** (trophy button): totals, records, fastest clear per galaxy, upgrade levels.
- **Bigger fish**: food and threats now scale with your size. There are always a few red-ringed objects you can't eat yet. Bump into one and you lose a little mass. Outgrow it and swallow it for a **BIG CATCH**.
- **Power-ups**: rare glowing orbs that are always edible. **Magnet** pulls food in, **Slow-Mo** slows the galaxy (not you), **Double Mass** doubles every bite. Active timers show under the HUD.
- **Zoom-out camera** that scales with your size, so the hole stays a sensible size on a phone screen.
- **Real combos**: a 1.25s combo window, and combos add up to +40% mass.
- **Juice**: screen shake, floating text, slurp animation, new sounds for power-ups, bumps, big catches and purchases.
- **Saves mid-galaxy** (mass + run stats), also when the phone backgrounds the app. v1 saves migrate automatically, plus a stardust legacy bonus for galaxies already cleared.
- **PWA fixes**: relative paths (works from a subfolder like GitHub Pages), network-first service worker so edits show up right away, `100dvh` + safe-area layout for phones.

