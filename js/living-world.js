// ─── LIVING WORLD SYSTEM ───
// Gravity well, dynamic spawning (food + "bigger fish" that scale with you),
// procedural events, ambient background life.

import { weightedType, createEntity, rand, typeAvgRadius, typeById } from "./entities.js";
import { prerenderEntitySprite } from "./render.js";
import { playEventCue } from "./audio.js";
import { foodScaleFor } from "./progression.js";
import { powerupFade, MAGNET_RANGE, MAGNET_PULL } from "./powerups.js";

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

  // Event system (frames @60fps). v3: far fewer, always telegraphed.
  EVENT_EVAL_INTERVAL: 120,     // look for a chance every 2s once cooled down
  EVENT_FIRE_CHANCE: 0.3,
  EVENT_COOLDOWN_MIN: 1500,     // 25-40s of quiet between events
  EVENT_COOLDOWN_MAX: 2400,
  EVENT_GRACE_PERIOD: 1800,     // nothing in the first 30s
  MAX_EVENTS: 5,                // per galaxy
  BREATHER_EVENTS: 3
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
    eventsFired: 0,
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
    if (ev.draw && ev.rgb) ev.draw(ctx, state, w, h);
  }
}

// ─── GRAVITY WELL ───
// Only pulls things you can actually eat; bigger fish don't budge.

export function pullRange(state) {
  const m = powerupFade(state, "magnet");
  return state.radius * CFG.PULL_RANGE * state.mods.pullRange * (1 + (MAGNET_RANGE - 1) * m);
}

function updateGravityWell(state, dt) {
  const m = powerupFade(state, "magnet");
  const R = state.radius;
  const range = pullRange(state);
  const k = CFG.PULL_K * state.speedScale * state.mods.pullStrength * (1 + (MAGNET_PULL - 1) * m);
  const cap = CFG.PULL_CAP * state.speedScale * (1 + (MAGNET_RANGE - 1) * m);
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

// ─── PROCEDURAL EVENT SYSTEM (v3: calm + telegraphed) ───
// Every event has a 2.5s "warning" phase (edge glow / breathing ring / gathering
// light) before anything moves, plus a calm caption the first time you see it.
// Each biome has a signature event (see biome.events in entities.js).

export const EVENT_INFO = {
  meteorShower: {
    name: "Meteor Shower", rgb: "255, 196, 150",
    first: "A meteor shower is drifting in from the glow. Free snacks!",
    codex: "Small rocks drift in from the glowing edge. Every one of them is food."
  },
  cometStream: {
    name: "Comet Stream", rgb: "160, 225, 255",
    first: "Comets are gliding through. Catch a few if you like.",
    codex: "Icy comets glide across your path from the glowing edge. All edible."
  },
  derelictFlotilla: {
    name: "Derelict Flotilla", rgb: "205, 180, 255",
    first: "Old ship wrecks are drifting by, slow and easy to catch.",
    codex: "A slow line of old wrecks drifts in from one side. Easy, chunky food."
  },
  voidPulse: {
    name: "Void Gift", rgb: "170, 150, 255",
    first: "The void is breathing out. Nearby food will drift toward you.",
    codex: "A soft ring breathes in, then releases and gently draws nearby food toward you."
  },
  stellarBirth: {
    name: "Stellar Birth", rgb: "255, 232, 180",
    first: "A new star is forming nearby. It's bigger than you for now, so grow into it.",
    codex: "Light gathers, then a young star blooms with a sprinkle of dust. Grow into it for a big catch."
  },
  gravitationalWave: {
    name: "Gravity Wave", rgb: "140, 170, 255",
    first: "A gravity wave is rolling through. Things will sway for a moment.",
    codex: "Faint lines roll across space, and things sway sideways as they pass. Harmless."
  }
};

const WARN_FRAMES = 150;                         // 2.5s heads-up before every event
const DEFAULT_EVENTS = { meteorShower: 2, cometStream: 1 };

function eventBudget(state) {
  return state.biome && state.biome.breather ? CFG.BREATHER_EVENTS : CFG.MAX_EVENTS;
}

function updateEventSystem(state, dt) {
  updateActiveEvents(state, dt);
  if (world.graceTimer > 0) { world.graceTimer -= dt; return; }
  if (world.globalCooldown > 0) { world.globalCooldown -= dt; return; }
  if (world.eventsFired >= eventBudget(state)) return;
  if (world.activeEvents.length > 0) return;     // one thing at a time

  world.eventEvalTimer += dt;
  if (world.eventEvalTimer < CFG.EVENT_EVAL_INTERVAL) return;
  world.eventEvalTimer = 0;
  if (Math.random() > CFG.EVENT_FIRE_CHANCE) return;

  const pool = (state.biome && state.biome.events) || DEFAULT_EVENTS;
  fireEvent(state, pickWeighted(pool));
}

function pickWeighted(pool) {
  const entries = Object.entries(pool);
  let r = Math.random() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [id, w] of entries) { r -= w; if (r <= 0) return id; }
  return entries[0][0];
}

