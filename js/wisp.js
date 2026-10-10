// ─── COMPANION WISP (v5.2) ───
// A small glowing wisp drifts beside the hole, breathing with the 10s cycle.
// Now and then it floats toward something tasty nearby, as a gentle hint.
// It never eats, never blocks, and costs one cached sprite per frame.

const TAU = Math.PI * 2;
let w = null;
let sprite = null;

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

export function resetWisp(state) {
  const a = Math.random() * TAU;
  const d = state.radius * 3;
  w = {
    x: state.playerX + Math.cos(a) * d, y: state.playerY + Math.sin(a) * d,
    vx: 0, vy: 0, ang: a, mode: "follow", modeT: 0,
    nextHint: 900 + Math.random() * 600, target: null, trail: [], trailT: 0, age: 0
  };
}

function homePoint(state) {
  // Orbit gently a little off the hole's shoulder (at least ~22px out on screen)
  const d = Math.max(state.radius * 2.6, 22 / state.zoom);
  return { x: state.playerX + Math.cos(w.ang) * d, y: state.playerY + Math.sin(w.ang) * d * 0.8 };
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
  w.ang += (reduceMotion ? 0.0015 : 0.003) * dt;
  let goal = homePoint(state);

  if (w.mode === "follow") {
    w.nextHint -= dt;
    if (w.nextHint <= 0) {
      w.target = findHint(state);
      w.nextHint = 1100 + Math.random() * 700;   // every ~20-30s
      if (w.target) { w.mode = "hint"; w.modeT = 0; }
    }
  } else {
    w.modeT += dt;
    const t = w.target;
    if (!t || t.consuming || !state.entities.includes(t) || w.modeT > 260) {
      w.mode = "follow"; w.target = null;
    } else {
      // hover just beside it, never on top
      const side = Math.max(t.radius * 1.8, 14 / state.zoom);
      goal = { x: t.x + Math.cos(w.ang * 3) * side, y: t.y + Math.sin(w.ang * 3) * side };
    }
  }

  // Soft spring toward the goal (frame-rate independent)
  const k = (w.mode === "hint" ? 0.0035 : 0.006) * dt;
  w.vx += (goal.x - w.x) * k;
  w.vy += (goal.y - w.y) * k;
  const damp = Math.pow(0.9, dt);
  w.vx *= damp; w.vy *= damp;
  w.x += w.vx * dt; w.y += w.vy * dt;

  // Snap back if it got left far behind (new galaxy, a big pull-back)
  const far = Math.hypot(w.x - state.playerX, w.y - state.playerY);
  if (far > Math.max(state.viewW, state.viewH)) { const h = homePoint(state); w.x = h.x; w.y = h.y; w.vx = w.vy = 0; w.trail = []; }

  if (!reduceMotion) {
    w.trailT += dt;
    if (w.trailT >= 4) {
      w.trailT = 0;
      w.trail.push(w.x, w.y);
      if (w.trail.length > 16) w.trail.splice(0, 2);
    }
  } else if (w.trail.length) w.trail = [];
}

/** Inside the world transform (camera already applied by the caller via cam offsets). */
export function drawWisp(ctx, state, vw, vh, breath, reduceMotion) {
  if (!w) return;
  if (!sprite) sprite = makeSprite();
  const z = state.zoom;
  const ox = vw / 2 - state.camX, oy = vh / 2 - state.camY;
  // Grows a little with each scale tier, in screen pixels
  const px = 7 + Math.min(6, (state.tier || 0) * 0.5);
  const pulse = reduceMotion ? 1 : 0.85 + breath * 0.3;
  const fade = Math.min(1, w.age / 120);
  const s = px * pulse / z;
  for (let i = 0; i < w.trail.length; i += 2) {
    const a = (i / w.trail.length) * 0.25 * fade;
    const ts = s * (0.4 + 0.5 * i / w.trail.length);
    ctx.globalAlpha = a;
    ctx.drawImage(sprite, w.trail[i] + ox - ts, w.trail[i + 1] + oy - ts, ts * 2, ts * 2);
  }
  ctx.globalAlpha = (0.7 + breath * 0.25) * fade;
  ctx.drawImage(sprite, w.x + ox - s * 2, w.y + oy - s * 2, s * 4, s * 4);
  ctx.globalAlpha = 1;
}

export function wispInfo() { return w ? { x: w.x, y: w.y, mode: w.mode, age: w.age } : null; }
