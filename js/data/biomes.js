// ─── GALAXY DEFINITIONS (data only) ───
// The seven biomes and the order galaxies cycle through them.
// js/entities.js picks one per galaxy (getBiome); js/worlds.js adds the mechanic.

// v3: every biome has its own palette, object mix, drone chord, eat-sound key
// and signature event. Planet Nursery and Star Meadow are "breathers": every
// 3rd galaxy, big easy food, a short ~1-1.5 min clear.
export const biomeCatalog = [
  {
    name: "Debris Reef", signature: "junk",
    tint: "#103040", tintRGB: [16, 48, 64], borderColor: "#2a6a7e",
    nebula: [[90, 170, 200], [110, 140, 210], [80, 200, 175]],
    weights: { dust: 6, junk: 5, meteor: 3, comet: 0.5, craft: 0.5, planet: 0.3, star: 0.1, neutron: 0 },
    events: { meteorShower: 3, derelictFlotilla: 1 },
    sound: { root: 73.4, chord: [1, 1.5, 2.01], cutoff: 420, scale: 293.7 },
    description: "Drifting reefs of wreckage and stone",
    codex: "Slate-blue reefs of junk and pebbles. Graze the clusters; meteor showers drift through."
  },
  {
    name: "Comet Current", signature: "comet",
    tint: "#0b3048", tintRGB: [11, 48, 72], borderColor: "#3a8ab0",
    nebula: [[160, 225, 255], [205, 240, 255], [120, 205, 235]],
    weights: { dust: 3, junk: 0.5, meteor: 0.5, comet: 8, craft: 0.5, planet: 0.5, star: 0.3, neutron: 0 },
    events: { cometStream: 3, meteorShower: 1 },
    gainK: 1.3,            // v5: rivers only feed what's near you now, and the current pulls you along
    sound: { root: 82.4, chord: [1, 1.5, 2.25], cutoff: 700, scale: 329.6 },
    description: "Rivers of ice and light",
    codex: "Icy cyan space full of comets. Comet streams glide across your path."
  },
  {
    name: "Planet Nursery", signature: "planet", breather: true,
    tint: "#0f3424", tintRGB: [15, 52, 36], borderColor: "#3a9a6a",
    nebula: [[120, 230, 170], [90, 205, 205], [180, 240, 150]],
    weights: { dust: 2, junk: 0.5, meteor: 0.5, comet: 0.5, craft: 0.3, planet: 7, star: 1, neutron: 0 },
    events: { stellarBirth: 3, cometStream: 1 },
    sound: { root: 65.4, chord: [1, 1.25, 1.5], cutoff: 600, scale: 261.6 },
    description: "A breather: young worlds, big and easy",
    codex: "A breather galaxy. Soft green space full of young planets. Big, easy bites and a short clear."
  },
  {
    name: "Ruined Armada", signature: "craft",
    tint: "#24163a", tintRGB: [36, 22, 58], borderColor: "#7a5aa0",
    nebula: [[175, 125, 225], [210, 160, 110], [140, 105, 185]],
    weights: { dust: 2, junk: 4, meteor: 1, comet: 0.5, craft: 7, planet: 0.5, star: 0.3, neutron: 0 },
    events: { derelictFlotilla: 3, meteorShower: 1 },
    gainK: 1.15,           // v5.1: hulls are mostly too big to eat, so bites elsewhere count a bit more
    sound: { root: 55, chord: [1, 1.498, 1.189], cutoff: 300, scale: 220 },
    description: "Graveyard of ancient vessels",
    codex: "Dusky violet and bronze. Old ships and pods; slow flotillas of wrecks drift by."
  },
  {
    name: "Void Rift",
    tint: "#0c0c2c", tintRGB: [12, 12, 44], borderColor: "#4a4a9a",
    nebula: [[95, 85, 210], [60, 170, 175], [135, 95, 225]],
    weights: { dust: 4, junk: 2, meteor: 2, comet: 2, craft: 2, planet: 2, star: 2, neutron: 1 },
    density: 0.7, foodBoost: 1.15,
    events: { voidPulse: 3, gravitationalWave: 1 },
    gainK: 0.85,           // v5.1: the aurora follows you now, so it feeds a lot
    sound: { root: 49, chord: [1, 1.5], cutoff: 220, scale: 196 },
    description: "Quiet, sparse, and generous",
    codex: "Deep indigo with faint aurora. Fewer, larger bites, and the void sometimes gives food to you."
  },
  {
    name: "Star Meadow", signature: "star", breather: true,
    tint: "#33260a", tintRGB: [51, 38, 10], borderColor: "#a08a3a",
    nebula: [[255, 205, 115], [255, 175, 95], [255, 232, 165]],
    weights: { dust: 2, junk: 0.5, meteor: 0.5, comet: 0.5, craft: 0.3, planet: 1, star: 7, neutron: 0 },
    events: { stellarBirth: 3, voidPulse: 1 },
    gainK: 1.15,           // v4.1: buds start small, so bites are a bit richer
    sound: { root: 87.3, chord: [1, 1.25, 1.5, 2], cutoff: 800, scale: 349.2 },
    description: "A breather: fields of gentle suns",
    codex: "A breather galaxy. Warm gold fields of little suns. Big, easy bites and a short clear."
  },
  {
    name: "Neutron Forge", signature: "neutron",
    tint: "#1c1430", tintRGB: [28, 20, 48], borderColor: "#7a64c8",
    nebula: [[200, 182, 255], [255, 155, 95], [160, 142, 255]],
    weights: { dust: 3, junk: 2, meteor: 2, comet: 1, craft: 1, planet: 2, star: 3, neutron: 4 },
    events: { gravitationalWave: 3, stellarBirth: 1 },
    gainK: 0.8,            // v4.1: pulsar beams give +50%
    sound: { root: 58.3, chord: [1, 1.5, 2], cutoff: 380, scale: 233.1 },
    description: "Where dead stars are born again",
    codex: "Cool violet with ember sparks. Dense neutron stars; slow gravity waves roll through."
  }
];

// Galaxy order (getBiome): every 3rd galaxy is a breather, alternating; the rest cycle the regulars.
export const BREATHERS = ["Planet Nursery", "Star Meadow"];
export const REGULARS = ["Debris Reef", "Comet Current", "Ruined Armada", "Void Rift", "Neutron Forge"];
