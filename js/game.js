// ─── GAME MAIN ───
// State, main loop, consume logic, zoom camera, galaxy transitions + summary.

import { createInput } from "./input.js";
import { spawnGalaxy, updateEntities, galaxyObjectCount, getBiome, rand } from "./entities.js";
import {
  drawStarfield, drawBoundary, drawEntities, drawBlackHole,
  drawParticles, drawRipples, drawMinimap, drawEdgeIndicators, drawCursor,
  invalidateStarfield, prerenderEntitySprite, setNebulaPalette, setSoftPalette, drawLens
} from "./render.js";
import { initWorlds, updateWorlds, drawWorldsBG, drawWorldsOverlay, drawWorldsMinimap,
  onWorldBump, onWorldEvent, onWorldTier, worldMassMul, eventPairText, worldsInfo, worldsFeature } from "./worlds.js";
import { beginArtFrame, setArtQuality, getArtQuality, artStats, warmHole } from "./art.js";
import * as audio from "./audio.js";
import { save, load, clearSave, defaultStats, defaultRecords, defaultUpgrades } from "./save.js";
import {
  initLivingWorld, updateLivingWorld, drawLivingWorldBG, drawLivingWorldFG, drawLivingWorldOverlay,
  pullRange, fireEvent, activeEventInfo, EVENT_INFO
} from "./living-world.js";
import { computeMods, freshRun, finishGalaxy, UPGRADES, upgradeCost, fmtTime, fmtMass } from "./progression.js";
import { initPowerups, updatePowerups, activatePowerup, freshActive, POWERUPS, slowFactor, powerupFade } from "./powerups.js";
import * as ui from "./ui.js";
import { drawBackdrop, setBackdropPalette } from "./backdrop.js";
import { R0, START_R, tier, tierIndexForR, tierName, massForR, targetMassFrom, tierProgress, rForTier } from "./tiers.js";
import { fillAround, DENSITY, densityInfo } from "./living-world.js";

// ─── CANVAS SETUP ───
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const hudGalaxy = document.getElementById("hud-galaxy");
const hudTime = document.getElementById("hud-time");
const hudMass = document.getElementById("hud-mass");
const hudBest = document.getElementById("hud-best");
const hudBiome = document.getElementById("hud-biome");
const hudProgressBar = document.getElementById("hud-progress-bar");

// Screen sharpness cap: 2x on High, 1.5x on Balanced ("Lite")
let dprCap = 2;

function resizeCanvas() {
  const container = document.getElementById("game-container");
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  const w = container.clientWidth;
  const h = container.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h, dpr };
}

let screenW, screenH, screenDpr;
({ w: screenW, h: screenH, dpr: screenDpr } = resizeCanvas());
window.addEventListener("resize", () => {
  ({ w: screenW, h: screenH, dpr: screenDpr } = resizeCanvas());
});

// ─── STATE ───
const state = {
  galaxy: 1,
  bestGalaxy: 1,

  mass: 20,
  radius: 8,
  playerX: 0, playerY: 0, playerVX: 0, playerVY: 0,

  // Camera (zoom shrinks as you grow so the hole stays a sensible size on screen)
  camX: 0, camY: 0, zoom: 1, viewW: 800, viewH: 600, speedScale: 1,
  bgX: 0, bgY: 0,

  entities: [], bounds: Infinity, baseBounds: 800, biome: null, initialCount: 0,
  targetMass: 15000, startMass: 20,
  // v5 "Vast": the scale ladder. floorMass = where this galaxy started
  // (the most you reached in the last one). anchor = the size the camera is framed on.
  floorMass: 20, tier: 0, bestTier: 0, galaxyProgress: 0,
  anchorR: 8, anchorSmooth: 8, reveal: null, tierBanner: null, trail: [], trailT: 0,

  particles: [], ripples: [], floaters: [], shake: 0, gulp: 0,

  comboCount: 0, comboTimer: 0,

  transitioning: false, transitionPhase: "", transitionTimer: 0,
  galaxyCredited: false, summary: null,

  paused: false, menuOpen: false,
  audioEnabled: true, volume: 0.4,

  totalConsumed: 0,
  stats: defaultStats(),
  records: defaultRecords(),
  upgrades: defaultUpgrades(),
  stardust: 0,
  seenHints: {},
  // Zen is on by default: no clock/par, bumps cost nothing
  settings: { touchMode: "joystick", zen: true, reduceMotion: false, softPalette: false, breathGuide: false, quality: "auto" },

  // v4 screens: "play" | "title" | "intro"; camMul zooms the camera (title close-up)
  screen: "play", camMul: 1, drift: null,
  legacyBonusPending: 0,

  mods: computeMods(defaultUpgrades()),
  eatRatio: 0.88,
  run: null,
  active: freshActive(), activeMax: freshActive(),
  invuln: 0,
  nearGoalPlayed: false
};

const input = createInput(canvas);

// Largest single bite as a share of your mass. Growth is exponential, so this
// (more than the galaxy target) sets the pace: ~6% => roughly 2.5-4 min per galaxy for a person.
const MAX_BITE = 0.042;     // v4.1: worlds add food (reefs, rivers, aurora), so bites are a little smaller
const MAX_BIG_BITE = 0.056;  // outgrown "bigger fish" are a slightly bigger treat
const BREATHER_BITE = 0.055; // breathers: food is big and everywhere, so a smaller cap keeps it ~1-1.5 min
const MIN_BITE_CAP = 6;
const REGULAR_GAIN = 0.26;   // v4.1: share of a bite's mass you keep in regular galaxies (breathers 0.5)
// v5: each galaxy now climbs only ~1 tier (instead of ~14x in size), so every
// bite counts for less: "very small increments". These scale all of the above.
const PACE = 0.16;
const BREATHER_PACE = 0.095;

// ─── HELPERS ───
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

function updateRadius() {
  state.radius = Math.max(6, 4 + Math.sqrt(state.mass) * 0.9);
  // v5: no edge. Space goes on; things spawn and recycle around you.
  state.bounds = Infinity;
}

// v5: the camera is framed on an "anchor" size. Within a tier you visibly
// grow on screen (13px -> ~34px); at each tier line the camera slowly pulls
// back so you are small again and the next layer of the universe appears.
const HOLE_PX = 13;
const REVEAL_FRAMES = 160;   // ~2.7s pull-back
function zoomTarget() {
  const k = clamp(Math.min(screenW, screenH) / 420, 0.85, 1.5);
  return HOLE_PX * k / state.anchorSmooth;
}

function updateAnchor(dt) {
  const rv = state.reveal;
  if (rv) {
    rv.p = Math.min(1, rv.p + dt / rv.dur);
    const e = 0.5 - 0.5 * Math.cos(Math.PI * rv.p);
    state.anchorSmooth = rv.from * Math.pow(rv.to / rv.from, e);
    if (rv.p >= 1) state.reveal = null;
  } else {
    state.anchorSmooth = state.anchorR;
  }
}

