// ─── POWER-UPS ───
// Rare glowing pickups: Magnet, Slow-Mo, Double Mass. Always edible.

import { rand } from "./entities.js";

export const POWERUPS = {
  magnet: { label: "Magnet", color: "#ffd166", rgb: "255, 209, 102", glyph: "M", duration: 900, tone: 660 },
  slow: { label: "Slow-Mo", color: "#7fdbff", rgb: "127, 219, 255", glyph: "S", duration: 720, tone: 520 },
  double: { label: "Double Mass", color: "#ff7ad9", rgb: "255, 122, 217", glyph: "x2", duration: 720, tone: 780 }
};

// v3 calm tuning (frames @60fps): fewer, longer, gentler power-ups
export const MAGNET_RANGE = 1.8;   // pull range multiplier (was 2.2)
export const MAGNET_PULL = 2;      // pull strength multiplier (was 3)
export const SLOW_WORLD = 0.55;    // world speed during Slow-Mo (was 0.35)
const FADE_FRAMES = 180;           // effects ease out over the last 3s

/** 0..1 strength of an active power-up, easing out over its last 3s. */
export function powerupFade(state, kind) {
  const left = state.active[kind];
  if (!(left > 0)) return 0;
  const t = Math.min(1, left / FADE_FRAMES);
  return t * t * (3 - 2 * t);
}

export function slowFactor(state) {
  return 1 - (1 - SLOW_WORLD) * powerupFade(state, "slow");
}
export const POWERUP_KINDS = Object.keys(POWERUPS);

const FIRST_SPAWN = 2400;       // ~40s into a galaxy
const SPAWN_MIN = 3000;         // then every ~50-75s (about 3 per galaxy)
const SPAWN_RANGE = 1500;
const PICKUP_LIFE = 1800;       // 30s on the field before it fades

let timer = 0;
let nextAt = FIRST_SPAWN;

export function initPowerups() {
  timer = 0;
  nextAt = FIRST_SPAWN;
}

export function freshActive() {
  return { magnet: 0, slow: 0, double: 0 };
}

function makePickup(kind, x, y, radius) {
  const def = POWERUPS[kind];
  const a = rand(0, Math.PI * 2);
  const speed = 0.15;
  return {
    id: Math.random().toString(36).slice(2, 11),
    type: "powerup",
    powerup: kind,
    sizeClass: 0,
    color: def.color,
    radius,
    density: 0,
    mass: 0,
    x, y,
    vx: Math.cos(a) * speed,
    vy: Math.sin(a) * speed,
    baseSpeed: speed,
    rotation: 0,
    rotSpeed: 0.02,
    tone: def.tone,
    glow: 1,
    hasTail: false,
    shape: "powerup",
    bands: null,
    consuming: false,
    consumeProgress: 0,
    life: PICKUP_LIFE,
    _spawnAge: 0,
    _spawnAlpha: 0
  };
}

/** Spawns pickups on a timer and ages them out. Returns a newly spawned pickup (or null). */
export function updatePowerups(state, dt) {
  // Tick active effects
  for (const k of POWERUP_KINDS) {
    if (state.active[k] > 0) {
      state.active[k] = Math.max(0, state.active[k] - dt);
      if (state.active[k] === 0) state.onPowerupEnd?.(k);
    }
  }

  // Age pickups on the field
  let onField = 0;
  for (const e of state.entities) {
    if (!e.powerup || e.consuming) continue;
    onField++;
    e.life -= dt;
    if (e.life <= 0) e.consumed = true; // quietly removed by the consume sweep
  }

  timer += dt * state.mods.surgeFrequency;
  if (timer < nextAt || onField > 0) return null;
  timer = 0;
  nextAt = SPAWN_MIN + rand(0, SPAWN_RANGE);

  // Avoid handing out the same power-up that's already running
  const kinds = POWERUP_KINDS.filter(k => state.active[k] <= 0);
  const kind = kinds[Math.floor(Math.random() * kinds.length)] || "magnet";

  // Appear inside the current view so you see it pop in
  const viewR = Math.min(state.viewW, state.viewH) / 2;
  const a = rand(0, Math.PI * 2);
  const d = viewR * rand(0.45, 0.8);
  let x = state.playerX + Math.cos(a) * d;
  let y = state.playerY + Math.sin(a) * d;
  const radius = Math.max(7, state.radius * 0.38);
  const lim = state.bounds - radius - 10;
  const dist = Math.hypot(x, y);
  if (dist > lim) { x *= lim / dist; y *= lim / dist; }

  const p = makePickup(kind, x, y, radius);
  state.entities.push(p);
  return p;
}

export function activatePowerup(state, kind) {
  const def = POWERUPS[kind];
  const dur = def.duration * state.mods.surgeDuration;
  state.active[kind] = dur;
  state.activeMax[kind] = dur;
}
