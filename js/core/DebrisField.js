// ─── DebrisField ───
// One job: the bits of whatever was just eaten. They exist only during a bite.
// Each piece is that item's own sprite, cut by a painted shard mask (an image
// asset, composited once and cached). A bite starts inside the painted shadow,
// so the pieces hop out to the rim (the item's angle, just past shadowRadius)
// and ride that rim in the disk's direction for about half to three-quarters
// of a turn. They tighten, shrink and fade, and alpha is 0 as the footprint
// meets the shadow. Nothing is drawn over the black centre. Idle means no
// canvas calls.
//
// If the masks have not loaded, one piece is the whole sprite on that same
// rim. Still only that image. No code-drawn stand-in, no light streaks.

import { spriteFor } from "../art.js";
import { shadowRadius } from "../art/hole.js";

const CAP = 18;
const PER_BITE = 4;
const LIFE_MIN = 42;   // 0.7 s at 60 Hz
const LIFE_MAX = 60;   // 1.0 s
// Canvas y grows downward, so atan2 increases clockwise, which is also the
// way drawDisk's positive rotation carries the disk.
const TURN_MIN = Math.PI;        // half a turn
const TURN_MAX = Math.PI * 1.5;  // three quarters
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
        travel: TURN_MIN, slack0: 1, spin0: 0, spr: null, dw: 0, dh: 0,
        visAlpha: 0, whole: false
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

  /**
   * Park one piece on the rim at `ang`. The centre sits just outside the
   * painted shadow by about half the shard (its corner reach) plus a short
   * gap, so a bite that started inside the shadow still shows.
   */
  _arm(p, ang, dw, dh, still, shadowR, whole) {
    const zoom = this.state.zoom > 0 ? this.state.zoom : 1;
    const px = 1 / (zoom * (this.dpr || 1));
    const reach = 0.71 * dw;
    p.on = true;
    p.age = 0;
    p.life = still ? LIFE_MIN : LIFE_MIN + Math.floor(Math.random() * (LIFE_MAX - LIFE_MIN + 1));
    p.ang = ang;
    p.spin0 = ang;
    p.whole = whole;
    p.dw = dw;
    p.dh = dh;
    // Just outside the shadow: the corner reach, plus a hair so the first
    // frame is not already touching. That hair is the gap they close.
    const hop = Math.max(reach * 0.12, 2 * px);
    p.r0 = shadowR + reach + hop;
    p.rad = p.r0;
    p.slack0 = Math.max(px, hop);
    p.travel = (still ? TURN_MIN * 0.45 : TURN_MIN);
    p.visAlpha = 0;
    p.spr = null;
    this.live++;
    this.spawned++;
  }

  /** Where the piece is, and how strongly it draws, for the current age. */
  _pose(p, still) {
    const t = p.life > 0 ? Math.min(1, p.age / p.life) : 1;
    const sc = 1 - 0.46 * t;
    const shadowR = shadowRadius(this.state.radius, this.state.gulp, still);
    const radial = 0.71 * p.dw * sc;
    const touch = shadowR + radial;
    const remain = (1 - t) * (1 - 0.2 * t);
    const rad = touch + (p.r0 - touch) * remain;
    const slack = rad - shadowR - radial;
    const ageFade = t < 0.4 ? 1 : Math.pow((1 - t) / 0.6, 0.85);
    const zoom = this.state.zoom > 0 ? this.state.zoom : 1;
    const pad = 1.25 / (zoom * (this.dpr || 1));
    const alpha = slack <= pad ? 0 : Math.min(1, slack / p.slack0) * ageFade;
    return { sc, rad, alpha, radial };
  }

  /** Start pieces on the rim at the eaten item's angle. The entity can go. */
  spawn(e) {
    const state = this.state;
    const zoom = state.zoom > 0 ? state.zoom : 1;
    const px = Math.max(8, e.radius * zoom * (this.dpr || 1));
    const sp = spriteFor(e, px);
    const canvas = sp.c;
    if (!canvas || !canvas.width) return;
    const base = Math.atan2(e.y - state.playerY, e.x - state.playerX);
    const still = !!(state.settings && state.settings.reduceMotion);
    const shadowR = shadowRadius(state.radius, state.gulp, still);
    const item = Math.max(1, e.radius * 2);
    const minW = 6 / zoom;
    if (!this.masksReady) {
      const dw = Math.max(minW, item * 0.34);
      const p = this._free();
      this._arm(p, base, dw, dw, still, shadowR, true);
      p.spr = canvas;
      return;
    }
    const shards = this._shards(canvas);
    for (let i = 0; i < PER_BITE; i++) {
      const sh = shards[i];
      const frac = 0.25 + 0.15 * (i / (PER_BITE - 1));
      const dw = Math.max(minW, item * frac);
      const dh = dw * (sh.canvas.height / Math.max(1, sh.canvas.width));
      const p = this._free();
      // A short fan at the item's angle, wide enough that four pieces read apart.
      this._arm(p, base + (i - 1.5) * 0.36, dw, dh, still, shadowR, false);
      p.spr = sh.canvas;
      const u = i / (PER_BITE - 1);
      p.travel = still ? TURN_MIN * 0.45 : TURN_MIN + (TURN_MAX - TURN_MIN) * u;
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
    for (let i = 0; i < CAP; i++) {
      const p = this.pieces[i];
      if (!p.on) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.on = false;
        p.spr = null;
        p.visAlpha = 0;
        this.live--;
        this.finished++;
        continue;
      }
      p.ang += (p.travel / p.life) * dt;
      p.rad = this._pose(p, still).rad;
    }
  }

  /**
   * side -1: the far half, behind the hole. side +1: the near half, in front.
   * Idle, and anything already at the dark core, returns before any canvas call.
   */
  draw(ctx, hx, hy, side) {
    if (this.live <= 0) return;
    const still = !!(this.state.settings && this.state.settings.reduceMotion);
    // The far half is drawn first. Clear last frame's alphas once per frame.
    if (side === -1) {
      for (let i = 0; i < CAP; i++) this.pieces[i].visAlpha = 0;
    }
    for (let i = 0; i < CAP; i++) {
      const p = this.pieces[i];
      if (!p.on || !p.spr) continue;
      const below = Math.sin(p.ang) >= 0 ? 1 : -1;
      if (below !== side) continue;
      const pose = this._pose(p, still);
      p.rad = pose.rad;
      if (pose.alpha <= 0.02) continue;
      if (pose.rad - shadowRadius(this.state.radius, this.state.gulp, still) <= pose.radial) continue;
      const x = hx + Math.cos(p.ang) * pose.rad;
      const y = hy + Math.sin(p.ang) * pose.rad;
      const dw = p.dw * pose.sc;
      const dh = (p.dh || p.dw) * pose.sc;
      p.visAlpha = pose.alpha;
      this.draws++;
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = pose.alpha;
      ctx.translate(x, y);
      ctx.rotate(p.ang - p.spin0);
      ctx.drawImage(p.spr, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    }
  }
}
