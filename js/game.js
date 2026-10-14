// ─── GAME MAIN ───
// State, main loop, consume logic, zoom camera, galaxy transitions + summary.

import { createInput } from "./input.js";
import { spawnGalaxy, updateEntities, galaxyObjectCount, getBiome, rand, biomeCatalog } from "./entities.js";
import {
  drawStarfield, drawBoundary, drawEntities, drawBlackHole, setHaloFrom,
  drawParticles, drawRipples, drawMinimap, drawEdgeIndicators, drawCursor,
  invalidateStarfield, prerenderEntitySprite, setNebulaPalette, setSoftPalette, drawLens
} from "./render.js";
import { initWorlds, updateWorlds, drawWorldsBG, drawWorldsOverlay, drawWorldsMinimap,
  onWorldBump, onWorldEvent, onWorldTier, worldMassMul, worldFlags, eventPairText, worldsInfo, worldsFeature } from "./worlds.js";
import { beginArtFrame, setArtQuality, getArtQuality, artStats, warmHole } from "./art.js";
import * as audio from "./audio.js";
import { save, load, clearSave, defaultStats, defaultRecords, defaultUpgrades, exportCode, parseCode, writeBackup } from "./save.js";
import { initDiscoveries, updateDiscoveries, drawDiscoveries, drawDiscoveryCue, discoveriesInfo, discoveryById } from "./discoveries.js";
import { resetWisp, updateWisp, drawWisp, wispInfo, wispReact } from "./wisp.js";
import { openStarMap } from "./starmap.js";
import { openLogbook } from "./logbook.js";
import { openConstellation } from "./constellation.js";
import * as zen from "./zen.js";
import { depthInfo, ascMods, defaultAsc, freshAscRun, dmFor, GOALS, starsFor, GALAXY_PERKS, COLLAPSE_MIN_CLEARED, rollGolden, rollDeep, rollSupernova, keptUpgrades, milestonesAt, hasMilestone, SKINS, RARE_FIND_CHANCE } from "./ascension.js";
import { initRivals, updateRivals, drawRivals } from "./rivals.js";
import {
  initLivingWorld, updateLivingWorld, drawLivingWorldBG, drawLivingWorldFG, drawLivingWorldOverlay,
  pullRange, fireEvent, activeEventInfo, EVENT_INFO
} from "./living-world.js";
import { computeMods, freshRun, finishGalaxy, UPGRADES, upgradeCost, fmtTime, fmtMass } from "./progression.js";
import { initPowerups, updatePowerups, activatePowerup, freshActive, POWERUPS, slowFactor, powerupFade } from "./powerups.js";
import * as ui from "./ui.js";
import { drawBackdrop, setBackdropPalette } from "./backdrop.js";
import { R0, START_R, tier, tierIndexForR, tierName, massForR, rForMass, targetMassFrom, tierProgress, rForTier } from "./tiers.js";

const VERSION = "7.1";
import { fillAround, DENSITY, densityInfo } from "./living-world.js";

// ─── CANVAS SETUP ───
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const hudGalaxy = document.getElementById("hud-galaxy");
const hudGoal = document.getElementById("hud-goal");
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
  mode: "ascension", asc: defaultAsc(), zenNotes: [], densityK: 1, breathPull: 1, rivals: [],
  settings: { touchMode: "joystick", skin: "classic", zen: true, musicVol: 0.6, sfxVol: 0.6, musicOn: true, sfxOn: true, zenBreathCue: false, reduceMotion: false, softPalette: false, breathGuide: false, quality: "auto", wispName: "Wisp" },

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
// v6 "meatier bites": food is bigger and sparser, so each bite carries more but
// the total time per galaxy is unchanged (tuned with the playtest bot).
// gain scales what a bite gives, cap lifts the per-bite ceiling so big morsels count.
// Per-galaxy factors keep each galaxy's v5.2 clear time (bot-measured, within ~10%).
const MEATY = { gain: 1, breatherGain: 1, cap: 2, byBiome: {
  "Debris Reef": 0.75, "Comet Current": 0.63, "Planet Nursery": 0.48, "Ruined Armada": 0.53,
  "Void Rift": 0.69, "Star Meadow": 0.48, "Neutron Forge": 0.62 },
  // bite ceiling per galaxy (breathers and Armada are ceiling-bound, so this sets their pace)
  capBiome: { "Planet Nursery": 1, "Star Meadow": 1, "Ruined Armada": 1.2 } };
function meatyK() { return (MEATY.byBiome[state.biome.name] ?? 0.62) * (state.biome.breather ? MEATY.breatherGain : MEATY.gain); }

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

