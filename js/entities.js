// ─── ENTITY SYSTEM ───
// Object types, biomes, spawning, galaxy shapes
// Objects drift naturally within boundaries. NO pull toward the black hole.

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
  }
];

export const biomeCatalog = [
  {
    name: "Debris Reef",
    tint: "#0d1633",
    tintRGB: [13, 22, 51],
    borderColor: "#1a2e6a",
    weights: { dust: 6, junk: 5, meteor: 3, comet: 1, craft: 1, planet: 0.5, star: 0.2, neutron: 0 },
    description: "Dense fields of drifting wreckage"
  },
  {
    name: "Comet Current",
    tint: "#0a2238",
    tintRGB: [10, 34, 56],
    borderColor: "#164a6e",
    weights: { dust: 3, junk: 1, meteor: 1, comet: 7, craft: 1, planet: 1, star: 0.5, neutron: 0 },
    description: "Rivers of ice and light"
  },
  {
    name: "Ruined Armada",
    tint: "#1a0e30",
    tintRGB: [26, 14, 48],
    borderColor: "#4a2a7a",
    weights: { dust: 2, junk: 3, meteor: 2, comet: 1, craft: 6, planet: 1, star: 0.5, neutron: 0 },
    description: "Graveyard of ancient vessels"
  },
  {
    name: "Planet Nursery",
    tint: "#0e2218",
    tintRGB: [14, 34, 24],
    borderColor: "#1e5a3a",
    weights: { dust: 2, junk: 1, meteor: 1, comet: 1, craft: 1, planet: 6, star: 2, neutron: 0 },
    description: "Worlds forming in the dust"
  },
  {
    name: "Star Meadow",
    tint: "#221a08",
    tintRGB: [34, 26, 8],
    borderColor: "#6a5a1e",
    weights: { dust: 2, junk: 1, meteor: 1, comet: 1, craft: 1, planet: 2, star: 6, neutron: 0 },
    description: "Brilliant fields of burning suns"
  },
  {
    name: "Void Rift",
    tint: "#0a0a1e",
    tintRGB: [10, 10, 30],
    borderColor: "#2a2a5a",
    weights: { dust: 4, junk: 2, meteor: 2, comet: 2, craft: 2, planet: 2, star: 2, neutron: 1 },
    description: "The space between spaces",
    minGalaxy: 3
  },
  {
    name: "Neutron Forge",
    tint: "#14101e",
    tintRGB: [20, 16, 30],
    borderColor: "#5040aa",
    weights: { dust: 3, junk: 2, meteor: 2, comet: 2, craft: 2, planet: 2, star: 3, neutron: 4 },
    description: "Where dead stars are born again",
    minGalaxy: 5
  }
];

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

export function createEntity(type, x, y) {
  const r = rand(type.minR, type.maxR);
  const color = pickRandom(type.colors);
  const angle = rand(0, Math.PI * 2);
  const speed = rand(type.speed * 0.4, type.speed);
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
    tone: type.tone + rand(-20, 20),
    glow: type.glow,
    hasTail: !!type.hasTail,
    shape: type.shape || "circle",
    bands: bandSet,
    // Consume animation state
    consuming: false,
    consumeProgress: 0,
    consumeTarget: null
  };
}

export function getBiome(galaxy) {
  // Filter to available biomes, then pick based on galaxy number
  const available = biomeCatalog.filter(b => !b.minGalaxy || galaxy >= b.minGalaxy);
  return available[galaxy % available.length];
}

export function spawnGalaxy(galaxy) {
  const count = galaxyObjectCount(galaxy);
  const bounds = galaxyBounds(galaxy);
  const biome = getBiome(galaxy);
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

    // Speed cap to base speed
    const speed = Math.hypot(e.vx, e.vy);
    const maxSpeed = e.baseSpeed * 1.5;
    if (speed > maxSpeed) {
      e.vx = (e.vx / speed) * maxSpeed;
      e.vy = (e.vy / speed) * maxSpeed;
    }
  }
}