/** Start an event (with its warning phase). Exported for tests/debugging. */
export function fireEvent(state, id) {
  const make = EVENT_MAKERS[id];
  if (!make || !world) return null;
  const ev = make(state);
  ev.id = id;
  ev.age = 0;
  ev.warn = WARN_FRAMES;
  ev.warnAge = 0;
  ev.rgb = EVENT_INFO[id].rgb;
  world.activeEvents.push(ev);
  world.eventsFired++;
  world.globalCooldown = rand(CFG.EVENT_COOLDOWN_MIN, CFG.EVENT_COOLDOWN_MAX);
  playEventCue(id);
  state.onEventWarn?.(id);
  return ev;
}

export function activeEventInfo() {
  return world ? world.activeEvents.map(e => ({ id: e.id, warn: Math.max(0, e.warn), age: e.age })) : [];
}

function updateActiveEvents(state, dt) {
  for (let i = world.activeEvents.length - 1; i >= 0; i--) {
    const ev = world.activeEvents[i];
    if (ev.warn > 0) {
      ev.warn -= dt;
      ev.warnAge += dt;
      if (ev.warnUpdate) ev.warnUpdate(state, dt);
      continue;
    }
    ev.age += dt;
    if (ev.update) ev.update(state, dt);
    if (ev.age >= ev.duration) world.activeEvents.splice(i, 1);
  }
}

const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

/** Screen-space overlay: soft edge glows pointing at where an event comes from. */
export function drawLivingWorldOverlay(ctx, state, w, h) {
  if (!world) return;
  for (const ev of world.activeEvents) {
    if (ev.edgeAngle == null) continue;
    let a;
    if (ev.warn > 0) a = smooth(ev.warnAge / WARN_FRAMES);
    else a = 1 - smooth(ev.age / Math.min(ev.duration, 90));
    if (a <= 0.01) continue;
    drawEdgeGlow(ctx, state, w, h, ev.edgeAngle, ev.rgb, a);
  }
}

function drawEdgeGlow(ctx, state, w, h, angle, rgb, a) {
  const px = (state.playerX - state.camX) * state.zoom + w / 2;
  const py = (state.playerY - state.camY) * state.zoom + h / 2;
  const cx = Math.cos(angle), cy = Math.sin(angle);
  const tx = cx > 0 ? (w - px) / cx : cx < 0 ? -px / cx : Infinity;
  const ty = cy > 0 ? (h - py) / cy : cy < 0 ? -py / cy : Infinity;
  const t = Math.min(tx, ty);
  const ex = px + cx * t, ey = py + cy * t;
  const breathe = 0.85 + 0.15 * Math.sin(performance.now() * 0.0025);
  const r = Math.min(w, h) * 0.32;
  const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, r);
  g.addColorStop(0, `rgba(${rgb}, ${0.32 * a * breathe})`);
  g.addColorStop(0.5, `rgba(${rgb}, ${0.1 * a * breathe})`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(ex - r, ey - r, r * 2, r * 2);
}

