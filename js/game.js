// ─── GAME MAIN ───
// State, main loop, consume logic, zoom camera, galaxy transitions + summary.

import { createInput } from "./input.js";
import { spawnGalaxy, updateEntities, galaxyObjectCount, getBiome, rand } from "./entities.js";
import {
  drawStarfield, drawBoundary, drawEntities, drawBlackHole,
  drawParticles, drawRipples, drawMinimap, drawEdgeIndicators, drawCursor,
  invalidateStarfield, prerenderEntitySprite
} from "./render.js";
import * as audio from "./audio.js";
import { save, load, clearSave, defaultStats, defaultRecords, defaultUpgrades } from "./save.js";
import { initLivingWorld, updateLivingWorld, drawLivingWorldBG, drawLivingWorldFG, pullRange } from "./living-world.js";
import { computeMods, targetMassFor, freshRun, finishGalaxy, UPGRADES, upgradeCost, fmtTime, fmtMass } from "./progression.js";
import { initPowerups, updatePowerups, activatePowerup, freshActive, POWERUPS } from "./powerups.js";
import * as ui from "./ui.js";

// ─── CANVAS SETUP ───
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const hudGalaxy = document.getElementById("hud-galaxy");
const hudTime = document.getElementById("hud-time");
const hudMass = document.getElementById("hud-mass");
const hudBest = document.getElementById("hud-best");
const hudBiome = document.getElementById("hud-biome");
const hudProgressBar = document.getElementById("hud-progress-bar");

