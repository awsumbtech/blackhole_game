# Black Hole: Galaxy Eater

A browser-based space game where you control a growing black hole consuming objects across procedurally generated galaxies.

![Game Preview](https://img.shields.io/badge/Status-Playable-brightgreen)
![PWA Ready](https://img.shields.io/badge/PWA-Ready-blue)
![No Dependencies](https://img.shields.io/badge/Dependencies-None-orange)

## 🎮 Play Now

Serve the game over HTTP (ES modules require it — `file://` won't work):

```bash
# With Node.js installed:
npx serve

# Or with Python:
python -m http.server 8080
```

Then open **http://localhost:8080** (or the port shown) in your browser.

## 🌌 What's new in v4: Feels Finished

- **Title screen**: the live game is the backdrop, with a slow close-up of your black hole. Continue (shows your galaxy), New Game (asks first; keeps settings, records and codex) and Settings. Shown when the app opens after more than 10 minutes away; otherwise you drop straight back in.
- **First-launch intro**: three quiet lines ("Drift. / Eat what's smaller. / Grow.") over the hole, about 11 seconds, with Skip. Shown once, never again (not even after New Game).
- **Drift-in**: Continue eases the camera into the hole, a breath of dark, then play.
- **Pause menu**: Resume / Settings / Title screen.
- **Painterly art (all code-drawn)**: lit planets with soft cloud bands, atmospheres, rings and moons; stars with coronas and gentle twinkle; cratered meteors; muted wreck hulls with warm windows; comet heads with tapered tails; soft dust.
- **New black hole**: tilted accretion disk that swirls (inner faster than outer), spins up a little when you eat, a photon ring, light bent over the top (lensed arc) and background stars magnified around the edge.
- **Particles**: soft glowing streaks that swirl and spiral into the hole. Reduce Motion keeps them short and fewer.
- **Backgrounds**: two layers of big soft nebula clouds in each biome's colours.
- **Performance**: every object is painted once into a small cached canvas (by type, colour, variant, on-screen size) and stamped each frame; painting is capped at ~2.5 ms per frame. Settings > Visual quality: Auto (default), High, Lite. Auto drops to Lite (1.5x pixel density, one disk layer, no star lensing, fewer particles) if frames run long. `__bh.perf()` reports frame work time.

## 🌙 What's new in v3: Calm & Themed

Built to be a calm, centring time-waster: no startling events, no punishing fail states.

- **Zen mode (on by default):** no clock, no par or time records, bumping costs nothing. Toggle with the **Zen** button or in Stats → Settings.
- **Every event is telegraphed:** a 2.5s soft warning (edge glow, a breathing ring, or gathering light) plus a calm caption the first time. Events are spaced 25-40s apart, never in the first 30s, max 5 per galaxy (3 in breathers).
- **Void Gift:** the old Void Pulse now gently draws nearby food *toward* you.
- **Themed galaxies with a rhythm:** Debris Reef → Comet Current → *Planet Nursery* → Ruined Armada → Void Rift → *Star Meadow* → Neutron Forge → … Every 3rd galaxy is a short "breather" (~1-1.5 min) full of big, easy food. Each biome has its own palette, drone chord, eat-sound key (major pentatonic) and signature event.
- **Breathing pulse:** the drone, biome glow and hole halo swell on a slow 10s cycle (~6 breaths/min). Optional breathing guide ring.
- **Softer everything:** eased bumps (no screen shake; combo pauses instead of resetting), bloom instead of a white flash, soft pad cues, power-ups rarer/longer and fading out instead of ending abruptly.
- **Settings:** Zen, breathing guide, soft palette, reduce motion, touch controls. **"What's that?" codex** in Stats explains every event and galaxy you've seen.

Tuning knobs: `CFG` event spacing in `js/living-world.js`, power-up timings in `js/powerups.js`, `BREATHER_TARGET` in `js/progression.js`, `MAX_BITE` / `BREATHER_BITE` / bump constants in `js/game.js`.

## 🆕 What's new in v2

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

## ✨ Features

### Core Gameplay
- **Size-Based Consumption**: Eat objects smaller than you to grow larger
- **Mass-Based Progression**: Reach a mass threshold to advance — galaxies are never empty
- **Progressive Difficulty**: Quadratic targets (`9000 + 4000g + 2000g²`, see `js/progression.js`)
- **Combo System**: Chain bites within the combo window for bonus mass and ascending audio
- **Smooth Physics**: Momentum-based movement with boundary collision

### Living World System
- **Gravity Well**: Objects near the black hole curve toward you — dust streams in, heavy objects barely budge
- **Dynamic Spawning**: New objects continuously fade in from galaxy edges, maintaining a living population
- **Procedural Events**: 6 event types triggered by game state metrics:
  - *Meteor Shower* — fast rocks from a single direction
  - *Comet Stream* — curved trails of ice and light
  - *Void Pulse* — expanding shockwave rings that push entities outward
  - *Derelict Flotilla* — formation of ancient craft drifting inward
  - *Stellar Birth* — gathering light → flash → explosion spawning a star
  - *Gravitational Wave* — sinusoidal displacement sweeping across the galaxy
- **Ambient Background**: Shooting stars, distant supernova flashes, and faint energy waves

### Biomes (7 Unique Environments)
1. **Debris Reef** - Dense wreckage fields
2. **Comet Current** - Fast-moving ice streams
3. **Ruined Armada** - Ancient spacecraft graveyard
4. **Planet Nursery** - Forming worlds
5. **Star Meadow** - Brilliant burning suns
6. **Void Rift** - Mysterious mixed space (Galaxy 3+)
7. **Neutron Forge** - Dead star remnants (Galaxy 5+)

### Object Types
- **Space Dust** - Tiny, always eatable
- **Debris** - Common wreckage
- **Meteors** - Rocky objects with glow effects
- **Comets** - Fast-moving with particle trails
- **Derelicts** - Large spacecraft remains
- **Planets** - Massive worlds with color bands
- **Stars** - Huge burning suns
- **Neutron Stars** - Small but extremely dense (late game)

### Audio System
- **Procedural Soundscape**: WebAudio API generates all sounds - no audio files needed
- **Adaptive Ambient Drone**: Shifts based on biome color palette
- **Dynamic Consumption Sounds**: Pitch and tone adapt to object properties
- **Combo Chimes**: Ascending arpeggios for rapid consumption chains
- **Event Audio Cues**: Each living-world event has a distinct procedural sound signature
- **Milestone Events**: Satisfying chord progressions for galaxy completion

### Technical Features
- 🎯 **Zero Dependencies**: Pure vanilla JavaScript with ES6 modules
- 📱 **PWA Ready**: Installable with offline support
- 🎨 **Canvas Rendering**: Smooth 60 FPS gameplay
- 💾 **Auto-Save**: LocalStorage every 5 seconds and when the app is backgrounded, including mid-galaxy progress
- 🎮 **Multiple Controls**: Touch, WASD, Arrow Keys, or Mouse movement
- 🔊 **WebAudio Engine**: Fully procedural audio generation

## 🎯 Controls

| Input | Action |
|-------|--------|
| **Touch (hold)** | Drift toward your finger (farther from center = faster) |
| **WASD** / **Arrow Keys** | Move black hole |
| **Mouse Movement** | Direct control |
| **Trophy button** | Stats & records |
| **P** / **Escape** | Pause game |
| **Volume Slider** | Adjust audio level |
| **Restart Button** | Restart current galaxy |
| **Reset All** | Hard reset (clears progress) |

## 🏗️ Project Structure

```
blackhole_game/
├── index.html          # Main HTML structure with HUD
├── manifest.json       # PWA manifest
├── sw.js              # Service worker for offline support
├── css/
│   └── game.css       # Styling and animations
├── js/
│   ├── game.js        # Main game loop and state management
│   ├── entities.js    # Object types, biomes, and spawning
│   ├── living-world.js # Gravity, dynamic spawning, events, ambient effects
│   ├── audio.js       # Procedural audio engine
│   ├── render.js      # Canvas drawing functions
│   ├── input.js       # Keyboard, mouse and touch input
│   ├── save.js        # LocalStorage save/load + migration
│   ├── progression.js # Stardust, upgrades, galaxy targets, records
│   ├── powerups.js    # Magnet / Slow-Mo / Double Mass pickups
│   └── ui.js          # Summary + shop, stats view, power-up timers
└── icons/
    ├── icon.svg       # App icon (vector)
    ├── icon-192.png   # PWA icon (192x192)
    └── icon-512.png   # PWA icon (512x512)
```

## 🚀 Development

### Quick Start
```bash
# ES modules require HTTP — serve locally:
npx serve        # Node.js (easiest)
# or
python -m http.server 8080   # Python
```

### Code Organization
- **Modular ES6**: Each system in its own file
- **Clean Separation**: Game logic, rendering, audio, and input are independent
- **No Build Tools**: Works directly in browsers with ES6 module support
- **Comment Documentation**: Each module has clear section headers

### Key Systems

**Game Loop** (`js/game.js`)
- 60 FPS main loop with delta time
- State management with cached DOM references
- In-place array cleanup (reverse-splice, guarded by dirty flags)
- Galaxy transitions with starfield cache invalidation
- HUD synchronization

**Entity System** (`js/entities.js`)
- 8 object types with unique properties
- 7 biome configurations
- Procedural galaxy generation
- Cluster-based spawning for density variation

**Living World** (`js/living-world.js`)
- Gravity well with distance-based attraction and speed capping
- Depletion spawner + ambient trickle with population cap
- Hazard-function event probability with per-event and global cooldowns
- Screen-space ambient effects (shooting stars, flashes, energy waves)

**Audio Engine** (`js/audio.js`)
- 3-oscillator ambient drone
- Multi-layered consumption sounds with pre-generated noise buffer
- Combo chime system with event audio cues
- Dynamic compression and filtering

**Rendering** (`js/render.js`)
- Offscreen-cached starfield and nebula (only redrawn when camera exceeds buffer threshold)
- Pre-rendered entity sprites for planets and derelicts (baked at spawn time)
- Cached glow canvas shared across all glowing entities
- Black hole gradients cached and rebuilt only on radius change
- Alpha-segmented comet tails and speed trails (no per-frame gradient allocation)
- Mathematically computed edge indicator arrows (no save/translate/rotate/restore)
- Particle system, ripple effects, minimap

## 🎨 Customization

### Adding New Object Types
Edit `js/entities.js` and add to `objectTypes` array:
```javascript
{
  id: "newtype",
  label: "New Object",
  colors: ["#rrggbb"],
  minR: 5, maxR: 10,
  density: 1.5,
  speed: 0.3,
  tone: 200,
  glow: 0.5,
  sizeClass: 3,
  minGalaxy: 1  // Optional: unlock at galaxy N
}
```

### Creating New Biomes
Edit `js/entities.js` and add to `biomeCatalog`:
```javascript
{
  name: "Biome Name",
  tint: "#rrggbb",
  tintRGB: [r, g, b],
  borderColor: "#rrggbb",
  weights: { dust: 5, junk: 3, meteor: 2, ... },
  description: "Flavor text",
  minGalaxy: 1  // Optional
}
```

### Adjusting Difficulty
- `js/progression.js`: `targetMassFor()` (galaxy goal), upgrade costs and effects, stardust payout.
- `js/living-world.js` `CFG`: food size (`FOOD_RATIO_*`, the main pacing knob), bigger fish size/count, pull strength, spawn rates.
- `js/game.js`: `MAX_BITE` (largest single bite as a share of your mass), bump penalty in `bump()`.
- `js/powerups.js`: power-up durations and spawn timing.

In `js/entities.js`:
```javascript
// Object count per galaxy
export function galaxyObjectCount(galaxy) {
  return Math.min(340, 30 + galaxy * 16);  // Adjust multiplier
}

// Galaxy size
export function galaxyBounds(galaxy) {
  return 800 + galaxy * 120;  // Adjust growth rate
}
```

In `js/living-world.js` — tune the `CFG` object for gravity strength, spawn rates, event probabilities, and cooldowns.

## 🌐 Browser Support

- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

Requires:
- ES6 Modules
- Canvas API
- WebAudio API
- LocalStorage

## 📄 License

MIT License - Feel free to use, modify, and distribute!

## 🤝 Contributing

Contributions welcome! Some ideas:
- [ ] New object types and behaviors
- [ ] Additional biomes and themes
- [ ] Power-up system
- [ ] Leaderboard/stats tracking
- [ ] Mobile-optimized controls
- [ ] Accessibility improvements
- [ ] Visual themes/skins

## 🎵 Credits

- **Game Design & Development**: Procedurally generated gameplay
- **Audio**: Fully procedural WebAudio synthesis
- **Graphics**: HTML5 Canvas rendering

---

**Made with ❤️ using vanilla JavaScript, Canvas, and WebAudio**
