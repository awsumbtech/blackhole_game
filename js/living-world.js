// ─── LIVING WORLD SYSTEM ───
// Gravity well, dynamic spawning (food + "bigger fish" that scale with you),
// procedural events, ambient background life.

import { weightedType, createEntity, rand, typeAvgRadius, typeById } from "./entities.js";
import { prerenderEntitySprite } from "./render.js";
import { playEventCue } from "./audio.js";
import { foodScaleFor } from "./progression.js";

const TAU = Math.PI * 2;

// ─── CONFIG ───

export const CFG = {
  // Gravity well: strength = PULL_K * speedScale * (R / dist)^2 inside R * PULL_RANGE
  PULL_K: 0.06,
  PULL_RANGE: 6,
  PULL_CAP: 2.5,

  // Food is sized relative to the player (fraction of player radius)
  FOOD_RATIO_MIN: 0.08,
  FOOD_RATIO_MAX: 0.22,
  NEAR_SPAWN_CHANCE: 0.7,

  // Bigger fish: always keep a few things on the field you can't eat yet
  BIG_RATIO_MIN: 1.4,
  BIG_RATIO_MAX: 2.6,
  BIG_CHECK_INTERVAL: 30,

  // Population
  POP_RATIO: 0.75,
  SPAWN_CAP_RATIO: 1.6,
  AMBIENT_SPAWN_MIN: 240,
  AMBIENT_SPAWN_RANGE: 180,

  // Event system
  EVENT_EVAL_INTERVAL: 120,
  EVENT_GLOBAL_COOLDOWN: 180,
  EVENT_GRACE_PERIOD: 300
};

const BIG_TYPES = ["planet", "star", "craft", "meteor"];

export function minBigFish(galaxy) {
  return 3 + Math.min(2, Math.floor(galaxy / 3));
}

// ─── MODULE STATE ───

let world = null;

function freshWorldState() {
  return {
    initialCount: 0,
    depletionTimer: 0,
    ambientTimer: 0,
    ambientNext: CFG.AMBIENT_SPAWN_MIN + rand(0, CFG.AMBIENT_SPAWN_RANGE),
    bigTimer: 0,
    bigCount: 0,

    eventEvalTimer: 0,
    globalCooldown: 0,
    graceTimer: CFG.EVENT_GRACE_PERIOD,
    eventCooldowns: {},
    activeEvents: [],
    galaxyTime: 0,

    shootingStars: [],
    shootingStarTimer: 0,
    distantFlashes: [],
    energyWaves: []
  };
}

// ─── PUBLIC API ───

export function initLivingWorld(state) {
  world = freshWorldState();
  world.initialCount = state.initialCount;
}

export function getBigFishCount() {
  return world ? world.bigCount : 0;
}

/** dt = real frame step, worldDt = slowed step while Slow-Mo is active. */
export function updateLivingWorld(state, dt, worldDt = dt) {
  if (!world) return;

  world.galaxyTime += dt;

  updateGravityWell(state, dt);
  updateDynamicSpawning(state, dt);
  updateEventSystem(state, worldDt);
  updateAmbientBackground(state, dt);

  for (const e of state.entities) {
    if (e._spawnAge != null && e._spawnAge < 60) {
      e._spawnAge += dt;
      e._spawnAlpha = Math.min(1, e._spawnAge / 60);
    }
  }
}

export function drawLivingWorldBG(ctx, state, w, h) {
  if (!world) return;
  drawShootingStars(ctx, w, h);
  drawDistantFlashes(ctx, w, h);
  drawEnergyWaves(ctx, w, h);
}

/** Drawn inside the zoomed world transform; w/h are the zoomed (world) viewport. */
export function drawLivingWorldFG(ctx, state, w, h) {
  if (!world) return;
  for (const ev of world.activeEvents) {
    if (ev.draw) ev.draw(ctx, state, w, h);
  }
}

// ─── GRAVITY WELL ───
// Only pulls things you can actually eat; bigger fish don't budge.

