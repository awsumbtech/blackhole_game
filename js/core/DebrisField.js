// ─── DebrisField ───
// One job: the bits of whatever was just eaten. They exist only during a bite.
// Each piece is that item's own sprite, cut by a soft shard mask (an image
// asset, composited once and cached). They start where the item was, spiral
// in, shrink, and fade out at the edge of the dark core. Nothing is drawn
// over the black centre. Idle means no canvas calls.

import { spriteFor } from "../art.js";

const CAP = 18;
const PER_BITE = 4;
const LIFE_MIN = 36;   // 0.6 s at 60 Hz
const LIFE_MAX = 60;   // 1.0 s
const SPIN = 0.028;
const SPIN_STILL = 0.01;
const MASKS = [1, 2, 3, 4].map(n => "assets/fx/shard_mask_" + n + ".png");

const shardCache = new WeakMap();

function load(src) {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  return img;
}

export class DebrisField {
  constructor(state) {
    this.state = state;
    this.dpr = 1;
    this.perBite = PER_BITE;
    this.lifeMin = LIFE_MIN;
    this.lifeMax = LIFE_MAX;
    this.masks = MASKS.map(load);
    this.pieces = new Array(CAP);
    for (let i = 0; i < CAP; i++) {
      this.pieces[i] = {
        on: false, age: 0, life: LIFE_MIN, ang: 0, rad: 0, r0: 0,
        core: 1, dir: 1, spin0: 0, spr: null, dw: 0
      };
    }
    this.live = 0;
    this.spawned = 0;
    this.finished = 0;
    this.draws = 0;
  }

  get masksReady() {
    return this.masks.every(m => m.complete && m.naturalWidth > 0);
  }

  /** Four soft shards of this sprite. Cached on the sprite canvas itself. */
  _shards(sprite) {
    const hit = shardCache.get(sprite);
    if (hit) return hit;
    const w = sprite.width, h = sprite.height;
    const out = [];
    for (let i = 0; i < PER_BITE; i++) {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d");
      g.drawImage(sprite, 0, 0);
      g.globalCompositeOperation = "destination-in";
      g.drawImage(this.masks[i], 0, 0, w, h);
      out.push(c);
    }
    shardCache.set(sprite, out);
    return out;
  }

  _free() {
    let oldest = this.pieces[0];
    for (let i = 0; i < CAP; i++) {
      const p = this.pieces[i];
      if (!p.on) return p;
      if (p.age > oldest.age) oldest = p;
    }
    if (oldest.on) { oldest.on = false; this.live--; this.finished++; }
    return oldest;
  }

  /** Start pieces at the eaten item. The entity can go. */
  spawn(e) {
    if (!this.masksReady) return;
    const state = this.state;
    const px = Math.max(8, e.radius * (state.zoom || 1) * (this.dpr || 1));
    const sp = spriteFor(e, px);
    const canvas = sp.c;
    if (!canvas || !canvas.width) return;
    const shards = this._shards(canvas);
    const dx = e.x - state.playerX;
    const dy = e.y - state.playerY;
    const dist = Math.hypot(dx, dy);
    const base = Math.atan2(dy, dx);
    const still = !!(state.settings && state.settings.reduceMotion);
    const core = state.radius;
    for (let i = 0; i < PER_BITE; i++) {
      const p = this._free();
      p.on = true;
      p.age = 0;
      p.life = still ? LIFE_MIN : LIFE_MIN + Math.floor(Math.random() * (LIFE_MAX - LIFE_MIN + 1));
      p.ang = base + (i - 1.5) * 0.2;
      p.core = core;
      p.r0 = dist;
      p.rad = dist;
      p.dir = i % 2 === 0 ? 1 : -1;
      p.spin0 = p.ang;
      p.spr = shards[i];
      p.dw = e.radius * 2;
      this.live++;
      this.spawned++;
    }
  }

  /** Drop every piece. Galaxy, Zen and collapse all call this via Galaxy.init. */
  clear() {
    for (let i = 0; i < CAP; i++) {
      this.pieces[i].on = false;
      this.pieces[i].spr = null;
    }
    this.live = 0;
  }

  update(dt, still) {
    if (dt <= 0 || this.live <= 0) return;
    const spin = still ? SPIN_STILL : SPIN;
    for (let i = 0; i < CAP; i++) {
      const p = this.pieces[i];
      if (!p.on) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.on = false;
        p.spr = null;
        this.live--;
        this.finished++;
        continue;
      }
      const k = 1 - p.age / p.life;
      const span = Math.max(0, p.r0 - p.core);
      p.rad = p.core + span * k * k;
      p.ang += spin * p.dir * dt;
    }
  }

  /**
   * side -1: the far half, behind the hole. side +1: the near half, in front.
   * Idle, and anything already at the dark core, returns before any canvas call.
   */
  draw(ctx, hx, hy, side) {
    if (this.live <= 0) return;
    for (let i = 0; i < CAP; i++) {
      const p = this.pieces[i];
      if (!p.on || !p.spr) continue;
      const below = Math.sin(p.ang) >= 0 ? 1 : -1;
      if (below !== side) continue;
      // Fully gone once the piece reaches the shadow. Near side included:
      // nothing is drawn over the black centre.
      if (p.rad <= p.core) continue;
      const span = Math.max(1, p.r0 - p.core);
      const near = (p.rad - p.core) / span;
      const approach = near < 0.22 ? near / 0.22 : 1;
      const t = p.age / p.life;
      const lifeFade = t < 0.8 ? 1 : (1 - t) / 0.2;
      const alpha = approach * lifeFade;
      if (alpha <= 0.02) continue;
      const sc = 0.35 + 0.65 * near;
      const x = hx + Math.cos(p.ang) * p.rad;
      const y = hy + Math.sin(p.ang) * p.rad;
      this.draws++;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.rotate(p.ang - p.spin0);
      ctx.drawImage(p.spr, -p.dw * sc / 2, -p.dw * sc / 2, p.dw * sc, p.dw * sc);
      ctx.restore();
    }
  }
}