function checkTier() {
  const t = tierIndexForR(state.radius);
  if (t <= state.tier) return;
  state.tier = t;
  state.bestTier = Math.max(state.bestTier || 0, t);
  const dur = state.settings.reduceMotion ? REVEAL_FRAMES * 0.6 : REVEAL_FRAMES;
  state.reveal = { from: state.anchorSmooth, to: state.radius, p: 0, dur };
  state.anchorR = state.radius;
  state.tierBanner = { name: tierName(t), line: tier(t).line, age: 0 };
  state.stats.tierReveals = (state.stats.tierReveals || 0) + 1;
  audio.playTierChime();
  audio.setMusicLayers(t, state.biome);
  onWorldTier(state);
  state.onTierReveal?.(t);
}

function updateCameraScale(snap = false) {
  const zt = zoomTarget() * state.camMul;
  state.zoom = snap ? zt : state.zoom + (zt - state.zoom) * 0.04;
  state.viewW = screenW / state.zoom;
  state.viewH = screenH / state.zoom;
  // World speeds scale with the camera framing, keeping on-screen speed steady;
  // within a tier you speed up a little as you grow.
  const A = state.anchorSmooth;
  state.speedScale = (A / HOLE_PX) * Math.pow(Math.max(1, state.radius / A), 0.45);
}

function hint(key, msg, ms) {
  if (key) {
    if (state.seenHints[key]) return;
    state.seenHints[key] = true;
  }
  showHint(msg, ms);
}

function floater(x, y, text, color = "#ffd27a", size = 16) {
  state.floaters.push({ x, y, text, color, size, age: 0, maxAge: 70 });
  if (state.floaters.length > 12) state.floaters.shift();
}

// ─── v5: RADAR TRAIL + TIER BANNER ───
const TIER_BANNER_FRAMES = 330;
function radarRange() {
  return Math.hypot(state.viewW, state.viewH) / 2 * 2.6;
}
function updateTrail(dt) {
  state.trailT += dt;
  if (state.trailT < 20) return;   // a point every ~1/3s
  state.trailT = 0;
  const t = state.trail;
  const last = t[t.length - 1];
  const step = Math.hypot(state.viewW, state.viewH) * 0.02;
  if (!last || Math.hypot(last.x - state.playerX, last.y - state.playerY) > step) {
    t.push({ x: state.playerX, y: state.playerY });
    if (t.length > 90) t.shift();
  }
}
function drawTierBanner(w, h) {
  const b = state.tierBanner;
  if (!b) return;
  const t = b.age / TIER_BANNER_FRAMES;
  const a = Math.min(1, b.age / 50) * Math.min(1, (TIER_BANNER_FRAMES - b.age) / 70);
  if (a <= 0) return;
  const y = h * 0.24 - (state.settings.reduceMotion ? 0 : t * 8);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 8;
  ctx.font = "500 11px system-ui, sans-serif";
  ctx.fillStyle = `rgba(190, 196, 255, ${0.55 * a})`;
  ctx.fillText("A WIDER VIEW", w / 2, y - 24);
  ctx.font = "300 26px system-ui, sans-serif";
  ctx.fillStyle = `rgba(236, 238, 255, ${0.9 * a})`;
  ctx.fillText(b.name, w / 2, y);
  ctx.font = "italic 300 14px system-ui, sans-serif";
  ctx.fillStyle = `rgba(210, 214, 240, ${0.7 * a})`;
  ctx.fillText(b.line, w / 2, y + 26);
  ctx.restore();
}

// ─── INIT GALAXY ───
function initGalaxy(galaxyNum, resume = null) {
  const biome = getBiome(galaxyNum);

  state.mods = computeMods(state.upgrades);
  state.eatRatio = state.mods.eatRatio;
  // v5: start where the last galaxy ended (your floor), plus Seed Mass
  state.floorMass = Math.max(massForR(START_R), state.floorMass || 0);
  state.startMass = state.floorMass * (1 + (state.mods.startBonus || 0));
  state.targetMass = targetMassFrom(state.floorMass, !!biome.breather);
  state.startMass = Math.min(state.startMass, state.targetMass * 0.8);

  state.entities = [];
  state.biome = biome;
  state.baseBounds = 1000;
  state.initialCount = DENSITY.regular;

  setNebulaPalette(biome.nebula);
  setBackdropPalette(biome.nebula);
  invalidateStarfield();
  if (!state.seenHints["biome_" + biome.name]) state.seenHints["biome_" + biome.name] = true;

  state.mass = resume ? clamp(resume.mass, state.startMass, state.targetMass * 0.97) : state.startMass;
  updateRadius();
  state.tier = tierIndexForR(state.radius);
  state.bestTier = Math.max(state.bestTier || 0, state.tier);
  state.anchorR = state.anchorSmooth = state.radius;
  state.reveal = null;
  state.tierBanner = null;
  state.trail = [];
  state.galaxyProgress = galaxyProgressNow();

  state.run = freshRun(state.stats);
  if (resume) {
    for (const k of ["time", "eaten", "bestCombo", "bigFish", "powerups", "bumps", "startBestCombo"]) {
      if (typeof resume[k] === "number") state.run[k] = resume[k];
    }
  }

  state.playerX = (Math.random() - 0.5) * 150;
  state.playerY = (Math.random() - 0.5) * 150;
  state.playerVX = 0;
  state.playerVY = 0;
  state.camX = state.playerX;
  state.camY = state.playerY;
  updateCameraScale(true);

  state.particles = [];
  state.ripples = [];
  state.floaters = [];
  state.comboCount = 0;
  state.comboTimer = 0;
  state.active = freshActive();
  state.activeMax = freshActive();
  state.invuln = 0;
  state.nearGoalPlayed = false;

  initLivingWorld(state);
  initWorlds(state);
  fillAround(state, Math.max(20, (biome.breather ? DENSITY.breather : DENSITY.regular) - state.entities.length));
  initPowerups();
  ui.updatePowerupBar(state);

  audio.startDrone(biome);
  audio.setMusicLayers(state.tier, biome);
  syncHud(true);
}

// ─── PLAYER MOVEMENT ───

function updatePlayer(dt) {
  const { mx, my, magnitude } = input.getMovement(screenW, screenH);
  const ss = state.speedScale;
  const thrust = state.mods.thrust;

  const maxSpeed = 3.6 * thrust * ss;
  const accel = 0.18 * thrust * ss * dt;
  if (magnitude > 0.01) {
    state.playerVX += mx * accel;
    state.playerVY += my * accel;
  }

  // Frame-rate independent friction (same feel at 60Hz and 120Hz)
  const friction = Math.pow(0.92, dt);
  state.playerVX *= friction;
  state.playerVY *= friction;

  const speed = Math.hypot(state.playerVX, state.playerVY);
  if (speed > maxSpeed && state.invuln < 40) {
    state.playerVX = (state.playerVX / speed) * maxSpeed;
    state.playerVY = (state.playerVY / speed) * maxSpeed;
  }

  state.playerX += state.playerVX * dt;
  state.playerY += state.playerVY * dt;

  const distFromCenter = Math.hypot(state.playerX, state.playerY);
  if (distFromCenter + state.radius > state.bounds) {
    const nx = state.playerX / distFromCenter;
    const ny = state.playerY / distFromCenter;
    const dot = state.playerVX * nx + state.playerVY * ny;
    if (dot > 0) {
      state.playerVX -= 2 * dot * nx * 0.6;
      state.playerVY -= 2 * dot * ny * 0.6;
      if (dot > 0.8 * ss) audio.playBounce();
    }
    const pushDist = state.bounds - state.radius - 2;
    state.playerX = nx * pushDist;
    state.playerY = ny * pushDist;
  }

  const camSmooth = 1 - Math.pow(1 - 0.08, dt);
  state.camX += (state.playerX - state.camX) * camSmooth;
  state.camY += (state.playerY - state.camY) * camSmooth;
}