export function pullRange(state) {
  const magnet = state.active.magnet > 0;
  return state.radius * CFG.PULL_RANGE * state.mods.pullRange * (magnet ? 2.2 : 1);
}

function updateGravityWell(state, dt) {
  const magnet = state.active.magnet > 0;
  const R = state.radius;
  const range = pullRange(state);
  const k = CFG.PULL_K * state.speedScale * state.mods.pullStrength * (magnet ? 3 : 1);
  const cap = CFG.PULL_CAP * state.speedScale * (magnet ? 2.2 : 1);
  const px = state.playerX;
  const py = state.playerY;

  for (const e of state.entities) {
    if (e.consuming) continue;
    if (!e.powerup && R <= e.radius * state.eatRatio) continue;

    const dx = px - e.x;
    const dy = py - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist > range || dist < 1) continue;

    const ed = Math.max(dist, R * 1.2);
    const strength = k * (R / ed) * (R / ed);
    e.vx += (dx / dist) * strength * dt;
    e.vy += (dy / dist) * strength * dt;
    e._pullCap = cap;
  }
}

// ─── SPAWNING ───

function viewRadius(state) {
  return Math.hypot(state.viewW || 800, state.viewH || 600) / 2;
}

function clampInBounds(state, x, y, radius) {
  const lim = Math.max(10, state.bounds - radius - 4);
  const d = Math.hypot(x, y);
  if (d > lim) return { x: x * lim / d, y: y * lim / d };
  return { x, y };
}

function pickSpawnPos(state, near, radius) {
  let x, y;
  if (near) {
    // Just outside the visible area, so things drift in rather than pop in
    const a = rand(0, TAU);
    const d = viewRadius(state) * rand(1.0, 1.4) + radius;
    x = state.playerX + Math.cos(a) * d;
    y = state.playerY + Math.sin(a) * d;
  } else {
    const a = rand(0, TAU);
    const d = Math.sqrt(Math.random()) * state.bounds * 0.92;
    x = Math.cos(a) * d;
    y = Math.sin(a) * d;
  }
  return clampInBounds(state, x, y, radius);
}

function finishSpawn(e) {
  e._spawnAge = 0;
  e._spawnAlpha = 0;
  prerenderEntitySprite(e);
  return e;
}

/** Aim an entity roughly toward the player so near spawns cross the view. */
function aimAtPlayer(state, e, spread, speed) {
  const a = Math.atan2(state.playerY - e.y, state.playerX - e.x) + rand(-spread, spread);
  e.vx = Math.cos(a) * speed;
  e.vy = Math.sin(a) * speed;
}

/**
 * Create an entity sized as a fraction of the player's radius.
 * forceScale lets bigger fish shrink below the type's natural size early on.
 */
export function spawnScaled(state, type, ratioMin, ratioMax, opts = {}) {
  const desired = rand(ratioMin, ratioMax) * state.radius;
  const raw = desired / typeAvgRadius(type);
  const scale = opts.forceScale ? raw : Math.max(1, raw);
  const e = createEntity(type, 0, 0, scale);
  const pos = opts.pos || pickSpawnPos(state, opts.near ?? true, e.radius);
  e.x = pos.x;
  e.y = pos.y;
  if (opts.near ?? true) aimAtPlayer(state, e, 1.0, e.baseSpeed);
  return finishSpawn(e);
}

function spawnFood(state, near) {
  const type = weightedType(state.biome.weights, state.galaxy);
  const fs = foodScaleFor(state.galaxy);
  return spawnScaled(state, type, CFG.FOOD_RATIO_MIN * fs, CFG.FOOD_RATIO_MAX * fs, { near });
}

