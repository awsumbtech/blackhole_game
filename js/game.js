// ─── GAME MAIN ───
// State management, main loop, consume logic, galaxy transitions.

import { createInput } from "./input.js";
import { spawnGalaxy, updateEntities, galaxyObjectCount, galaxyBounds, getBiome } from "./entities.js";
import {
  drawStarfield, drawBoundary, drawEntities, drawBlackHole,
  drawParticles, drawRipples, drawMinimap, drawEdgeIndicators, drawCursor
} from "./render.js";
import * as audio from "./audio.js";
import { save, load, clearSave, defaultStats } from "./save.js";

// ─── CANVAS SETUP ───
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

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
  return { w, h };
}

let screenW, screenH;
({ w: screenW, h: screenH } = resizeCanvas());
window.addEventListener("resize", () => {
  ({ w: screenW, h: screenH } = resizeCanvas());
});

// ─── STATE ───
const state = {
  galaxy: 1,
  bestGalaxy: 1,

  // Player — resets each galaxy
  mass: 20,
  radius: 8,
  playerX: 0,
  playerY: 0,
  playerVX: 0,
  playerVY: 0,

  // Camera
  camX: 0,
  camY: 0,

  // Level
  entities: [],
  bounds: 800,
  biome: null,
  initialCount: 0,

  // Effects
  particles: [],
  ripples: [],

  // Combo tracking
  comboCount: 0,
  comboTimer: 0,

  // Transition
  transitioning: false,
  transitionPhase: "",
  transitionTimer: 0,

  // Pause
  paused: false,

  // Settings
  audioEnabled: true,
  volume: 0.4,

  // Stats (persistent)
  totalConsumed: 0,
  stats: defaultStats()
};

// ─── INPUT ───
const input = createInput(canvas);

// ─── HELPERS ───
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

function updateRadius() {
  state.radius = Math.max(6, 4 + Math.sqrt(state.mass) * 0.9);
}

// ─── INIT GALAXY ───
function initGalaxy(galaxyNum) {
  const { entities, biome, bounds } = spawnGalaxy(galaxyNum);

  state.entities = entities;
  state.biome = biome;
  state.bounds = bounds;
  state.initialCount = entities.length;

  // Fresh start — small black hole
  state.mass = 20;
  updateRadius();

  // Start near center
  state.playerX = (Math.random() - 0.5) * 150;
  state.playerY = (Math.random() - 0.5) * 150;
  state.playerVX = 0;
  state.playerVY = 0;
  state.camX = state.playerX;
  state.camY = state.playerY;

  // Reset effects
  state.particles = [];
  state.ripples = [];
  state.comboCount = 0;
  state.comboTimer = 0;

  // Audio
  audio.startDrone(biome.tintRGB);

  syncHud();
}

// ─── PLAYER MOVEMENT ───

function updatePlayer(dt) {
  const { mx, my, magnitude } = input.getMovement(screenW, screenH);

  // Speed scales down as you grow
  const baseSpeed = 3.8;
  const speedMod = Math.max(0.55, 1 - state.radius * 0.006);
  const maxSpeed = baseSpeed * speedMod;

  // Acceleration
  const accel = 0.18 * dt;
  if (magnitude > 0.01) {
    state.playerVX += mx * accel;
    state.playerVY += my * accel;
  }

  // Friction
  const friction = 0.92;
  state.playerVX *= friction;
  state.playerVY *= friction;

  // Speed cap
  const speed = Math.hypot(state.playerVX, state.playerVY);
  if (speed > maxSpeed) {
    state.playerVX = (state.playerVX / speed) * maxSpeed;
    state.playerVY = (state.playerVY / speed) * maxSpeed;
  }

  state.playerX += state.playerVX * dt;
  state.playerY += state.playerVY * dt;

  // Bounce off galaxy boundary
  const distFromCenter = Math.hypot(state.playerX, state.playerY);
  if (distFromCenter + state.radius > state.bounds) {
    const nx = state.playerX / distFromCenter;
    const ny = state.playerY / distFromCenter;
    const dot = state.playerVX * nx + state.playerVY * ny;
    state.playerVX -= 2 * dot * nx * 0.6;
    state.playerVY -= 2 * dot * ny * 0.6;

    const pushDist = state.bounds - state.radius - 2;
    state.playerX = nx * pushDist;
    state.playerY = ny * pushDist;

    audio.playBounce();
  }

  // Smooth camera follow
  const camSmooth = 0.06;
  state.camX += (state.playerX - state.camX) * camSmooth * dt;
  state.camY += (state.playerY - state.camY) * camSmooth * dt;
}