// ─── CONSUME LOGIC ───

function tryConsume(dt) {
  let ateThisFrame = 0;
  let totalTone = 0;
  let totalMassGained = 0;
  const R = state.radius;

  if (state.comboTimer > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) {
      state.comboTimer = 0;
      state.comboCount = 0;
    }
  }
  if (state.invuln > 0) state.invuln = Math.max(0, state.invuln - dt);

  for (const e of state.entities) {
    if (e.consumed) continue;
    if (e.consuming) {
      // Slurp toward the center while spinning down
      const pull = 1 - Math.pow(1 - 0.18, dt);
      e.x += (state.playerX - e.x) * pull;
      e.y += (state.playerY - e.y) * pull;
      e.consumeProgress += 0.06 * dt;
      if (e.consumeProgress >= 1) e.consumed = true;
      continue;
    }

    const dx = e.x - state.playerX;
    const dy = e.y - state.playerY;
    const dist = Math.hypot(dx, dy);

    // Power-up pickup
    if (e.powerup) {
      if (dist < R + e.radius) {
        e.consuming = true;
        e.consumeProgress = 0;
        collectPowerup(e);
      }
      continue;
    }

    const edible = R > e.radius * state.eatRatio;
    const touchDist = R + e.radius * (0.4 + state.mods.reachBonus);

    if (edible && dist < touchDist) {
      e.consuming = true;
      e.consumeProgress = 0;

      const comboBonus = 1 + Math.min(state.comboCount, 25) * 0.01;
      const dbl = state.active.double > 0 ? 2 : 1;
      // Small absolute floor keeps the opening seconds snappy
      const biteK = state.biome.breather ? BREATHER_BITE : (e.bigFish ? MAX_BIG_BITE : MAX_BITE);
      const pace = state.biome.breather ? BREATHER_PACE : PACE;
      const cap = Math.max(MIN_BITE_CAP, state.mass * biteK) * pace;
      const gk = (state.biome.breather ? 0.5 : REGULAR_GAIN) * pace;
      // biome.gainK evens out pacing for galaxies whose mechanic adds a lot of food
      const gain = Math.min(e.mass * gk * (state.biome.gainK || 1) * comboBonus, cap) * dbl * worldMassMul();
      state.mass += gain;
      updateRadius();

      state.comboCount += 1;
      state.comboTimer = state.mods.comboWindow;
      state.run.eaten += 1;
      if (state.comboCount > state.run.bestCombo) state.run.bestCombo = state.comboCount;

      ateThisFrame += 1;
      totalTone += e.tone;
      totalMassGained += gain;
      state.gulp = Math.min(1, state.gulp + 0.25 + Math.min(0.5, gain / state.mass));

      spawnConsumeParticles(e);
      spawnRipple(e);

      if (e.bigFish) {
        state.run.bigFish += 1;
        state.stats.bigFishEaten += 1;
        floater(e.x, e.y, "Big catch", "#ffcf6e", 19);
        shakeBy(1.5);
        audio.playBigCatch();
      }
    } else if (!edible && state.invuln <= 0 && (e._spawnAlpha ?? 1) > 0.6 && dist < R + e.radius * 0.85) {
      bump(e, dx, dy, dist);
    }
  }

  // Sweep finished/expired entities
  for (let i = state.entities.length - 1; i >= 0; i--) {
    if (state.entities[i].consumed) state.entities.splice(i, 1);
  }

  if (ateThisFrame > 0) {
    const avgTone = totalTone / ateThisFrame;
    const massRatio = clamp(totalMassGained / (state.mass * 0.15), 0, 1);
    audio.playConsume(avgTone, massRatio, state.comboCount);
    if (state.comboCount >= 3 && state.comboCount % 3 === 0) audio.playComboChime(state.comboCount);

    state.totalConsumed += ateThisFrame;
    state.stats.totalConsumed += ateThisFrame;
    state.stats.highestMass = Math.max(state.stats.highestMass, state.mass);
    state.stats.bestCombo = Math.max(state.stats.bestCombo, state.comboCount);

    if (state.comboCount === 8) hint("combo", "Chain bites quickly: combos add bonus mass", 3200);
  }

  if (!state.nearGoalPlayed && state.mass >= state.targetMass * 0.9) {
    state.nearGoalPlayed = true;
    audio.playNearGoal();
    showHint("Almost there…", 1800);
  }

  if (state.mass >= state.targetMass && !state.transitioning) galaxyComplete();
}

// Calm bump: a soft, eased nudge away from something too big. No shake, the
// combo just pauses, and Zen mode costs nothing (otherwise a tiny 1%).
const BUMP_PUSH = 2.4;          // was a hard 7x speed kick
const BUMP_LOSS = 0.01;         // was 5% of mass (0 in Zen)
const COMBO_PAUSE = 120;        // combo holds for 2s instead of resetting

function bump(e, dx, dy, dist) {
  onWorldBump(state, e);           // Ruined Armada: brittle hulls crumble
  const d = Math.max(1, dist);
  const nx = -dx / d;
  const ny = -dy / d;
  const ss = state.speedScale;
  // Blend toward the push instead of overwriting velocity, so it glides
  const into = state.playerVX * -nx + state.playerVY * -ny;
  if (into > 0) {
    state.playerVX += nx * into;
    state.playerVY += ny * into;
  }
  state.playerVX += nx * BUMP_PUSH * ss;
  state.playerVY += ny * BUMP_PUSH * ss;
  e.vx -= nx * 0.15 * e.baseSpeed;
  e.vy -= ny * 0.15 * e.baseSpeed;

  const loss = state.settings.zen ? 0 : Math.min(state.mass * BUMP_LOSS, Math.max(0, state.mass - state.startMass));
  if (loss > 0) {
    state.mass -= loss;
    updateRadius();
  }
  state.invuln = 60;
  if (state.comboCount > 0) state.comboTimer = Math.max(state.comboTimer, COMBO_PAUSE);
  state.run.bumps += 1;
  state.stats.bumps += 1;

  const bx = state.playerX - nx * state.radius;
  const by = state.playerY - ny * state.radius;
  const n = state.settings.reduceMotion ? 4 : 8;
  for (let i = 0; i < n; i++) {
    const a = Math.atan2(-ny, -nx) + rand(-1.2, 1.2);
    const sp = rand(0.4, 1.2) * ss;
    state.particles.push({
      x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      size: (1 + Math.random() * 1.5) * Math.max(1, state.radius * 0.05),
      color: "#cdd8ff", alpha: 0.5, age: 0, maxAge: 40, gravity: 0
    });
  }
  audio.playBump();
  hint("bump", "Ringed objects are still too big. Grow a little, then come back for them.", 3800);
}

function shakeBy(amount) {
  if (state.settings.reduceMotion) return;
  state.shake = Math.max(state.shake, amount);
}

