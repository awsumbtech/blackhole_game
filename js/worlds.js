// ─── WORLDS (v4.1) ───
// One gentle signature mechanic per galaxy, plus named landmarks.
// Geometry is stored in "base" units (the galaxy's starting radius) and scaled
// by f = bounds / baseBounds, so landmarks keep their place as the galaxy
// grows with you. Everything is seeded by galaxy number, so a reload mid-galaxy
// finds the same reefs, rivers and pulsars.

import { typeById, createEntity } from "./entities.js";
import { spawnFood, spawnScaled, pullRange } from "./living-world.js";
import { spriteFor, getArtQuality } from "./art.js";

const TAU = Math.PI * 2;
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

// ─── Codex / captions ───
export const MECHANICS = {
  "Debris Reef": {
    name: "Regrowing reefs",
    first: "Reefs of rock gather here and slowly regrow after you graze them.",
    codex: "Soft teal reefs hold clusters of rock. Graze one, drift off, and it quietly regrows. Meteor showers reseed the reefs faster.",
    pairs: { meteorShower: "the shower is reseeding the reefs" }
  },
  "Comet Current": {
    name: "Rivers to ride",
    first: "Glide into a river of light and let the current carry you along.",
    codex: "Rivers of light flow across the galaxy. Drift into one and it carries you (and its comets) along. Comet streams pour in upstream.",
    pairs: { cometStream: "comets are pouring into the rivers" }
  },
  "Planet Nursery": {
    name: "The Cradle",
    first: "A young sun sits in this galaxy. Little worlds circle it, slow and patient.",
    codex: "A warm young sun with planets on slow orbits. Come close and they drift out of orbit toward you. Stellar births add new worlds to the rings.",
    pairs: { stellarBirth: "new worlds are joining the orbits" }
  },
  "Ruined Armada": {
    name: "Breakable hulls",
    first: "Big hulls here are brittle. Nudge one and pieces crumble off for you.",
    codex: "Old hulls too big to swallow crumble softly when you bump them, shedding pieces you can eat. Keep nudging and they shrink until they fit. Flotillas bring more hulls.",
    pairs: { derelictFlotilla: "a few brittle hulls drift in with them" }
  },
  "Void Rift": {
    name: "Aurora feeding line",
    first: "Follow the aurora. Food slowly gathers along its light.",
    codex: "A ribbon of aurora crosses the rift. Small food keeps appearing along it and drifts down its length. A void gift makes it glow and feed faster.",
    pairs: { voidPulse: "the aurora brightens and feeds faster" }
  },
  "Star Meadow": {
    name: "Blooming stars",
    first: "Star buds grow in the meadows. Eat them now, or wait and they bloom bigger.",
    codex: "Little star buds grow in golden meadows and bloom over about half a minute. Patient bites are bigger. A stellar birth makes the nearest meadow bloom all at once.",
    pairs: { stellarBirth: "the meadow is blooming" }
  },
  "Neutron Forge": {
    name: "Pulsar beams",
    first: "Slow pulsar beams sweep the forge. Inside a beam, everything you eat counts 50% more.",
    codex: "Pulsars turn slowly, sweeping soft beams of light. While you are inside a beam, food gives +50% mass. Gravity waves make the beams flare wider for a while.",
    pairs: { gravitationalWave: "the beams flare wider" }
  }
};

export function mechanicFor(biomeName) { return MECHANICS[biomeName] || null; }

// ─── Module state ───
let W = null;

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Landmarks spaced around the galaxy at base distance d (fraction of b0). */
function ringSpots(r, n, dMin, dMax) {
  const off = r() * TAU;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * TAU + (r() - 0.5) * 0.7;
    const d = dMin + r() * (dMax - dMin);
    out.push([Math.cos(a) * d, Math.sin(a) * d]);
  }
  return out;
}

function landmark(name, kind, x, y, r, rgb) {
  return { name, kind, x, y, r, rgb, visited: false };
}

// World <-> base conversions
const wx = v => v * W.f;

function curve(r, b0, bend) {
  // A gentle curve from one side of the galaxy to the other
  const a0 = r() * TAU;
  const a1 = a0 + Math.PI + (r() - 0.5) * 0.9;
  const p0 = [Math.cos(a0) * b0 * 0.92, Math.sin(a0) * b0 * 0.92];
  const p2 = [Math.cos(a1) * b0 * 0.92, Math.sin(a1) * b0 * 0.92];
  const mx = (p0[0] + p2[0]) / 2, my = (p0[1] + p2[1]) / 2;
  const nx = -(p2[1] - p0[1]), ny = p2[0] - p0[0];
  const nl = Math.hypot(nx, ny) || 1;
  const k = (r() - 0.5) * 2 * bend * b0;
  const p1 = [mx + nx / nl * k, my + ny / nl * k];
  const wob = 0.04 * b0, wf = 2 + r() * 2, wp = r() * TAU;
  const pts = [];
  const N = 48;
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    let x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0];
    let y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1];
    const s = Math.sin(t * Math.PI * wf + wp) * wob * Math.sin(t * Math.PI);
    x += nx / nl * s; y += ny / nl * s;
    pts.push([x, y]);
  }
  const path = new Path2D();
  pts.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
  return { pts, path };
}

function pointOn(pts, t) {
  const f = Math.max(0, Math.min(pts.length - 1.001, t * (pts.length - 1)));
  const i = Math.floor(f), k = f - i;
  const a = pts[i], b = pts[i + 1];
  const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
  return { x: a[0] + tx * k, y: a[1] + ty * k, tx: tx / tl, ty: ty / tl };
}

