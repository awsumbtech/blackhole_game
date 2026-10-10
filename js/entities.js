// ─── ENTITY SYSTEM ───
// Object types, biomes, spawning, galaxy shapes.
// Objects drift naturally within boundaries; the gravity well in living-world.js
// pulls edible objects toward the black hole.

// You can swallow an object when your radius > its radius * eatRatio.
// The base ratio lives here so the render "too big" ring and tryConsume agree.
export const BASE_EAT_RATIO = 0.88;

export const objectTypes = [
  {
    id: "dust",
    label: "Space Dust",
    colors: ["#6b7399", "#7e86ad", "#5c647d"],
    minR: 2, maxR: 4,
    density: 0.5,
    speed: 0.3,
    tone: 280,
    glow: 0,
    sizeClass: 0  // smallest — always eatable
  },
  {
    id: "junk",
    label: "Debris",
    colors: ["#8894b7", "#7a8aaa", "#9ba4c2"],
    minR: 3, maxR: 6,
    density: 0.8,
    speed: 0.2,
    tone: 200,
    glow: 0,
    sizeClass: 1
  },
  {
    id: "meteor",
    label: "Meteor",
    colors: ["#b8ac8c", "#c4b690", "#a89c7a"],
    minR: 5, maxR: 9,
    density: 1.2,
    speed: 0.35,
    tone: 180,
    glow: 0.15,
    sizeClass: 2
  },
  {
    id: "comet",
    label: "Comet",
    colors: ["#83d7ff", "#6ec8f5", "#99e2ff"],
    minR: 4, maxR: 7,
    density: 1.0,
    speed: 0.8,
    tone: 260,
    glow: 0.4,
    sizeClass: 1,
    hasTail: true
  },
  {
    id: "craft",
    label: "Derelict",
    colors: ["#c28eff", "#b07ae0", "#d4a2ff"],
    minR: 6, maxR: 11,
    density: 1.4,
    speed: 0.18,
    tone: 210,
    glow: 0.2,
    sizeClass: 3,
    shape: "polygon"
  },
  {
    id: "planet",
    label: "Planet",
    colors: ["#62c38c", "#4db87a", "#78d4a0"],
    bands: [["#4a9e6e", "#62c38c", "#88ddb0"], ["#3d7a8e", "#5ba4b8", "#82c8d8"], ["#8e6a3d", "#b88a5b", "#d8b282"]],
    minR: 10, maxR: 16,
    density: 2.0,
    speed: 0.06,
    tone: 140,
    glow: 0.1,
    sizeClass: 4
  },
  {
    id: "star",
    label: "Star",
    colors: ["#ffd86d", "#ffcc44", "#ffe599"],
    minR: 14, maxR: 22,
    density: 2.8,
    speed: 0.03,
    tone: 110,
    glow: 0.7,
    sizeClass: 5  // biggest — need large radius to eat
  },
  {
    id: "neutron",
    label: "Neutron Star",
    colors: ["#e0e8ff", "#c8d4ff", "#f0f4ff"],
    minR: 4, maxR: 6,
    density: 5.0,
    speed: 0.02,
    tone: 80,
    glow: 0.9,
    sizeClass: 3,  // small but dense — needs decent size
    minGalaxy: 4
  },
  // v5 "Vast": bigger layers of the universe for the higher scale tiers
  {
    id: "moon", label: "Moon",
    colors: ["#b9bccb", "#a7aab8", "#c8c4bc"],
    bands: [["#8d909e", "#b9bccb", "#d6d8e2"], ["#9a948a", "#c8c4bc", "#e0dcd2"]],
    minR: 8, maxR: 12, density: 1.6, speed: 0.08, tone: 160, glow: 0.05, sizeClass: 4
  },
  {
    id: "system", label: "Star System",
    colors: ["#ffd98a", "#ffc7a0", "#fff1c4"],
    minR: 14, maxR: 20, density: 3, speed: 0.03, tone: 100, glow: 0.6, sizeClass: 5
  },
  {
    id: "nebula", label: "Nebula",
    colors: ["#c48cff", "#7fd6ff", "#ff9fc8", "#9fffd0"],
    minR: 16, maxR: 24, density: 1.4, speed: 0.02, tone: 90, glow: 0.5, sizeClass: 5
  },
  {
    id: "cluster", label: "Star Cluster",
    colors: ["#ffe9b0", "#d6e4ff", "#fff6e0"],
    minR: 14, maxR: 20, density: 3.2, speed: 0.02, tone: 85, glow: 0.7, sizeClass: 5
  },
  {
    id: "galaxy", label: "Galaxy",
    colors: ["#cfc4ff", "#ffd9b0", "#b8e6ff"],
    minR: 16, maxR: 24, density: 3, speed: 0.015, tone: 75, glow: 0.6, sizeClass: 5
  }
];

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
    gainK: 1.2,            // v5: the aurora only feeds near you now
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

const BREATHERS = ["Planet Nursery", "Star Meadow"];
const REGULARS = ["Debris Reef", "Comet Current", "Ruined Armada", "Void Rift", "Neutron Forge"];
const byName = n => biomeCatalog.find(b => b.name === n);

/** Every 3rd galaxy is a breather (alternating Nursery / Meadow). */
export function isBreather(galaxy) {
  return galaxy % 3 === 0;
}

export function rand(min, max) {
  return Math.random() * (max - min) + min;
}

export function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function weightedType(weights, galaxy) {
  const available = objectTypes.filter(t => {
    if (t.minGalaxy && galaxy < t.minGalaxy) return false;
    return (weights[t.id] || 0) > 0;
  });

  const total = available.reduce((sum, t) => sum + (weights[t.id] || 0), 0);
  let r = Math.random() * total;
  for (const type of available) {
    r -= weights[type.id] || 0;
    if (r <= 0) return type;
  }
  return available[0] || objectTypes[0];
}

