const hypot = (x, y) => Math.sqrt(x * x + y * y);   // 2-arg Math.hypot without the varargs cost
// ─── ENTITY SYSTEM ───
// Spawning, motion and the galaxy -> biome order. The data (object types and
// biomes) lives in js/data/; it is re-exported here so callers keep one import.
// Objects drift naturally within boundaries; the gravity well in living-world.js
// pulls edible objects toward the black hole.

import { objectTypes } from "./data/objects.js";
import { biomeCatalog, BREATHERS, REGULARS } from "./data/biomes.js";
import { CometTail } from "./core/CometTail.js";
export { objectTypes, biomeCatalog };

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

export function typeAvgRadius(type) {
  return (type.minR + type.maxR) / 2;
}

export function typeById(id) {
  return objectTypes.find(t => t.id === id) || objectTypes[0];
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
    tail: type.hasTail ? new CometTail() : null,
    shape: type.shape || "circle",
    bands: bandSet,
    // Consume animation state
    consuming: false,
    consumeProgress: 0,
    bigFish: false,
    // Hot fields, declared up front so every entity shares one shape and
    // numeric writes stay unboxed (these defaults match "unset" everywhere)
    consumed: false, swallow: false,
    _spawnAge: 60, _spawnAlpha: 1, _pullCap: 0, _crumbleCd: 0,
    _sp: null, _artBase: null,
    // v8.3 growth: depthT < 1 while drifting in from a back layer (non-interactive),
    // depthK0 = apparent size it starts at; gainK keeps bite value when food is drawn smaller
    depthT: 1, depthK0: 1, gainK: 1, mergeGlow: 0,
    // v9 art (visual only): look = painted look (-1: from the seed); hot = a meteor
    // entering hot (glowing streak and leading edge), set by meteor showers
    look: -1, hot: 0,
    // v9.4 ships (ships.js): class, wreck (tumbles) or living (steers nose-first)
    ship: "", wreck: false, steer: false,
    _mc: color + "88", _ec: color + "55"   // minimap dot / edge arrow colours
  };
}

export function getBiome(galaxy) {
  // 1 Debris, 2 Comet, 3 Nursery*, 4 Armada, 5 Void, 6 Meadow*, 7 Forge, 8 Debris...
  if (isBreather(galaxy)) return byName(BREATHERS[(galaxy / 3 - 1) % 2]);
  const regularIndex = galaxy - 1 - Math.floor(galaxy / 3);
  return byName(REGULARS[regularIndex % REGULARS.length]);
}

export function updateEntities(entities, bounds, dt) {
  for (const e of entities) {
    if (e.consuming) continue; // Frozen during consume animation

    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.rotation += e.rotSpeed * dt;
    if (e.steer) {
      // v9.4: living ships turn gently to face where they're gliding
      let da = Math.atan2(e.vy, e.vx) - e.rotation;
      da -= Math.round(da / 6.283185307179586) * 6.283185307179586;
      e.rotation += da * Math.min(1, 0.03 * dt);
    }

    // Bounce off circular boundary
    const dist = hypot(e.x, e.y);
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
    const speed = hypot(e.vx, e.vy);
    const maxSpeed = Math.max(e.baseSpeed * 1.5, e._pullCap || 0);
    e._pullCap = 0;
    if (speed > maxSpeed) {
      const f = Math.max(maxSpeed / speed, Math.pow(0.95, dt));
      e.vx *= f;
      e.vy *= f;
    }
  }
}