// ─── Init ───
export function initWorlds(state) {
  const biome = state.biome.name;
  const r = rng(state.galaxy * 7919 + 13);
  const b0 = state.baseBounds;
  W = {
    biome, mech: MECHANICS[biome], r, b0, f: 1,
    lms: [], banner: null, hint: { a: 0, lm: null, thin: 0, timer: 0 },
    introTimer: 240, boost: 0, flare: 0, inBeam: false, beamA: 0,
    reefs: [], rivers: [], cradle: null, aurora: null, meadows: [], pulsars: [], flagship: null,
    grid: null, timer: 0
  };
  const setup = SETUP[biome];
  if (setup) setup(state, r, b0);
}

const SETUP = {
  "Debris Reef"(state, r, b0) {
    const names = ["The Shoals", "Pebble Reach", "Old Reef", "Driftstone"];
    const spots = ringSpots(r, 4, b0 * 0.32, b0 * 0.7);
    // Gather existing small rocks into the reefs
    const pool = state.entities.filter(e => !e.bigFish && !e.powerup && (e.type === "junk" || e.type === "dust" || e.type === "meteor"));
    spots.forEach(([x, y], i) => {
      const reef = { x, y, r: b0 * (0.17 + r() * 0.06), want: 14, regrow: 0 };
      W.reefs.push(reef);
      W.lms.push(landmark(names[i], "reef", x, y, reef.r, "120, 220, 200"));
      for (let k = 0; k < reef.want && pool.length; k++) {
        const e = pool.pop();
        const a = r() * TAU, d = Math.sqrt(r()) * reef.r * 0.85;
        e.x = x + Math.cos(a) * d; e.y = y + Math.sin(a) * d;
        e.vx *= 0.4; e.vy *= 0.4;
        e.reef = i;
      }
    });
  },

  "Comet Current"(state, r, b0) {
    const names = ["The Long River", "Glacier Run"];
    for (let i = 0; i < 2; i++) {
      const c = curve(r, b0, 0.55);
      const river = { ...c, w: b0 * 0.11, spawn: 0, names: names[i] };
      W.rivers.push(river);
      const m = pointOn(c.pts, 0.5);
      W.lms.push(landmark(names[i], "river", m.x, m.y, river.w * 1.2, "170, 225, 255"));
    }
    buildFlowGrid(b0);
  },

  "Planet Nursery"(state, r, b0) {
    const a = r() * TAU, d = b0 * 0.36;
    const cx = Math.cos(a) * d, cy = Math.sin(a) * d;
    const sunR = b0 * 0.075;
    W.cradle = { x: cx, y: cy, sunR, rings: [2.4, 3.6, 5.0, 6.5].map(k => k * sunR),
      sun: { type: "star", color: "#ffd86d", seed: 4242, variant: 0, radius: sunR } };
    W.lms.push(landmark("The Cradle", "cradle", cx, cy, sunR * 6.8, "255, 216, 140"));
    // Put most planets on slow orbits
    const planets = state.entities.filter(e => e.type === "planet" && !e.powerup);
    planets.slice(0, 22).forEach((e, i) => putInOrbit(e, i % 4, r() * TAU));
  },

  "Ruined Armada"(state, r, b0) {
    const spots = ringSpots(r, 2, b0 * 0.35, b0 * 0.62);
    const [fx, fy] = spots[0];
    W.flagship = { x: fx, y: fy, size: b0 * 0.16, rot: r() * TAU,
      art: { type: "craft", color: "#8f7fb0", seed: 777, variant: 2, radius: 1 } };
    W.lms.push(landmark("The Flagship", "flagship", fx, fy, b0 * 0.22, "205, 180, 255"));
    const [lx, ly] = spots[1];
    W.lms.push(landmark("The Broken Line", "line", lx, ly, b0 * 0.18, "215, 170, 120"));
    // Brittle hulls around both
    for (let i = 0; i < 3; i++) addHull(state, fx + (r() - 0.5) * b0 * 0.3, fy + (r() - 0.5) * b0 * 0.3, 1.5, 2.2);
    const la = r() * Math.PI;
    for (let i = 0; i < 4; i++) addHull(state, lx + Math.cos(la) * (i - 1.5) * b0 * 0.09, ly + Math.sin(la) * (i - 1.5) * b0 * 0.09, 1.2, 1.6);
  },

  "Void Rift"(state, r, b0) {
    const c = curve(r, b0, 0.4);
    W.aurora = { ...c, spawn: 0, count: 0 };
    const m = pointOn(c.pts, 0.5), e = pointOn(c.pts, 0.85);
    W.lms.push(landmark("The Aurora", "aurora", m.x, m.y, b0 * 0.14, "130, 240, 200"));
    W.lms.push(landmark("Stillwater", "aurora", e.x, e.y, b0 * 0.14, "150, 150, 255"));
  },

  "Star Meadow"(state, r, b0) {
    const names = ["Goldfield", "Sunpatch", "The Orchard"];
    ringSpots(r, 3, b0 * 0.3, b0 * 0.66).forEach(([x, y], i) => {
      const m = { x, y, r: b0 * 0.17, want: 7, plant: 0 };
      W.meadows.push(m);
      W.lms.push(landmark(names[i], "meadow", x, y, m.r, "255, 215, 130"));
      for (let k = 0; k < 4; k++) plantBud(state, m, 0.2 + r() * 0.6);
    });
  },

  "Neutron Forge"(state, r, b0) {
    const names = ["The Lighthouse", "Ember Pulsar"];
    ringSpots(r, 2, b0 * 0.3, b0 * 0.55).forEach(([x, y], i) => {
      W.pulsars.push({ x, y, ang: r() * TAU, spin: (i ? -1 : 1) * 0.0028,
        art: { type: "neutron", color: i ? "#ffd2b0" : "#e0e8ff", seed: 99 + i, variant: 0, radius: b0 * 0.012 },
        rgb: i ? "255, 190, 140" : "200, 190, 255", grad: null });
      W.lms.push(landmark(names[i], "pulsar", x, y, b0 * 0.08, i ? "255, 190, 140" : "200, 190, 255"));
    });
  }
};