// ─── v7: ASCENSION HOOKS ───
function tintNebula(neb, rgb, k) {
  return neb.map(c => Array.isArray(c) ? c.map((v, i) => Math.round(v + (rgb[i] - v) * k)) : c);
}

/** Per-galaxy goal: count the bites (or seconds) that use this galaxy's mechanic. */
function trackGoal(e) {
  const g = state.goal;
  if (!g || state.mode === "zen") return;
  let hit = false;
  switch (g.metric) {
    case "reef": hit = e.reef != null; break;
    case "orbit": hit = !!e.orbit; break;
    case "crumb": hit = !!e.crumb; break;
    case "aurora": hit = !!e.auroraItem; break;
    case "bloom": hit = e.meadow != null && !e.bloom; break;
    case "beam": hit = worldMassMul() > 1; break;
  }
  if (hit) bumpGoal(1);
}
function bumpGoal(n) {
  state.goalCount += n;
  const st = starsFor(state.goal, state.goalCount);
  if (st > state.goalStarsShown) {
    state.goalStarsShown = st;
    audio.playGoalStar(st);
    floater(state.playerX, state.playerY - state.radius * 2.2, "★".repeat(st) + "☆".repeat(3 - st), "#ffe3a0", 18);
    hint("goal_star", "A goal star! Each galaxy type has its own goal. 3 stars unlocks its perk.", 4200);
  }
}
function updateAscension(dt) {
  if (state.mode === "zen") return;
  if (state.goal && state.goal.metric === "ride" && worldFlags().riding) bumpGoal(dt / 60);
  state.asc.run.time = (state.asc.run.time || 0) + dt / 60;
  // Hungry Wisp perk: every ~4s the wisp nudges a nearby crumb into you
  if (state.ascMods.wispFeed) {
    state.wispFeedT = (state.wispFeedT || 0) + dt;
    const wi = wispInfo();
    if (state.wispFeedT > 240 && wi) {
      state.wispFeedT = 0;
      let best = null, bd = Math.hypot(state.viewW, state.viewH) * 0.3;
      for (const e of state.entities) {
        if (e.consuming || e.powerup || state.radius <= e.radius * state.eatRatio) continue;
        const d = Math.hypot(e.x - wi.x, e.y - wi.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) {
        const dx = state.playerX - best.x, dy = state.playerY - best.y, d = Math.hypot(dx, dy) || 1;
        const sp = 2.2 * Math.sqrt(state.speedScale);
        best.vx = dx / d * sp; best.vy = dy / d * sp;
      }
    }
  }
  updateRivals(state, dt, onRivalSwallow);
}

function onRivalSwallow(rv) {
  const gain = state.mass * 0.035 * state.ascMods.bigCatch * state.ascMods.gain;
  state.mass += gain;
  updateRadius();
  state.gulp = 1;
  state.run.bigFish += 1;
  if (!state.run.bestCatch || rv.r > state.run.bestCatch.r) state.run.bestCatch = { r: rv.r, type: "rival" };
  floater(rv.x, rv.y, "Rival swallowed", "#ffcf6e", 19);
  audio.playBigCatch();
  wispReact(state, "catch");
  hint("rival_eat", "You outgrew a rival. Another, a little bigger, will drift in later.", 4000);
}

/** After a galaxy clears: depth, goal stars, galaxy perks, golden rewards. */
function onAscensionClear() {
  const a = state.asc, r = a.run, sum = state.summary;
  r.cleared += 1;
  r.peakTier = Math.max(r.peakTier || 0, state.tier, tierIndexForR(state.radius));
  a.bestDepth = Math.max(a.bestDepth || 0, r.cleared);
  sum.depth = r.cleared;
  // Golden galaxy: triple stardust. Salvager perk: +30%.
  let extra = 0;
  if (state.golden) { r.goldenCleared = (r.goldenCleared || 0) + 1; extra += sum.earned * 2; sum.parts.push(["Golden galaxy ×3", sum.earned * 2]); }
  if (state.ascMods.stardustMul > 1) { const x = Math.round((sum.earned + extra) * (state.ascMods.stardustMul - 1)); extra += x; sum.parts.push(["Salvager", x]); }
  if (extra) { state.stardust += extra; state.stats.stardustEarned += extra; sum.earned += extra; }
  // Goal stars (best per galaxy type)
  if (state.goal) {
    const st = starsFor(state.goal, state.goalCount);
    const key = state.biome.name;
    const prev = a.goalStars[key] || 0;
    a.goalStars[key] = Math.max(prev, st);
    sum.goal = { name: state.goal.name, stars: st, best: a.goalStars[key], count: Math.floor(state.goalCount), unit: state.goal.unit, need: state.goal.stars };
    const gp = GALAXY_PERKS.find(p => p.galaxy === key);
    if (st >= 3 && gp && !a.perks[gp.id]) { a.perks[gp.id] = true; sum.unlocked = gp; }
  }
  sum.dmPreview = dmFor(r, state.ascMods).total;
  sum.canCollapse = r.cleared >= COLLAPSE_MIN_CLEARED;
  // The soft wall: when a galaxy took much longer than this galaxy type usually does
  sum.heavy = r.cleared >= COLLAPSE_MIN_CLEARED && state.run.time > (state.biome.breather ? 150 : 400);
}

// ─── v6: DISCOVERIES ───
function onDiscovery(def, f) {
  const log = state.records.discoveries || (state.records.discoveries = {});
  const first = !log[def.id];
  log[def.id] = { g: first ? state.galaxy : log[def.id].g, d: first ? Date.now() : log[def.id].d, n: (log[def.id]?.n || 0) + 1 };
  state.run.found = (state.run.found || 0) + 1;
  if (state.mode !== "zen") {
    state.asc.run.finds = (state.asc.run.finds || 0) + 1;
    // Rare, shining finds: +3 Dark Matter on the spot
    if (hasMilestone(state.asc, "golden") && Math.random() < RARE_FIND_CHANCE * state.ascMods.rareMul * (state.deep ? 2 : 1)) {
      state.asc.dm += 3; state.asc.dmTotal += 3;
      setTimeout(() => { floater(state.playerX, state.playerY - state.radius * 2, "Shining find · +3 Dark Matter", "#d9ccff", 17); audio.playGoalStar(3); }, 900);
    }
  }
  (state.run.foundNames || (state.run.foundNames = [])).push(def.name);
  floater(f.x, f.y, first ? "Discovered" : "Found again", "#fff0c8", 17);
  showHint(`${def.name}. ${def.line}`, 5200);
  audio.playDiscovery();
  wispReact(state, "discovery");
  if (first) setTimeout(() => hint("logbook", "Written in your logbook (title screen or Stats)", 3600), 5600);
  save(state);
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
  // v7 Ascension: permanent perks layer on top of the in-run stardust upgrades
  const zen = state.mode === "zen";
  const am = state.ascMods = ascMods(state.asc);
  if (!zen) {
    state.mods.pullRange *= am.pullRange;
    state.mods.pullStrength *= am.pullStrength;
    state.mods.eatRatio = Math.max(0.7, state.mods.eatRatio - am.eatRatioAdd);
    state.mods.reachBonus += am.reachAdd;
    state.mods.thrust *= am.speed;
    state.mods.comboWindow *= am.comboWindow;
    state.mods.surgeDuration *= am.puDur;
    state.mods.surgeFrequency *= am.puFreq;
  }
  state.eatRatio = state.mods.eatRatio;
  const dinfo = state.depth = depthInfo(zen ? 1 : galaxyNum);
  state.densityK = zen ? 1 : dinfo.density;
  state.golden = !zen && !resume && rollGolden(state.asc, am);
  state.deep = !zen && !resume && !state.golden && rollDeep(state.asc);
  state.goal = zen ? null : GOALS[biome.name] || null;
  state.goalCount = resume && typeof resume.goalCount === "number" ? resume.goalCount : 0;
  state.goalStarsShown = starsFor(state.goal, state.goalCount);
  // v5: start where the last galaxy ended (your floor), plus Seed Mass
  state.floorMass = Math.max(massForR(START_R), state.floorMass || 0);
  state.startMass = state.floorMass * (1 + (state.mods.startBonus || 0));
  state.targetMass = zen ? Infinity : targetMassFrom(state.floorMass, !!biome.breather, dinfo.climbK * (biome.breather ? am.breatherClimb : 1));
  state.startMass = Math.min(state.startMass, state.targetMass * 0.8);

  state.entities = [];
  state.biome = biome;
  state.baseBounds = 1000;
  state.initialCount = DENSITY.regular;

  // Golden galaxies glow warm gold; deep variants go night-blue
  const neb = state.golden ? tintNebula(biome.nebula, [255, 200, 90], 0.45) : state.deep ? tintNebula(biome.nebula, [30, 40, 110], 0.5) : biome.nebula;
  setNebulaPalette(neb);
  setBackdropPalette(neb);
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
    for (const k of ["time", "eaten", "bestCombo", "bigFish", "powerups", "bumps", "startBestCombo", "bestCatch", "found"]) {
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
  fillAround(state, Math.max(20, Math.round((biome.breather ? DENSITY.breather : DENSITY.regular) * state.densityK) - state.entities.length));
  initRivals(state, zen ? 0 : dinfo.rivals, dinfo.rivalSize);
  resetWisp(state);
  initDiscoveries(state);
  initPowerups();
  ui.updatePowerupBar(state);

  setHaloFrom(zen ? 0.82 : am.haloFrom);
  if (state.golden) setTimeout(() => showHint("A golden galaxy. Everything here shines: triple stardust when you clear it.", 5000), 2500);
  else if (state.deep) setTimeout(() => showHint("A deep variant: night-blue, and rare finds shine more often here.", 4500), 2500);
  audio.startDrone(biome);
  audio.newPhrase();
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
      e.consumeProgress += (e.swallow ? (state.settings.reduceMotion ? 0.035 : 0.016) : 0.06) * dt;
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

      const comboBonus = 1 + Math.min(state.comboCount, state.mode === "zen" ? 25 : state.ascMods.comboCap) * 0.01;
      const dbl = state.active.double > 0 ? 2 : 1;
      // Small absolute floor keeps the opening seconds snappy
      const biteK = state.biome.breather ? BREATHER_BITE : (e.bigFish ? MAX_BIG_BITE : MAX_BITE);
      const pace = state.biome.breather ? BREATHER_PACE : PACE;
      const cap = Math.max(MIN_BITE_CAP, state.mass * biteK) * pace * (MEATY.capBiome[state.biome.name] ?? MEATY.cap);
      const gk = (state.biome.breather ? 0.5 : REGULAR_GAIN) * meatyK() * pace;
      // biome.gainK evens out pacing for galaxies whose mechanic adds a lot of food
      let gain = Math.min(e.mass * gk * (state.biome.gainK || 1) * comboBonus, cap) * dbl * worldMassMul();
      // v7 Ascension: perks (Appetite), supernova runs, and big-catch perks
      if (state.mode !== "zen") {
        gain *= state.ascMods.gain * (state.asc.run.supernova ? 1.5 : 1);
        if (e.bigFish) gain *= state.ascMods.bigCatch;
      }
      trackGoal(e);
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
        // v6: a slow, satisfying swallow (about a second) with a soft chime. No shake.
        e.swallow = true;
        state.run.bigFish += 1;
        state.stats.bigFishEaten += 1;
        if (!state.run.bestCatch || e.radius > state.run.bestCatch.r) state.run.bestCatch = { r: e.radius, type: e.type };
        floater(e.x, e.y, "Big catch", "#ffcf6e", 19);
        state.gulp = 1;
        audio.playBigCatch();
        wispReact(state, "catch");
        hint("bigcatch", "Big catch! Golden halos show what's almost in reach.", 3600);
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
  onAscensionClear();
  // v5: the next galaxy starts at the most you reached here
  state.floorMass = Math.max(state.floorMass, state.mass);
  // v5.2: a star for the star map
  // v7: keyed by journey order (galaxies cleared), since runs restart at Galaxy 1 after a collapse
  state.records.galaxyLog[Math.max(state.stats.galaxiesCleared, state.galaxy)] = { b: state.biome.name, gold: state.golden || undefined, d: Date.now(), t: Math.max(state.tier, tierIndexForR(rForMass(state.mass))) };
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
      // v6: a calm moment first. The new star joins your sky, then the summary.
      state.transitionPhase = "ritual";
      state.transitionTimer = 0;
      input.setEnabled(false);
      audio.playRitual();
      openStarMap(starEntries(), {
        reduceMotion: state.settings.reduceMotion,
        ritual: ritualText(),
        onClose: showGalaxySummary
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

function showGalaxySummary() {
  if (state.transitionPhase !== "ritual") return;
  state.transitionPhase = "summary";
  state.transitionTimer = 0;
  ui.showSummary(state.summary, state, {
    onBuy: buyUpgrade,
    onContinue: startWarp,
    onCollapse: openCollapse
  });
}

const CATCH_NAMES = { rival: "a rival black hole", planet: "a whole planet", star: "a sleeping star", craft: "an old derelict hull", meteor: "a great meteor",
  junk: "a drifting rock", moon: "a moon", comet: "a comet", neutron: "a neutron star", system: "a star system",
  nebula: "a nebula", cluster: "a star cluster", galaxy: "a galaxy" };
function ritualText() {
  const r = state.run || {};
  const found = r.foundNames || [];
  let line;
  if (found.length) line = `You found ${found.length > 1 ? found.slice(0, -1).join(", ") + " and " + found[found.length - 1] : "the " + found[0]}.`;
  else if (r.bestCatch) line = `Your best catch here was ${CATCH_NAMES[r.bestCatch.type] || "something big"}.`;
  else line = `${r.eaten || 0} gentle bites, and a new star.`;
  if (found.length && r.bestCatch) line += ` Best catch: ${CATCH_NAMES[r.bestCatch.type] || "something big"}.`;
  return { title: "A new star", sub: `Galaxy ${state.galaxy} · ${state.biome.name} joins your sky`, line };
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
  if (state.goal) {
    const st = starsFor(state.goal, state.goalCount);
    const nextNeed = state.goal.stars[Math.min(2, st)];
    const txt = `${state.goal.name} <span class="st">${"★".repeat(st)}${"☆".repeat(3 - st)}</span> ${Math.floor(state.goalCount)}/${nextNeed}`;
    if (hudGoal._t !== txt) { hudGoal._t = txt; hudGoal.innerHTML = txt; }
  } else if (hudGoal._t) { hudGoal._t = ""; hudGoal.innerHTML = ""; }

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
  const depthTxt = state.asc.run.cleared ? `Run depth ${state.asc.run.cleared} · ` : "";
  document.getElementById("title-continue-sub").textContent = `${depthTxt}Galaxy ${state.galaxy} · ${state.biome ? state.biome.name : ""}`;
  document.getElementById("btn-title-constellation").classList.toggle("glow", (state.asc.dm || 0) >= 6);
  if (state.v7Welcome) {
    state.v7Welcome = false;
    setTimeout(() => showHint(`New: Ascension. Your journey is now a run, ${state.asc.run.cleared} galaxies deep. Collapse any time (pause menu) to earn Dark Matter for permanent perks.`, 7000), 1200);
  }
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
  if (kind === "zen") {
    showHint("Breathe with the pull: things drift out as you breathe in, and come to you as you breathe out.", 6000);
    return;
  }
  if (kind === "newrun") {
    const sn = state.asc.run.supernova;
    showHint(sn ? "A supernova run! Every bite counts 50% more, all run long." : `Run ${state.asc.runsStarted}. Galaxy ${state.galaxy}: ${state.biome.name}`, 4500);
    return;
  }
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
  state.asc = defaultAsc();   // v7: a full start-over also clears Ascension
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

// ─── v7: CONSTELLATION, COLLAPSE, ZEN ───
function skinFilter() {
  const sk = SKINS.find(s => s.id === state.settings.skin);
  if (!sk || sk.id === "classic" || state.mode === "zen" && false) return "";
  if (sk.unlock && !hasMilestone(state.asc, sk.unlock)) return "";
  return `hue-rotate(${sk.hue || 0}deg) saturate(${sk.sat ?? 1}) brightness(${sk.bright ?? 1})`;
}

state.openConstellation = (o = {}) => {
  audio.playClick();
  openConstellation(state.asc, {
    reduceMotion: state.settings.reduceMotion,
    newRun: !!o.newRun,
    onBuy: () => { audio.playGoalStar(3); save(state); },
    onClose: begin => { save(state); if (o.newRun) startNewRun(); }
  });
};
document.getElementById("btn-title-constellation").addEventListener("click", () => state.openConstellation());

// Collapse: confirm with a clear breakdown, then the singularity moment
function openCollapse() {
  const r = state.asc.run;
  const dm = dmFor(r, state.ascMods || ascMods(state.asc));
  document.getElementById("collapse-sub").textContent = `This run: ${r.cleared} galax${r.cleared === 1 ? "y" : "ies"} deep, up to ${tierName(r.peakTier || 0)}`;
  document.getElementById("collapse-break").innerHTML = dm.parts.map(([k, v]) => `<span><i>${k}</i><b>+${v}</b></span>`).join("") +
    `<span class="tot"><i>Dark Matter</i><b>+${dm.total}</b></span>`;
  const next = milestonesAt((state.asc.collapses || 0) + 1);
  document.getElementById("collapse-mile").innerHTML = next.length
    ? `Collapse ${(state.asc.collapses || 0) + 1} also unlocks: ` + next.map(m => `<b>${m.name}</b> (${m.desc})`).join(", ")
    : "";
  document.getElementById("collapse").classList.remove("hidden");
}
document.getElementById("btn-collapse-no").addEventListener("click", () => { audio.playClick(); document.getElementById("collapse").classList.add("hidden"); });
document.getElementById("btn-collapse-yes").addEventListener("click", () => { audio.playClick(); doCollapse(); });

function doCollapse() {
  const a = state.asc, r = a.run;
  const mods = state.ascMods || ascMods(a);
  const dm = dmFor(r, mods).total;
  a.dm = (a.dm || 0) + dm;
  a.dmTotal = (a.dmTotal || 0) + dm;
  a.collapses = (a.collapses || 0) + 1;
  a.history.push({ n: a.collapses, depth: r.cleared, dm, min: Math.round((r.time || 0) / 60), d: Date.now() });
  const unlocked = milestonesAt(a.collapses);
  // What resets, what stays
  state.upgrades = { ...defaultUpgrades(), ...keptUpgrades(a, mods, state.upgrades) };
  state.stardust = mods.startStardust || 0;
  const head = hasMilestone(a, "headstart");
  state.floorMass = massForR(START_R);
  if (head) state.floorMass = targetMassFrom(state.floorMass, false);
  state.galaxy = head ? 2 : 1;
  a.run = freshAscRun();
  if (head) a.run.cleared = 1;
  a.run.supernova = rollSupernova(a, ascMods(a));
  a.runsStarted = (a.runsStarted || 1) + 1;
  state.galaxyCredited = false;
  state.transitioning = false;
  state.transitionPhase = "";
  state.paused = false;
  ["collapse", "summary", "pause-menu", "transition-overlay"].forEach(id => document.getElementById(id).classList.add("hidden"));
  ui.closeStats?.();
  input.setEnabled(false);
  state.screen = "collapse";
  save(state);
  audio.stopDrone();
  audio.playCollapse();
  const sing = document.getElementById("singularity");
  document.getElementById("sing-title").textContent = `Collapse ${a.collapses}`;
  document.getElementById("sing-line").textContent = `+${dm} Dark Matter · ${Math.floor(a.dm)} to spend`;
  document.getElementById("sing-mile").innerHTML = unlocked.map(m => `Unlocked: <b>${m.name}</b>. ${m.desc}`).join("<br>");
  sing.style.opacity = "1";
  sing.classList.remove("hidden");
  let gone = false;
  const next = () => {
    if (gone) return; gone = true;
    sing.style.opacity = "0";
    setTimeout(() => { sing.classList.add("hidden"); state.openConstellation({ newRun: true }); }, 1400);
  };
  sing.onclick = () => { if (performance.now() - t0c > 1500) next(); };
  const t0c = performance.now();
  setTimeout(next, unlocked.length ? 7000 : 5200);
}

function startNewRun() {
  initGalaxy(state.galaxy);
  state.camMul = TITLE_ZOOM;
  updateCameraScale(true);
  save(state);
  state.screen = "title";
  startDrift("newrun");
}

// Zen session: a separate, calm space. Your journey is saved first and comes
// back exactly as it was. Nothing in a session is saved or rewarded.
let zenSnap = null;
function zenStart(min) {
  save(state);
  zenSnap = { galaxy: state.galaxy, run: (load() || {}).run || null };
  state.mode = "zen";
  document.body.classList.add("mode-zen");
  const zg = 1 + Math.floor(Math.random() * 7);
  state.galaxy = zg;
  state.zen = { dur: min * 3600, t: 0, wound: false, ending: false, min };
  initGalaxy(zg);
  state.densityK = zen.zenDensity(0);
  document.getElementById("zen-arc").classList.remove("hidden");
  zen.setArc(0);
  state.camMul = TITLE_ZOOM;
  updateCameraScale(true);
  startDrift("zen");
}
function updateZen(dt, now) {
  const z = state.zen;
  if (!z || z.ending) return;
  z.t += dt;
  const p = Math.min(1, z.t / z.dur);
  state.densityK = zen.zenDensity(p);
  state.breathPull = zen.zenBreathPull(now, BREATH_MS);
  zen.setArc(p);
  // v7.1 optional "breathe in / out" words (off by default)
  const cue = document.getElementById("zen-cue");
  if (cue) {
    const on = !!state.settings.zenBreathCue && !z.wound;
    cue.classList.toggle("hidden", !on);
    if (on) {
      const ph = (now % BREATH_MS) / BREATH_MS * 10;
      cue.textContent = ph < 4 ? "breathe in" : "breathe out";
      cue.style.opacity = (ph < 4 ? Math.sin(Math.PI * ph / 4) : Math.sin(Math.PI * (ph - 4) / 6)) * 0.55;
    }
  }
  if (!z.wound && p >= zen.ARC.WIND) {
    z.wound = true;
    audio.setMusicLayers(0, state.biome);
    audio.playZenResolve();
  }
  if (p >= 1) zenBeginExit();
}
function zenBeginExit() {
  const z = state.zen;
  if (!z || z.ending) return;
  z.ending = true;
  input.setEnabled(false);
  state.screen = "zenexit";
  document.getElementById("zen-arc").classList.add("hidden");
  document.getElementById("zen-cue")?.classList.add("hidden");
  setTimeout(() => {
    audio.stopDrone();
    zen.runExit({
      reduceMotion: state.settings.reduceMotion,
      onBreath: () => audio.playBreathTone(),
      onDone: text => {
        zenRestore();
        if (text) { state.zenNotes = [...(state.zenNotes || []), { t: Date.now(), text }].slice(-20); save(state); }
        showTitle();
      }
    });
  }, state.settings.reduceMotion ? 300 : 1200);
}
function zenRestore() {
  if (state.mode !== "zen") return;
  state.mode = "ascension";
  state.zen = null;
  state.breathPull = 1;
  document.body.classList.remove("mode-zen");
  document.getElementById("zen-arc").classList.add("hidden");
  state.galaxy = zenSnap ? zenSnap.galaxy : state.galaxy;
  const resume = zenSnap && zenSnap.run && zenSnap.run.galaxy === state.galaxy ? zenSnap.run : null;
  zenSnap = null;
  initGalaxy(state.galaxy, resume);
  state.camMul = TITLE_ZOOM;
  updateCameraScale(true);
}
document.getElementById("btn-title-zen").addEventListener("click", () => {
  audio.playClick();
  zen.openPicker(min => { audio.playClick(); zenStart(min); }, () => audio.playClick());
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
  // v7.1: 4 s in, 6 s out (6 breaths a minute)
  const ph = (now % BREATH_MS) / BREATH_MS * 10;
  return ph < 4 ? 0.5 - 0.5 * Math.cos(Math.PI * ph / 4) : 0.5 + 0.5 * Math.cos(Math.PI * (ph - 4) / 6);
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
    updateWisp(state, dt, state.settings.reduceMotion);
    if (!state.seenHints.wisp_intro && state.run.time > 25 && !state.tierBanner) {
      hint("wisp_intro", `A little light has found you. ${state.settings.wispName || "Wisp"} will drift along, and now and then point out something tasty.`, 6000);
    }
    if (updatePowerups(state, dt)) {
      audio.playPowerupSpawn();
      hint("pu_first", "A power-up appeared! Grab the glowing orb", 2600);
    }
    tryConsume(dt);
    updateDiscoveries(state, dt, onDiscovery);
    updateAscension(dt);
    if (state.mode === "zen") updateZen(dt, now);
    if (state.discoveryNear && state.discoveryNear.q > 0.3) hint("discovery_near", "Something rare is shimmering nearby. Follow the soft glow.", 4200);
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
  drawRivals(ctx, state, vw, vh, now, state.settings.reduceMotion);
  drawDiscoveries(ctx, state, vw, vh, now, state.settings.reduceMotion);
  if (state.screen === "play") drawWisp(ctx, state, vw, vh, breath, state.settings.reduceMotion);
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
      breathGuide: state.settings.breathGuide && state.mode !== "zen",   // v7.1: no ring in Zen; the wisp breathes instead
      filter: skinFilter()
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
    drawDiscoveryCue(ctx, state, w, h);
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
    } else if (state.transitionPhase === "summary" || state.transitionPhase === "ritual") {
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
  if (state.transitioning && (state.transitionPhase === "summary" || state.transitionPhase === "ritual")) return;
  if (state.screen !== "play" || state.drift) return;
  state.paused = p;
  input.setEnabled(!p);
  const btn = document.getElementById("btn-pause");
  btn.innerHTML = p ? PLAY_SVG : PAUSE_SVG;
  document.getElementById("pause-menu").classList.toggle("hidden", !p);
  document.getElementById("btn-pause-collapse").classList.toggle("hidden", !(state.mode !== "zen" && state.asc.run.cleared >= COLLAPSE_MIN_CLEARED));
  document.getElementById("btn-pause-endzen").classList.toggle("hidden", state.mode !== "zen");
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
  if (state.mode === "zen") { zenRestore(); }
  showTitle();
});
document.getElementById("btn-pause-collapse").addEventListener("click", () => { audio.playClick(); openCollapse(); });
document.getElementById("btn-pause-endzen").addEventListener("click", () => { audio.playClick(); setPaused(false); zenBeginExit(); });

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
  if (state.transitioning && (state.transitionPhase === "summary" || state.transitionPhase === "ritual")) return;
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
      !(state.transitioning && (state.transitionPhase === "summary" || state.transitionPhase === "ritual"))) {
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
  state.settings.zen = true;   // v7: Ascension is calm (no clock); Zen is now its own session mode
  state.legacyBonusPending = savedData.legacyBonus || 0;
  state.floorMass = savedData.floorMass;
  state.bestTier = savedData.bestTier || 0;
  state.asc = savedData.asc;
  state.zenNotes = savedData.zenNotes || [];
  if (savedData.v7Welcome) {
    // v7: your journey so far becomes the current Ascension run
    state.asc.run.cleared = Math.max(0, state.galaxy - 1);
    state.asc.run.peakTier = state.bestTier || 0;
    state.asc.bestDepth = state.galaxy - 1;
    state.v7Welcome = true;
  }
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
  audio.setMix({ music: st.musicVol ?? 0.6, sfx: st.sfxVol ?? 0.6, musicOn: st.musicOn !== false, sfxOn: st.sfxOn !== false });
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

// ─── v5.2: STAR MAP + SAVE BACKUP ───
state.version = VERSION;
function backfillStarLog() {
  const log = state.records.galaxyLog || (state.records.galaxyLog = {});
  const cleared = state.galaxy - 1 + (state.galaxyCredited ? 1 : 0);
  for (let g = 1; g <= cleared; g++) {
    if (log[g]) continue;
    // Cleared before the star map existed: no date, scale estimated from the ladder
    const t = Math.min(state.bestTier || state.tier || 0, Math.round(g * 0.6));
    log[g] = { b: getBiome(g).name, d: 0, t, est: true };
  }
}
function starEntries() {
  backfillStarLog();
  return Object.keys(state.records.galaxyLog).map(Number).filter(g => g >= 1).sort((a, b) => a - b).map(g => {
    const e = state.records.galaxyLog[g];
    const b = biomeCatalog.find(x => x.name === e.b) || getBiome(g);
    const c = b.nebula[0];
    const rgb = c.map(v => Math.round(v + (255 - v) * 0.3)).join(", ");
    const f = state.records.fastest[g];
    return { g, biome: b.name, rgb, date: e.d || 0, tier: e.t || 0, tierName: tierName(e.t || 0), est: !!e.est,
      time: f ? fmtTime(f) : "", breather: !!b.breather };
  });
}
state.openStarMap = () => {
  audio.playClick();
  openStarMap(starEntries(), { reduceMotion: state.settings.reduceMotion });
};
document.getElementById("btn-title-starmap").addEventListener("click", () => state.openStarMap());
state.openLogbook = () => {
  audio.playClick();
  openLogbook(state.records.discoveries);
};
document.getElementById("btn-title-logbook").addEventListener("click", () => state.openLogbook());

const backupLabel = d => `Galaxy ${d.galaxy} · ${tierName(tierIndexForR(rForMass(d.floorMass)))} · ${Math.floor(d.stardust)} stardust`;
state.exportSave = () => exportCode(state);
state.checkBackup = code => {
  const r = parseCode(code);
  if (!r.ok) return r;
  return { ok: true, label: backupLabel(r.data), current: `Galaxy ${state.galaxy} · ${tierName(state.tier)}` };
};
state.applyBackup = code => {
  const r = parseCode(code);
  if (!r.ok) return;
  resetting = true;           // don't let the unload save overwrite it
  writeBackup(r.json);
  location.reload();
};
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
if (DEV) window.__bh = { meaty: MEATY,
  state, input, fireEvent: id => fireEvent(state, id), events: activeEventInfo,
  perf: perfReport, worlds: worldsInfo, resetPerf: () => { perf.n = 0; perf.ring.fill(0); }, art: artStats, wisp: wispInfo, openLogbook: () => state.openLogbook(), finds: () => discoveriesInfo(state),
  density: densityInfo, music: audio.musicInfo, phrase: audio.phraseInfo, feature: () => worldsFeature(state),
  tier: () => ({ tier: state.tier, name: tierName(state.tier), R: state.radius, anchor: state.anchorSmooth, zoom: state.zoom,
    reveal: state.reveal ? +state.reveal.p.toFixed(2) : null, floor: state.floorMass, target: state.targetMass, progress: state.galaxyProgress }),
  // test helper: grow to just under the next tier line
  nearNextTier: (k = 0.985) => { const r = rForTier(state.tier + 1) * k; state.mass = massForR(r); updateRadius(); }
};
