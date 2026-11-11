// ─── Absorption (v9.7) ───
// One job: a short-lived spiral for one eaten thing. The thing's own sprite
// stretches toward the hole (tidal stretch is a transform) with the supplied
// streak behind it, then the slot turns off. Nothing stays around the hole.
// A fixed pool: eating does not allocate.

import { spriteFor } from "../art.js";

const POOL = 24;
const LIFE = 46;
const LIFE_BIG = 62;
const LIFE_STILL = 30;
const SPIN = 0.05;
const SPIN_STILL = 0.012;

export class Absorption {
  constructor(state) {
    this.state = state;
    this.dpr = 1;
    this.streak = new Image();
    this.streak.decoding = "async";
    this.streak.src = "assets/absorb_streak.png";
    this.slots = new Array(POOL);
    for (let i = 0; i < POOL; i++) {
      this.slots[i] = {
        on: false, age: 0, life: LIFE, ang: 0, r0: 1, rad: 1,
        dir: 1, d: 1, spr: null
      };
    }
    this.live = 0;
    this.spawned = 0;
    this.finished = 0;
    this._dir = 1;
  }

  /** Snapshot the eaten entity and start its fall. The entity can be removed. */
  spawn(e) {
    const state = this.state;
    let slot = null;
    let oldest = this.slots[0];
    for (let i = 0; i < POOL; i++) {
      const s = this.slots[i];
      if (!s.on) { slot = s; break; }
      if (s.age > oldest.age) oldest = s;
    }
    if (!slot) {
      slot = oldest;
      if (slot.on) { slot.on = false; this.live--; this.finished++; }
    }
    const dx = e.x - state.playerX;
    const dy = e.y - state.playerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const px = Math.max(8, e.radius * (state.zoom || 1) * (this.dpr || 1));
    const sp = spriteFor(e, px);
    const still = !!(state.settings && state.settings.reduceMotion);
    slot.on = true;
    slot.age = 0;
    slot.life = still ? LIFE_STILL : (e.bigFish ? LIFE_BIG : LIFE);
    slot.ang = Math.atan2(dy, dx);
    slot.r0 = dist > 1 ? dist : state.radius * 1.4;
    slot.rad = slot.r0;
    slot.dir = this._dir;
    this._dir = -this._dir;
    slot.d = sp.k * e.radius;
    slot.spr = sp.c;
    this.live++;
    this.spawned++;
  }

  update(dt, still) {
    if (dt <= 0 || this.live <= 0) return;
    const spin = still ? SPIN_STILL : SPIN;
    for (let i = 0; i < POOL; i++) {
      const s = this.slots[i];
      if (!s.on) continue;
      s.age += dt;
      if (s.age >= s.life) {
        s.on = false;
        s.spr = null;
        this.live--;
        this.finished++;
        continue;
      }
      const k = 1 - s.age / s.life;
      s.ang += spin * s.dir * dt;
      s.rad = s.r0 * k * k;
    }
  }

  /**
   * side -1: above the hole (behind the shadow). side +1: below it.
   * hx/hy are the hole in the same world space as the rest of the frame.
   */
  draw(ctx, hx, hy, side) {
    if (this.live <= 0) return;
    const streak = this.streak;
    const streakOk = streak.complete && streak.naturalWidth > 0;
    for (let i = 0; i < POOL; i++) {
      const s = this.slots[i];
      if (!s.on || !s.spr) continue;
      const below = Math.sin(s.ang) >= 0 ? 1 : -1;
      if (below !== side) continue;
      const t = s.age / s.life;
      const x = hx + Math.cos(s.ang) * s.rad;
      const y = hy + Math.sin(s.ang) * s.rad;
      const stretch = 1 + t * 2.6;
      const thin = Math.max(0.2, 1 - t * 0.75);
      const fade = t < 0.78 ? 1 : (1 - t) / 0.22;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(s.ang);
      if (streakOk) {
        const len = s.d * (1.5 + t);
        const hh = s.d * 0.4;
        ctx.globalAlpha = (1 - t) * 0.8;
        ctx.drawImage(streak, 0, -hh / 2, len, hh);
      }
      ctx.globalAlpha = fade;
      ctx.scale(stretch, thin);
      ctx.drawImage(s.spr, -s.d / 2, -s.d / 2, s.d, s.d);
      ctx.restore();
    }
  }
}