// ─── Mechanic helpers ───
function putInOrbit(e, ring, ang) {
  const c = W.cradle;
  const rr = c.rings[ring];
  e.orbit = { ring, ang, w: 0.0022 * Math.pow(c.rings[0] / rr, 1.5) };
  e.vx = 0; e.vy = 0;
}

function addHull(state, x, y, kMin, kMax) {
  const e = spawnScaled(state, typeById("craft"), kMin, kMax, { near: false, pos: { x, y }, forceScale: true });
  e.x = x; e.y = y;
  e.vx *= 0.3; e.vy *= 0.3;
  e.bigFish = true;
  e.hull = true;
  e.baseSpeed = 0.08;
  state.entities.push(e);
  return e;
}

function plantBud(state, m, progress = 0) {
  const a = W.r() * TAU, d = Math.sqrt(W.r()) * m.r * 0.85;
  const e = spawnFood(state, false, { type: "star", pos: { x: wx(m.x) + Math.cos(a) * wx(d), y: wx(m.y) + Math.sin(a) * wx(d) }, sizeK: 1.15 });
  e.vx *= 0.15; e.vy *= 0.15;
  const r1 = e.radius;
  e.bloom = { t: progress * 1800, dur: 1500 + W.r() * 900, r0: r1 * 0.35, r1 };
  setBudSize(e);
  e.meadow = W.meadows.indexOf(m);
  state.entities.push(e);
  return e;
}

function setBudSize(e) {
  const b = e.bloom;
  const k = smooth(b.t / b.dur);
  e.radius = b.r0 + (b.r1 - b.r0) * k;
  e.mass = Math.PI * e.radius * e.radius * e.density;
}

// River flow lookup grid (base units)
function buildFlowGrid(b0) {
  const cell = Math.max(24, b0 / 40);
  const n = Math.ceil((b0 * 2.4) / cell) + 1;
  const dist = new Float32Array(n * n), tx = new Float32Array(n * n), ty = new Float32Array(n * n);
  const o = -b0 * 1.2;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const px = o + i * cell, py = o + j * cell;
      let best = Infinity, bx = 0, by = 0;
      for (const rv of W.rivers) {
        const p = rv.pts;
        for (let s = 0; s < p.length - 1; s++) {
          const ax = p[s][0], ay = p[s][1], dx = p[s + 1][0] - ax, dy = p[s + 1][1] - ay;
          const L2 = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
          const qx = ax + dx * t - px, qy = ay + dy * t - py;
          const d2 = qx * qx + qy * qy;
          if (d2 < best) { best = d2; const l = Math.sqrt(L2); bx = dx / l; by = dy / l; }
        }
      }
      const k = j * n + i;
      dist[k] = Math.sqrt(best); tx[k] = bx; ty[k] = by;
    }
  }
  W.grid = { cell, n, o, dist, tx, ty };
}

const RIVER_FLOW = 1.15;
/** Flow vector at a world point (world units per frame, before speed scale). */
function flowAt(x, y, out) {
  const g = W.grid;
  const bx = x / W.f, by = y / W.f;
  const i = Math.round((bx - g.o) / g.cell), j = Math.round((by - g.o) / g.cell);
  out.x = 0; out.y = 0;
  if (i < 0 || j < 0 || i >= g.n || j >= g.n) return out;
  const k = j * g.n + i;
  const w = W.rivers[0].w;
  const d = g.dist[k];
  if (d > w) return out;
  const s = smooth(1 - d / w) * (W.boost > 0 ? 1.15 : 1);
  out.x = g.tx[k] * s; out.y = g.ty[k] * s;
  return out;
}
const tmp = { x: 0, y: 0 };

// ─── Update ───
export function updateWorlds(state, dt, worldDt) {
  if (!W) return;
  W.f = state.bounds / W.b0;
  W.timer += dt;
  if (W.boost > 0) W.boost -= dt;
  if (W.flare > 0) W.flare -= dt;

  // First-time caption for this galaxy's mechanic
  if (W.introTimer > 0) {
    W.introTimer -= dt;
    if (W.introTimer <= 0 && W.mech) state.worldHint?.("mech_" + W.biome, W.mech.first, 5600);
  }

  const upd = UPDATE[W.biome];
  if (upd) upd(state, dt, worldDt);

  updateLandmarks(state, dt);
}

