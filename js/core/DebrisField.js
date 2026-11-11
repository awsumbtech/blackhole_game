// ─── DebrisField ───
// One job: the bits of whatever was just eaten. They exist only during a bite.
// Each piece is that item's own sprite, cut by a painted shard mask (an image
// asset, composited once and cached). They start where the item was, spiral
// in, shrink, and fade out before their footprint crosses the painted shadow.
// Nothing is drawn over the black centre. Idle means no canvas calls.
//
// If the masks have not loaded, or the item is already inside the shadow
// (no room to travel), one piece is the whole sprite: it shrinks and fades
// in place. Still only that image. No code-drawn stand-in.

import { spriteFor } from "../art.js";
import { shadowRadius } from "../art/hole.js";

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

  /** Opaque box of a mask image, measured once. */
  _maskBox(mask) {
    if (mask._box) return mask._box;
    const c = document.createElement("canvas");
    c.width = mask.naturalWidth;
    c.height = mask.naturalHeight;
    const g = c.getContext("2d");
    g.drawImage(mask, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (data[(y * c.width + x) * 4 + 3] < 8) continue;
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
    if (x1 < x0) { x0 = 0; y0 = 0; x1 = c.width - 1; y1 = c.height - 1; }
    mask._box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, mw: c.width, mh: c.height };
    return mask._box;
  }

  /** Painted bounds of a sprite, measured once and kept on the canvas. */
  _spriteBox(sprite) {
    if (sprite._box) return sprite._box;
    const c = document.createElement("canvas");
    c.width = sprite.width;
    c.height = sprite.height;
    const g = c.getContext("2d");
    g.drawImage(sprite, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0, any = false;
    for (let y = 0; y < c.height; y += 2) {
      for (let x = 0; x < c.width; x += 2) {
        if (data[(y * c.width + x) * 4 + 3] < 16) continue;
        any = true;
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
    if (!any) { x0 = 0; y0 = 0; x1 = c.width - 1; y1 = c.height - 1; }
    sprite._box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    return sprite._box;
  }

  /** Four soft shards, cropped to each mask. Cached on the sprite canvas. */
  _shards(sprite) {
    const hit = shardCache.get(sprite);
    if (hit) return hit;
      const w = sprite.width, h = sprite.height;
      const body = this._spriteBox(sprite);
      const out = [];
      for (let i = 0; i < PER_BITE; i++) {
      const mask = this.masks[i];
      const box = this._maskBox(mask);
      const full = document.createElement("canvas");
      full.width = w;
      full.height = h;
      const fg = full.getContext("2d");
      fg.drawImage(sprite, 0, 0);
      fg.globalCompositeOperation = "destination-in";
      // Lay the mask over one quarter of the painted body, not the empty padding.
      const qw = body.w / 2, qh = body.h / 2;
      const qx = body.x + (i % 2) * qw, qy = body.y + ((i / 2) | 0) * qh;
      fg.drawImage(mask, qx, qy, qw, qh);
      const sx = Math.max(0, Math.floor(qx + box.x / box.mw * qw));
      const sy = Math.max(0, Math.floor(qy + box.y / box.mh * qh));
      const sw = Math.max(1, Math.ceil(box.w / box.mw * qw));
      const sh = Math.max(1, Math.ceil(box.h / box.mh * qh));
      const c = document.createElement("canvas");
      c.width = sw;
      c.height = sh;
      c.getContext("2d").drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
      out.push({ canvas: c, ox: (sx + sw / 2) / w - 0.5, oy: (sy + sh / 2) / h - 0.5, fw: sw / w, fh: sh / h });
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

  _arm(p, e, dx, dy, still, whole) {
    const state = this.state;
    const dist = Math.hypot(dx, dy);
    p.on = true;
    p.age = 0;
    p.life = still ? LIFE_MIN : LIFE_MIN + Math.floor(Math.random() * (LIFE_MAX - LIFE_MIN + 1));
    p.ang = Math.atan2(dy, dx);
    p.core = state.radius;
    p.r0 = dist;
    p.rad = dist;
    p.whole = whole;
    p.dir = 1;
    p.spin0 = p.ang;
    p.dw = e.radius * 2;
    p.dh = e.radius * 2;
    this.live++;
    this.spawned++;
  }

  /** Start pieces at the eaten item. The entity can go. */
  spawn(e) {
    const state = this.state;
    const px = Math.max(8, e.radius * (state.zoom || 1) * (this.dpr || 1));
    const sp = spriteFor(e, px);
    const canvas = sp.c;
    if (!canvas || !canvas.width) return;
    const dx = e.x - state.playerX;
    const dy = e.y - state.playerY;
    const still = !!(state.settings && state.settings.reduceMotion);
    const shadowR = shadowRadius(state.radius, state.gulp, still);
    // Room outside the painted shadow. Zero means the whole item is already inside it.
    const span = Math.hypot(dx, dy) + e.radius - shadowR;
    if (!this.masksReady || span <= 0) {
      const p = this._free();
      this._arm(p, e, dx, dy, still, true);
      p.spr = canvas;
      p.dir = 1;
      return;
    }
    const shards = this._shards(canvas);
    for (let i = 0; i < PER_BITE; i++) {
      const sh = shards[i];
      const ox = sh.ox * e.radius * 2;
      const oy = sh.oy * e.radius * 2;
      const p = this._free();
      this._arm(p, e, dx + ox, dy + oy, still, false);
      p.spr = sh.canvas;
      p.dw = e.radius * 2 * sh.fw;
      p.dh = e.radius * 2 * sh.fh;
      p.dir = i % 2 === 0 ? 1 : -1;
      p.spin0 = p.ang;
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
      const shadowR = shadowRadius(this.state.radius, this.state.gulp, still);
      const span = p.r0 - shadowR;
      // No room to travel: hold the start distance and let draw shrink the sprite.
      p.rad = span <= 0 ? p.r0 : shadowR + span * k * k;
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
      const t = p.age / p.life;
      const lifeFade = p.whole ? (1 - t) : (t < 0.8 ? 1 : (1 - t) / 0.2);
      let sc = p.whole ? Math.max(0.05, 1 - t) : 0.35 + 0.65 * (1 - t);
      const shadowR = shadowRadius(this.state.radius, this.state.gulp, !!(this.state.settings && this.state.settings.reduceMotion));
      // Whole footprint, including a rotated corner (0.71 of the drawn width).
      // Alpha is 0 when rad - shadowR <= 0.71*dw*sc. If the piece is still
      // outside the shadow, shrink it until that is true rather than covering the core.
      const room = p.rad - shadowR;
      if (room <= 0) continue;
      const maxSc = room / (0.71 * p.dw);
      if (maxSc < 0.08) continue;
      if (sc > maxSc * 0.96) sc = maxSc * 0.96;
      if (p.rad - shadowR <= 0.71 * p.dw * sc) continue;
      const edgeFade = Math.min(1, room / (shadowR * 0.16));
      const alpha = edgeFade * lifeFade;
      if (alpha <= 0.02) continue;
      const x = hx + Math.cos(p.ang) * p.rad;
      const y = hy + Math.sin(p.ang) * p.rad;
      const dw = p.dw * sc;
      const dh = (p.dh || p.dw) * sc;
      this.draws++;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.rotate(p.ang - p.spin0);
      ctx.drawImage(p.spr, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    }
  }
}
