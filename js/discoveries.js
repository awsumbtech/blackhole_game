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
export function discoveryById(id) { return ALL_DISCOVERIES.find(d => d.id === id); }

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
  const plan = state.biome && state.biome.breather ? PLAN_BREATHER : PLAN_REGULAR;
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
    const rgb = f.def.rgb;
    if (f.def.kind === "comet") {
      const ang = time * 0.0002 + f.at;
      const tx = Math.cos(ang), ty = Math.sin(ang);
      const tg = ctx.createLinearGradient(x, y, x - tx * r * 6, y - ty * r * 6);
      tg.addColorStop(0, `rgba(${rgb}, ${0.45 * fade})`);
      tg.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.strokeStyle = tg;
      ctx.lineWidth = r * 0.9;
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - tx * r * 6, y - ty * r * 6); ctx.stroke();
    }
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
    g.addColorStop(0, `rgba(255, 252, 240, ${0.95 * fade})`);
    g.addColorStop(0.18, `rgba(${rgb}, ${0.8 * fade * tw})`);
    g.addColorStop(0.5, `rgba(${rgb}, ${0.18 * fade * tw})`);
    g.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, TAU); ctx.fill();
    if (f.def.kind === "ring") {
      ctx.strokeStyle = `rgba(${rgb}, ${0.5 * fade})`;
      ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.7, r * 0.6, -0.4, 0, TAU); ctx.stroke();
    }
    // Four-point sparkle, turning slowly (still in Reduce Motion)
    const s = r * 1.6 * tw, rot = reduceMotion ? 0.4 : time * 0.0004 + f.at;
    ctx.strokeStyle = `rgba(255, 250, 235, ${0.55 * fade})`;
    ctx.lineWidth = Math.max(0.6, r * 0.07);
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = rot + i * Math.PI / 2;
      ctx.moveTo(x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3);
      ctx.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
    }
    ctx.stroke();
  }
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