const UPDATE = {
  "Debris Reef"(state, dt, wdt) {
    const counts = W.reefs.map(() => 0);
    for (const e of state.entities) {
      if (e.reef == null || e.consuming) continue;
      counts[e.reef]++;
      const rf = W.reefs[e.reef];
      const dx = wx(rf.x) - e.x, dy = wx(rf.y) - e.y, d = Math.hypot(dx, dy) || 1;
      if (d > wx(rf.r) * 0.8) { e.vx += dx / d * 0.004 * wdt; e.vy += dy / d * 0.004 * wdt; }
      e.vx *= Math.pow(0.995, wdt); e.vy *= Math.pow(0.995, wdt);
    }
    const every = W.boost > 0 ? 70 : 240;          // ~4s, ~1.2s during a shower
    W.reefs.forEach((rf, i) => {
      if (counts[i] >= rf.want) { rf.regrow = 0; return; }
      rf.regrow += dt;
      if (rf.regrow < every) return;
      rf.regrow = 0;
      // Don't pop food in right under your nose
      const a = W.r() * TAU, d = Math.sqrt(W.r()) * rf.r * 0.8;
      const x = wx(rf.x + Math.cos(a) * d), y = wx(rf.y + Math.sin(a) * d);
      if (Math.hypot(x - state.playerX, y - state.playerY) < state.radius * 3) return;
      const pick = W.r();
      const e = spawnFood(state, false, { type: pick < 0.45 ? "junk" : pick < 0.8 ? "dust" : "meteor", pos: { x, y } });
      e.vx *= 0.3; e.vy *= 0.3;
      e.reef = i;
      state.entities.push(e);
      state.ripples.push({ x, y, startRadius: e.radius, expandTo: e.radius * 4, age: 0, maxAge: 70, color: "rgba(140, 230, 210, 1)" });
    });
  },

  "Comet Current"(state, dt, wdt) {
    const ss = state.speedScale;
    flowAt(state.playerX, state.playerY, tmp);
    const pf = RIVER_FLOW * ss;
    state.playerX += tmp.x * pf * dt;
    state.playerY += tmp.y * pf * dt;
    W.riding = Math.hypot(tmp.x, tmp.y) > 0.3;
    for (const e of state.entities) {
      if (e.consuming || e.powerup) continue;
      flowAt(e.x, e.y, tmp);
      if (tmp.x === 0 && tmp.y === 0) continue;
      const k = RIVER_FLOW * 0.8 * Math.max(1, Math.sqrt(ss)) * wdt;
      e.x += tmp.x * k; e.y += tmp.y * k;
      // Comets that reach the river's mouth fade out quietly
      if (e.riverItem && (e.x * e.x + e.y * e.y) > Math.pow(state.bounds * 0.9, 2)) e.consumed = true;
    }
    // Rivers carry fresh comets from upstream
    const every = W.boost > 0 ? 60 : 200;
    for (const rv of W.rivers) {
      rv.spawn += dt;
      if (rv.spawn < every) continue;
      rv.spawn = 0;
      let n = 0;
      for (const e of state.entities) if (e.riverItem) n++;
      if (n > 36) continue;
      const p = pointOn(rv.pts, 0.04 + W.r() * 0.25);
      const off = (W.r() - 0.5) * rv.w * 0.8;
      const e = spawnFood(state, false, { type: W.r() < 0.75 ? "comet" : "dust", pos: { x: wx(p.x - p.ty * off), y: wx(p.y + p.tx * off) } });
      e.vx = p.tx * 0.4; e.vy = p.ty * 0.4;
      e.riverItem = true;
      state.entities.push(e);
    }
  },

  "Planet Nursery"(state, dt, wdt) {
    const c = W.cradle;
    const cx = wx(c.x), cy = wx(c.y);
    const pr = pullRange(state);
    for (const e of state.entities) {
      if (!e.orbit) {
        // Keep loose things from sitting on the sun
        if (!e.consuming) {
          const dx = e.x - cx, dy = e.y - cy, d = Math.hypot(dx, dy) || 1;
          if (d < wx(c.sunR) * 1.6) { e.vx += dx / d * 0.01 * wdt; e.vy += dy / d * 0.01 * wdt; }
        }
        continue;
      }
      if (e.consuming) { e.orbit = null; continue; }
      const o = e.orbit;
      const rr = wx(c.rings[o.ring]);
      if (Math.hypot(e.x - state.playerX, e.y - state.playerY) < pr) {
        // Close to you: let go of the orbit and glide off along it
        e.vx = -Math.sin(o.ang) * o.w * rr;
        e.vy = Math.cos(o.ang) * o.w * rr;
        e.orbit = null;
        continue;
      }
      o.ang += o.w * wdt;
      e.x = cx + Math.cos(o.ang) * rr;
      e.y = cy + Math.sin(o.ang) * rr;
      e.vx = 0; e.vy = 0;
    }
  },

  "Ruined Armada"(state, dt) {
    for (const e of state.entities) if (e._crumbleCd > 0) e._crumbleCd -= dt;
  },

  "Void Rift"(state, dt, wdt) {
    const au = W.aurora;
    let n = 0;
    for (const e of state.entities) {
      if (!e.auroraItem || e.consuming) continue;
      n++;
      // Drift slowly down the ribbon
      const t = e.auroraT = Math.min(1, e.auroraT + 0.00011 * wdt);
      const p = pointOn(au.pts, t);
      const tx = wx(p.x), ty = wx(p.y);
      e.x += (tx - e.x) * 0.02 * wdt + (W.r() - 0.5) * 0.2;
      e.y += (ty - e.y) * 0.02 * wdt + (W.r() - 0.5) * 0.2;
      e.vx = 0; e.vy = 0;
      if (t >= 1) e.consumed = true;
    }
    au.count = n;
    au.spawn += dt;
    const every = W.boost > 0 ? 25 : 80;
    if (au.spawn >= every && n < 32) {
      au.spawn = 0;
      const t = W.r() * 0.9;
      const p = pointOn(au.pts, t);
      const e = spawnFood(state, false, { pos: { x: wx(p.x), y: wx(p.y) } });
      if (e.radius * state.eatRatio >= state.radius) return;     // only edible gifts
      e.auroraItem = true;
      e.auroraT = t;
      state.entities.push(e);
    }
  },

  "Star Meadow"(state, dt, wdt) {
    const counts = W.meadows.map(() => 0);
    for (const e of state.entities) {
      if (e.meadow == null || e.consuming) continue;
      counts[e.meadow]++;
      if (e.bloom) {
        e.bloom.t += wdt;
        setBudSize(e);
        if (e.bloom.t >= e.bloom.dur) e.bloom = null;
      }
    }
    W.meadows.forEach((m, i) => {
      if (counts[i] >= m.want) { m.plant = 0; return; }
      m.plant += dt;
      if (m.plant >= 300) { m.plant = 0; plantBud(state, m, 0); }
    });
  },

  "Neutron Forge"(state, dt, wdt) {
    W.inBeam = false;
    const hw = beamHalfWidth();
    for (const p of W.pulsars) {
      p.ang += p.spin * wdt;
      const dx = state.playerX - wx(p.x), dy = state.playerY - wx(p.y);
      const d = Math.hypot(dx, dy);
      if (d < wx(W.b0 * 0.03) || d > wx(W.b0 * 1.5)) continue;
      let diff = Math.atan2(dy, dx) - p.ang;
      diff = ((diff % Math.PI) + Math.PI * 1.5) % Math.PI - Math.PI / 2;   // two opposite beams
      // Angular half-width, widened a little so the beam is a fair target
      if (Math.abs(diff) < hw + state.radius / Math.max(d, 1)) W.inBeam = true;
    }
    W.beamA += ((W.inBeam ? 1 : 0) - W.beamA) * Math.min(1, 0.08 * dt);
    if (W.inBeam) state.worldHint?.("beam_first", "Inside the beam: everything you eat counts 50% more.", 3600);
  }
};