function collectPowerup(e) {
  const def = POWERUPS[e.powerup];
  activatePowerup(state, e.powerup);
  state.run.powerups += 1;
  state.stats.powerupsCollected += 1;
  audio.playPowerup(e.powerup);
  floater(e.x, e.y, def.label, def.color, 18);
  const pn = state.settings.reduceMotion ? 10 : 20;
  for (let i = 0; i < pn; i++) {
    const a = (i / pn) * Math.PI * 2;
    const sp = rand(0.8, 2) * state.speedScale;
    state.particles.push({
      x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      size: (1.5 + Math.random() * 2) * Math.max(1, state.radius * 0.06),
      color: def.color, alpha: 0.9, age: 0, maxAge: 45, gravity: 0
    });
  }
  ui.updatePowerupBar(state);
  const tips = {
    magnet: "Magnet: nearby food drifts toward you",
    slow: "Slow-Mo: the galaxy slows down, you don't",
    double: "Double Mass: every bite counts twice"
  };
  hint("pu_" + e.powerup, tips[e.powerup], 3000);
}

// Every event starts with a 2.5s warning: explain it calmly the first time,
// afterwards just name it.
state.onEventWarn = id => {
  const info = EVENT_INFO[id];
  if (!info) return;
  // v4.1: a galaxy's signature event also feeds its mechanic; say so softly
  const pair = eventPairText(id);
  if (pair) {
    const key = "pair_" + state.biome.name + "_" + id;
    const first = !state.seenHints[key];
    state.seenHints[key] = true;
    state.seenHints["ev_" + id] = true;
    showHint(first ? `${info.name}: ${pair}.` : `${info.name}: ${pair}`, first ? 4200 : 2400);
    return;
  }
  if (!state.seenHints["ev_" + id]) {
    state.seenHints["ev_" + id] = true;
    showHint(info.first, 4800);
  } else {
    showHint(info.name, 2000);
  }
};

state.onEventStart = id => onWorldEvent(state, id);
state.worldHint = (key, msg, ms) => hint(key, msg, ms);

// Power-ups fade out over their last 3 seconds, so no end sound is needed
state.onPowerupEnd = () => {};

// ─── PARTICLES ───

// v4: bits swirl around the hole and spiral in (tangential + inward pull)
function spawnConsumeParticles(entity) {
  const few = state.settings.reduceMotion || getArtQuality() !== "high";
  const count = Math.floor((6 + Math.min(14, Math.floor(entity.radius * 0.8 / Math.max(1, state.radius * 0.05)))) * (few ? 0.6 : 1));
  const sizeK = Math.max(1, entity.radius * 0.12);
  const ss = state.speedScale;
  const dx = entity.x - state.playerX, dy = entity.y - state.playerY;
  const d = Math.hypot(dx, dy) || 1;
  const tx = -dy / d, ty = dx / d;            // swirl direction (counter-clockwise)
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (0.3 + Math.random() * 1.2) * ss;
    const swirl = (0.8 + Math.random() * 1.4) * ss;
    state.particles.push({
      x: entity.x + Math.cos(angle) * entity.radius * 0.5,
      y: entity.y + Math.sin(angle) * entity.radius * 0.5,
      vx: Math.cos(angle) * speed + tx * swirl, vy: Math.sin(angle) * speed + ty * swirl,
      size: (0.8 + Math.random() * 1.8) * sizeK,
      color: entity.color,
      alpha: 0.5 + Math.random() * 0.35,
      age: 0, maxAge: 40 + Math.random() * 25,
      gravity: (0.05 + Math.random() * 0.04) * ss
    });
  }
}

function spawnRipple(entity) {
  state.ripples.push({
    x: entity.x, y: entity.y,
    startRadius: entity.radius,
    expandTo: 30 / state.zoom + entity.radius * 2,
    color: entity.color, age: 0, maxAge: 25
  });
  if (state.ripples.length > 40) state.ripples.shift();
}

function updateParticles(dt) {
  const drag = Math.pow(0.97, dt);
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    const dx = state.playerX - p.x;
    const dy = state.playerY - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 5 && p.gravity) {
      p.vx += (dx / dist) * p.gravity * dt;
      p.vy += (dy / dist) * p.gravity * dt;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= drag;
    p.vy *= drag;
    p.age += dt;
    if (p.age >= p.maxAge) state.particles.splice(i, 1);
  }
  for (let i = state.ripples.length - 1; i >= 0; i--) {
    state.ripples[i].age += dt;
    if (state.ripples[i].age >= state.ripples[i].maxAge) state.ripples.splice(i, 1);
  }
  for (let i = state.floaters.length - 1; i >= 0; i--) {
    state.floaters[i].age += dt;
    if (state.floaters[i].age >= state.floaters[i].maxAge) state.floaters.splice(i, 1);
  }
  const pCap = getArtQuality() === "high" ? 300 : 160;
  if (state.particles.length > pCap) state.particles.splice(0, state.particles.length - pCap);
}

// ─── GALAXY TRANSITION ───

function galaxyComplete() {
  state.transitioning = true;
  state.transitionPhase = "implode";
  state.transitionTimer = 0;
  state.active = freshActive();
  ui.updatePowerupBar(state);

  audio.playGalaxyComplete();
  state.stats.galaxiesCleared += 1;
  state.summary = finishGalaxy(state);
  // v5: the next galaxy starts at the most you reached here
  state.floorMass = Math.max(state.floorMass, state.mass);
  state.galaxyCredited = true;
  save(state);
}

function buyUpgrade(id) {
  const upg = UPGRADES.find(u => u.id === id);
  const lvl = state.upgrades[id] || 0;
  const cost = upgradeCost(upg, lvl);
  if (cost == null || state.stardust < cost) {
    audio.playDenied();
    return;
  }
  state.stardust -= cost;
  state.upgrades[id] = lvl + 1;
  audio.playPurchase();
  save(state);
}

function updateTransition(dt) {
  state.transitionTimer += dt;

  if (state.transitionPhase === "implode") {
    if (state.transitionTimer > 60) {
      state.transitionPhase = "summary";
      state.transitionTimer = 0;
      input.setEnabled(false);
      ui.showSummary(state.summary, state, {
        onBuy: buyUpgrade,
        onContinue: startWarp
      });
    }
  } else if (state.transitionPhase === "warp") {
    if (state.transitionTimer > 100) {
      state.transitionPhase = "fadein";
      state.transitionTimer = 0;
      state.galaxy += 1;
      state.galaxyCredited = false;
      state.bestGalaxy = Math.max(state.bestGalaxy, state.galaxy);
      initGalaxy(state.galaxy);
      save(state);
    }
  } else if (state.transitionPhase === "fadein") {
    if (state.transitionTimer > 60) {
      document.getElementById("transition-overlay").classList.add("hidden");
      state.transitioning = false;
      state.transitionPhase = "";
    }
  }
}

function startWarp() {
  audio.playClick();
  input.setEnabled(true);
  state.transitionPhase = "warp";
  state.transitionTimer = 0;
  const nextGalaxy = state.galaxy + 1;
  const biome = getBiome(nextGalaxy);
  document.getElementById("transition-galaxy").textContent = `Galaxy ${nextGalaxy}`;
  document.getElementById("transition-biome").textContent = biome.name;
  document.getElementById("transition-count").textContent = biome.description;
  document.getElementById("transition-overlay").classList.remove("hidden");
  lastTime = performance.now();
}

