// ─── DebrisField ───
// One job: the bits of whatever was just eaten. They exist only during a bite.
// Each piece is a slice of that item's own cached sprite (a source rectangle),
// never a code-drawn shape. They spiral inward, shrink, fade, and are gone.
// Idle means nothing to draw: no pieces, and draw does not touch the canvas.

import { spriteFor } from "../art.js";

const CAP = 18;
const PER_BITE = 4;
const LIFE_MIN = 36;   // 0.6 s at 60 Hz
const LIFE_MAX = 60;   // 1.0 s
const SPIN = 0.028;
const SPIN_STILL = 0.01;

export class DebrisField {
  constructor(state) {
    this.state = state;
    this.dpr = 1;
    this.pieces = new Array(CAP);
    for (let i = 0; i < CAP; i++) {
      this.pieces[i] = {
        on: false, age: 0, life: LIFE_MIN, ang: 0, rad: 0, r0: 0,
        dir: 1, spin0: 0, spr: null,
        sx: 0, sy: 0, sw: 0, sh: 0, dw: 0, dh: 0
      };
    }
    this.live = 0;
    this.spawned = 0;
    this.finished = 0;
    this.draws = 0;
  }

  /** The painted pixels, split into four. Empty canvas padding is left out. */
  _rects(canvas) {
    const w = canvas.width, h = canvas.height;
    const data = canvas.getContext("2d").getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = 0, y1 = 0, any = false;
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        if (data[(y * w + x) * 4 + 3] < 20) continue;
        any = true;
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
    if (!any) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
    const hw = Math.max(1, Math.ceil((x1 - x0 + 1) / 2));
    const hh = Math.max(1, Math.ceil((y1 - y0 + 1) / 2));
    return [
      { sx: x0, sy: y0, sw: hw, sh: hh },
      { sx: x0 + hw, sy: y0, sw: Math.max(1, x1 - x0 + 1 - hw), sh: hh },
      { sx: x0, sy: y0 + hh, sw: hw, sh: Math.max(1, y1 - y0 + 1 - hh) },
      { sx: x0 + hw, sy: y0 + hh, sw: Math.max(1, x1 - x0 + 1 - hw), sh: Math.max(1, y1 - y0 + 1 - hh) }
    ];
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

  /** Cut the eaten item's sprite into pieces and start them falling. The entity can go. */
  spawn(e) {
    const state = this.state;
    const px = Math.max(8, e.radius * (state.zoom || 1) * (this.dpr || 1));
    const sp = spriteFor(e, px);
    const canvas = sp.c;
    if (!canvas || !canvas.width) return;
    const rects = this._rects(canvas);
    const dx = e.x - state.playerX;
    const dy = e.y - state.playerY;
    const still = !!(state.settings && state.settings.reduceMotion);
    const n = Math.min(PER_BITE, rects.length);
    for (let i = 0; i < n; i++) {
      const rec = rects[i];
      const p = this._free();
      const ox = ((rec.sx + rec.sw / 2) / canvas.width - 0.5) * e.radius * 2;
      const oy = ((rec.sy + rec.sh / 2) / canvas.height - 0.5) * e.radius * 2;
      let rad = Math.hypot(dx + ox, dy + oy);
      // The disk is wide. Start outside its bright core so the pieces read, then spiral in.
      const minR = state.radius * 2.6;
      if (rad < minR) rad = minR + i * state.radius * 0.22;
      p.on = true;
      p.age = 0;
      p.life = still ? LIFE_MIN : LIFE_MIN + Math.floor(Math.random() * (LIFE_MAX - LIFE_MIN + 1));
      p.ang = Math.atan2(dy + oy, dx + ox) + (i - 1.5) * 0.55;
      p.r0 = rad;
      p.rad = rad;
      p.dir = i % 2 === 0 ? 1 : -1;
      p.spin0 = p.ang;
      p.spr = canvas;
      p.sx = rec.sx; p.sy = rec.sy; p.sw = rec.sw; p.sh = rec.sh;
      const aspect = rec.sw / Math.max(1, rec.sh);
      const long = e.radius * 1.15;
      p.dw = aspect >= 1 ? long : long * aspect;
      p.dh = aspect >= 1 ? long / aspect : long;
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
      p.ang += spin * p.dir * dt;
      p.rad = p.r0 * k * k;
    }
  }

  /**
   * side -1: the far half, behind the hole. side +1: the near half, in front.
   * Idle returns before any canvas call.
   */
  draw(ctx, hx, hy, side) {
    if (this.live <= 0) return;
    let any = false;
    for (let i = 0; i < CAP; i++) {
      const p = this.pieces[i];
      if (!p.on || !p.spr) continue;
      const below = Math.sin(p.ang) >= 0 ? 1 : -1;
      if (below !== side) continue;
      const t = p.age / p.life;
      const k = 1 - t;
      const x = hx + Math.cos(p.ang) * p.rad;
      const y = hy + Math.sin(p.ang) * p.rad;
      const sc = 0.2 + 0.8 * k;
      const fade = k < 0.25 ? k / 0.25 : 1;
      const alpha = fade * (t < 0.72 ? 1 : (1 - t) / 0.28);
      if (alpha <= 0.01) continue;
      if (!any) { any = true; this.draws++; }
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.rotate(p.ang - p.spin0);
      ctx.drawImage(p.spr, p.sx, p.sy, p.sw, p.sh, -p.dw * sc / 2, -p.dh * sc / 2, p.dw * sc, p.dh * sc);
      ctx.restore();
    }
  }
}
