# Black Hole: Galaxy Eater — Design & Handoff

## 0. North Star (read before every change)

**The game is about FEELING yourself grow.** You start as a just-born, minuscule black hole eating
dust, and you become something vast. Every change must strengthen that growth feeling.

**One loop: Born → grow → collapse → reborn stronger.** (v9)
- **Growth is THE progression.** Tier-ups and layer merges are the rewards. There is nothing else to grind for inside a run.
- **Galaxies flow into each other** with a gentle in-play transition: a soft caption, a crossfade, a star quietly added to the star map. No summary screen, no shop, nothing interrupts play.
- **Collapse is the ONLY reset.** **Dark Matter is the ONLY meta currency.** **The perk constellation is the ONLY upgrade screen.**
- **Goal stars are optional discoveries.** They're noted in the logbook and give a little Dark Matter, with no separate perk track.
- **Everything you meet fits your scale.** Every event and object only appears when it's edible or at most one tier up (no meteor showers in Space Dust). Anything bigger waits in the back depth layers.

**Zen exists to calm and refocus, then let you go.** It never traps you.

**Check every change against these three questions. If one gets a "no", rethink the change.**
1. Does it make growth more *felt*? Think scale, the world shrinking around you, and the next layer arriving. Does it fit the one loop, or does it add a second currency, screen or reset?
2. Is it calm? No startles, no flashes, no clutter.
3. Does it serve Zen's purpose? Calm, refocus, then a clean exit.

**Standing preferences (Brian)**
- **Audio:** soft and research-based. See `docs/AUDIO_RESEARCH.md` and §7d. No harsh sounds; music must never cause headaches.
- **Grindy galaxies are welcome as walls.** A slow, heavy galaxy is fine as a gate. There is no actual boss.
- **The wisp:**
  - In Zen it stays beside the hole as the breath guide and doesn't wander off to hint.
  - In every mode it is drawn above everything and is never covered.
- **Zen level pacing is liked.** Keep Zen durations as they are.
- **Keep the prestige/Ascension structure:** collapse → Dark Matter → constellation perks, with optional galaxy goals and calm rivals (v9: one loop, one currency, one upgrade screen).

Read this first if you're the bot picking up this game. It records what the game is for, the
rules it follows, how it works, and how to ship changes. Current version: **v9.0**
(`VERSION` in `js/game.js`, `CACHE_NAME = "blackhole-v9.0"` in `sw.js`, `SAVE_VERSION = 8` in `js/save.js`).
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
- **v9 art (every type its own little painting).** Brian: "the space dust looks like mobs", "planets and meteors need different graphics for everything".
  - **Looks:** each type has a set of looks (`LOOKS` in art.js); `lookOf(e)` takes `e.look` if >= 0, else the seed. Types in `OWN` paint their own palette, so their cache key is `type||look|variant` (planet keeps variant for rings/moon). One look always paints the same.
  - **Dust** is never a round blob: a faint drift of gas carrying grains and glints (silicate grit, ice glints, carbon soot, pink gas wisp). **Grit & pebbles:** low-poly lit chips, gravel handfuls, ice flakes, glassy basalt, rust. **Asteroids** (`meteor` type): lumpy potatoes and contact binaries in stony, iron (metal sheen), carbon and rusty tones, lit craters. **Meteors** are shower rocks with `e.hot = 1` (set in living-world `streamEvent`): a glowing entry streak (`tailFor(.., hot)`) and a heated leading edge (`heatFor`), both rotated to the velocity and fading as it slows. No meteor showers at tier 0 (a Dust Drift stands in; see tier gating in §7c).
  - **Comets:** dark icy nucleus, cyan / C2-green / white coma, soft sunward jets, warm dust tail + blue ion tail. **Moons:** grey maria, icy cracked (Europa), volcanic (Io), dark dusty (Callisto), bright tiger-striped, rusty with one big crater. **Planets:** 10 archetypes (`planetPalette`): rocky, ocean, desert, ice, lava, banded gas giant with a storm, ice giant, ringed, cloud-wrapped, exotic; 30 looks. Atmosphere halo is thicker on the lit side and the limb glow is hidden by night.
  - **Stars** by spectral type (`SPECTRA`, M to B, spots on cool stars); the Cradle sun is pinned to `look: 0` (G). **Systems:** sun by type, tilted orbits, little lit worlds, sometimes a companion star or a belt. **Nebulae:** emission, blue reflection, planetary ring, dark pillars (only where the glow is), supernova filaments. **Clusters:** globular or open. **Galaxies:** spiral, barred, elliptical, irregular, edge-on.
  - **Light:** always upper left (`LX, LY`). Rocks sway (sin of rotation, ±0.35 rad) instead of spinning so their light stays put. `shade()` gives a curved terminator; `facets()` lights chips.
  - **Back layers** use 8 looks per type; an object merging forward keeps the look it had in the haze.
  - **Sky/backdrop:** the near "mote" layer is faint dust streaks, far galaxies are dim small smudges with no bright eye-like core (they read as creatures/food before).
  - **Audit tool:** `tools/art-gallery.html?type=planet&px=40&n=12&cols=3&q=high[&hot][&blur=2]` paints every look of a type; `/workspace/bhpt/v9gallery.py` and `v9game.py` screenshot all types and tiers.

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

