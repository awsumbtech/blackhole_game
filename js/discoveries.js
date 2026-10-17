// ─── DISCOVERIES (v6) ───
// A few rare, gentle finds hidden in each galaxy, themed to its biome. They're
// not food: you just drift into them and they're written in your logbook.
// Like every mechanic, they follow you: a find you've wandered away from
// quietly reappears ahead of you. A soft edge glow (2.5s fade-in) and the wisp
// leaning that way are the only cues. Nothing flashes, nothing is timed.

const TAU = Math.PI * 2;

// kind: "orb" (soft glow), "comet" (glow + tail), "ring" (glow + halo ring)
export const DISCOVERIES = {
  "Debris Reef": [
    { id: "geode", name: "Golden Geode", rgb: "255, 206, 120", kind: "orb", line: "A hollow stone lined with gold, humming faintly." },
    { id: "bottle", name: "Drifting Bottle", rgb: "170, 235, 220", kind: "orb", line: "Glass, and inside it a tiny map of somewhere else." },
    { id: "coralsat", name: "Coral Satellite", rgb: "130, 225, 210", kind: "ring", line: "An old satellite, slowly overgrown by the reef." }
  ],
  "Comet Current": [
    { id: "goldcomet", name: "Golden Comet", rgb: "255, 214, 130", kind: "comet", line: "A comet with a warm gold tail. Lucky, they say." },
    { id: "twincomets", name: "Twin Comets", rgb: "170, 210, 255", kind: "comet", line: "Two comets that have travelled side by side for ages." },
    { id: "icelantern", name: "Ice Lantern", rgb: "200, 240, 255", kind: "orb", line: "Light trapped in ice, glowing from the inside." }
  ],
  "Planet Nursery": [
    { id: "firstmoon", name: "First Moon", rgb: "235, 225, 255", kind: "orb", line: "A brand-new moon, still finding its orbit." },
    { id: "seedling", name: "Ringed Seedling", rgb: "180, 240, 170", kind: "ring", line: "A little world that's already grown its first ring." },
    { id: "cradlesong", name: "Cradle Song", rgb: "255, 230, 190", kind: "orb", line: "A soft radio hum, like a lullaby, from the young sun." }
  ],
  "Ruined Armada": [
    { id: "probe", name: "Lost Probe", rgb: "255, 220, 170", kind: "ring", line: "A tiny probe, still faithfully sending home." },
    { id: "lantern", name: "Captain's Lantern", rgb: "255, 196, 130", kind: "orb", line: "Someone left the light on." },
    { id: "beacon", name: "Sleeping Beacon", rgb: "200, 200, 255", kind: "ring", line: "It blinks once every hundred years. You caught it." }
  ],
  "Void Rift": [
    { id: "whale", name: "Whale Nebula", rgb: "150, 190, 255", kind: "orb", line: "A nebula shaped like a whale, drifting through the dark." },
    { id: "auroraseed", name: "Aurora Seed", rgb: "150, 255, 210", kind: "orb", line: "Where the ribbons of light begin." },
    { id: "echo", name: "Quiet Echo", rgb: "210, 190, 255", kind: "ring", line: "A whisper from the start of everything." }
  ],
  "Star Meadow": [
    { id: "dandelion", name: "Dandelion Star", rgb: "255, 240, 180", kind: "orb", line: "One puff, and it would scatter into a hundred stars." },
    { id: "fireflies", name: "Firefly Swarm", rgb: "230, 255, 160", kind: "orb", line: "A tiny swarm of lights, keeping each other company." },
    { id: "moonflower", name: "Moonflower", rgb: "220, 220, 255", kind: "ring", line: "It only opens when something gentle passes by." }
  ],
  "Neutron Forge": [
    { id: "singing", name: "Singing Pulsar", rgb: "255, 180, 150", kind: "ring", line: "It hums one clear note, over and over." },
    { id: "ironrose", name: "Iron Rose", rgb: "255, 160, 140", kind: "orb", line: "Forged in starfire and left here to cool." },
    { id: "ember", name: "Cooling Ember", rgb: "255, 200, 140", kind: "orb", line: "The last warm spark of an old star, resting." }
  ]
};
export const ALL_DISCOVERIES = Object.entries(DISCOVERIES).flatMap(([b, list]) => list.map(d => ({ ...d, biome: b })));

// When (seconds into the galaxy) each find is planted
const PLAN_REGULAR = [35, 120];
const PLAN_BREATHER = [22];
const NEAR_VR = 2.4;      // the cue starts within this many view radii
const FOLLOW_VR = 4.5;    // farther than this and it re-plants ahead of you

function vrOf(state) { return Math.hypot(state.viewW || 800, state.viewH || 600) / 2; }