function resizeCanvas() {
  const container = document.getElementById("game-container");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
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

  entities: [], bounds: 800, baseBounds: 800, biome: null, initialCount: 0,
  targetMass: 15000, startMass: 20,

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
const MAX_BITE = 0.06;
const MAX_BIG_BITE = 0.08;   // outgrown "bigger fish" are a slightly bigger treat
const MIN_BITE_CAP = 6;

// ─── HELPERS ───
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

function updateRadius() {
  state.radius = Math.max(6, 4 + Math.sqrt(state.mass) * 0.9);
  // The galaxy grows with you so it never feels like a fishbowl
  state.bounds = Math.max(state.baseBounds, state.radius * 14);
}

function zoomTarget() {
  const k = clamp(Math.min(screenW, screenH) / 420, 0.85, 1.5);
  return clamp(Math.pow(24 / (state.radius + 16), 0.65) * k, 0.02, 1.5);
}

function updateCameraScale(snap = false) {
  const zt = zoomTarget();
  state.zoom = snap ? zt : state.zoom + (zt - state.zoom) * 0.04;
  state.viewW = screenW / state.zoom;
  state.viewH = screenH / state.zoom;
  // World speeds scale up as the camera zooms out, keeping on-screen speed steady
  state.speedScale = Math.pow((state.radius + 16) / 24, 0.55);
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

// ─── INIT GALAXY ───
function initGalaxy(galaxyNum, resume = null) {
  const { entities, biome, bounds } = spawnGalaxy(galaxyNum);

  state.mods = computeMods(state.upgrades);
  state.eatRatio = state.mods.eatRatio;
  state.startMass = state.mods.startMass;

  state.entities = entities;
  state.biome = biome;
  state.baseBounds = bounds;
  state.initialCount = entities.length;
  state.targetMass = targetMassFor(galaxyNum);

  for (const e of entities) prerenderEntitySprite(e);
  invalidateStarfield();

  state.mass = resume ? clamp(resume.mass, state.startMass, state.targetMass * 0.97) : state.startMass;
  updateRadius();

  // Anything you can't eat at the start counts as a "big catch" later
  for (const e of entities) if (state.radius <= e.radius * state.eatRatio) e.bigFish = true;

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
  initPowerups();
  ui.updatePowerupBar(state);

  audio.startDrone(biome.tintRGB);
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
      const cap = Math.max(MIN_BITE_CAP, state.mass * (e.bigFish ? MAX_BIG_BITE : MAX_BITE));
      const gain = Math.min(e.mass * 0.5 * comboBonus, cap) * dbl;
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
        floater(e.x, e.y, "BIG CATCH!", "#ffcf6e", 20);
        state.shake = Math.max(state.shake, 6);
        audio.playBigCatch();
      }
      if (state.comboCount >= 5 && state.comboCount % 5 === 0) {
        floater(state.playerX, state.playerY - R * 1.6, `Combo ×${state.comboCount}!`, "#ffe08a", 15 + Math.min(10, state.comboCount / 3));
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

function bump(e, dx, dy, dist) {
  // Knocked back by something too big: lose a little mass, break the combo
  const d = Math.max(1, dist);
  const nx = -dx / d;
  const ny = -dy / d;
  const kick = 7 * state.speedScale;
  state.playerVX = nx * kick;
  state.playerVY = ny * kick;
  e.vx -= nx * 0.3 * e.baseSpeed;
  e.vy -= ny * 0.3 * e.baseSpeed;

  const loss = Math.min(state.mass * 0.05, Math.max(0, state.mass - state.startMass));
  state.mass -= loss;
  updateRadius();
  state.invuln = 60;
  state.comboCount = 0;
  state.comboTimer = 0;
  state.shake = Math.max(state.shake, 9);
  state.run.bumps += 1;
  state.stats.bumps += 1;

  const bx = state.playerX - nx * state.radius;
  const by = state.playerY - ny * state.radius;
  for (let i = 0; i < 14; i++) {
    const a = Math.atan2(-ny, -nx) + rand(-1.2, 1.2);
    const sp = rand(1, 3) * state.speedScale;
    state.particles.push({
      x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      size: (1 + Math.random() * 2) * Math.max(1, state.radius * 0.06),
      color: "#ff6b6b", alpha: 0.8, age: 0, maxAge: 35, gravity: 0
    });
  }
  if (loss > 1) floater(state.playerX, state.playerY - state.radius * 1.4, `-${fmtMass(loss)}`, "#ff8080", 14);
  audio.playBump();
  hint("bump", "Red-ringed objects are too big. Grow first, then come back for them!", 3800);
}

function collectPowerup(e) {
  const def = POWERUPS[e.powerup];
  activatePowerup(state, e.powerup);
  state.run.powerups += 1;
  state.stats.powerupsCollected += 1;
  audio.playPowerup(e.powerup);
  floater(e.x, e.y, def.label.toUpperCase() + "!", def.color, 19);
  state.shake = Math.max(state.shake, 3);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const sp = rand(1.5, 3.5) * state.speedScale;
    state.particles.push({
      x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      size: (1.5 + Math.random() * 2) * Math.max(1, state.radius * 0.06),
      color: def.color, alpha: 0.9, age: 0, maxAge: 45, gravity: 0
    });
  }
  ui.updatePowerupBar(state);
  const tips = {
    magnet: "Magnet: everything edible nearby gets pulled in",
    slow: "Slow-Mo: the galaxy slows down, you don't",
    double: "Double Mass: every bite counts twice"
  };
  hint("pu_" + e.powerup, tips[e.powerup], 3000);
}

state.onPowerupEnd = () => {
  audio.playPowerupEnd();
};

// ─── PARTICLES ───

function spawnConsumeParticles(entity) {
  const count = 6 + Math.min(18, Math.floor(entity.radius * 0.8 / Math.max(1, state.radius * 0.05)));
  const sizeK = Math.max(1, entity.radius * 0.15);
  const ss = state.speedScale;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const speed = (0.5 + Math.random() * 2) * ss;
    state.particles.push({
      x: entity.x, y: entity.y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      size: (1 + Math.random() * 2.5) * sizeK,
      color: entity.color,
      alpha: 0.6 + Math.random() * 0.3,
      age: 0, maxAge: 30 + Math.random() * 20,
      gravity: (0.02 + Math.random() * 0.02) * ss
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
  if (state.particles.length > 300) state.particles.splice(0, state.particles.length - 300);
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
  state.transitionPhase = "warp";
  state.transitionTimer = 0;
  const nextGalaxy = state.galaxy + 1;
  const biome = getBiome(nextGalaxy);
  document.getElementById("transition-galaxy").textContent = `Galaxy ${nextGalaxy}`;
  document.getElementById("transition-biome").textContent = biome.name;
  document.getElementById("transition-count").textContent =
    `${galaxyObjectCount(nextGalaxy)} objects · goal ${fmtMass(targetMassFor(nextGalaxy))} mass`;
  document.getElementById("transition-overlay").classList.remove("hidden");
  lastTime = performance.now();
}

// ─── HUD ───

let lastHudSec = -1;
function syncHud(force = false) {
  // Log-scale progress: growth is roughly exponential, so this fills steadily
  const m0 = state.startMass;
  const progress = state.targetMass > m0
    ? clamp(Math.log(Math.max(state.mass, m0) / m0) / Math.log(state.targetMass / m0), 0, 1)
    : 0;
  hudGalaxy.textContent = state.galaxy;
  hudMass.textContent = fmtMass(state.mass) + " / " + fmtMass(state.targetMass);
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

  // rAF timestamps can be slightly earlier than a performance.now() taken in an
  // event handler (resume/continue), so clamp at 0 to avoid negative steps.
  const rawDt = (now - lastTime) / 16.67;
  const dt = clamp(rawDt, 0, 3);
  lastTime = now;

  if (state.paused || state.menuOpen) return;

  state.stats.timePlayed += dt / 60;

  if (state.transitioning) updateTransition(dt);

  const playing = !state.transitioning || state.transitionPhase === "fadein";
  const worldDt = state.active.slow > 0 ? dt * 0.35 : dt;

  if (playing) {
    state.run.time += dt / 60;
    const prevCamX = state.camX, prevCamY = state.camY;
    updatePlayer(dt);
    updateCameraScale();
    state.bgX += (state.camX - prevCamX) * state.zoom;
    state.bgY += (state.camY - prevCamY) * state.zoom;
    updateLivingWorld(state, dt, worldDt);
    updateEntities(state.entities, state.bounds, worldDt);
    if (updatePowerups(state, dt)) {
      audio.playPowerupSpawn();
      hint("pu_first", "A power-up appeared! Grab the glowing orb", 2600);
    }
    tryConsume(dt);
    ui.updatePowerupBar(state);
    syncHud();
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

  drawStarfield(ctx, w, h, state.bgX, state.bgY, state.biome ? state.biome.tint : "#0d1633");
  drawLivingWorldBG(ctx, state, w, h);

  const shakeX = state.shake ? (Math.random() - 0.5) * state.shake : 0;
  const shakeY = state.shake ? (Math.random() - 0.5) * state.shake : 0;

  ctx.save();
  ctx.translate(shakeX, shakeY);
  ctx.scale(z, z);
  drawBoundary(ctx, vw, vh, state.camX, state.camY, state.bounds, state.biome ? state.biome.borderColor : "#1a2e6a", now, z);
  drawEntities(ctx, state.entities, vw, vh, state.camX, state.camY, state.radius, now, state.eatRatio, z);
  drawParticles(ctx, state.particles, vw, vh, state.camX, state.camY);
  drawRipples(ctx, state.ripples, vw, vh, state.camX, state.camY, z);
  drawLivingWorldFG(ctx, state, vw, vh);
  drawBlackHole(ctx, state.playerX - state.camX + vw / 2, state.playerY - state.camY + vh / 2, state.radius, now,
    { vx: state.playerVX, vy: state.playerVY }, {
      zoom: z,
      speedScale: state.speedScale,
      magnet: state.active.magnet > 0,
      pullRange: pullRange(state),
      double: state.active.double > 0,
      invuln: state.invuln > 0,
      gulp: state.gulp
    });
  ctx.restore();

  // Slow-Mo tint
  if (state.active.slow > 0) {
    const a = Math.min(1, state.active.slow / 30) * 0.22;
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, "rgba(80, 180, 255, 0)");
    g.addColorStop(1, `rgba(80, 180, 255, ${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  drawEdgeIndicators(ctx, state.entities, w, h, state.camX, state.camY, state.radius, z, state.eatRatio);
  drawMinimap(ctx, w, h, state.playerX, state.playerY, state.entities, state.bounds, state.radius, state.eatRatio);
  drawCursor(ctx, mouseScreenX, mouseScreenY, w, h);
  drawFloaters(w, h, z);

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

  // Combo counter + bonus
  if (state.comboCount >= 3 && !state.transitioning) {
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
  state.paused = p;
  const btn = document.getElementById("btn-pause");
  btn.innerHTML = p ? PLAY_SVG : PAUSE_SVG;
  if (p) {
    showHint("Paused");
    save(state);
  } else {
    lastTime = performance.now();
  }
}

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
    audio.startDrone(state.biome ? state.biome.tintRGB : [13, 22, 51]);
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
  ui.showStats(state, () => {
    state.menuOpen = false;
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
  if (e.key === "Escape" || e.key === "p" || e.key === "P") {
    setPaused(!state.paused);
    e.preventDefault();
  }
});

// Save often, and whenever the app is backgrounded (phones kill tabs)
let resetting = false;
setInterval(() => { if (!resetting) save(state); }, 5000);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && !resetting) save(state);
  if (!document.hidden) lastTime = performance.now();
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
  state.legacyBonusPending = savedData.legacyBonus || 0;
  if (savedData.run && savedData.run.galaxy === state.galaxy) resumeRun = savedData.run;

  document.getElementById("volume-slider").value = Math.round(state.volume * 100);
  if (!state.audioEnabled) document.getElementById("btn-audio").classList.add("audio-off");
}

audio.setVolume(state.volume);
audio.setEnabled(state.audioEnabled);
// Audio may only start from an "activation" gesture: touchend/pointerup/click/keydown
// (touchstart and touch pointerdown don't count on mobile browsers).
const UNLOCK_EVENTS = ["pointerup", "touchend", "click", "keydown"];
const initAudio = () => {
  if (state.audioEnabled) {
    audio.init();
    audio.startDrone(state.biome ? state.biome.tintRGB : [13, 22, 51]);
  }
  for (const ev of UNLOCK_EVENTS) window.removeEventListener(ev, initAudio, true);
};
for (const ev of UNLOCK_EVENTS) window.addEventListener(ev, initAudio, true);

initGalaxy(state.galaxy, resumeRun);
if (resumeRun) {
  showHint(`Welcome back! Galaxy ${state.galaxy}: ${state.biome.name}`);
} else {
  showHint(`Galaxy ${state.galaxy}: ${state.biome.name}`);
}
if (state.legacyBonusPending) {
  setTimeout(() => showHint(`+${state.legacyBonusPending} stardust legacy bonus! Spend it after this galaxy`, 4000), 3000);
} else if (!savedData) {
  const touch = matchMedia("(pointer: coarse)").matches;
  setTimeout(() => showHint(touch ? "Hold a finger where you want to drift. Eat smaller things!" : "Move with the mouse or WASD. Eat smaller things!", 4000), 3000);
}
save(state);

requestAnimationFrame(frame);

// Debug/automation hook (harmless; lets a test bot read state)
window.__bh = { state };