function beamHalfWidth() { return W.flare > 0 ? 0.13 : 0.075; }

/** Mass multiplier for a bite (pulsar beams). */
export function worldMassMul() {
  return W && W.biome === "Neutron Forge" && W.inBeam ? 1.5 : 1;
}

/** Ruined Armada: bumping a brittle hull crumbles a few edible pieces off it. */
export function onWorldBump(state, e) {
  if (!W || W.biome !== "Ruined Armada" || e.type !== "craft") return false;
  if (e._crumbleCd > 0) return true;
  e._crumbleCd = 50;
  const dx = state.playerX - e.x, dy = state.playerY - e.y, d = Math.hypot(dx, dy) || 1;
  const n = 3;
  for (let i = 0; i < n; i++) {
    const a = Math.atan2(dy, dx) + (i - 1) * 0.6;
    const p = spawnFood(state, false, { type: "junk", pos: { x: e.x + Math.cos(a) * e.radius * 0.9, y: e.y + Math.sin(a) * e.radius * 0.9 }, sizeK: 1.5 });
    p.vx = Math.cos(a) * 0.5 * Math.sqrt(state.speedScale);
    p.vy = Math.sin(a) * 0.5 * Math.sqrt(state.speedScale);
    p.color = e.color;
    p._artBase = null;
    p._spawnAge = 30; p._spawnAlpha = 0.5;
    state.entities.push(p);
  }
  // Soft crumble: the hull shrinks a little each time
  e.radius *= 0.86;
  e.mass = Math.PI * e.radius * e.radius * e.density;
  for (let i = 0; i < (state.settings.reduceMotion ? 5 : 12); i++) {
    const a = Math.random() * TAU, sp = 0.2 + Math.random() * 0.6;
    state.particles.push({ x: e.x + Math.cos(a) * e.radius * 0.8, y: e.y + Math.sin(a) * e.radius * 0.8,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: 1 + Math.random() * 1.6 * Math.max(1, state.radius * 0.04),
      color: "#cdb9ef", alpha: 0.45, age: 0, maxAge: 70, gravity: 0 });
  }
  state.worldHint?.("hull_first", "The hull crumbles a little. Pieces are yours to eat.", 3600);
  return true;
}

/** A signature event just went from warning to active. */
export function onWorldEvent(state, id) {
  if (!W || !W.mech || !W.mech.pairs[id]) return;
  if (W.biome === "Debris Reef" || W.biome === "Comet Current" || W.biome === "Void Rift") W.boost = 900;
  if (W.biome === "Neutron Forge") W.flare = 720;
  if (W.biome === "Planet Nursery") {
    const ring = Math.floor(W.r() * 3);
    for (let i = 0; i < 3; i++) {
      const e = spawnFood(state, false, { type: "planet", pos: { x: 0, y: 0 } });
      putInOrbit(e, ring, W.r() * TAU);
      state.entities.push(e);
    }
  }
  if (W.biome === "Star Meadow") {
    let best = null, bd = Infinity;
    for (const m of W.meadows) { const d = Math.hypot(wx(m.x) - state.playerX, wx(m.y) - state.playerY); if (d < bd) { bd = d; best = m; } }
    if (best) {
      for (let i = 0; i < 4; i++) plantBud(state, best, 0);
      const idx = W.meadows.indexOf(best);
      for (const e of state.entities) if (e.meadow === idx && e.bloom) { e.bloom.dur = Math.min(e.bloom.dur, e.bloom.t + 240); }
    }
  }
  if (W.biome === "Ruined Armada") {
    for (let i = 0; i < 2; i++) {
      const a = W.r() * TAU, d = Math.max(state.viewW, state.viewH) * 0.6;
      const h = addHull(state, state.playerX + Math.cos(a) * d, state.playerY + Math.sin(a) * d, 1.2, 1.6);
      h._spawnAge = 0; h._spawnAlpha = 0;
      h.vx = -Math.cos(a) * 0.15; h.vy = -Math.sin(a) * 0.15;
    }
  }
}

/** Short pairing line for event captions ("Meteor Shower: the shower is reseeding the reefs"). */
export function eventPairText(id) {
  return W && W.mech && W.mech.pairs[id] || null;
}