// ─── CONSUME LOGIC ───

function tryConsume(dt) {
  let ateThisFrame = 0;
  let totalTone = 0;
  let totalMassGained = 0;

  // Decay combo
  if (state.comboTimer > 0) {
    state.comboTimer -= dt * 16;
    if (state.comboTimer <= 0) {
      state.comboCount = 0;
    }
  }

  for (const e of state.entities) {
    if (e.consuming) {
      e.consumeProgress += 0.06 * dt;
      if (e.consumeProgress >= 1) {
        e.consumed = true;
      }
      continue;
    }

    const dx = e.x - state.playerX;
    const dy = e.y - state.playerY;
    const dist = Math.hypot(dx, dy);

    const canEat = state.radius > e.radius * 0.88;
    const touchDist = state.radius + e.radius * 0.4;

    if (canEat && dist < touchDist) {
      e.consuming = true;
      e.consumeProgress = 0;

      state.mass += e.mass * 0.5;
      updateRadius();

      state.comboCount += 1;
      state.comboTimer = 90;

      ateThisFrame += 1;
      totalTone += e.tone;
      totalMassGained += e.mass;

      spawnConsumeParticles(e);
      spawnRipple(e);
    }
  }

  // Remove consumed
  state.entities = state.entities.filter(e => !e.consumed);

  // Audio
  if (ateThisFrame > 0) {
    const avgTone = totalTone / ateThisFrame;
    const massRatio = clamp(totalMassGained / 400, 0, 1);
    audio.playConsume(avgTone, massRatio, state.comboCount);

    if (state.comboCount >= 3 && state.comboCount % 3 === 0) {
      audio.playComboChime(state.comboCount);
    }

    state.totalConsumed += ateThisFrame;
    state.stats.totalConsumed += ateThisFrame;
    state.stats.highestMass = Math.max(state.stats.highestMass, state.mass);
    state.stats.bestCombo = Math.max(state.stats.bestCombo, state.comboCount);

    syncHud();
  }

  // Galaxy complete?
  if (state.entities.length === 0 && !state.transitioning) {
    galaxyComplete();
  }
}

// ─── PARTICLES ───

function spawnConsumeParticles(entity) {
  const count = 6 + Math.floor(entity.radius * 0.8);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const speed = 0.5 + Math.random() * 2;
    state.particles.push({
      x: entity.x,
      y: entity.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 1 + Math.random() * 2.5,
      color: entity.color,
      alpha: 0.6 + Math.random() * 0.3,
      age: 0,
      maxAge: 30 + Math.random() * 20,
      gravity: 0.02 + Math.random() * 0.02
    });
  }
}

function spawnRipple(entity) {
  state.ripples.push({
    x: entity.x,
    y: entity.y,
    startRadius: entity.radius,
    expandTo: 30 + entity.radius * 2,
    color: entity.color,
    age: 0,
    maxAge: 25
  });
}

function updateParticles(dt) {
  for (const p of state.particles) {
    const dx = state.playerX - p.x;
    const dy = state.playerY - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 5) {
      p.vx += (dx / dist) * p.gravity * dt;
      p.vy += (dy / dist) * p.gravity * dt;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.97;
    p.vy *= 0.97;
    p.age += dt;
  }
  state.particles = state.particles.filter(p => p.age < p.maxAge);

  for (const r of state.ripples) {
    r.age += dt;
  }
  state.ripples = state.ripples.filter(r => r.age < r.maxAge);

  if (state.particles.length > 300) {
    state.particles = state.particles.slice(-300);
  }
}

