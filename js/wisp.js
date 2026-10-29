// ─── COMPANION WISP (v9.2 Growth Witness) ───
// Unlocked by lighting Companion on the constellation (after first collapse).
// Celebrates growth (tier/merge pulse + one soft post-merge hint), joy on big
// catches/finds, and in Zen stays beside the hole as the 4/6 breath guide.
// Skins and anim profiles plug in via setSkin / setAnim — no rewrite needed.

const TAU = Math.PI * 2;
const TRAIL_N = 16;

const DEFAULT_SKIN = {
  id: "classic",
  core: ["rgba(255, 255, 250, 1)", "rgba(255, 244, 205, 0.95)", "rgba(150, 235, 215, 0.38)", "rgba(120, 220, 200, 0)"],
  halo: ["rgba(170, 245, 225, 0.35)", "rgba(140, 220, 255, 0.12)", "rgba(140, 200, 255, 0)"],
  shade: ["rgba(4, 8, 18, 0.55)", "rgba(4, 8, 18, 0.25)", "rgba(4, 8, 18, 0)"],
  mote: ["rgba(255, 252, 230, 1)", "rgba(190, 250, 230, 0.5)", "rgba(160, 230, 220, 0)"],
  ray: "rgba(255, 250, 230, 0.3)"
};

const DEFAULT_ANIM = {
  id: "default",
  trailN: TRAIL_N,
  orbitSpin: 0.003,
  orbitSpinRest: 0.00165,
  joySpin: 0.012,
  mergeWiden: 0.55,   // extra orbit distance while mergePulse is hot
  mergePulseFade: 180 // frames (~3s) for widen/pulse settle
};

function makeRadial(size, stops) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (let i = 0; i < stops.length; i++) gr.addColorStop(i / (stops.length - 1), stops[i]);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}

export class Wisp {
  constructor() {
    this.unlocked = false;
    this.w = null;
    this.skin = { ...DEFAULT_SKIN };
    this.anim = { ...DEFAULT_ANIM };
    this.sprite = null;
    this.shade = null;
    this.halo = null;
    this.mote = null;
    this.hx = 0;
    this.hy = 0;
  }

  /** Permanent unlock (constellation Companion / save migrate). */
  unlock() {
    this.unlocked = true;
  }

  isActive() {
    return this.unlocked;
  }

  /** Sync from asc.perks.aw (load / migrate). */
  syncFromAsc(asc) {
    this.unlocked = !!(asc && asc.perks && asc.perks.aw);
  }

  setSkin(skin) {
    this.skin = { ...DEFAULT_SKIN, ...(skin || {}) };
    this.sprite = this.shade = this.halo = this.mote = null; // rebuild on next draw
  }

  setAnim(profile) {
    this.anim = { ...DEFAULT_ANIM, ...(profile || {}) };
  }

  reset(state) {
    if (!this.unlocked) { this.w = null; return; }
    const a = Math.random() * TAU;
    const d = state.radius * 3;
    this.w = {
      x: state.playerX + Math.cos(a) * d, y: state.playerY + Math.sin(a) * d,
      vx: 0, vy: 0, ang: a, mode: "follow", modeT: 0,
      target: null, trail: new Float64Array(this.anim.trailN || TRAIL_N), trailLen: 0, trailT: 0,
      age: 0, joy: 0, perk: 0,
      mergePulse: 0, orbitWiden: 0, postMergeHint: 0
    };
  }

  /**
   * Moments the wisp reacts to.
   * kind: "catch" | "discovery" | "tier" | "merge"
   */
  react(state, kind) {
    if (!this.unlocked || !this.w) return;
    const w = this.w;
    if (kind === "discovery") w.joy = 150;
    else if (kind === "catch") w.joy = 100;
    else if (kind === "tier" || kind === "merge") {
      w.mergePulse = 1;
      w.orbitWiden = 1;
      // One soft post-merge hint toward new-scale food (not in Zen)
      if (state.mode !== "zen") w.postMergeHint = 1;
    }
  }

  info() {
    const w = this.w;
    return w ? { x: w.x, y: w.y, mode: w.mode, age: w.age, joy: w.joy, perk: +w.perk.toFixed(2), mergePulse: w.mergePulse } : null;
  }