### 5b. Growth you can feel (v8.3, `js/depth.js`). This serves the North Star.
- **The play layer holds what fits you now.** A brand-new hole sees only dust: tier 0 food is dust only, with no biome signature and no big fish while in tier 0. Inedible "bigger fish" are kept to the minimum pace needs (3–4 per regular galaxy from tier 1 on, 1–2 in breathers; cutting them to 2 slowed Comet Current ~15%), and they drift in from the back layer. **At most ~1 tier above you (v8.4):** a big type or biome signature whose home tier (the first tier it is food) is more than one above yours never enters play (`homeTier` in tiers.js); bigger fish are 1.3–2.2× your radius (one tier is 2.6×), and at Grit & Pebbles they are rough rock only. Anything 2+ tiers up stays in the back depth layers.
- **Landmarks follow the layers too.** At tier 0 the Debris Reef reefs are faint haze with no rock; the tier-1 set merges in (fades up over `MERGE_FRAMES`) with rock, and its caption (`minTier: 1` in `MECHANICS`) waits until then. A fresh game opens with "You've just been born. Drift and gather the dust."
- **Back depth layers show the next 3 tiers** (layers for tiers t+1, t+2 and t+3; Lite shows 2).
  - They are hazy, dimmer, sparser and on slower parallax, using pre-blurred cached sprites (`blurFor`).
  - Deeper layers look bigger but blurrier: they are huge things far away.
  - They are hashed in screen space, so there is no per-object state. They never interact.
- **Merge on tier-up.** The layer for the tier you just reached steps forward. Up to 14 of its visible objects become real food at the same screen spots.
  - Each one starts at its hazy apparent size (`depthK0`), then sharpens, brightens and grows in over `MERGE_FRAMES` (~2.5s). It is non-interactive while `depthT` < 1.
  - Deeper layers glide forward one step at the same time, and the camera pull-back plays together with the merge.
  - The first time for each tier: the tier chime plus the caption "You're big enough now. The <things> drift closer."
- **You visibly outgrow food within a tier.** Food is sized from a lagging reference: `growRef` = anchor·(R/anchor)^0.4. Fresh food therefore gets relatively smaller as you grow, until the next reveal.
  - `e.gainK` = (full/actual size)² gives back the bite value, so balance is unchanged.
- **Rivals** fade and scale in from the back over 2.5s and can't touch you until fully arrived. **Galaxy start** resets the layers (fine dust at your scale, bigger things behind).
- When adding tiers or types, check `layerTypes()` picks a sensible representative (it scores what is newly prominent at that tier).

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
- **End-of-galaxy ritual:** (v6–v8; dropped in v9, folded into the in-play galaxy flow: a soft chime and the galaxy caption, the star joins the map silently.)
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

### Prestige design (v9: one loop) (`js/ascension.js`, `js/rivals.js`, `js/constellation.js`)
Born → grow → collapse → reborn stronger. One reset (Collapse), one meta currency (Dark Matter),
one upgrade screen (the constellation). There is no in-run currency or shop (stardust was removed
in v9; saves refund it, see below).
- **Inside a run, growth is the progression.** Tier-ups and depth-layer merges are the rewards.
- **Galaxy flow** (`galaxyComplete` / `updateTransition` in game.js). At the target size the galaxy
  is credited quietly (stats, records, `galaxyLog` star, run depth). Phase `flowout` (90 frames)
  softly veils the view toward the next galaxy's colour while you keep drifting and eating. The
  next galaxy is built under the veil (`initGalaxy(n, null, true)` keeps your drift), then `flowin`
  (130 frames) lifts it with a caption ("GALAXY N", biome, line; the tier-banner style) and a soft
  chime. Play never stops; no modal. The star map lives in the pause menu and on the title.
