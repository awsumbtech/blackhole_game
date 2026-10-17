// ─── COMPANION WISP (v5.2) ───
// A small glowing wisp drifts beside the hole, breathing with the 10s cycle.
// Now and then it floats toward something tasty nearby, as a gentle hint.
// v6: it twirls happily after a big catch, curls up and rests during breather
// galaxies, and perks up (brighter, leaning that way) near a hidden discovery.
// It never eats, never blocks, and costs one cached sprite per frame.

const TAU = Math.PI * 2;
let w = null;
let sprite = null, shade = null;
let hx = 0, hy = 0;   // home point (written by homePoint, no per-frame objects)
const TRAIL_N = 16;   // floats (8 points)

function makeSprite() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255, 255, 250, 1)");
  gr.addColorStop(0.14, "rgba(255, 244, 205, 0.95)");
  gr.addColorStop(0.38, "rgba(150, 235, 215, 0.38)");
  gr.addColorStop(1, "rgba(120, 220, 200, 0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return c;
}
// v8: a soft dark backing so the glow stays readable over bright stars and nebulae
function makeShade() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(4, 8, 18, 0.55)");
  gr.addColorStop(0.5, "rgba(4, 8, 18, 0.25)");
  gr.addColorStop(1, "rgba(4, 8, 18, 0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return c;
}

export function resetWisp(state) {
  const a = Math.random() * TAU;
  const d = state.radius * 3;
  w = {
    x: state.playerX + Math.cos(a) * d, y: state.playerY + Math.sin(a) * d,
    vx: 0, vy: 0, ang: a, mode: "follow", modeT: 0,
    nextHint: 900 + Math.random() * 600, target: null, trail: new Float64Array(TRAIL_N), trailLen: 0, trailT: 0, age: 0, joy: 0, perk: 0
  };
}

function homePoint(state) {
  // Orbit gently a little off the hole's shoulder (at least ~22px out on screen).
  // v8 Zen: a closer, steady orbit right beside the hole (it's the breath guide).
  const zen = state.mode === "zen";
  const rest = !zen && state.biome && state.biome.breather;
  let d = zen ? Math.max(state.radius * 2.1, 20 / state.zoom) : Math.max(state.radius * (rest ? 1.9 : 2.6), (rest ? 17 : 22) / state.zoom);
  // Resting: a slow little curl (a loop within the loop), like a cat settling
  if (rest) d *= 1 + 0.18 * Math.sin(w.ang * 3);
  hx = state.playerX + Math.cos(w.ang) * d;
  hy = state.playerY + Math.sin(w.ang) * d * 0.8;
}

/** v6: moments the wisp reacts to ("catch" after a big catch, "discovery" on a find). */
export function wispReact(state, kind) {
  if (!w) return;
  w.joy = kind === "discovery" ? 150 : 100;
}

function findHint(state) {
  const R = state.radius, reach = Math.min(state.viewW, state.viewH) * 0.42;
  let best = null, bs = 0;
  for (const e of state.entities) {
    if (e.consuming || e.powerup || R <= e.radius * state.eatRatio) continue;
    const d = Math.hypot(e.x - state.playerX, e.y - state.playerY);
    if (d < R * 3 || d > reach) continue;
    const s = e.mass / (d + R);
    if (s > bs) { bs = s; best = e; }
  }
  return best;
}