  _ensureSprites() {
    if (this.sprite) return;
    const sk = this.skin;
    this.sprite = makeRadial(64, sk.core);
    this.shade = makeRadial(64, sk.shade);
    this.mote = makeRadial(16, sk.mote);
    // Halo with soft rays
    const c = document.createElement("canvas");
    c.width = c.height = 96;
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(48, 48, 0, 48, 48, 48);
    gr.addColorStop(0, sk.halo[0]);
    gr.addColorStop(0.4, sk.halo[1]);
    gr.addColorStop(1, sk.halo[2]);
    g.fillStyle = gr; g.fillRect(0, 0, 96, 96);
    g.globalCompositeOperation = "lighter";
    g.translate(48, 48);
    for (let i = 0; i < 4; i++) {
      g.rotate(Math.PI / 4 + (i ? Math.PI / 2 - Math.PI / 4 : 0));
      const lg = g.createLinearGradient(0, 0, 44, 0);
      lg.addColorStop(0, sk.ray); lg.addColorStop(1, "rgba(255, 250, 230, 0)");
      g.fillStyle = lg; g.beginPath(); g.ellipse(22, 0, 22, 1.6, 0, 0, TAU); g.fill();
    }
    this.halo = c;
  }

  _homePoint(state) {
    const w = this.w;
    const zen = state.mode === "zen";
    const rest = !zen && state.biome && state.biome.breather;
    let d = zen ? Math.max(state.radius * 2.1, 20 / state.zoom)
      : Math.max(state.radius * (rest ? 1.9 : 2.6), (rest ? 17 : 22) / state.zoom);
    // Growth Witness: orbit widens calmly while mergePulse settles
    if (w.orbitWiden > 0.01) d *= 1 + this.anim.mergeWiden * w.orbitWiden;
    if (rest) d *= 1 + 0.18 * Math.sin(w.ang * 3);
    this.hx = state.playerX + Math.cos(w.ang) * d;
    this.hy = state.playerY + Math.sin(w.ang) * d * 0.8;
  }

  _findScaleHint(state) {
    // Prefer edible food near the player's new scale (not tiny crumbs, not too far)
    const R = state.radius, reach = Math.min(state.viewW, state.viewH) * 0.45;
    let best = null, bs = 0;
    for (const e of state.entities) {
      if (e.consuming || e.powerup || R <= e.radius * state.eatRatio) continue;
      // New-scale: at least ~35% of hole radius so it reads as "your size now"
      if (e.radius < R * 0.35) continue;
      const d = Math.hypot(e.x - state.playerX, e.y - state.playerY);
      if (d < R * 2.5 || d > reach) continue;
      const s = e.mass / (d + R);
      if (s > bs) { bs = s; best = e; }
    }
    return best;
  }

  update(state, dt, reduceMotion) {
    if (!this.unlocked) return;
    if (!this.w) this.reset(state);
    const w = this.w;
    w.age += dt;
    const rest = state.biome && state.biome.breather;
    const zen = state.mode === "zen";
    const anim = this.anim;

    if (w.joy > 0) w.joy = Math.max(0, w.joy - dt);
    if (w.mergePulse > 0) w.mergePulse = Math.max(0, w.mergePulse - dt / anim.mergePulseFade);
    if (w.orbitWiden > 0) w.orbitWiden = Math.max(0, w.orbitWiden - dt / anim.mergePulseFade);

    const spin = w.joy > 0 && !reduceMotion ? anim.joySpin * Math.min(1, w.joy / 40) : 0;
    // Merge: a slightly livelier orbit while the world opens
    const mergeSpin = w.mergePulse > 0 && !reduceMotion ? 0.004 * w.mergePulse : 0;
    w.ang += ((reduceMotion ? 0.0015 : anim.orbitSpin) * (rest ? 0.55 : 1) + spin + mergeSpin) * dt;

    this._homePoint(state);
    let gx = this.hx, gy = this.hy;

    // Discovery lean (never in Zen) — soft sixth sense, not the primary purpose
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
      w.mode = "follow"; w.target = null; w.postMergeHint = 0;
    } else if (w.postMergeHint) {
      // One soft hint after a layer merge — then back to follow (no spam tours)
      w.postMergeHint = 0;
      w.target = this._findScaleHint(state);
      if (w.target) { w.mode = "hint"; w.modeT = 0; }
    } else if (w.mode === "hint") {
      w.modeT += dt;
      const t = w.target;
      if (!t || t.consuming || !state.entities.includes(t) || w.modeT > 220 || w.perk > 0.3) {
        w.mode = "follow"; w.target = null;
      } else {
        const side = Math.max(t.radius * 1.8, 14 / state.zoom);
        gx = t.x + Math.cos(w.ang * 3) * side;
        gy = t.y + Math.sin(w.ang * 3) * side;
      }
    } else {
      w.mode = "follow"; w.target = null;
    }