/** Called at the start of each galaxy. */
export function initDiscoveries(state) {
  const list = (state.biome && DISCOVERIES[state.biome.name]) || [];
  const log = (state.records && state.records.discoveries) || {};
  let plan = state.biome && state.biome.breather ? PLAN_BREATHER : PLAN_REGULAR;
  // v7: none in Zen sessions (nothing there is kept); Keen Eye adds one more
  if (state.mode === "zen") plan = [];
  else if (state.ascMods && state.ascMods.extraFind && !(state.biome && state.biome.breather)) plan = [...plan, 200];
  // Prefer finds you haven't logged yet; then any (seeing an old friend again is nice too)
  const fresh = list.filter(d => !log[d.id]);
  const pool = [...shuffle(fresh), ...shuffle(list.filter(d => log[d.id]))];
  state.finds = plan.map((at, i) => pool[i] ? { def: pool[i], at, planted: false, found: false, x: 0, y: 0, cue: 0, age: 0 } : null).filter(Boolean);
  state.discoveryNear = null;
}

function shuffle(a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

function plantAhead(state, f) {
  const vr = vrOf(state);
  const sp = Math.hypot(state.playerVX || 0, state.playerVY || 0);
  const heading = sp > 0.2 ? Math.atan2(state.playerVY, state.playerVX) : Math.random() * TAU;
  const a = heading + (Math.random() - 0.5) * 1.6;
  const d = vr * (1.5 + Math.random() * 0.8);   // just off-screen, somewhere ahead
  f.x = state.playerX + Math.cos(a) * d;
  f.y = state.playerY + Math.sin(a) * d;
  f.planted = true;
  f.cue = 0;
}

/** Radius in world units: always a comfortable size relative to you. */
function findR(state) { return Math.max(state.radius * 0.6, 9 / (state.zoom || 1)); }

/** Per frame. onFound(def) is called once per find. */
export function updateDiscoveries(state, dt, onFound) {
  if (!state.finds) return;
  const t = state.run ? state.run.time : 0;
  const vr = vrOf(state);
  let near = null;
  for (const f of state.finds) {
    if (f.found) continue;
    if (!f.planted) { if (t >= f.at) plantAhead(state, f); else continue; }
    f.age += dt;
    const d = Math.hypot(f.x - state.playerX, f.y - state.playerY);
    if (d > vr * FOLLOW_VR) { plantAhead(state, f); continue; }
    const q = Math.max(0, Math.min(1, 1 - (d - vr * 0.4) / (vr * (NEAR_VR - 0.4))));
    // ~2.5s soft telegraph: the cue fades in rather than appearing
    f.cue = q > 0 ? Math.min(1, f.cue + dt / 150) : Math.max(0, f.cue - dt / 90);
    if (q > 0 && (!near || q > near.q)) near = { x: f.x, y: f.y, q: q * f.cue, f };
    if (d < state.radius + findR(state) * 1.1) {
      f.found = true;
      onFound(f.def, f);
    }
  }
  state.discoveryNear = near;
}

// v8.1: each find gets its own painted sprite (cached once per find), a unique
// glyph from its id: petals, rings, facets or a comet head. Drawn rotated slowly.
const findSprites = new Map();
let tailSprite = null;
function hashId(id) { let h = 7; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h; }
function findSprite(def) {
  let c = findSprites.get(def.id);
  if (c) return c;
  const S = 128, h = S / 2, R = S * 0.12;
  c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  g.translate(h, h);
  const H = hashId(def.id), rgb = def.rgb;
  const halo = g.createRadialGradient(0, 0, 0, 0, 0, h);
  halo.addColorStop(0, `rgba(${rgb}, 0.5)`);
  halo.addColorStop(0.25, `rgba(${rgb}, 0.18)`);
  halo.addColorStop(1, `rgba(${rgb}, 0)`);
  g.fillStyle = halo; g.fillRect(-h, -h, S, S);
  g.globalCompositeOperation = "lighter";
  if (def.kind === "ring") {
    const n = 1 + (H % 3);
    for (let i = 0; i < n; i++) {
      g.save(); g.rotate(-0.4 + i * 1.05);
      g.strokeStyle = `rgba(${rgb}, ${0.55 - i * 0.12})`;
      g.lineWidth = 2;
      g.beginPath(); g.ellipse(0, 0, R * (2.6 + i * 0.5), R * (0.85 + i * 0.15), 0, 0, TAU); g.stroke();
      g.restore();
    }
  } else if (def.kind === "orb") {
    const petals = 5 + (H % 4), len = R * (2 + (H % 5) * 0.25);
    for (let i = 0; i < petals; i++) {
      g.save(); g.rotate(i * TAU / petals + (H % 7) * 0.1);
      const pg = g.createLinearGradient(0, 0, len, 0);
      pg.addColorStop(0, `rgba(${rgb}, 0.5)`);
      pg.addColorStop(1, `rgba(${rgb}, 0)`);
      g.fillStyle = pg;
      g.beginPath(); g.ellipse(len * 0.5, 0, len * 0.55, R * 0.42, 0, 0, TAU); g.fill();
      g.restore();
    }
  }
  // core
  const cg = g.createRadialGradient(-R * 0.25, -R * 0.25, 0, 0, 0, R * 1.2);
  cg.addColorStop(0, "rgba(255, 253, 245, 1)");
  cg.addColorStop(0.45, `rgba(${rgb}, 0.95)`);
  cg.addColorStop(1, `rgba(${rgb}, 0)`);
  g.fillStyle = cg; g.beginPath(); g.arc(0, 0, R * 1.2, 0, TAU); g.fill();
  // fine four-point sparkle
  g.strokeStyle = "rgba(255, 250, 235, 0.6)";
  g.lineWidth = 1.2;
  g.beginPath();
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.moveTo(Math.cos(a) * R * 0.4, Math.sin(a) * R * 0.4); g.lineTo(Math.cos(a) * R * 3.2, Math.sin(a) * R * 3.2); }
  g.stroke();
  // orbiting motes
  for (let i = 0; i < 3 + (H % 3); i++) {
    const a = i * 2.1 + H, d = R * (2.2 + (i % 2) * 0.9);
    g.fillStyle = "rgba(255, 250, 235, 0.8)";
    g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, 1.4, 0, TAU); g.fill();
  }
  findSprites.set(def.id, c);
  return c;
}
function tail() {
  if (tailSprite) return tailSprite;
  const L = 256, H = 48;
  tailSprite = document.createElement("canvas");
  tailSprite.width = L; tailSprite.height = H;
  const g = tailSprite.getContext("2d");
  const lg = g.createLinearGradient(0, 0, L, 0);
  lg.addColorStop(0, "rgba(255, 255, 255, 0.7)");
  lg.addColorStop(1, "rgba(255, 255, 255, 0)");
  g.fillStyle = lg;
  g.beginPath(); g.moveTo(0, H / 2 - 10); g.quadraticCurveTo(L * 0.4, H / 2 - 8, L, H / 2); g.quadraticCurveTo(L * 0.4, H / 2 + 8, 0, H / 2 + 10); g.fill();
  return tailSprite;
}