// ─── HUD ───

let lastHudSec = -1;
function galaxyProgressNow() {
  // Log-scale progress: growth is roughly exponential, so this fills steadily
  const m0 = state.startMass;
  return state.targetMass > m0
    ? clamp(Math.log(Math.max(state.mass, m0) / m0) / Math.log(state.targetMass / m0), 0, 1)
    : 0;
}

function syncHud(force = false) {
  const progress = galaxyProgressNow();
  hudGalaxy.textContent = state.galaxy;
  const tn = tierName(state.tier);
  if (hudMass.textContent !== tn) hudMass.textContent = tn;
  hudBiome.textContent = state.biome ? state.biome.name : "";
  hudProgressBar.style.width = (progress * 100).toFixed(1) + "%";

  const sec = Math.floor(state.run ? state.run.time : 0);
  if (force || sec !== lastHudSec) {
    lastHudSec = sec;
    hudTime.textContent = fmtTime(sec);
    const best = state.records.fastest[state.galaxy];
    hudBest.textContent = best != null ? fmtTime(best) : "--:--";
  }
}

function showHint(msg, ms = 2800) {
  const el = document.getElementById("hint-toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(showHint._t);
  showHint._t = setTimeout(() => el.classList.add("hidden"), ms);
}

// ─── SCREENS: TITLE, INTRO, DRIFT-IN ───
const TITLE_AFTER_MS = 10 * 60 * 1000;
const TITLE_ZOOM = 3.4;          // camera close-up on the hole behind the title
const titleEl = document.getElementById("title-screen");
const introEl = document.getElementById("intro-screen");
let firstPlayStart = true;

function showScreenEl(el) {
  el.classList.remove("hidden", "fading");
}
function fadeOutScreenEl(el) {
  if (el.classList.contains("hidden")) return;
  el.classList.add("fading");
  setTimeout(() => { if (el.classList.contains("fading")) el.classList.add("hidden"); }, 1400);
}

function showTitle() {
  state.screen = "title";
  state.drift = null;
  state.camMul = TITLE_ZOOM;
  input.setEnabled(false);
  document.body.classList.add("on-title");
  document.getElementById("newgame-confirm").classList.add("hidden");
  document.getElementById("hint-toast").classList.add("hidden");
  document.getElementById("title-continue-sub").textContent = `Galaxy ${state.galaxy} · ${state.biome ? state.biome.name : ""}`;
  showScreenEl(titleEl);
  warmHole(state.radius * zoomTarget() * TITLE_ZOOM * screenDpr);
  save(state);
}

const INTRO_LINES = ["Drift.", "Eat what's smaller.", "Grow."];
let introTimers = [];
function showIntro() {
  state.screen = "intro";
  state.camMul = TITLE_ZOOM;
  updateCameraScale(true);
  input.setEnabled(false);
  document.body.classList.add("on-title");
  state.seenHints.intro = true;
  showScreenEl(introEl);
  const line = document.getElementById("intro-line");
  INTRO_LINES.forEach((txt, i) => {
    const at = 900 + i * 3600;
    introTimers.push(setTimeout(() => { line.textContent = txt; line.classList.add("on"); }, at));
    introTimers.push(setTimeout(() => line.classList.remove("on"), at + 2500));
  });
  introTimers.push(setTimeout(endIntro, 900 + INTRO_LINES.length * 3600));
}
function endIntro() {
  if (state.screen !== "intro") return;
  introTimers.forEach(clearTimeout);
  introTimers = [];
  fadeOutScreenEl(introEl);
  startDrift("fresh");
}
document.getElementById("btn-skip-intro").addEventListener("click", () => { audio.playClick(); endIntro(); });

/** Title -> play: the camera eases into the hole, a breath of dark, then play. */
function startDrift(kind) {
  if (state.drift) return;
  fadeOutScreenEl(titleEl);
  const rm = state.settings.reduceMotion;
  state.drift = { t: 0, phase: 1, kind, veil: 0, from: state.camMul, inDur: rm ? 50 : 110, outDur: rm ? 50 : 80 };
}

function updateDrift(dt) {
  const d = state.drift;
  d.t += dt;
  if (d.phase === 1) {
    const p = Math.min(1, d.t / d.inDur);
    const e = p * p * (3 - 2 * p);
    if (!state.settings.reduceMotion) state.camMul = d.from + (TITLE_ZOOM * 2.1 - d.from) * e;
    d.veil = e * 0.94;
    if (p >= 1) {
      // Swap to the play camera under the veil
      d.phase = 2;
      d.t = 0;
      state.screen = "play";
      state.camMul = 1;
      updateCameraScale(true);
      document.body.classList.remove("on-title");
      titleEl.classList.add("hidden");
      introEl.classList.add("hidden");
      lastTime = performance.now();
    }
  } else {
    const p = Math.min(1, d.t / d.outDur);
    d.veil = 0.94 * (1 - p * p * (3 - 2 * p));
    if (p >= 1) {
      state.drift = null;
      input.setEnabled(true);
      onPlayStart(d.kind);
    }
  }
}

/** The world idles behind the title: things drift slowly, nothing happens. */
function updateBackdrop(dt) {
  updateCameraScale();
  state.camX += (state.playerX - state.camX) * 0.05;
  state.camY += (state.playerY - state.camY) * 0.05;
  updateEntities(state.entities, state.bounds, dt * 0.4);
}

function onPlayStart(kind) {
  if (kind === "resume") showHint(`Welcome back! Galaxy ${state.galaxy}: ${state.biome.name}`);
  else showHint(`Galaxy ${state.galaxy}: ${state.biome.name}`);
  if (!firstPlayStart) return;
  firstPlayStart = false;
  if (state.legacyBonusPending) {
    setTimeout(() => showHint(`+${state.legacyBonusPending} stardust legacy bonus! Spend it after this galaxy`, 4000), 3000);
  } else if (kind === "fresh") {
    const touch = matchMedia("(pointer: coarse)").matches;
    setTimeout(() => showHint(touch ? "Touch anywhere and drag to steer. Eat smaller things!" : "Move with the mouse or WASD. Eat smaller things!", 4000), 2600);
  }
  if (kind !== "fresh" && !state.seenHints.v3_zen) {
    state.seenHints.v3_zen = true;
    setTimeout(() => showHint("Zen mode is on (no clock, no penalties). Tap Zen below to switch it off.", 5000), 7000);
  }
}

document.getElementById("btn-title-continue").addEventListener("click", () => { audio.playClick(); startDrift("continue"); });
document.getElementById("btn-title-new").addEventListener("click", () => {
  audio.playClick();
  document.getElementById("newgame-confirm").classList.remove("hidden");
});
document.getElementById("btn-newgame-no").addEventListener("click", () => {
  audio.playClick();
  document.getElementById("newgame-confirm").classList.add("hidden");
});
document.getElementById("btn-newgame-yes").addEventListener("click", () => {
  audio.playClick();
  document.getElementById("newgame-confirm").classList.add("hidden");
  // Fresh journey: galaxy 1, no stardust or upgrades. Settings, records, codex stay.
  state.galaxy = 1;
  state.floorMass = massForR(START_R);
  state.bestTier = 0;
  state.stardust = 0;
  state.upgrades = defaultUpgrades();
  state.legacyBonusPending = 0;
  state.galaxyCredited = false;
  state.transitioning = false;
  state.transitionPhase = "";
  document.getElementById("transition-overlay").classList.add("hidden");
  initGalaxy(1);
  state.camMul = TITLE_ZOOM;
  updateCameraScale(true);
  save(state);
  startDrift("new");
});
document.getElementById("btn-title-settings").addEventListener("click", () => {
  audio.playClick();
  ui.showStats(state, () => {}, { settingsOnly: true });
});

// ─── PERFORMANCE + AUTO QUALITY ───
// Work time per frame (not the vsync interval). At 120Hz the budget is 8.3ms;
// on Auto, if the average stays above ~6.5ms for 2s we drop to Lite.
// Also watches the real frame interval against the display's own vsync (the
// fastest interval seen lately) to catch GPU-bound slowdowns JS timing misses.
const perf = { ema: 0, ring: new Float32Array(240), n: 0, over: 0, drops: 0, vsync: 0, iEma: 0, slow: 0 };
function trackPerf(ms, dt, interval) {
  perf.ring[perf.n++ % perf.ring.length] = ms;
  perf.ema = perf.ema ? perf.ema * 0.95 + ms * 0.05 : ms;
  if (interval > 2 && interval < 100) {
    perf.vsync = perf.vsync ? Math.min(perf.vsync * 1.0015, interval) : interval;
    perf.iEma = perf.iEma ? perf.iEma * 0.95 + interval * 0.05 : interval;
  }
  if (state.settings.quality !== "auto" || getArtQuality() !== "high" || state.screen !== "play" || state.drift) return;
  perf.over = perf.ema > 6.5 ? perf.over + dt : 0;
  perf.slow = perf.iEma > perf.vsync * 1.45 ? perf.slow + dt : 0;
  if (perf.over > 120 || perf.slow > 240) {
    perf.slow = 0;
    perf.drops++;
    applyQuality("balanced");
  }
}
function perfReport() {
  const n = Math.min(perf.n, perf.ring.length);
  const a = Array.from(perf.ring.slice(0, n)).sort((x, y) => x - y);
  const q = f => a.length ? +a[Math.min(a.length - 1, Math.floor(a.length * f))].toFixed(2) : 0;
  return { avg: +(a.reduce((s, v) => s + v, 0) / (a.length || 1)).toFixed(2), p50: q(0.5), p95: q(0.95), max: q(0.999),
    quality: getArtQuality(), autoDrops: perf.drops, vsyncMs: +perf.vsync.toFixed(2), frameMs: +perf.iEma.toFixed(2), entities: state.entities.length, ...artStats() };
}
function applyQuality(q) {
  setArtQuality(q);
  const cap = q === "high" ? 2 : 1.5;
  if (cap !== dprCap) {
    dprCap = cap;
    ({ w: screenW, h: screenH, dpr: screenDpr } = resizeCanvas());
    invalidateStarfield();
  }
}

// ─── BREATHING ───
// ~6 breaths per minute: 5s in, 5s out. Drives the drone swell, the biome
// glow and the hole's halo (plus the optional guide ring).
const BREATH_MS = 10000;
function breathPhase(now) {
  return 0.5 - 0.5 * Math.cos((now % BREATH_MS) / BREATH_MS * Math.PI * 2);
}

// ─── MAIN LOOP ───

let lastTime = performance.now();
let mouseScreenX = -100;
let mouseScreenY = -100;

canvas.addEventListener("mousemove", e => {
  const rect = canvas.getBoundingClientRect();
  mouseScreenX = e.clientX - rect.left;
  mouseScreenY = e.clientY - rect.top;
});
canvas.addEventListener("mouseleave", () => {
  mouseScreenX = -100;
  mouseScreenY = -100;
});

function frame(now) {
  requestAnimationFrame(frame);
  const t0 = performance.now();

  // rAF timestamps can be slightly earlier than a performance.now() taken in an
  // event handler (resume/continue), so clamp at 0 to avoid negative steps.
  const rawDt = (now - lastTime) / 16.67;
  const dt = clamp(rawDt, 0, 3);
  lastTime = now;

  if (state.paused || state.menuOpen) return;

  const inPlay = state.screen === "play";
  if (inPlay) state.stats.timePlayed += dt / 60;

  if (state.transitioning && inPlay) updateTransition(dt);
  if (!inPlay) updateBackdrop(dt);
  if (state.drift) updateDrift(dt);

  const playing = inPlay && (!state.transitioning || state.transitionPhase === "fadein");
  const worldDt = dt * slowFactor(state);

  if (playing) {
    state.run.time += dt / 60;
    const prevCamX = state.camX, prevCamY = state.camY;
    updatePlayer(dt);
    updateAnchor(dt);
    updateCameraScale();
    state.bgX += (state.camX - prevCamX) * state.zoom;
    state.bgY += (state.camY - prevCamY) * state.zoom;
    updateLivingWorld(state, dt, worldDt);
    updateWorlds(state, dt, worldDt);
    updateEntities(state.entities, state.bounds, worldDt);
    if (updatePowerups(state, dt)) {
      audio.playPowerupSpawn();
      hint("pu_first", "A power-up appeared! Grab the glowing orb", 2600);
    }
    tryConsume(dt);
    state.galaxyProgress = galaxyProgressNow();
    if (!state.transitioning) checkTier();
    updateTrail(dt);
    ui.updatePowerupBar(state);
    syncHud();
  }
  if (state.tierBanner) {
    state.tierBanner.age += dt;
    if (state.tierBanner.age > TIER_BANNER_FRAMES) state.tierBanner = null;
  }
  updateParticles(dt);
  state.shake *= Math.pow(0.88, dt);
  if (state.shake < 0.2) state.shake = 0;
  state.gulp *= Math.pow(0.9, dt);

  // ─── DRAW ───
  const w = screenW;
  const h = screenH;
  const z = state.zoom;
  const vw = state.viewW;
  const vh = state.viewH;

  const breath = breathPhase(now);
  audio.setBreath(breath);
  drawStarfield(ctx, w, h, state.bgX, state.bgY, state.biome ? state.biome.tint : "#0d1633", breath, { noNebula: true });
  drawBackdrop(ctx, w, h, z, state.bgX, state.bgY, breath, { lite: getArtQuality() !== "high" });
  drawLivingWorldBG(ctx, state, w, h);
  beginArtFrame();
  if (getArtQuality() === "high") {
    drawLens(ctx, (state.playerX - state.camX) * state.zoom + w / 2, (state.playerY - state.camY) * state.zoom + h / 2, state.radius * state.zoom);
  }

  const shakeX = state.shake ? (Math.random() - 0.5) * state.shake : 0;
  const shakeY = state.shake ? (Math.random() - 0.5) * state.shake : 0;

  ctx.save();
  ctx.translate(shakeX, shakeY);
  ctx.scale(z, z);
  drawWorldsBG(ctx, state, vw, vh, { zoom: z, dpr: screenDpr, time: now, breath, reduceMotion: state.settings.reduceMotion });
  drawEntities(ctx, state.entities, vw, vh, state.camX, state.camY, state.radius, now, state.eatRatio, z, screenDpr, breath);
  drawParticles(ctx, state.particles, vw, vh, state.camX, state.camY, { reduceMotion: state.settings.reduceMotion });
  drawRipples(ctx, state.ripples, vw, vh, state.camX, state.camY, z);
  drawLivingWorldFG(ctx, state, vw, vh);
  drawBlackHole(ctx, state.playerX - state.camX + vw / 2, state.playerY - state.camY + vh / 2, state.radius, now,
    { vx: state.playerVX, vy: state.playerVY }, {
      zoom: z,
      dpr: screenDpr,
      dt: state.paused ? 0 : dt,
      reduceMotion: state.settings.reduceMotion,
      speedScale: state.speedScale,
      magnet: state.active.magnet > 0,
      pullRange: pullRange(state),
      double: state.active.double > 0,
      gulp: state.gulp,
      breath,
      breathGuide: state.settings.breathGuide
    });
  ctx.restore();

  // Slow-Mo tint
  if (state.active.slow > 0) {
    const a = powerupFade(state, "slow") * 0.16;
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, "rgba(80, 180, 255, 0)");
    g.addColorStop(1, `rgba(80, 180, 255, ${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  if (inPlay) {
    drawLivingWorldOverlay(ctx, state, w, h);
    drawWorldsOverlay(ctx, state, w, h, breath);
    drawEdgeIndicators(ctx, state.entities, w, h, state.camX, state.camY, state.radius, z, state.eatRatio);
    drawMinimap(ctx, w, h, state.playerX, state.playerY, state.entities, radarRange(), state.radius, state.eatRatio,
      (c, mx, my, sc, rim) => drawWorldsMinimap(c, mx, my, sc, now, rim), { trail: state.trail, viewW: vw, viewH: vh });
    drawTierBanner(w, h);
    drawCursor(ctx, mouseScreenX, mouseScreenY, w, h);
    drawThumbstick(input.getStick());
    drawFloaters(w, h, z);
  }

  if (state.transitioning) {
    if (state.transitionPhase === "implode") {
      const alpha = Math.min(1, state.transitionTimer / 60);
      ctx.fillStyle = `rgba(2, 3, 8, ${alpha * 0.8})`;
      ctx.fillRect(0, 0, w, h);
    } else if (state.transitionPhase === "summary") {
      ctx.fillStyle = "rgba(2, 3, 8, 0.8)";
      ctx.fillRect(0, 0, w, h);
    } else if (state.transitionPhase === "warp") {
      ctx.fillStyle = "rgba(2, 3, 8, 0.85)";
      ctx.fillRect(0, 0, w, h);
      const progress = state.transitionTimer / 100;
      for (let i = 0; i < 10; i++) {
        const ringProgress = (i / 10 + progress * 2) % 1;
        const r = ringProgress * Math.max(w, h) * 0.7;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(130, 140, 255, ${(1 - ringProgress) * 0.18})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    } else if (state.transitionPhase === "fadein") {
      const alpha = 1 - Math.min(1, state.transitionTimer / 60);
      ctx.fillStyle = `rgba(2, 3, 8, ${alpha * 0.8})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // Drift-in veil (title -> play)
  if (state.drift && state.drift.veil > 0) {
    ctx.fillStyle = `rgba(2, 3, 8, ${state.drift.veil})`;
    ctx.fillRect(0, 0, w, h);
  }

  trackPerf(performance.now() - t0, dt, rawDt * 16.67);

  // Combo counter + bonus
  if (inPlay && state.comboCount >= 3 && !state.transitioning) {
    const hx = (state.playerX - state.camX) * z + w / 2;
    const hy = (state.playerY - state.camY) * z + h / 2;
    const size = 14 + Math.min(state.comboCount, 25) * 0.5;
    ctx.save();
    ctx.font = `700 ${size}px 'Outfit', sans-serif`;
    ctx.textAlign = "center";
    const a = Math.min(0.9, 0.3 + state.comboTimer / state.mods.comboWindow);
    ctx.fillStyle = `rgba(255, 210, 100, ${a})`;
    ctx.fillText(`×${state.comboCount}`, hx, hy - state.radius * z * 1.25 - 14);
    if (state.comboCount >= 5) {
      ctx.font = "600 10px 'Space Mono', monospace";
      ctx.fillStyle = `rgba(255, 210, 100, ${a * 0.7})`;
      ctx.fillText(`+${Math.min(state.comboCount, 25)}% mass`, hx, hy - state.radius * z * 1.25 - 14 + 13);
    }
    ctx.restore();
  }
}

// Floating thumbstick: faint base ring + knob, drawn in screen space
function drawThumbstick(st) {
  if (!st) return;
  const dx = st.kx - st.bx;
  const dy = st.ky - st.by;
  const d = Math.hypot(dx, dy);
  const kx = d > st.maxR ? st.bx + (dx / d) * st.maxR : st.kx;
  const ky = d > st.maxR ? st.by + (dy / d) * st.maxR : st.ky;
  ctx.save();
  ctx.beginPath();
  ctx.arc(st.bx, st.by, st.maxR, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(138, 141, 255, 0.07)";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(170, 175, 255, 0.28)";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(st.bx, st.by, 3, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(200, 205, 255, 0.25)";
  ctx.fill();
  const g = ctx.createRadialGradient(kx, ky, 2, kx, ky, 24);
  g.addColorStop(0, "rgba(220, 224, 255, 0.45)");
  g.addColorStop(1, "rgba(138, 141, 255, 0.18)");
  ctx.beginPath();
  ctx.arc(kx, ky, 22, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(220, 224, 255, 0.5)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawFloaters(w, h, z) {
  for (const f of state.floaters) {
    const t = f.age / f.maxAge;
    const sx = (f.x - state.camX) * z + w / 2;
    const sy = (f.y - state.camY) * z + h / 2 - t * 40;
    const pop = t < 0.15 ? 0.6 + (t / 0.15) * 0.5 : 1.1 - Math.min(0.1, (t - 0.15));
    ctx.save();
    ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    ctx.font = `800 ${Math.round(f.size * pop)}px 'Outfit', sans-serif`;
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(4, 6, 16, 0.7)";
    ctx.strokeText(f.text, sx, sy);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, sx, sy);
    ctx.restore();
  }
}

// ─── CONTROLS BAR EVENTS ───

const PAUSE_SVG = '<svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><rect x="4" y="3" width="3" height="12" rx="1"/><rect x="11" y="3" width="3" height="12" rx="1"/></svg>';
const PLAY_SVG = '<svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><polygon points="5,3 15,9 5,15"/></svg>';

function setPaused(p) {
  if (state.transitioning && state.transitionPhase === "summary") return;
  if (state.screen !== "play" || state.drift) return;
  state.paused = p;
  input.setEnabled(!p);
  const btn = document.getElementById("btn-pause");
  btn.innerHTML = p ? PLAY_SVG : PAUSE_SVG;
  document.getElementById("pause-menu").classList.toggle("hidden", !p);
  if (p) {
    save(state);
  } else {
    if (ui.isStatsOpen()) ui.closeStats();
    lastTime = performance.now();
  }
}

document.getElementById("btn-resume").addEventListener("click", () => { audio.playClick(); setPaused(false); });
document.getElementById("btn-pause-settings").addEventListener("click", () => {
  audio.playClick();
  ui.showStats(state, () => {}, { settingsOnly: true });
});
document.getElementById("btn-pause-title").addEventListener("click", () => {
  audio.playClick();
  setPaused(false);
  showTitle();
});

document.getElementById("btn-pause").addEventListener("click", () => setPaused(!state.paused));

document.getElementById("btn-restart").addEventListener("click", () => {
  if (state.transitioning) {
    showHint("Hang on, warping…");
    return;
  }
  initGalaxy(state.galaxy);
  save(state);
  showHint("Galaxy restarted");
});

document.getElementById("btn-audio").addEventListener("click", () => {
  state.audioEnabled = !state.audioEnabled;
  audio.setEnabled(state.audioEnabled);
  document.getElementById("btn-audio").classList.toggle("audio-off", !state.audioEnabled);
  if (state.audioEnabled) {
    audio.init();
    audio.startDrone(state.biome);
  }
  save(state);
});

document.getElementById("volume-slider").addEventListener("input", e => {
  state.volume = Number(e.target.value) / 100;
  audio.setVolume(state.volume);
  save(state);
});

document.getElementById("btn-stats").addEventListener("click", () => {
  if (ui.isStatsOpen()) { ui.closeStats(); return; }
  if (state.transitioning && state.transitionPhase === "summary") return;
  state.menuOpen = true;
  input.setEnabled(false);
  ui.showStats(state, () => {
    state.menuOpen = false;
    input.setEnabled(!state.paused);
    lastTime = performance.now();
  });
});

document.getElementById("btn-reset").addEventListener("click", () => {
  if (!confirm("Reset all progress, stardust and upgrades? This cannot be undone.")) return;
  resetting = true;
  clearSave();
  location.reload();
});

// P / Escape pause (Escape also closes the stats view)
window.addEventListener("keydown", e => {
  if (e.key === "Escape" && ui.isStatsOpen()) {
    ui.closeStats();
    e.preventDefault();
    return;
  }
  if ((e.key === "Escape" || e.key === "p" || e.key === "P") && state.screen === "play") {
    setPaused(!state.paused);
    e.preventDefault();
  }
});

// Save often, and whenever the app is backgrounded (phones kill tabs)
let resetting = false;
setInterval(() => { if (!resetting) save(state); }, 5000);
let hiddenAt = 0;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    if (!resetting) save(state);
    return;
  }
  lastTime = performance.now();
  // Back after a long break: greet with the title screen instead of mid-galaxy
  if (hiddenAt && Date.now() - hiddenAt > TITLE_AFTER_MS && state.screen === "play" && !state.drift &&
      !(state.transitioning && state.transitionPhase === "summary")) {
    if (state.paused) setPaused(false);
    showTitle();
  }
});
window.addEventListener("pagehide", () => { if (!resetting) save(state); });

// ─── INIT ───

const savedData = load();
let resumeRun = null;
if (savedData) {
  state.galaxy = savedData.galaxy;
  state.bestGalaxy = Math.max(savedData.bestGalaxy, state.galaxy);
  state.totalConsumed = savedData.totalConsumed;
  state.audioEnabled = savedData.audioEnabled;
  state.volume = savedData.volume;
  state.stats = savedData.stats;
  state.records = savedData.records;
  state.upgrades = savedData.upgrades;
  state.stardust = savedData.stardust;
  state.seenHints = savedData.seenHints;
  state.settings = { ...state.settings, ...(savedData.settings || {}) };
  state.legacyBonusPending = savedData.legacyBonus || 0;
  state.floorMass = savedData.floorMass;
  state.bestTier = savedData.bestTier || 0;
  if (savedData.run && savedData.run.galaxy === state.galaxy) resumeRun = savedData.run;

  document.getElementById("volume-slider").value = Math.round(state.volume * 100);
  if (!state.audioEnabled) document.getElementById("btn-audio").classList.add("audio-off");
}

// ─── SETTINGS ───
function applySettings() {
  const st = state.settings;
  input.setTouchMode(st.touchMode);
  document.body.classList.toggle("zen", !!st.zen);
  document.body.classList.toggle("soft-palette", !!st.softPalette);
  setSoftPalette(!!st.softPalette);
  document.getElementById("btn-zen").classList.toggle("on", !!st.zen);
  document.body.classList.toggle("reduce-motion", !!st.reduceMotion);
  if (st.reduceMotion) state.shake = 0;
}

state.setSetting = (key, val) => {
  state.settings[key] = val;
  if (key === "quality") {
    perf.over = 0;
    applyQuality(val === "balanced" ? "balanced" : "high");
  }
  applySettings();
  syncHud(true);
  save(state);
};
state.setTouchMode = mode => state.setSetting("touchMode", mode);
applySettings();
applyQuality(state.settings.quality === "balanced" ? "balanced" : "high");

document.getElementById("btn-zen").addEventListener("click", () => {
  const on = !state.settings.zen;
  state.setSetting("zen", on);
  audio.playClick();
  showHint(on ? "Zen mode on: no clock, no penalties. Just drift." : "Zen mode off: clock, par bonus and records are back", 3200);
});

audio.setVolume(state.volume);
audio.setEnabled(state.audioEnabled);
// Audio may only start from an "activation" gesture: touchend/pointerup/click/keydown
// (touchstart and touch pointerdown don't count on mobile browsers).
const UNLOCK_EVENTS = ["pointerup", "touchend", "click", "keydown"];
const initAudio = () => {
  if (state.audioEnabled) {
    audio.init();
    audio.startDrone(state.biome);
  }
  for (const ev of UNLOCK_EVENTS) window.removeEventListener(ev, initAudio, true);
};
for (const ev of UNLOCK_EVENTS) window.addEventListener(ev, initAudio, true);

initGalaxy(state.galaxy, resumeRun);

// Fresh install: short intro. Away > 10 min (or never seen v4): title screen.
// Otherwise drop straight back in where you were.
const awayMs = savedData ? Date.now() - (savedData.lastActive || 0) : Infinity;
if (!savedData && !state.seenHints.intro) {
  showIntro();
} else if (awayMs > TITLE_AFTER_MS) {
  showTitle();
} else {
  onPlayStart(resumeRun ? "resume" : "continue");
}
save(state);

requestAnimationFrame(frame);

// Debug/automation hook (harmless; lets a test bot read state)
// Developer hook for the automated tests. Only exists on a local dev server
// or with ?debug in the URL, never for normal play.
const DEV = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || new URLSearchParams(location.search).has("debug");
if (DEV) window.__bh = {
  state, input, fireEvent: id => fireEvent(state, id), events: activeEventInfo,
  perf: perfReport, worlds: worldsInfo, resetPerf: () => { perf.n = 0; perf.ring.fill(0); }, art: artStats,
  density: densityInfo, music: audio.musicInfo, feature: () => worldsFeature(state),
  tier: () => ({ tier: state.tier, name: tierName(state.tier), R: state.radius, anchor: state.anchorSmooth, zoom: state.zoom,
    reveal: state.reveal ? +state.reveal.p.toFixed(2) : null, floor: state.floorMass, target: state.targetMass, progress: state.galaxyProgress }),
  // test helper: grow to just under the next tier line
  nearNextTier: (k = 0.985) => { const r = rForTier(state.tier + 1) * k; state.mass = massForR(r); updateRadius(); }
};