function spawnBigFish(state) {
  const weights = {};
  for (const id of BIG_TYPES) weights[id] = state.biome.weights[id] || 0;
  if (!Object.values(weights).some(v => v > 0)) weights.planet = 1;
  const type = weightedType(weights, state.galaxy);
  const e = spawnScaled(state, type, CFG.BIG_RATIO_MIN, CFG.BIG_RATIO_MAX, { near: true, forceScale: true });
  // Start at the edge of the view (fading in) so there's usually one on screen
  const a = rand(0, TAU);
  const d = Math.min(state.viewW, state.viewH) * rand(0.45, 0.75) + e.radius * 0.5;
  const pos = clampInBounds(state, state.playerX + Math.cos(a) * d, state.playerY + Math.sin(a) * d, e.radius);
  e.x = pos.x;
  e.y = pos.y;
  e.bigFish = true;
  e.baseSpeed = rand(0.2, 0.45) * Math.sqrt(state.speedScale);
  aimAtPlayer(state, e, 0.9, e.baseSpeed);
  return e;
}

function updateDynamicSpawning(state, dt) {
  const cap = Math.floor(world.initialCount * CFG.SPAWN_CAP_RATIO) + 10;
  const popTarget = Math.max(24, Math.floor(world.initialCount * CFG.POP_RATIO));
  const n = state.entities.length;

  // Refill when the field thins out
  const deficit = popTarget - n;
  if (deficit > 0) {
    const interval = Math.max(8, 45 - deficit * 2);
    world.depletionTimer += dt;
    if (world.depletionTimer >= interval) {
      world.depletionTimer = 0;
      if (n < cap) state.entities.push(spawnFood(state, Math.random() < CFG.NEAR_SPAWN_CHANCE));
    }
  } else {
    world.depletionTimer = 0;
  }

  // Ambient trickle
  world.ambientTimer += dt;
  if (world.ambientTimer >= world.ambientNext) {
    world.ambientTimer = 0;
    world.ambientNext = CFG.AMBIENT_SPAWN_MIN + rand(0, CFG.AMBIENT_SPAWN_RANGE);
    if (state.entities.length < cap) state.entities.push(spawnFood(state, true));
  }

  // Bigger fish: keep a minimum number of things you can't eat yet
  world.bigTimer += dt;
  if (world.bigTimer >= CFG.BIG_CHECK_INTERVAL) {
    world.bigTimer = 0;
    let big = 0;
    for (const e of state.entities) {
      if (!e.powerup && !e.consuming && state.radius <= e.radius * state.eatRatio) big++;
    }
    world.bigCount = big;
    const want = minBigFish(state.galaxy) - big;
    for (let i = 0; i < Math.min(2, want) && state.entities.length < cap + 8; i++) {
      state.entities.push(spawnBigFish(state));
      world.bigCount++;
    }
  }
}

// ─── PROCEDURAL EVENT SYSTEM ───

function getMetrics(state) {
  const targetMass = state.targetMass || 400;
  const consumeRatio = world.initialCount > 0 ? 1 - (state.entities.length / world.initialCount) : 0;
  const entityDensity = state.entities.length / Math.max(1, world.initialCount);
  const massRatio = state.mass / targetMass;

  return {
    galaxyTime: world.galaxyTime,
    consumeRatio,
    entityDensity,
    playerMass: state.mass,
    playerRadius: state.radius,
    comboActivity: state.comboCount > 0 ? 1 : 0,
    massRatio,
    galaxy: state.galaxy,
    isEarlyGame: state.mass < 60,
    isMidGame: state.mass >= 60 && massRatio < 0.6,
    isLateGame: massRatio >= 0.6
  };
}