export function galaxyObjectCount(galaxy) {
  return Math.min(340, 30 + galaxy * 16);
}

export function galaxyBounds(galaxy) {
  // Galaxy radius grows with level
  return 800 + galaxy * 120;
}

export function typeAvgRadius(type) {
  return (type.minR + type.maxR) / 2;
}

export function typeById(id) {
  return objectTypes.find(t => t.id === id) || objectTypes[0];
}

/** True when a black hole of radius playerR can swallow entity e. */
export function canEat(playerR, e, eatRatio = BASE_EAT_RATIO) {
  if (e.powerup) return true;
  return playerR > e.radius * eatRatio;
}

/**
 * scale > 1 makes a bigger copy of the type (used so food and "bigger fish"
 * keep pace with the player as it grows).
 */
export function createEntity(type, x, y, scale = 1) {
  const r = rand(type.minR, type.maxR) * scale;
  const color = pickRandom(type.colors);
  const angle = rand(0, Math.PI * 2);
  const speed = rand(type.speed * 0.4, type.speed) * Math.min(3, Math.sqrt(scale));
  const bandSet = type.bands ? pickRandom(type.bands) : null;

  return {
    id: Math.random().toString(36).substr(2, 9),
    type: type.id,
    sizeClass: type.sizeClass,
    color,
    radius: r,
    density: type.density,
    mass: Math.PI * r * r * type.density,
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    baseSpeed: speed,
    rotation: rand(0, Math.PI * 2),
    rotSpeed: rand(-0.008, 0.008),
    // v4 art: a seed for the painted look and one of 4 variants (rings, moons...)
    seed: (Math.random() * 1e9) | 0,
    variant: Math.floor(Math.random() * 4),
    tone: type.tone + rand(-20, 20),
    glow: type.glow,
    hasTail: !!type.hasTail,
    shape: type.shape || "circle",
    bands: bandSet,
    // Consume animation state
    consuming: false,
    consumeProgress: 0,
    bigFish: false
  };
}

export function getBiome(galaxy) {
  // 1 Debris, 2 Comet, 3 Nursery*, 4 Armada, 5 Void, 6 Meadow*, 7 Forge, 8 Debris...
  if (isBreather(galaxy)) return byName(BREATHERS[(galaxy / 3 - 1) % 2]);
  const regularIndex = galaxy - 1 - Math.floor(galaxy / 3);
  return byName(REGULARS[regularIndex % REGULARS.length]);
}

export function spawnGalaxy(galaxy) {
  const biome = getBiome(galaxy);
  const count = Math.round(galaxyObjectCount(galaxy) * (biome.density || 1));
  const bounds = galaxyBounds(galaxy);
  const entities = [];

  // Spawn in clusters for interesting density variation
  const clusterCount = 3 + Math.floor(galaxy / 3);
  const perCluster = Math.floor(count / clusterCount);

  for (let c = 0; c < clusterCount; c++) {
    // Cluster center within bounds (with margin)
    const cx = rand(-bounds * 0.7, bounds * 0.7);
    const cy = rand(-bounds * 0.7, bounds * 0.7);
    const clusterSpread = rand(100, 350);

    for (let i = 0; i < perCluster; i++) {
      const type = weightedType(biome.weights, galaxy);
      const angle = rand(0, Math.PI * 2);
      const dist = rand(20, clusterSpread);
      const x = cx + Math.cos(angle) * dist;
      const y = cy + Math.sin(angle) * dist;

      // Clamp to within bounds
      const clamped = clampToBounds(x, y, bounds - 30);
      entities.push(createEntity(type, clamped.x, clamped.y));
    }
  }

  // Fill remaining as scattered
  while (entities.length < count) {
    const type = weightedType(biome.weights, galaxy);
    const angle = rand(0, Math.PI * 2);
    const dist = rand(50, bounds * 0.85);
    const x = Math.cos(angle) * dist;
    const y = Math.sin(angle) * dist;
    entities.push(createEntity(type, x, y));
  }

  return { entities, biome, bounds };
}

function clampToBounds(x, y, bounds) {
  const dist = Math.hypot(x, y);
  if (dist > bounds) {
    const scale = bounds / dist;
    return { x: x * scale, y: y * scale };
  }
  return { x, y };
}

export function updateEntities(entities, bounds, dt) {
  for (const e of entities) {
    if (e.consuming) continue; // Frozen during consume animation

    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.rotation += e.rotSpeed * dt;

    // Bounce off circular boundary
    const dist = Math.hypot(e.x, e.y);
    if (dist + e.radius > bounds) {
      // Reflect velocity off the boundary normal
      const nx = e.x / dist;
      const ny = e.y / dist;
      const dot = e.vx * nx + e.vy * ny;
      e.vx -= 2 * dot * nx;
      e.vy -= 2 * dot * ny;

      // Push back inside
      const push = bounds - e.radius - 1;
      e.x = nx * push;
      e.y = ny * push;
    }

    // Very gentle random drift (keeps things moving interestingly)
    e.vx += rand(-0.003, 0.003) * dt;
    e.vy += rand(-0.003, 0.003) * dt;

    // Speed cap: base speed, or the gravity well's higher cap while being pulled.
    // Ease back down instead of snapping so objects leaving the pull glide.
    const speed = Math.hypot(e.vx, e.vy);
    const maxSpeed = Math.max(e.baseSpeed * 1.5, e._pullCap || 0);
    e._pullCap = 0;
    if (speed > maxSpeed) {
      const f = Math.max(maxSpeed / speed, Math.pow(0.95, dt));
      e.vx *= f;
      e.vy *= f;
    }
  }
}