- **Tier gating** (`js/tiers.js`): `fitType(state, id)` swaps any explicitly spawned type more than
  one tier up for the biggest food of your tier; `eventFor(state, id)` swaps stream events whose
  content isn't edible yet (meteor shower / comet stream / derelict flotilla → meteor shower or
  Dust Drift) and Stellar Birth below tier 6 for a Soft Bloom. All `fireEvent` and mechanic spawns
  pass through these.
- **Run depth** = galaxy number in the current run. Per depth d:
  - growth needed ×`CLIMB_GROWTH^(d-1)` (`DEPTH.CLIMB_GROWTH`; breathers ×0.85 of that with Quiet Cradle).
  - food density `1 - 0.035(d-1)`, floor 0.62.
  - calm rival holes from depth 3: 1 + floor((d-3)/2), max 3, size 1.5 + 0.12(d-3) × yours.
    Rivals eat food and ease you aside. They never take mass. Once outgrown they turn gold and
    can be swallowed.
- **Collapse** (from 3 cleared). Offered, never forced: when growth clearly slows (over 3 min in
  a galaxy and on pace for 9+, the sim's wall; breathers 2 / 4.5 min) a soft "Growth is slowing · Collapse?" pill
  appears under the HUD (`checkCollapseNudge`). Always available from the pause menu. The confirm
  card shows the Dark Matter breakdown, then the singularity, then the constellation, then the
  rebirth: the same newborn intro as the first launch ("Collapse N." / "Reborn." / "Grow.", then
  the birth) at Galaxy 1 as dust. Dark Matter = `3·cleared^1.5 + 2·peakTier` + finds bonus (f6)
  + 5/golden galaxy, × Fortune.
- **Constellation:** 27 nodes in three branches (Reach, Appetite, Fortune), 7 tiers each. Tiers
  3 and 5 are forks (a real choice). Tier costs 8 / 16 / 28 / 45 / 70 / 100 / 150. The old shop
  and galaxy perks are folded in: Solar Wind (speed, was Thrusters + Current Rider), Momentum
  (combo cap and window, was Momentum + Patient Bloom), Second Helping (power-up length and
  frequency, was Power Surge + Aurora Heart), Quiet Cradle (f3b, breathers need 15% less growth,
  was Cradle Blessing), Star Reader (f5b, goal stars give double DM). Reach/pull nodes cover the
  old Event Horizon and Gravity Well. Seed Mass, Salvager and Pulsar Core are gone.
- **Galaxy goals are optional discoveries:** each biome has its own goal (graze reefs, ride rivers,
  eat orbiting worlds, hull crumbs, aurora bites, full blooms, bites in beams), rated 1–3 stars,
  shown on the HUD and in the logbook. Each new best star gives +2 DM (`GOAL_DM`, ×2 Star Reader).
  No perks hang on them.
- **Milestones** by collapse count (only the ones that change what you see):

  | Collapses | Unlock |
  |---|---|
  | 1 | golden galaxies (8%, +5 DM each) + Ember skin |
  | 3 | supernova runs (12% of runs, bites ×1.5) + Aurora skin |
  | 6 | Pearl skin |

- **v9 save migration (SAVE_VERSION 8):** unspent stardust plus the cost of every bought upgrade
  level becomes Dark Matter at 25 stardust each (a maxed shop ≈ 125 DM); each galaxy perk owned
  gives 8 DM and is removed (f3b/f5b keep their ids with the new effects). v1 saves' legacy
  stardust bonus is included. A one-time title hint says what came back.
- **Tuning numbers** (`tools/collapse-sim.mjs`, run `node tools/collapse-sim.mjs`): see the v9
  table below.

  - Bot time ≈ base × climbK^0.72 (base back-fitted from v9 bot runs at depths 1–7: Reef 186s,
    Comet 263, Nursery 93, Armada 262, Void 147, Meadow 84, Forge 204). Humans are about 1.2× the bot.
  - The wall: the next galaxy would take more than 9 minutes (the same line as the in-game nudge).
  - Comet Current and Ruined Armada stay the grind walls (Brian likes them); v9 made Nursery, Void
    Rift and Meadow a little quicker (`MEATY.byBiome` / `capBiome`).

  | Cycle | Depth | Min | DM | Perks | Power |
  |---|---|---|---|---|---|
  | 1 | 6 | 29 | 66 | 0 | 1.00 |
  | 2 | 8 | 37 | 112 | 5 | 1.29 |
  | 3 | 8 | 31 | 112 | 9 | 1.57 |
  | 4 | 10 | 37 | 149 | 13 | 1.88 |
  | 5 | 10 | 35 | 192 | 15 | 2.00 |
  | 6 | 10 | 30 | 192 | 18 | 2.27 |
  | 7 | 13 | 46 | 271 | 21 | 2.43 |
  | 8 | 15 | 49 | 328 | 23 | 3.28 |
  | 9 | 17 | 44 | 544 | 26 | 4.81 |

  First collapse: ~29 min of cleared galaxies, and the prompt appears ~3 min into Neutron Forge
  (depth 7). The tree fills in about 10 collapses (~6.5 hours).

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

- **v1–v2:** core eat-and-grow, stardust upgrade shop (removed in v9) (6 upgrades × 5 levels), galaxy summary, stats/records, bigger fish/threats, power-ups (Magnet, Slow-Mo, Double Mass), mid-galaxy saves, PWA fixes.
- **Joystick:** the floating thumbstick became the default.
- **v3.0 Calm & Themed:** Zen default, telegraphed events, Void Gift, biome rhythm with breathers, breathing pulse, codex.
- **v4.0 Feels Finished:** title screen, first-launch intro, drift-in, pause menu, painterly art, new black hole, quality setting.
- **v4.1 Worlds:** the 7 galaxy mechanics, landmarks, pacing.
- **v5.0 Vast:** the tier ladder, no edges, camera reveals, parallax sky, local radar, music layers.
- **v5.1 Polish:** mechanics follow you, regrowth, readable vast food, radar rim markers, pacing.
- **v5.2 Star Map & Wisp:** star map, wisp, save backup, cleanup, README and CHANGELOG. Merged to `main` from `v2-fun-update` (that branch is kept).
- **v9.0 One loop + painted looks:** born → grow → collapse → reborn stronger. Stardust and its shop removed (save v8 refunds them as Dark Matter, 25 stardust = 1 DM, +8 DM per galaxy perk); galaxy perks folded into constellation nodes; no summary screen: galaxies flow into each other in play (soft veil, caption, chime, star added silently; star map in pause and title); soft collapse prompt when growth slows, then constellation and a rebirth intro; goal stars are optional logbook entries worth +2 DM per new best star; milestones pruned to golden / supernova / skins. Events and mechanic objects are tier-gated (`fitType`, `eventFor` in tiers.js: content at most one tier up; Dust Drift / Soft Bloom stand in at Space Dust). Rebalanced (Nursery, Void Rift, Meadow quicker; Comet and Armada stay the walls). Art: every type has painted looks (§3).
- **v8.6 A real beginning:** the intro is a dark void that hides the galaxy (wordmark, then "Drift. / Eat what's smaller. / Grow."), then the void lifts over ~2.8s while the newborn hole is born in the play view (`state.birth` scales the drawn hole). `seenHints.intro` is set only when the intro has played, and boot shows the intro whenever it is unset, so an interrupted start-over resumes at the beginning. SW updates: `reg.update()` whenever the app returns to the front; on `controllerchange` the game saves and reloads at a calm moment (title or hidden), coming back to the title.
- **v8.5 True fresh start:** title "Start completely over" (`startCompletelyOver` in game.js) wipes progress, Ascension, the star map's galaxy log and all `seenHints` (onboarding, codex seen flags, tier/merge captions), ends any Zen session, then replays the first-launch intro and drift-in into a newborn dust-only galaxy 1. Settings, lifetime stats, fastest times, the logbook and Zen notes stay.
- **v8.4 Still tiny:** big inedible objects in play are at most ~1 tier up (`homeTier` filter on big types and biome signatures; bigger-fish 1.3–2.2× your radius; rough rock only at Grit & Pebbles); Debris Reef reefs are back-layer haze at tier 0 and merge in at tier 1 (caption waits, `minTier`); newborn opening hint.
- **v8.3 Growth you can feel:** North Star (§0); a fresh game is dust only, bigger tiers wait in blurred back depth layers and merge into play on tier-up (`js/depth.js`, §5b); the hole visibly outgrows its food; rivals drift in from the back; reef tendrils (the "snakes") removed.
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
js/depth.js         v8.3 back depth layers + tier merge
js/render.js        particles, ripples, radar        js/audio.js     WebAudio drone, layers, sounds
js/wisp.js          companion wisp       js/starmap.js     star map
js/discoveries.js   rare finds (v6)      js/logbook.js     logbook screen (v6)
js/ascension.js     v7 prestige logic    js/constellation.js perk screen
js/rivals.js        calm rival holes     js/zen.js          Zen sessions + exit
tools/collapse-sim.mjs  collapse-curve model (node)   tools/audio-analyze.py  offline audio render + metrics
js/powerups.js      power-ups            js/progression.js base mods, run records, formatting
js/save.js          localStorage, migration, backup codes   js/ui.js  HUD, stats, settings, codex
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