const EVENT_DEFS = [
  {
    id: "meteorShower", cooldown: 900, minGalaxy: 1, minMass: 0,
    hazard(m) { let p = 0.08; if (m.entityDensity < 0.5) p += 0.03; if (m.comboActivity) p += 0.03; return p; },
    fire: fireMeteorShower
  },
  {
    id: "cometStream", cooldown: 1200, minGalaxy: 1, minMass: 0,
    hazard(m) { let p = 0.06; if (m.entityDensity < 0.5) p += 0.04; if (m.galaxyTime > 1800) p += 0.04; return p; },
    fire: fireCometStream
  },
  {
    id: "voidPulse", cooldown: 1500, minGalaxy: 2, minMass: 0,
    hazard(m) { let p = 0.04; if (!m.comboActivity) p += 0.04; if (m.isLateGame) p += 0.06; return p; },
    fire: fireVoidPulse
  },
  {
    id: "derelictFlotilla", cooldown: 1800, minGalaxy: 2, minMass: 40,
    hazard(m) { let p = 0.04; if (m.isMidGame) p += 0.03; if (m.isLateGame) p += 0.04; return p; },
    fire: fireDerelictFlotilla
  },
  {
    id: "stellarBirth", cooldown: 2400, minGalaxy: 1, minMass: 80,
    hazard(m) { let p = 0.03; if (m.isLateGame) p += 0.04; if (m.consumeRatio > 0.5) p += 0.05; return p; },
    fire: fireStellarBirth
  },
  {
    id: "gravitationalWave", cooldown: 1980, minGalaxy: 3, minMass: 0,
    hazard(m) { let p = 0.03; if (m.galaxyTime > 1500) p += 0.03; if (m.consumeRatio > 0.4) p += 0.04; return p; },
    fire: fireGravitationalWave
  }
];

function updateEventSystem(state, dt) {
  if (world.graceTimer > 0) {
    world.graceTimer -= dt;
    updateActiveEvents(state, dt);
    return;
  }

  if (world.globalCooldown > 0) world.globalCooldown -= dt;
  for (const key in world.eventCooldowns) {
    if (world.eventCooldowns[key] > 0) world.eventCooldowns[key] -= dt;
  }

  world.eventEvalTimer += dt;
  if (world.eventEvalTimer >= CFG.EVENT_EVAL_INTERVAL) {
    world.eventEvalTimer = 0;
    if (world.globalCooldown <= 0) {
      const metrics = getMetrics(state);
      for (const def of EVENT_DEFS) {
        if (state.galaxy < def.minGalaxy) continue;
        if (state.mass < def.minMass) continue;
        if ((world.eventCooldowns[def.id] || 0) > 0) continue;
        if (Math.random() < def.hazard(metrics)) {
          def.fire(state);
          world.eventCooldowns[def.id] = def.cooldown;
          world.globalCooldown = CFG.EVENT_GLOBAL_COOLDOWN;
          state.onEvent?.(def.id);
          break;
        }
      }
    }
  }

  updateActiveEvents(state, dt);
}

function updateActiveEvents(state, dt) {
  for (let i = world.activeEvents.length - 1; i >= 0; i--) {
    const ev = world.activeEvents[i];
    ev.age += dt;
    if (ev.update) ev.update(state, dt);
    if (ev.age >= ev.duration) world.activeEvents.splice(i, 1);
  }
}

// Streams enter from just outside the view and sweep across the player's area.
function streamEvent(state, opts) {
  const angle = rand(0, TAU);
  const ev = {
    id: opts.id, age: 0, duration: opts.duration, spawnTimer: 0, spawned: 0,
    count: opts.count, angle,
    update(st, dt) {
      this.spawnTimer += dt;
      const interval = opts.window / this.count;
      while (this.spawnTimer >= interval && this.spawned < this.count) {
        this.spawnTimer -= interval;
        this.spawned++;
        const type = typeById(opts.typeId);
        const a = this.angle + rand(-opts.spread, opts.spread);
        const d = viewRadius(st) * 1.1;
        const pos = clampInBounds(st, st.playerX + Math.cos(a) * d, st.playerY + Math.sin(a) * d, 10);
        const e = spawnScaled(st, type, opts.ratioMin, opts.ratioMax, { pos, near: false });
        const speed = rand(opts.speedMin, opts.speedMax) * st.speedScale;
        const inward = Math.atan2(st.playerY - pos.y, st.playerX - pos.x) + rand(-opts.aimJitter, opts.aimJitter);
        e.vx = Math.cos(inward) * speed;
        e.vy = Math.sin(inward) * speed;
        e.baseSpeed = speed;
        st.entities.push(e);
      }
    }
  };
  world.activeEvents.push(ev);
  playEventCue(opts.id);
}

function fireMeteorShower(state) {
  streamEvent(state, {
    id: "meteorShower", typeId: "meteor", count: Math.floor(rand(6, 10)), duration: 90, window: 60,
    spread: 0.3, aimJitter: 0.35, ratioMin: 0.12, ratioMax: 0.28, speedMin: 0.9, speedMax: 1.5
  });
}