/** World-space draw (inside the camera transform, like the wisp). */
export function drawDiscoveries(ctx, state, vw, vh, time, reduceMotion) {
  if (!state.finds) return;
  const ox = vw / 2 - state.camX, oy = vh / 2 - state.camY;
  const r = findR(state);
  for (const f of state.finds) {
    if (!f.planted || f.found) continue;
    const x = f.x + ox, y = f.y + oy;
    if (x < -r * 8 || y < -r * 8 || x > vw + r * 8 || y > vh + r * 8) continue;
    const fade = Math.min(1, f.age / 90);
    const tw = reduceMotion ? 1 : 0.85 + 0.15 * Math.sin(time * 0.0021 + f.at);
    if (f.def.kind === "comet") {
      const ang = time * 0.0002 + f.at;
      const len = r * 7, hgt = r * 1.4;
      ctx.save();
      ctx.translate(x, y); ctx.rotate(ang + Math.PI);
      ctx.globalAlpha = 0.6 * fade;
      ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(tail(), 0, -hgt / 2, len, hgt);
      ctx.restore();
    }
    const sp = findSprite(f.def), d = r * 8.3 * (0.96 + 0.04 * tw);
    const rot = reduceMotion ? 0.4 : time * 0.0003 + f.at;
    ctx.globalAlpha = fade * (0.85 + 0.15 * tw);
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.drawImage(sp, -d / 2, -d / 2, d, d);
    ctx.rotate(-rot); ctx.translate(-x, -y);
  }
  ctx.globalAlpha = 1;
}

/** Screen-space cue: a soft glow at the screen edge toward an off-screen find. */
export function drawDiscoveryCue(ctx, state, w, h) {
  const n = state.discoveryNear;
  if (!n || n.q <= 0.02) return;
  const z = state.zoom || 1;
  const sx = (n.x - state.camX) * z + w / 2, sy = (n.y - state.camY) * z + h / 2;
  if (sx > 0 && sx < w && sy > 0 && sy < h) return;   // on screen: it speaks for itself
  const a = Math.atan2(sy - h / 2, sx - w / 2);
  const ex = w / 2 + Math.cos(a) * w * 0.5, ey = h / 2 + Math.sin(a) * h * 0.5;
  const cx = Math.max(0, Math.min(w, ex)), cy = Math.max(0, Math.min(h, ey));
  const rr = Math.min(w, h) * 0.32;
  const rgb = n.f.def.rgb;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
  g.addColorStop(0, `rgba(${rgb}, ${(0.22 * n.q).toFixed(3)})`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
}

export function discoveriesInfo(state) {
  return (state.finds || []).map(f => ({ id: f.def.id, planted: f.planted, found: f.found, x: f.x, y: f.y, at: f.at }));
}
