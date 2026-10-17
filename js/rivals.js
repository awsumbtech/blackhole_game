import { rivalSprite } from "./art.js";
const hypot = (x, y) => Math.sqrt(x * x + y * y);   // 2-arg Math.hypot without the varargs cost
// ─── RIVAL HOLES (v7 Ascension depth) ───
// From Galaxy 3 of a run, a few calm rival black holes drift through space.
// They wander toward food and quietly eat it, so food feels sparser. If you
// bump one while it's bigger, it just eases you aside (no loss, no shake).
// Outgrow one and it becomes the best catch in the galaxy.
// Like every mechanic they follow you: one left far behind reappears ahead.

const TAU = Math.PI * 2;
const RESPAWN = 2400;   // ~40s after you swallow one

function vr(state) { return hypot(state.viewW || 800, state.viewH || 600) / 2; }

function place(state, rv) {
  const sp = hypot(state.playerVX || 0, state.playerVY || 0);
  const heading = sp > 0.2 ? Math.atan2(state.playerVY, state.playerVX) : Math.random() * TAU;
  const a = heading + (Math.random() - 0.5) * 2.4;
  const d = vr(state) * (1.15 + Math.random() * 0.5);
  rv.x = state.playerX + Math.cos(a) * d;
  rv.y = state.playerY + Math.sin(a) * d;
  rv.vx = rv.vy = 0;
  rv.fade = 0;
}

export function initRivals(state, n, sizeK) {
  state.rivals = [];
  for (let i = 0; i < n; i++) {
    const rv = { r: state.radius * sizeK * (0.9 + Math.random() * 0.25), sizeK, phase: Math.random() * TAU, target: null, wait: i * 900, gone: 0, x: 0, y: 0, vx: 0, vy: 0, fade: 0, pick: 0 };
    place(state, rv);
    state.rivals.push(rv);
  }
}

/** Returns a rival you just swallowed (or null). */
export function updateRivals(state, dt, onSwallow) {
  const rs = state.rivals;
  if (!rs || !rs.length) return;
  const V = vr(state), R = state.radius, ss = state.speedScale || 1;
  const calm = state.ascMods && state.ascMods.rivalCalm;
  for (const rv of rs) {
    if (rv.gone > 0) {
      rv.gone -= dt;
      if (rv.gone <= 0) { rv.r = R * rv.sizeK; place(state, rv); }
      continue;
    }
    if (rv.wait > 0) { rv.wait -= dt; continue; }
    rv.fade = Math.min(1, rv.fade + dt / 120);
    rv.phase += 0.004 * dt;
    const pdx = state.playerX - rv.x, pdy = state.playerY - rv.y, pd = hypot(pdx, pdy) || 1;
    if (pd > V * 2.6) { place(state, rv); continue; }
    // Wander toward the nearest food it can eat (re-pick now and then)
    rv.pick -= dt;
    if (rv.pick <= 0 || (rv.target && (rv.target.consumed || rv.target.consuming))) {
      rv.pick = 45;
      let best = null, bd = V * 1.3;
      for (const e of state.entities) {
        if (e.consuming || e.powerup || e.radius > rv.r * 0.8) continue;
        const d = hypot(e.x - rv.x, e.y - rv.y);
        if (d < bd) { bd = d; best = e; }
      }
      rv.target = best;
    }
    let ax = 0, ay = 0;
    if (rv.target) {
      const dx = rv.target.x - rv.x, dy = rv.target.y - rv.y, d = hypot(dx, dy) || 1;
      ax = dx / d; ay = dy / d;
    } else { ax = Math.cos(rv.phase * 0.3); ay = Math.sin(rv.phase * 0.3); }
    // Still Water perk: rivals keep their distance from you
    if (calm && pd < R * 4 + rv.r * 2) { ax -= pdx / pd * 1.5; ay -= pdy / pd * 1.5; }
    const sp = 0.32 * Math.sqrt(ss);
    rv.vx += (ax * sp - rv.vx) * 0.02 * dt;
    rv.vy += (ay * sp - rv.vy) * 0.02 * dt;
    rv.x += rv.vx * dt; rv.y += rv.vy * dt;
    // It quietly eats small food it reaches
    for (const e of state.entities) {
      if (e.consuming || e.powerup || e.radius > rv.r * 0.8) continue;
      if (Math.abs(e.x - rv.x) > rv.r * 1.2 || Math.abs(e.y - rv.y) > rv.r * 1.2) continue;
      if (hypot(e.x - rv.x, e.y - rv.y) < rv.r * 1.05) {
        e.consumed = true;
        rv.r = Math.min(rv.r * 1.004, R * rv.sizeK * 1.6);
      }
    }
    // You and a rival
    const touch = pd < R + rv.r * 0.85;
    if (!touch) continue;
    if (R > rv.r * state.eatRatio) {
      rv.gone = RESPAWN;
      rv.sizeK *= 1.15;   // the next one is a little bigger
      onSwallow?.(rv);
    } else {
      // A soft ease apart, never a shove
      const push = (calm ? 0.25 : 0.7) * Math.sqrt(ss);
      state.playerVX -= pdx / pd * push * 0.12 * dt;
      state.playerVY -= pdy / pd * push * 0.12 * dt;
      state.worldHint?.("rival_first", "A rival hole. It drifts and eats too. Grow past it and it's yours.", 4200);
    }
  }
}

/** World-space draw (camera already applied via cam offsets). */
export function drawRivals(ctx, state, vw, vh, time, reduceMotion) {
  const rs = state.rivals;
  if (!rs || !rs.length) return;
  const ox = vw / 2 - state.camX, oy = vh / 2 - state.camY;
  const R = state.radius, zoomPx = (state.zoom || 1) * (window.devicePixelRatio || 1);
  for (const rv of rs) {
    if (rv.gone > 0 || rv.wait > 0) continue;
    const x = rv.x + ox, y = rv.y + oy, r = rv.r;
    if (x < -r * 4 || y < -r * 4 || x > vw + r * 4 || y > vh + r * 4) continue;
    const a = rv.fade || 0;
    const edible = R > r * state.eatRatio;
    // v8.1: a painted violet hole with its own disk and lensed arc (gold once you've outgrown it)
    const sp = rivalSprite(r * zoomPx, edible);
    const d = sp.k * r;
    ctx.globalAlpha = a * (reduceMotion ? 1 : 0.92 + 0.08 * Math.sin(rv.phase * 2));
    ctx.drawImage(sp.c, x - d / 2, y - d / 2, d, d);
    ctx.globalAlpha = 1;
  }
}