// ─── Landmarks: arrival names, food-thin edge hints ───
function updateLandmarks(state, dt) {
  for (const lm of W.lms) {
    if (lm.visited) continue;
    if (Math.hypot(wx(lm.x) - state.playerX, wx(lm.y) - state.playerY) < wx(lm.r) + state.radius) {
      lm.visited = true;
      W.banner = { text: lm.name, age: 0 };
    }
  }
  if (W.banner) { W.banner.age += dt; if (W.banner.age > 330) W.banner = null; }

  const h = W.hint;
  h.timer += dt;
  if (h.timer >= 30) {
    h.timer = 0;
    const reach = Math.max(state.viewW, state.viewH) * 0.75;
    let near = 0;
    for (const e of state.entities) {
      if (e.powerup || e.consuming || state.radius <= e.radius * state.eatRatio) continue;
      if (Math.abs(e.x - state.playerX) < reach && Math.abs(e.y - state.playerY) < reach) near++;
    }
    h.thin = near < 4 ? h.thin + 1 : 0;
    h.lm = null;
    if (h.thin >= 2) {
      let bd = Infinity;
      for (const lm of W.lms) {
        const d = Math.hypot(wx(lm.x) - state.playerX, wx(lm.y) - state.playerY);
        if (d > wx(lm.r) * 0.9 && d < bd) { bd = d; h.lm = lm; }
      }
    }
  }
  h.a += ((h.lm ? 1 : 0) - h.a) * Math.min(1, 0.03 * dt);
  if (h.lm) h.last = h.lm;
}

