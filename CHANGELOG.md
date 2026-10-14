# Changelog

All notable changes to Black Hole: Galaxy Eater. Saves carry forward through every version.

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