export function updateWisp(state, dt, reduceMotion) {
  if (!w) resetWisp(state);
  w.age += dt;
  const rest = state.biome && state.biome.breather;
  if (w.joy > 0) w.joy = Math.max(0, w.joy - dt);
  // Happy twirl after a catch; slow, settled orbit in breathers
  const spin = w.joy > 0 && !reduceMotion ? 0.012 * Math.min(1, w.joy / 40) : 0;
  w.ang += ((reduceMotion ? 0.0015 : 0.003) * (rest ? 0.55 : 1) + spin) * dt;
  const zen = state.mode === "zen";
  homePoint(state);
  let gx = hx, gy = hy;
  // Perk up near a hidden discovery: lean toward it from the hole's shoulder (never in Zen)
  const dn = zen ? null : state.discoveryNear;
  const perkGoal = dn && dn.q > 0 ? Math.min(1, dn.q) : 0;
  w.perk += (perkGoal - w.perk) * Math.min(1, 0.02 * dt);
  if (w.perk > 0.05 && dn) {
    const a = Math.atan2(dn.y - state.playerY, dn.x - state.playerX);
    const d = Math.max(state.radius * 3.4, 30 / state.zoom);
    gx += (state.playerX + Math.cos(a) * d - gx) * w.perk;
    gy += (state.playerY + Math.sin(a) * d - gy) * w.perk;
  }

  if (zen) {
    // Zen: never wanders off to hint at food; it stays at your side
    w.mode = "follow"; w.target = null;
  } else if (w.mode === "follow") {
    w.nextHint -= dt;
    if (w.nextHint <= 0 && rest) w.nextHint = 600;   // resting: no hints in breathers
    else if (w.nextHint <= 0) {
      w.target = findHint(state);
      w.nextHint = 1100 + Math.random() * 700;   // every ~20-30s
      if (w.target) { w.mode = "hint"; w.modeT = 0; }
    }
  } else {
    w.modeT += dt;
    const t = w.target;
    if (!t || t.consuming || !state.entities.includes(t) || w.modeT > 260 || w.perk > 0.3) {
      w.mode = "follow"; w.target = null;
    } else {
      // hover just beside it, never on top
      const side = Math.max(t.radius * 1.8, 14 / state.zoom);
      gx = t.x + Math.cos(w.ang * 3) * side; gy = t.y + Math.sin(w.ang * 3) * side;
    }
  }

  // Soft spring toward the goal (frame-rate independent)
  const k = (zen ? 0.014 : w.mode === "hint" ? 0.0035 : 0.006) * dt;
  w.vx += (gx - w.x) * k;
  w.vy += (gy - w.y) * k;
  const damp = Math.pow(0.9, dt);
  w.vx *= damp; w.vy *= damp;
  w.x += w.vx * dt; w.y += w.vy * dt;

  // Snap back if it got left far behind (new galaxy, a big pull-back)
  const far = Math.hypot(w.x - state.playerX, w.y - state.playerY);
  if (far > Math.max(state.viewW, state.viewH)) { homePoint(state); w.x = hx; w.y = hy; w.vx = w.vy = 0; w.trailLen = 0; }

  if (!reduceMotion) {
    w.trailT += dt;
    if (w.trailT >= 4) {
      w.trailT = 0;
      if (w.trailLen === TRAIL_N) { w.trail.copyWithin(0, 2); w.trailLen -= 2; }
      w.trail[w.trailLen++] = w.x; w.trail[w.trailLen++] = w.y;
    }
  } else w.trailLen = 0;
}

/** Inside the world transform (camera already applied by the caller via cam offsets). */
export function drawWisp(ctx, state, vw, vh, breath, reduceMotion) {
  if (!w) return;
  if (!sprite) { sprite = makeSprite(); shade = makeShade(); }
  const z = state.zoom;
  const ox = vw / 2 - state.camX, oy = vh / 2 - state.camY;
  // Grows a little with each scale tier, in screen pixels
  const rest = state.biome && state.biome.breather;
  const joyK = Math.min(1, w.joy / 40);
  const px = (7 + Math.min(6, (state.tier || 0) * 0.5)) * (rest ? 0.85 : 1) * (1 + 0.3 * joyK + 0.2 * w.perk);
  // Perked: a quicker, brighter shimmer (still soft); resting: slow and dim
  // v7.1 Zen: the wisp is the breathing guide. It swells on the in-breath (4 s)
  // and settles on the out-breath (6 s). It stays gentle with Reduce Motion.
  const zenB = state.mode === "zen";
  const pulse = zenB ? (reduceMotion ? 0.85 + breath * 0.35 : 0.7 + breath * 0.8)
    : reduceMotion ? 1 : 0.85 + breath * 0.3 + w.perk * 0.12 * Math.sin(w.age * 0.08);
  const fade = Math.min(1, w.age / 120);
  const s = px * pulse / z;
  const n = w.trailLen;
  for (let i = 0; i < n; i += 2) {
    const a = (i / n) * 0.25 * fade;
    const ts = s * (0.4 + 0.5 * i / n);
    ctx.globalAlpha = a;
    ctx.drawImage(sprite, w.trail[i] + ox - ts, w.trail[i + 1] + oy - ts, ts * 2, ts * 2);
  }
  ctx.globalAlpha = 0.8 * fade;
  ctx.drawImage(shade, w.x + ox - s * 3, w.y + oy - s * 3, s * 6, s * 6);
  ctx.globalAlpha = Math.min(1, (zenB ? 0.55 + breath * 0.45 : 0.7 + breath * 0.25) * (rest ? 0.8 : 1) + 0.25 * joyK + 0.2 * w.perk) * fade;
  ctx.drawImage(sprite, w.x + ox - s * 2, w.y + oy - s * 2, s * 4, s * 4);
  ctx.globalAlpha = 1;
}

export function wispInfo() { return w ? { x: w.x, y: w.y, mode: w.mode, age: w.age, joy: w.joy, perk: +w.perk.toFixed(2) } : null; }
