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

## ✨ Features

### Core Gameplay
- **Size-Based Consumption**: Eat objects smaller than you to grow larger
- **Mass-Based Progression**: Reach a mass threshold to advance — galaxies are never empty
- **Progressive Difficulty**: Quadratic scaling (`10000 + 5000g + 1000g²`) makes each galaxy harder
- **Combo System**: Chain rapid consumption for ascending audio feedback
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
- 💾 **Auto-Save**: LocalStorage persistence every 5 seconds
- 🎮 **Multiple Controls**: WASD, Arrow Keys, or Mouse movement
- 🔊 **WebAudio Engine**: Fully procedural audio generation

## 🎯 Controls

| Input | Action |
|-------|--------|
| **WASD** / **Arrow Keys** | Move black hole |
| **Mouse Movement** | Direct control |
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
│   ├── input.js       # Keyboard and mouse input handling
│   └── save.js        # LocalStorage save/load system
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
In `js/game.js`:
```javascript
// Mass threshold to complete a galaxy (quadratic scaling)
state.targetMass = 10000 + galaxyNum * 5000 + galaxyNum * galaxyNum * 1000;
```

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