function fireCometStream(state) {
  streamEvent(state, {
    id: "cometStream", typeId: "comet", count: Math.floor(rand(5, 9)), duration: 120, window: 90,
    spread: 0.2, aimJitter: 0.7, ratioMin: 0.12, ratioMax: 0.24, speedMin: 0.7, speedMax: 1.1
  });
}

function fireDerelictFlotilla(state) {
  streamEvent(state, {
    id: "derelictFlotilla", typeId: "craft", count: Math.floor(rand(4, 7)), duration: 60, window: 30,
    spread: 0.15, aimJitter: 0.2, ratioMin: 0.2, ratioMax: 0.4, speedMin: 0.2, speedMax: 0.35
  });
}

// ─── EVENT: VOID PULSE ───

function fireVoidPulse(state) {
  const angle = rand(0, TAU);
  const dist = viewRadius(state) * rand(0.3, 0.7);
  const ss = state.speedScale;
  const ev = {
    id: "voidPulse", age: 0, duration: 90,
    cx: state.playerX + Math.cos(angle) * dist,
    cy: state.playerY + Math.sin(angle) * dist,
    rings: [{ delay: 0, radius: 0 }, { delay: 15, radius: 0 }, { delay: 30, radius: 0 }],
    speed: 3.5 * ss, pushStrength: 0.4 * ss, waveBand: 40 * ss,
    update(st, dt) {
      for (const ring of this.rings) if (this.age >= ring.delay) ring.radius += this.speed * dt;
      const mainRadius = this.rings[0].radius;
      for (const e of st.entities) {
        if (e.consuming) continue;
        const dx = e.x - this.cx;
        const dy = e.y - this.cy;
        const d = Math.hypot(dx, dy);
        if (d < 1) continue;
        if (Math.abs(d - mainRadius) < this.waveBand) {
          e.vx += (dx / d) * this.pushStrength * dt;
          e.vy += (dy / d) * this.pushStrength * dt;
        }
      }
    },
    draw(ctx, st, w, h) {
      const sx = this.cx - st.camX + w / 2;
      const sy = this.cy - st.camY + h / 2;
      for (const ring of this.rings) {
        if (ring.radius <= 0) continue;
        const alpha = (1 - this.age / this.duration) * 0.3;
        ctx.beginPath();
        ctx.arc(sx, sy, ring.radius, 0, TAU);
        ctx.strokeStyle = `rgba(120, 100, 220, ${alpha})`;
        ctx.lineWidth = 2 / st.zoom;
        ctx.stroke();
      }
    }
  };
  world.activeEvents.push(ev);
  playEventCue("voidPulse");
}

// ─── EVENT: STELLAR BIRTH ───
// A new star ignites near you: a bigger fish to grow into, plus food fragments.