// ─── Drawing ───
const glowCache = new Map();
function glow(rgb) {
  let c = glowCache.get(rgb);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(${rgb}, 1)`);
  gr.addColorStop(0.4, `rgba(${rgb}, 0.45)`);
  gr.addColorStop(1, `rgba(${rgb}, 0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  glowCache.set(rgb, c);
  return c;
}

function drawGlow(ctx, rgb, x, y, r, a) {
  if (a <= 0.005) return;
  ctx.globalAlpha = a;
  ctx.drawImage(glow(rgb), x - r, y - r, r * 2, r * 2);
}

/**
 * Inside the zoomed world transform, before entities. vw/vh = world viewport.
 * fx: { zoom, dpr, time, breath, reduceMotion }
 */
export function drawWorldsBG(ctx, state, vw, vh, fx) {
  if (!W) return;
  const draw = DRAW[W.biome];
  if (!draw) return;
  ctx.save();
  ctx.translate(vw / 2 - state.camX, vh / 2 - state.camY);
  draw(ctx, state, fx, vw, vh);
  ctx.restore();
  ctx.globalAlpha = 1;
}

function onScreen(state, x, y, r, vw, vh) {
  return Math.abs(x - state.camX) < vw / 2 + r && Math.abs(y - state.camY) < vh / 2 + r;
}

const DRAW = {
  "Debris Reef"(ctx, state, fx, vw, vh) {
    for (const rf of W.reefs) {
      const x = wx(rf.x), y = wx(rf.y), r = wx(rf.r);
      if (!onScreen(state, x, y, r * 1.4, vw, vh)) continue;
      drawGlow(ctx, "90, 200, 180", x, y, r * 1.45, 0.1 + fx.breath * 0.03);
      drawGlow(ctx, "120, 160, 220", x + r * 0.3, y - r * 0.2, r * 0.8, 0.06);
    }
  },

  "Comet Current"(ctx, state, fx) {
    const f = W.f, lite = getArtQuality() !== "high";
    ctx.save();
    ctx.scale(f, f);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const rv of W.rivers) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = `rgba(120, 200, 255, ${0.05 + (W.boost > 0 ? 0.02 : 0)})`;
      ctx.lineWidth = rv.w * 2;
      ctx.stroke(rv.path);
      ctx.strokeStyle = "rgba(170, 225, 255, 0.05)";
      ctx.lineWidth = rv.w * 1.1;
      ctx.stroke(rv.path);
      // Slow drifting streaks show which way it flows
      const speed = fx.reduceMotion ? 0.012 : 0.035;
      ctx.setLineDash([rv.w * 0.5, rv.w * 1.4]);
      ctx.lineDashOffset = -fx.time * speed;
      ctx.strokeStyle = "rgba(210, 240, 255, 0.13)";
      ctx.lineWidth = Math.max(2 / (fx.zoom * f), rv.w * 0.04);
      ctx.stroke(rv.path);
      if (!lite) {
        ctx.save();
        ctx.translate(rv.w * 0.3, rv.w * 0.25);
        ctx.lineDashOffset = -fx.time * speed * 0.8 + rv.w;
        ctx.strokeStyle = "rgba(210, 240, 255, 0.08)";
        ctx.stroke(rv.path);
        ctx.restore();
      }
      ctx.setLineDash([]);
    }
    ctx.restore();
  },

  "Planet Nursery"(ctx, state, fx, vw, vh) {
    const c = W.cradle;
    const x = wx(c.x), y = wx(c.y);
    ctx.lineWidth = 1.2 / fx.zoom;
    for (const rr of c.rings) {
      ctx.globalAlpha = 0.16;
      ctx.beginPath();
      ctx.arc(x, y, wx(rr), 0, TAU);
      ctx.strokeStyle = "rgba(200, 240, 200, 1)";
      ctx.stroke();
    }
    const sr = wx(c.sunR);
    if (!onScreen(state, x, y, sr * 4, vw, vh)) return;
    drawGlow(ctx, "255, 220, 150", x, y, sr * 5.5, 0.12 + fx.breath * 0.04);
    c.sun.radius = sr;
    const sp = spriteFor(c.sun, sr * fx.zoom * fx.dpr);
    const d = sp.k * sr * (0.98 + fx.breath * 0.04);
    ctx.globalAlpha = 0.95;
    ctx.drawImage(sp.c, x - d / 2, y - d / 2, d, d);
  },

  "Ruined Armada"(ctx, state, fx, vw, vh) {
    const fl = W.flagship;
    const x = wx(fl.x), y = wx(fl.y), s = wx(fl.size);
    if (!onScreen(state, x, y, s * 1.6, vw, vh)) return;
    drawGlow(ctx, "180, 150, 230", x, y, s * 2, 0.08);
    const sp = spriteFor(fl.art, s * fx.zoom * fx.dpr);
    const d = sp.k * s;
    ctx.globalAlpha = 0.28;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(fl.rot + fx.time * 0.000004);
    ctx.drawImage(sp.c, -d / 2, -d / 2, d, d);
    ctx.restore();
  },

  "Void Rift"(ctx, state, fx) {
    const au = W.aurora, f = W.f, lite = getArtQuality() !== "high";
    const shimmer = fx.reduceMotion ? 0.5 : 0.5 + Math.sin(fx.time * 0.0007) * 0.5;
    const glowK = W.boost > 0 ? 1.6 : 1;
    ctx.save();
    ctx.scale(f, f);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const wide = W.b0 * 0.12;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = `rgba(70, 200, 170, ${0.045 * glowK})`;
    ctx.lineWidth = wide;
    ctx.stroke(au.path);
    if (!lite) {
      ctx.save();
      ctx.translate(0, -wide * 0.25);
      ctx.strokeStyle = `rgba(120, 110, 255, ${(0.035 + shimmer * 0.02) * glowK})`;
      ctx.lineWidth = wide * 0.6;
      ctx.stroke(au.path);
      ctx.restore();
    }
    ctx.strokeStyle = `rgba(170, 255, 225, ${(0.1 + fx.breath * 0.05) * glowK})`;
    ctx.lineWidth = Math.max(2 / (fx.zoom * f), wide * 0.06);
    ctx.stroke(au.path);
    ctx.restore();
  },

  "Star Meadow"(ctx, state, fx, vw, vh) {
    for (const m of W.meadows) {
      const x = wx(m.x), y = wx(m.y), r = wx(m.r);
      if (!onScreen(state, x, y, r * 1.4, vw, vh)) continue;
      drawGlow(ctx, "255, 205, 110", x, y, r * 1.4, 0.09 + fx.breath * 0.03);
    }
    // Soft bloom halos around growing buds
    const lite = getArtQuality() !== "high";
    ctx.lineWidth = 1.2 / fx.zoom;
    for (const e of state.entities) {
      if (!e.bloom || e.consuming || !onScreen(state, e.x, e.y, e.radius * 3, vw, vh)) continue;
      const k = smooth(e.bloom.t / e.bloom.dur);
      const a = (1 - k) * 0.35 * (e._spawnAlpha ?? 1);
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius * (1.7 + k * 0.6), 0, TAU);
      ctx.strokeStyle = "rgba(255, 225, 150, 1)";
      ctx.stroke();
      if (!lite) {
        const rot = fx.reduceMotion ? 0 : fx.time * 0.0002;
        for (let i = 0; i < 5; i++) {
          const ang = rot + i * TAU / 5;
          drawGlow(ctx, "255, 230, 160", e.x + Math.cos(ang) * e.radius * 1.5, e.y + Math.sin(ang) * e.radius * 1.5, e.radius * 0.6, a * 0.8);
        }
      }
    }
  },

  "Neutron Forge"(ctx, state, fx, vw, vh) {
    const hw = beamHalfWidth();
    const L = wx(W.b0 * 1.6);
    for (const p of W.pulsars) {
      const x = wx(p.x), y = wx(p.y);
      if (!p.grad || p.gradL !== L || p.gradF !== (W.flare > 0)) {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, L);
        const k = W.flare > 0 ? 1.4 : 1;
        g.addColorStop(0, `rgba(${p.rgb}, ${0.2 * k})`);
        g.addColorStop(0.35, `rgba(${p.rgb}, ${0.07 * k})`);
        g.addColorStop(1, `rgba(${p.rgb}, 0)`);
        p.grad = g; p.gradL = L; p.gradF = W.flare > 0;
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.ang);
      ctx.globalAlpha = 0.85 + fx.breath * 0.15;
      ctx.fillStyle = p.grad;
      for (const side of [0, Math.PI]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, L, side - hw, side + hw);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      const r = wx(p.art.radius);
      if (onScreen(state, x, y, r * 4, vw, vh)) {
        p.art.radius = W.b0 * 0.012;
        const sp = spriteFor(p.art, r * fx.zoom * fx.dpr);
        const d = sp.k * r;
        ctx.globalAlpha = 0.95;
        ctx.drawImage(sp.c, x - d / 2, y - d / 2, d, d);
      }
    }
    // A warm halo on the hole while you're in a beam
    if (W.beamA > 0.02) drawGlow(ctx, "255, 200, 140", state.playerX, state.playerY, state.radius * 3.6, 0.38 * W.beamA);
  }
};