// Streams enter from just outside the view and drift across the player's area.
function streamEvent(state, opts) {
  const angle = rand(0, TAU);
  return {
    duration: opts.duration, spawnTimer: 0, spawned: 0,
    count: opts.count, angle, edgeAngle: angle,
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
}

const EVENT_MAKERS = {
  meteorShower: st => streamEvent(st, {
    typeId: "meteor", count: Math.floor(rand(6, 10)), duration: 150, window: 110,
    spread: 0.3, aimJitter: 0.35, ratioMin: 0.12, ratioMax: 0.28, speedMin: 0.55, speedMax: 0.9
  }),
  cometStream: st => streamEvent(st, {
    typeId: "comet", count: Math.floor(rand(5, 9)), duration: 170, window: 140,
    spread: 0.2, aimJitter: 0.6, ratioMin: 0.12, ratioMax: 0.24, speedMin: 0.45, speedMax: 0.75
  }),
  derelictFlotilla: st => streamEvent(st, {
    typeId: "craft", count: Math.floor(rand(4, 7)), duration: 90, window: 60,
    spread: 0.15, aimJitter: 0.2, ratioMin: 0.2, ratioMax: 0.4, speedMin: 0.2, speedMax: 0.35
  }),
  voidPulse: makeVoidGift,
  stellarBirth: makeStellarBirth,
  gravitationalWave: makeGravityWave
};

// ─── EVENT: VOID GIFT (was Void Pulse) ───
// A ring breathes in at a point near you, then releases: food the ring has
// passed drifts gently toward you for a few seconds.
function makeVoidGift(state) {
  const angle = rand(0, TAU);
  const dist = viewRadius(state) * rand(0.3, 0.55);
  const ss = state.speedScale;
  return {
    duration: 240,
    cx: state.playerX + Math.cos(angle) * dist,
    cy: state.playerY + Math.sin(angle) * dist,
    radius: 0, speed: 2.6 * ss, pull: 0.035 * ss, cap: 1.6 * ss,
    update(st, dt) {
      this.radius += this.speed * dt;
      const reach = viewRadius(st) * 1.3;
      const fade = 1 - smooth((this.age - 150) / 90);
      for (const e of st.entities) {
        if (e.consuming || e.powerup) continue;
        if (st.radius <= e.radius * st.eatRatio) continue;     // only food
        const d = Math.hypot(e.x - this.cx, e.y - this.cy);
        if (d > this.radius) continue;
        const dx = st.playerX - e.x, dy = st.playerY - e.y;
        const dp = Math.hypot(dx, dy);
        if (dp < 1 || dp > reach) continue;
        e.vx += (dx / dp) * this.pull * fade * dt;
        e.vy += (dy / dp) * this.pull * fade * dt;
        e._pullCap = Math.max(e._pullCap || 0, this.cap);
      }
    },
    draw(ctx, st, w, h) {
      const sx = this.cx - st.camX + w / 2;
      const sy = this.cy - st.camY + h / 2;
      if (this.warn > 0) {
        // Breathing in: a soft ring slowly contracts toward its centre
        const p = smooth(this.warnAge / WARN_FRAMES);
        const base = 60 / st.zoom;
        const r = base * (1.6 - p * 1.2);
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, TAU);
        ctx.strokeStyle = `rgba(${this.rgb}, ${0.08 + p * 0.22})`;
        ctx.lineWidth = 2 / st.zoom;
        ctx.stroke();
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, base * 0.5);
        g.addColorStop(0, `rgba(${this.rgb}, ${0.25 * p})`);
        g.addColorStop(1, `rgba(${this.rgb}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sx, sy, base * 0.5, 0, TAU);
        ctx.fill();
        return;
      }
      const alpha = (1 - this.age / this.duration) * 0.28;
      for (let i = 0; i < 2; i++) {
        const r = this.radius - i * 40 / st.zoom;
        if (r <= 0) continue;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, TAU);
        ctx.strokeStyle = `rgba(${this.rgb}, ${alpha * (1 - i * 0.4)})`;
        ctx.lineWidth = 2 / st.zoom;
        ctx.stroke();
      }
    }
  };
}

// ─── EVENT: STELLAR BIRTH ───
// Light gathers (the warning), then a soft bloom (no flash) and a new star.
function makeStellarBirth(state) {
  const angle = rand(0, TAU);
  const dist = viewRadius(state) * rand(0.35, 0.6);
  const sf = Math.max(1, state.radius / 12);
  return {
    duration: 150, spawned: false, sf,
    cx: state.playerX + Math.cos(angle) * dist,
    cy: state.playerY + Math.sin(angle) * dist,
    update(st) {
      if (this.spawned) return;
      this.spawned = true;
      const pos = clampInBounds(st, this.cx, this.cy, st.radius * 1.5);
      this.cx = pos.x; this.cy = pos.y;
      const star = spawnScaled(st, typeById("star"), 0.95, 1.4, { pos, near: false, forceScale: true });
      star.vx = star.vy = 0;
      star.baseSpeed = 0.1;
      star.bigFish = true;
      star._spawnAge = 0;
      star._spawnAlpha = 0;
      st.entities.push(star);
      const fragCount = Math.floor(rand(5, 10));
      for (let i = 0; i < fragCount; i++) {
        const frag = spawnScaled(st, typeById("dust"), 0.08, 0.2, { pos: { x: this.cx, y: this.cy }, near: false });
        const a = rand(0, TAU);
        const speed = rand(0.3, 0.8) * st.speedScale;
        frag.vx = Math.cos(a) * speed;
        frag.vy = Math.sin(a) * speed;
        frag.baseSpeed = speed;
        st.entities.push(frag);
      }
    },
    draw(ctx, st, w, h) {
      const sx = this.cx - st.camX + w / 2;
      const sy = this.cy - st.camY + h / 2;
      let r, alpha;
      if (this.warn > 0) {
        const b = smooth(this.warnAge / WARN_FRAMES);
        r = (6 + b * 14) * sf;
        alpha = 0.15 + b * 0.35;
      } else {
        const p = smooth(this.age / this.duration);
        r = (20 + p * 50) * sf;
        alpha = 0.5 * (1 - p);
      }
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      grad.addColorStop(0, `rgba(255, 244, 215, ${alpha})`);
      grad.addColorStop(0.4, `rgba(255, 225, 160, ${alpha * 0.4})`);
      grad.addColorStop(1, "rgba(255, 225, 160, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, TAU);
      ctx.fill();
    }
  };
}

// ─── EVENT: GRAVITY WAVE ───
// Starts just off-screen (shown by an edge glow) and rolls past you; things
// sway sideways gently as the front passes.
function makeGravityWave(state) {
  const dirAngle = rand(0, TAU);
  const ss = state.speedScale;
  const vr = viewRadius(state);
  const speed = 1.8 * ss;
  const dirX = Math.cos(dirAngle), dirY = Math.sin(dirAngle);
  const startFront = state.playerX * dirX + state.playerY * dirY - vr * 1.15;
  return {
    duration: Math.floor((vr * 2.6) / speed),
    edgeAngle: dirAngle + Math.PI,        // it comes from behind the direction of travel
    dirAngle, waveFront: startFront, speed, wavelength: 120 * ss, sineStrength: 0.1 * ss,
    update(st, dt) {
      this.waveFront += this.speed * dt;
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
      if (this.warn > 0) return;
      const perpX = -dirY, perpY = dirX;
      const fadeIn = smooth(this.age / 40);
      const alpha = Math.min(0.14, (1 - this.age / this.duration) * 0.18) * fadeIn;
      const halfLen = Math.hypot(w, h);
      // Centre the lines on the player's projection so they always span the view
      const along = st.playerX * perpX + st.playerY * perpY;
      for (let i = 0; i < 5; i++) {
        const offset = (i - 2) * (this.wavelength / 3);
        const wx = dirX * (this.waveFront + offset) + perpX * along;
        const wy = dirY * (this.waveFront + offset) + perpY * along;
        const sx = wx - st.camX + w / 2;
        const sy = wy - st.camY + h / 2;
        ctx.beginPath();
        ctx.moveTo(sx + perpX * halfLen, sy + perpY * halfLen);
        ctx.lineTo(sx - perpX * halfLen, sy - perpY * halfLen);
        ctx.strokeStyle = `rgba(${this.rgb}, ${alpha * (1 - Math.abs(i - 2) * 0.25)})`;
        ctx.lineWidth = 1.5 / st.zoom;
        ctx.stroke();
      }
    }
  };
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