// ─── GALAXY TRANSITION ───

function galaxyComplete() {
  state.transitioning = true;
  state.transitionPhase = "implode";
  state.transitionTimer = 0;

  audio.playGalaxyComplete();
  state.stats.galaxiesCleared += 1;

  save(state);
}

function updateTransition(dt) {
  state.transitionTimer += dt;

  if (state.transitionPhase === "implode") {
    if (state.transitionTimer > 60) {
      state.transitionPhase = "warp";
      state.transitionTimer = 0;

      const nextGalaxy = state.galaxy + 1;
      const biome = getBiome(nextGalaxy);
      const count = galaxyObjectCount(nextGalaxy);

      const overlay = document.getElementById("transition-overlay");
      document.getElementById("transition-galaxy").textContent = `Galaxy ${nextGalaxy}`;
      document.getElementById("transition-biome").textContent = biome.name;
      document.getElementById("transition-count").textContent = `${count} objects`;
      overlay.classList.remove("hidden");
    }
  } else if (state.transitionPhase === "warp") {
    if (state.transitionTimer > 120) {
      state.transitionPhase = "fadein";
      state.transitionTimer = 0;

      state.galaxy += 1;
      state.bestGalaxy = Math.max(state.bestGalaxy, state.galaxy);
      initGalaxy(state.galaxy);
      save(state);
    }
  } else if (state.transitionPhase === "fadein") {
    if (state.transitionTimer > 60) {
      document.getElementById("transition-overlay").classList.add("hidden");
      state.transitioning = false;
    }
  }
}

// ─── HUD ───

function syncHud() {
  const consumed = state.initialCount - state.entities.length;
  const progress = state.initialCount > 0 ? consumed / state.initialCount : 0;

  document.getElementById("hud-galaxy").textContent = state.galaxy;
  document.getElementById("hud-left").textContent = state.entities.length;
  document.getElementById("hud-mass").textContent = Math.floor(state.mass);
  document.getElementById("hud-best").textContent = state.bestGalaxy;
  document.getElementById("hud-biome").textContent = state.biome ? state.biome.name : "";
  document.getElementById("hud-progress-bar").style.width = (progress * 100) + "%";
}