    const k = (zen ? 0.014 : w.mode === "hint" ? 0.0035 : 0.006) * dt;
    w.vx += (gx - w.x) * k;
    w.vy += (gy - w.y) * k;
    const damp = Math.pow(0.9, dt);
    w.vx *= damp; w.vy *= damp;
    w.x += w.vx * dt; w.y += w.vy * dt;

    const far = Math.hypot(w.x - state.playerX, w.y - state.playerY);
    if (far > Math.max(state.viewW, state.viewH)) {
      this._homePoint(state); w.x = this.hx; w.y = this.hy; w.vx = w.vy = 0; w.trailLen = 0;
    }

    if (!reduceMotion) {
      w.trailT += dt;
      if (w.trailT >= 4) {
        w.trailT = 0;
        if (w.trailLen === (this.anim.trailN || TRAIL_N)) { w.trail.copyWithin(0, 2); w.trailLen -= 2; }
        w.trail[w.trailLen++] = w.x; w.trail[w.trailLen++] = w.y;
      }
    } else w.trailLen = 0;
  }

  draw(ctx, state, vw, vh, breath, reduceMotion) {
    if (!this.unlocked || !this.w) return;
    this._ensureSprites();
    const w = this.w;
    const z = state.zoom;
    const ox = vw / 2 - state.camX, oy = vh / 2 - state.camY;
    const rest = state.biome && state.biome.breather;
    const joyK = Math.min(1, w.joy / 40);
    const mergeK = w.mergePulse || 0;
    const px = (7 + Math.min(6, (state.tier || 0) * 0.5)) * (rest ? 0.85 : 1)
      * (1 + 0.3 * joyK + 0.2 * w.perk + 0.35 * mergeK);
    const zenB = state.mode === "zen";
    // Zen: 4 in / 6 out via breath. Merge: a calm brighter swell (not a flash).
    const pulse = zenB ? (reduceMotion ? 0.85 + breath * 0.35 : 0.7 + breath * 0.8)
      : reduceMotion ? 1 + 0.15 * mergeK
        : 0.85 + breath * 0.3 + w.perk * 0.12 * Math.sin(w.age * 0.08) + 0.25 * mergeK;
    const fade = Math.min(1, w.age / 120);
    const s = px * pulse / z;
    const n = w.trailLen;
    for (let i = 0; i < n; i += 2) {
      const a = (i / n) * 0.3 * fade;
      const ts = s * (0.4 + 0.5 * i / n);
      ctx.globalAlpha = a;
      ctx.drawImage(this.sprite, w.trail[i] + ox - ts, w.trail[i + 1] + oy - ts, ts * 2, ts * 2);
      if (!reduceMotion && i + 2 < n) {
        const k = i * 1.7 + w.age * 0.02;
        const mx = w.trail[i] + ox + Math.sin(k) * s * 0.9;
        const my = w.trail[i + 1] + oy + Math.cos(k * 1.3) * s * 0.9;
        const ms = s * 0.35;
        ctx.globalAlpha = a * 1.6;
        ctx.drawImage(this.mote, mx - ms, my - ms, ms * 2, ms * 2);
      }
    }
    ctx.globalAlpha = 0.8 * fade;
    ctx.drawImage(this.shade, w.x + ox - s * 3, w.y + oy - s * 3, s * 6, s * 6);
    ctx.globalAlpha = Math.min(1, (zenB ? 0.55 + breath * 0.45 : 0.7 + breath * 0.25 + 0.2 * mergeK)
      * (rest ? 0.8 : 1) + 0.25 * joyK + 0.2 * w.perk) * fade;
    const hs = s * 4.2;
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * 0.7;
    ctx.drawImage(this.halo, w.x + ox - hs, w.y + oy - hs, hs * 2, hs * 2);
    ctx.globalAlpha = ga;
    ctx.drawImage(this.sprite, w.x + ox - s * 2, w.y + oy - s * 2, s * 4, s * 4);
    ctx.globalAlpha = 1;
  }
}

// Thin module-level singleton for gradual migration of call sites
export const wisp = new Wisp();
export function resetWisp(state) { wisp.reset(state); }
export function updateWisp(state, dt, rm) { wisp.update(state, dt, rm); }
export function drawWisp(ctx, state, vw, vh, breath, rm) { wisp.draw(ctx, state, vw, vh, breath, rm); }
export function wispReact(state, kind) { wisp.react(state, kind); }
export function wispInfo() { return wisp.info(); }