/** Screen-space: arrival names and gentle edge hints toward a landmark. */
export function drawWorldsOverlay(ctx, state, w, h, breath) {
  if (!W) return;
  if (W.banner) {
    const t = W.banner.age;
    const a = t < 60 ? smooth(t / 60) : t > 240 ? 1 - smooth((t - 240) / 90) : 1;
    ctx.save();
    ctx.globalAlpha = 0.55 * a;
    ctx.font = "300 17px Outfit, system-ui, sans-serif";
    if ("letterSpacing" in ctx) ctx.letterSpacing = "4px";
    ctx.textAlign = "center";
    ctx.fillStyle = "#e9edff";
    ctx.shadowColor = "rgba(150, 160, 255, 0.6)";
    ctx.shadowBlur = 12;
    ctx.fillText(W.banner.text.toUpperCase(), w / 2, h * 0.2);
    ctx.restore();
  }
  const hint = W.hint, lm = hint.lm || hint.last;
  if (hint.a > 0.02 && lm) {
    const z = state.zoom;
    const sx = (wx(lm.x) - state.camX) * z + w / 2, sy = (wx(lm.y) - state.camY) * z + h / 2;
    if (sx > 0 && sx < w && sy > 0 && sy < h) return;
    const px = (state.playerX - state.camX) * z + w / 2, py = (state.playerY - state.camY) * z + h / 2;
    const ang = Math.atan2(sy - py, sx - px);
    const m = 34, bottom = h - 120;
    const cx = Math.cos(ang), cy = Math.sin(ang);
    let k = Infinity;
    if (cx > 0) k = Math.min(k, (w - m - px) / cx); else if (cx < 0) k = Math.min(k, (m - px) / cx);
    if (cy > 0) k = Math.min(k, (bottom - py) / cy); else if (cy < 0) k = Math.min(k, (m + 50 - py) / cy);
    const ex = px + cx * k, ey = py + cy * k;
    const a = hint.a * (0.7 + breath * 0.3);
    ctx.save();
    drawGlow(ctx, lm.rgb, ex, ey, 30, 0.35 * a);
    ctx.globalAlpha = 0.6 * a;
    ctx.translate(ex, ey);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(-4, -6); ctx.lineTo(4, 0); ctx.lineTo(-4, 6);
    ctx.strokeStyle = `rgba(${lm.rgb}, 1)`;
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.5 * a;
    ctx.font = "400 11px Outfit, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = `rgba(${lm.rgb}, 1)`;
    const tx = Math.max(50, Math.min(w - 50, ex - cx * 30)), ty = Math.max(70, Math.min(bottom - 10, ey - cy * 26 + 4));
    ctx.fillText(lm.name, tx, ty);
    ctx.restore();
  }
}

/** Minimap overlay: called with the map centre and world->map scale. */
export function drawWorldsMinimap(ctx, cx, cy, sc, time) {
  if (!W) return;
  const f = W.f;
  ctx.save();
  ctx.lineCap = "round";
  for (const rv of W.rivers) {
    ctx.beginPath();
    rv.pts.forEach(([x, y], i) => (i ? ctx.lineTo(cx + x * f * sc, cy + y * f * sc) : ctx.moveTo(cx + x * f * sc, cy + y * f * sc)));
    ctx.strokeStyle = "rgba(150, 215, 255, 0.4)";
    ctx.lineWidth = Math.max(1.5, rv.w * f * sc * 1.2);
    ctx.stroke();
  }
  if (W.aurora) {
    ctx.beginPath();
    W.aurora.pts.forEach(([x, y], i) => (i ? ctx.lineTo(cx + x * f * sc, cy + y * f * sc) : ctx.moveTo(cx + x * f * sc, cy + y * f * sc)));
    ctx.strokeStyle = "rgba(130, 240, 200, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  for (const p of W.pulsars) {
    const x = cx + p.x * f * sc, y = cy + p.y * f * sc, L = W.b0 * 1.6 * f * sc;
    ctx.strokeStyle = `rgba(${p.rgb}, 0.35)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(p.ang) * L, y - Math.sin(p.ang) * L);
    ctx.lineTo(x + Math.cos(p.ang) * L, y + Math.sin(p.ang) * L);
    ctx.stroke();
  }
  for (const lm of W.lms) {
    const x = cx + lm.x * f * sc, y = cy + lm.y * f * sc;
    ctx.globalAlpha = lm.visited ? 0.55 : 0.9;
    ctx.strokeStyle = ctx.fillStyle = `rgba(${lm.rgb}, 1)`;
    ctx.lineWidth = 1;
    if (lm.kind === "reef" || lm.kind === "meadow") {
      ctx.beginPath(); ctx.arc(x, y, Math.max(2.5, lm.r * f * sc), 0, TAU); ctx.stroke();
    } else if (lm.kind === "cradle") {
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.3;
      ctx.beginPath(); ctx.arc(x, y, Math.max(4, lm.r * f * sc * 0.75), 0, TAU); ctx.stroke();
    } else if (lm.kind === "flagship" || lm.kind === "line") {
      ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 3); ctx.lineTo(x - 3, y); ctx.closePath(); ctx.fill();
    } else if (lm.kind === "pulsar") {
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill();
    } else if (lm.kind === "river" || lm.kind === "aurora") {
      ctx.beginPath(); ctx.arc(x, y, 1.8, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}

/** For tests/debug */
export function worldsInfo() {
  if (!W) return null;
  return { biome: W.biome, f: +W.f.toFixed(2), landmarks: W.lms.map(l => ({ name: l.name, x: Math.round(l.x * W.f), y: Math.round(l.y * W.f), visited: l.visited })),
    hint: W.hint.lm ? W.hint.lm.name : null,
    pulsars: W.pulsars.map(p => ({ x: Math.round(p.x * W.f), y: Math.round(p.y * W.f), ang: p.ang })), inBeam: W.inBeam, boost: Math.max(0, Math.round(W.boost)), flare: Math.max(0, Math.round(W.flare)), riding: !!W.riding };
}