function fireStellarBirth(state) {
  const angle = rand(0, TAU);
  const dist = viewRadius(state) * rand(0.35, 0.6);
  const sf = Math.max(1, state.radius / 12);
  const ev = {
    id: "stellarBirth", age: 0, duration: 165,
    cx: state.playerX + Math.cos(angle) * dist,
    cy: state.playerY + Math.sin(angle) * dist,
    phase: "gathering", spawned: false,
    update(st, dt) {
      if (this.age < 90) {
        this.phase = "gathering";
      } else if (this.age < 105) {
        this.phase = "flash";
        if (!this.spawned) {
          this.spawned = true;
          const pos = clampInBounds(st, this.cx, this.cy, st.radius * 1.5);
          this.cx = pos.x; this.cy = pos.y;
          const star = spawnScaled(st, typeById("star"), 0.95, 1.4, { pos, near: false, forceScale: true });
          star.vx = star.vy = 0;
          star.baseSpeed = 0.1;
          star.bigFish = true;
          st.entities.push(star);

          const fragCount = Math.floor(rand(5, 10));
          for (let i = 0; i < fragCount; i++) {
            const frag = spawnScaled(st, typeById("dust"), 0.08, 0.2, { pos: { x: this.cx, y: this.cy }, near: false });
            const a = rand(0, TAU);
            const speed = rand(0.6, 1.4) * st.speedScale;
            frag.vx = Math.cos(a) * speed;
            frag.vy = Math.sin(a) * speed;
            frag.baseSpeed = speed;
            frag._spawnAge = 30;
            frag._spawnAlpha = 0.5;
            st.entities.push(frag);
          }
        }
      } else {
        this.phase = "explode";
      }
    },
    draw(ctx, st, w, h) {
      const sx = this.cx - st.camX + w / 2;
      const sy = this.cy - st.camY + h / 2;
      if (this.phase === "gathering") {
        const b = this.age / 90;
        const r = (3 + b * 5) * sf;
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        grad.addColorStop(0, `rgba(255, 240, 200, ${b * 0.7})`);
        grad.addColorStop(1, "rgba(255, 240, 200, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, TAU);
        ctx.fill();
      } else if (this.phase === "flash") {
        const fp = (this.age - 90) / 15;
        const alpha = (1 - fp) * 0.8;
        const r = (20 + fp * 40) * sf;
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
        grad.addColorStop(0.3, `rgba(255, 240, 180, ${alpha * 0.5})`);
        grad.addColorStop(1, "rgba(255, 240, 180, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, TAU);
        ctx.fill();
      } else {
        const ep = (this.age - 105) / 60;
        ctx.beginPath();
        ctx.arc(sx, sy, (30 + ep * 80) * sf, 0, TAU);
        ctx.strokeStyle = `rgba(255, 220, 120, ${(1 - ep) * 0.3})`;
        ctx.lineWidth = 2 / st.zoom;
        ctx.stroke();
      }
    }
  };
  world.activeEvents.push(ev);
  playEventCue("stellarBirth");
}

// ─── EVENT: GRAVITATIONAL WAVE ───

function fireGravitationalWave(state) {
  const dirAngle = rand(0, TAU);
  const bounds = state.bounds;
  const ss = state.speedScale;
  const speed = 2.5 * ss;
  const ev = {
    id: "gravitationalWave", age: 0,
    duration: Math.floor((bounds * 2) / speed + 60),
    dirAngle, waveFront: -bounds, speed, wavelength: 120 * ss, bounds, sineStrength: 0.3 * ss,
    update(st, dt) {
      this.waveFront += this.speed * dt;
      const dirX = Math.cos(this.dirAngle), dirY = Math.sin(this.dirAngle);
      const perpX = -dirY, perpY = dirX;
      for (const e of st.entities) {
        if (e.consuming) continue;
        const distToFront = e.x * dirX + e.y * dirY - this.waveFront;
        if (Math.abs(distToFront) < this.wavelength) {
          const f = Math.sin((distToFront / this.wavelength) * TAU) * this.sineStrength;
          e.vx += perpX * f * dt;
          e.vy += perpY * f * dt;
        }
      }
    },
    draw(ctx, st, w, h) {
      const dirX = Math.cos(this.dirAngle), dirY = Math.sin(this.dirAngle);
      const perpX = -dirY, perpY = dirX;
      const alpha = Math.min(0.12, (1 - this.age / this.duration) * 0.15);
      for (let i = 0; i < 5; i++) {
        const offset = (i - 2) * (this.wavelength / 3);
        const sx = dirX * (this.waveFront + offset) - st.camX + w / 2;
        const sy = dirY * (this.waveFront + offset) - st.camY + h / 2;
        const halfLen = this.bounds * 1.5;
        ctx.beginPath();
        ctx.moveTo(sx + perpX * halfLen, sy + perpY * halfLen);
        ctx.lineTo(sx - perpX * halfLen, sy - perpY * halfLen);
        ctx.strokeStyle = `rgba(100, 140, 255, ${alpha})`;
        ctx.lineWidth = 1 / st.zoom;
        ctx.stroke();
      }
    }
  };
  world.activeEvents.push(ev);
  playEventCue("gravitationalWave");
}

// ─── 2D: AMBIENT BACKGROUND LIFE ───

function updateAmbientBackground(state, dt) {
  // Shooting stars
  world.shootingStarTimer += dt;
  const shootInterval = rand(180, 420); // 3-7 sec
  if (world.shootingStarTimer >= shootInterval && world.shootingStars.length < 3) {
    world.shootingStarTimer = 0;
    world.shootingStars.push({
      x: rand(0, 1),
      y: rand(0, 1),
      angle: rand(0.2, 1.2),
      speed: rand(3, 6),
      life: 0,
      maxLife: rand(60, 100),
      brightness: rand(0.3, 0.7)
    });
  }

  for (let i = world.shootingStars.length - 1; i >= 0; i--) {
    const s = world.shootingStars[i];
    s.life += dt;
    s.x += Math.cos(s.angle) * s.speed * 0.001 * dt;
    s.y += Math.sin(s.angle) * s.speed * 0.001 * dt;
    if (s.life >= s.maxLife) {
      world.shootingStars.splice(i, 1);
    }
  }

  // Distant flashes
  if (Math.random() < 0.001 * dt && world.distantFlashes.length < 2) {
    world.distantFlashes.push({
      x: rand(0.1, 0.9),
      y: rand(0.1, 0.9),
      life: 0,
      maxLife: rand(60, 120),
      brightness: rand(0.15, 0.35)
    });
  }

  for (let i = world.distantFlashes.length - 1; i >= 0; i--) {
    const f = world.distantFlashes[i];
    f.life += dt;
    if (f.life >= f.maxLife) {
      world.distantFlashes.splice(i, 1);
    }
  }

  // Energy waves
  if (Math.random() < 0.0008 * dt && world.energyWaves.length < 3) {
    world.energyWaves.push({
      x: rand(0.2, 0.8),
      y: rand(0.2, 0.8),
      radius: 0,
      life: 0,
      maxLife: rand(180, 300),
      speed: rand(0.15, 0.3)
    });
  }

  for (let i = world.energyWaves.length - 1; i >= 0; i--) {
    const ew = world.energyWaves[i];
    ew.life += dt;
    ew.radius += ew.speed * dt;
    if (ew.life >= ew.maxLife) {
      world.energyWaves.splice(i, 1);
    }
  }
}

function drawShootingStars(ctx, w, h) {
  for (const s of world.shootingStars) {
    const progress = s.life / s.maxLife;
    // Fade in quickly, fade out slowly
    const alpha = progress < 0.2
      ? (progress / 0.2) * s.brightness
      : (1 - (progress - 0.2) / 0.8) * s.brightness;

    const headX = s.x * w;
    const headY = s.y * h;
    const tailLen = 30 + s.speed * 8;
    const tailX = headX - Math.cos(s.angle) * tailLen;
    const tailY = headY - Math.sin(s.angle) * tailLen;

    const grad = ctx.createLinearGradient(headX, headY, tailX, tailY);
    grad.addColorStop(0, `rgba(220, 230, 255, ${alpha})`);
    grad.addColorStop(1, `rgba(220, 230, 255, 0)`);

    ctx.beginPath();
    ctx.moveTo(headX, headY);
    ctx.lineTo(tailX, tailY);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawDistantFlashes(ctx, w, h) {
  for (const f of world.distantFlashes) {
    const progress = f.life / f.maxLife;
    // Quick rise (20%), slow fade (80%)
    const alpha = progress < 0.2
      ? (progress / 0.2) * f.brightness
      : (1 - (progress - 0.2) / 0.8) * f.brightness;

    const x = f.x * w;
    const y = f.y * h;
    const r = 15 + alpha * 20;

    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255, 240, 220, ${alpha * 0.5})`);
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEnergyWaves(ctx, w, h) {
  for (const ew of world.energyWaves) {
    const progress = ew.life / ew.maxLife;
    const alpha = (1 - progress) * 0.08;

    const x = ew.x * w;
    const y = ew.y * h;

    ctx.beginPath();
    ctx.arc(x, y, ew.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(100, 120, 220, ${alpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