function showHint(msg) {
  const el = document.getElementById("hint-toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(showHint._t);
  showHint._t = setTimeout(() => el.classList.add("hidden"), 2800);
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

  const rawDt = (now - lastTime) / 16.67;
  const dt = Math.min(rawDt, 3);
  lastTime = now;

  if (state.paused) return;

  if (state.transitioning) {
    updateTransition(dt);
  }

  if (!state.transitioning || state.transitionPhase === "fadein") {
    updatePlayer(dt);
    updateEntities(state.entities, state.bounds, dt);
    tryConsume(dt);
    updateParticles(dt);
  }

  // ─── DRAW ───
  const w = screenW;
  const h = screenH;

  drawStarfield(ctx, w, h, state.camX, state.camY, state.biome ? state.biome.tint : "#0d1633");
  drawBoundary(ctx, w, h, state.camX, state.camY, state.bounds, state.biome ? state.biome.borderColor : "#1a2e6a", now);
  drawEntities(ctx, state.entities, w, h, state.camX, state.camY, state.radius, now);
  drawParticles(ctx, state.particles, w, h, state.camX, state.camY);
  drawRipples(ctx, state.ripples, w, h, state.camX, state.camY);
  drawBlackHole(ctx, w, h, state.radius, now, { vx: state.playerVX, vy: state.playerVY });
  drawEdgeIndicators(ctx, state.entities, w, h, state.camX, state.camY, state.radius);
  drawMinimap(ctx, w, h, state.playerX, state.playerY, state.entities, state.bounds);
  drawCursor(ctx, mouseScreenX, mouseScreenY, w, h);

  // Transition overlays
  if (state.transitioning) {
    if (state.transitionPhase === "implode") {
      const alpha = Math.min(1, state.transitionTimer / 60);
      ctx.fillStyle = `rgba(2, 3, 8, ${alpha * 0.8})`;
      ctx.fillRect(0, 0, w, h);
    } else if (state.transitionPhase === "warp") {
      ctx.fillStyle = "rgba(2, 3, 8, 0.85)";
      ctx.fillRect(0, 0, w, h);

      const progress = state.transitionTimer / 120;
      for (let i = 0; i < 8; i++) {
        const ringProgress = (i / 8 + progress * 2) % 1;
        const r = ringProgress * Math.max(w, h) * 0.7;
        const a = (1 - ringProgress) * 0.15;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(130, 140, 255, ${a})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    } else if (state.transitionPhase === "fadein") {
      const alpha = 1 - Math.min(1, state.transitionTimer / 60);
      ctx.fillStyle = `rgba(2, 3, 8, ${alpha * 0.8})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // Combo counter
  if (state.comboCount >= 3) {
    ctx.save();
    ctx.font = "600 14px 'Outfit', sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = `rgba(255, 210, 100, ${Math.min(0.7, state.comboTimer / 90)})`;
    ctx.fillText(`×${state.comboCount}`, w / 2, h / 2 - state.radius - 20);
    ctx.restore();
  }
}

// ─── CONTROLS BAR EVENTS ───

document.getElementById("btn-pause").addEventListener("click", () => {
  state.paused = !state.paused;
  const btn = document.getElementById("btn-pause");
  if (state.paused) {
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><polygon points="5,3 15,9 5,15"/></svg>';
    showHint("Paused");
  } else {
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><rect x="4" y="3" width="3" height="12" rx="1"/><rect x="11" y="3" width="3" height="12" rx="1"/></svg>';
    lastTime = performance.now();
  }
});

document.getElementById("btn-restart").addEventListener("click", () => {
  initGalaxy(state.galaxy);
  showHint("Galaxy restarted");
});

document.getElementById("btn-audio").addEventListener("click", () => {
  state.audioEnabled = !state.audioEnabled;
  audio.setEnabled(state.audioEnabled);
  const btn = document.getElementById("btn-audio");
  btn.classList.toggle("audio-off", !state.audioEnabled);
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

document.getElementById("btn-reset").addEventListener("click", () => {
  if (!confirm("Reset all progress? This cannot be undone.")) return;
  clearSave();
  location.reload();
});

// Pause on spacebar
window.addEventListener("keydown", e => {
  if (e.key === "Escape" || e.key === "p" || e.key === "P") {
    document.getElementById("btn-pause").click();
    e.preventDefault();
  }
});

// Auto-save every 5 seconds
setInterval(() => save(state), 5000);

// ─── INIT ───

const savedData = load();
if (savedData) {
  state.galaxy = savedData.galaxy || 1;
  state.bestGalaxy = savedData.bestGalaxy || state.galaxy;
  state.totalConsumed = savedData.totalConsumed || 0;
  state.audioEnabled = savedData.audioEnabled ?? true;
  state.volume = savedData.volume ?? 0.4;
  state.stats = savedData.stats || defaultStats();

  document.getElementById("volume-slider").value = Math.round(state.volume * 100);
  if (!state.audioEnabled) {
    document.getElementById("btn-audio").classList.add("audio-off");
  }
}

audio.setVolume(state.volume);
if (state.audioEnabled) {
  // Audio context needs user gesture — will init on first interaction
  const initAudio = () => {
    audio.init();
    audio.startDrone(state.biome ? state.biome.tintRGB : [13, 22, 51]);
    window.removeEventListener("click", initAudio);
    window.removeEventListener("keydown", initAudio);
    window.removeEventListener("touchstart", initAudio);
  };
  window.addEventListener("click", initAudio);
  window.addEventListener("keydown", initAudio);
  window.addEventListener("touchstart", initAudio);
}

initGalaxy(state.galaxy);
showHint(`Galaxy ${state.galaxy}: ${state.biome.name}`);

requestAnimationFrame(frame);
