// ─── CometTail ───
// One job: a comet's painted plume follows the path that comet actually
// traveled, in the world. The player, the camera and the zoom are not part
// of the step. +x of the painting is the plume, so each slice is turned to
// the local trailing tangent. This file does not draw a new shape.

import { Theme } from "./Theme.js";

export class CometTail {
  static TAU = Math.PI * 2;
  static CAP = 64;
  static SLICES = 64;
  // Short wisps use fewer, wider slices so a joint is never a subpixel.
  // A real bend keeps enough slices to stay smooth.
  static MIN_SLICE = 3.6;
  static MIN_CURVE = 34;
  static MIN_GAP = 1.5;
  // Per frame-time (dt 1 = one 60Hz frame). A slower step than this keeps the
  // last heading. FOLLOW is how much of the new heading is taken in one frame.
  static HOLD = 0.06;
  static FOLLOW = 0.7;
  // Device pixels added to a chord when a rotated joint needs it.
  // Left at 0 unless a measured hairline asks for a fraction of a pixel.
  static PAD_PX = 0.5;

  static wrap(a) {
    a = (a + Math.PI) % CometTail.TAU;
    if (a < 0) a += CometTail.TAU;
    return a - Math.PI;
  }

  constructor(ang = 0) {
    this.ang = ang;
    this.have = false;
    this.aimed = false;
    this.sx = 0;
    this.sy = 0;
    this.xs = new Float64Array(CometTail.CAP);
    this.ys = new Float64Array(CometTail.CAP);
    this.head = 0;
    this.count = 0;
    this.speed = 0;
    this.phase = 0;
    this.span = 0;
    this.wobble = ang * 2.3 + 1.1;
    this.at = { x: 0, y: 0, ang: 0 };
    this.q0 = { x: 0, y: 0, ang: 0 };
    this.q1 = { x: 0, y: 0, ang: 0 };
    this.vx = new Float64Array(CometTail.SLICES + 1);
    this.vy = new Float64Array(CometTail.SLICES + 1);
    this.slices = 0;
  }

  /** Forget the last world position. A teleport must not aim the tail. */
  reset() {
    this.have = false;
    this.aimed = false;
    this.count = 0;
    this.head = 0;
    this.speed = 0;
  }

  /**
   * x, y: where the head is in the world. Steering, the camera and zoom do
   * not move this point, so they do not swing the tail. dt is frame-time.
   * A step longer than `limit` (the view diagonal, in world units) is a
   * respawn or a wrap: drop the path, do not spin toward it.
   * `still` freezes the billow phase (Reduce Motion). The path still records.
   */
  sample(x, y, dt = 1, limit = Infinity, still = false) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const frames = dt > 0 ? dt : 0;
    if (!still) this.phase += frames * 0.05;

    if (!this.have) {
      this.sx = x;
      this.sy = y;
      this.have = true;
      this.count = 1;
      this.head = 0;
      this.xs[0] = x;
      this.ys[0] = y;
      this.speed = 0;
      return;
    }

    const dx = x - this.sx;
    const dy = y - this.sy;
    const step = Math.hypot(dx, dy);
    if (step > limit) {
      this.count = 1;
      this.head = 0;
      this.xs[0] = x;
      this.ys[0] = y;
      this.speed = 0;
      this.sx = x;
      this.sy = y;
      return;
    }

    const inst = frames > 0 ? step / frames : 0;
    if (frames > 0) {
      const rate = inst >= this.speed ? 0.62 : 0.09;
      const take = 1 - Math.pow(1 - rate, frames);
      this.speed += (inst - this.speed) * take;
    }
    if (step >= CometTail.HOLD * frames && frames > 0) {
      const target = Math.atan2(-dy, -dx);
      if (!this.aimed) {
        this.ang = target;
        this.aimed = true;
      } else {
        const take = 1 - Math.pow(1 - CometTail.FOLLOW, frames);
        this.ang += CometTail.wrap(target - this.ang) * take;
      }
    }
    this._push(x, y);
    this.sx = x;
    this.sy = y;
  }

  /**
   * World point `dist` behind the head along the recorded wake.
   * `out` receives x, y and the local trailing angle. False when there is
   * no curve yet, so the caller can fall back to `ang`.
   */
  pointAt(dist, out) {
    if (!out || this.count < 2 || !Number.isFinite(dist)) return false;
    const rec = this._length();
    if (!(rec > 0.5)) return false;
    const d = dist <= 0 ? 0 : (dist < rec ? dist : rec);
    this._place(d, out);
    return true;
  }

  /**
   * Food comet. `variant` is 0 cyan or 1 silver. The plume's head sits on
   * the comet. `speed` is the caller's own step; the smoothed world step
   * wins when it is larger. `still` holds the billow. `consume` (0..1)
   * shrinks and fades the trail as the comet is eaten.
   */
  drawComet(ctx, x, y, r, alpha, color, rpx, speed, variant = 0, still = false, consume = 0) {
    const rows = Theme.comets.variants();
    if (!rows.length || !(alpha > 0) || !(r > 0)) return false;
    const row = rows[((variant % rows.length) + rows.length) % rows.length];
    const spr = Theme.comets.sprite(row.tail);
    if (!spr) return false;
    const real = Math.max(this.speed, speed || 0);
    let len = r * this._plume(real);
    let a = alpha * this._presence(real);
    if (consume > 0) {
      const k = Math.pow(Math.max(0, 1 - Math.min(1, consume)), 1.6);
      len *= k;
      a *= k;
    }
    return this._ribbon(ctx, x, y, spr, len, a, r, !!still);
  }

  /**
   * A painted plume the caller already resolved. +x trails along the path.
   * `r` sizes the billow. Omit it and the length is read as 7.2 radii.
   */
  drawPainted(ctx, x, y, spr, len, alpha, still = false, r = len / 7.2) {
    if (!spr || !spr.ok || !(len > 0) || !(alpha > 0)) return false;
    const radius = r > 0 ? r : len / 7.2;
    return this._ribbon(ctx, x, y, spr, len, alpha, radius, !!still);
  }

  _plume(s) {
    const v = s > 0 ? s : 0;
    if (v <= 0.05) return 2.7;
    if (v < 0.6) return 2.7 + (v - 0.05) / 0.55 * (7.8 - 2.7);
    if (v < 1.2) return 7.8 + (v - 0.6) / 0.6 * (11.2 - 7.8);
    if (v < 1.6) return 11.2 + (v - 1.2) / 0.4 * (14.2 - 11.2);
    return Math.min(16.4, 14.2 + (v - 1.6) * 1.15);
  }

  _presence(s) {
    const v = s > 0 ? s : 0;
    if (v <= 0.05) return 0.42;
    if (v >= 0.6) return 0.92;
    return 0.42 + (0.92 - 0.42) * ((v - 0.05) / 0.55);
  }

  _gap() {
    const parts = CometTail.CAP - 2;
    const want = this.span > CometTail.MIN_GAP * parts ? this.span / parts : CometTail.MIN_GAP;
    return want > CometTail.MIN_GAP ? want : CometTail.MIN_GAP;
  }

  _push(x, y) {
    const cap = CometTail.CAP;
    if (this.count < 1) {
      this.head = 0;
      this.count = 1;
      this.xs[0] = x;
      this.ys[0] = y;
      return;
    }
    if (this.count === 1) {
      const d = Math.hypot(x - this.xs[this.head], y - this.ys[this.head]);
      if (!(d > 0)) {
        this.xs[this.head] = x;
        this.ys[this.head] = y;
        return;
      }
      this.head = (this.head + 1) % cap;
      this.count = 2;
      this.xs[this.head] = x;
      this.ys[this.head] = y;
      return;
    }
    this.xs[this.head] = x;
    this.ys[this.head] = y;
    const prev = (this.head - 1 + cap) % cap;
    if (Math.hypot(x - this.xs[prev], y - this.ys[prev]) >= this._gap()) {
      this.head = (this.head + 1) % cap;
      if (this.count < cap) this.count++;
      this.xs[this.head] = x;
      this.ys[this.head] = y;
    }
  }

  _length() {
    const cap = CometTail.CAP;
    let n = 0;
    let idx = this.head;
    for (let k = 0; k < this.count - 1; k++) {
      const prev = (idx - 1 + cap) % cap;
      n += Math.hypot(this.xs[prev] - this.xs[idx], this.ys[prev] - this.ys[idx]);
      idx = prev;
    }
    return n;
  }

  /** Point `dist` behind the head. Past the recorded curve, extend on the oldest tangent. */
  _place(dist, out) {
    out.x = this.xs[this.head];
    out.y = this.ys[this.head];
    out.ang = this.ang;
    if (!(dist > 0) || this.count < 2) return;
    const cap = CometTail.CAP;
    let remain = dist;
    let idx = this.head;
    const last = this.count - 1;
    for (let k = 0; k < last; k++) {
      const prev = (idx - 1 + cap) % cap;
      const dx = this.xs[prev] - this.xs[idx];
      const dy = this.ys[prev] - this.ys[idx];
      const seg = Math.hypot(dx, dy);
      if (seg > 1e-6) {
        if (remain <= seg) {
          const t = remain / seg;
          out.x = this.xs[idx] + dx * t;
          out.y = this.ys[idx] + dy * t;
          out.ang = Math.atan2(dy, dx);
          return;
        }
        remain -= seg;
      }
      idx = prev;
    }
    const oldest = idx;
    const newer = (oldest + 1) % cap;
    let dx = this.xs[oldest] - this.xs[newer];
    let dy = this.ys[oldest] - this.ys[newer];
    const seg = Math.hypot(dx, dy) || 1;
    out.x = this.xs[oldest] + dx / seg * remain;
    out.y = this.ys[oldest] + dy / seg * remain;
    out.ang = Math.atan2(dy, dx);
  }

  /** Painted columns from the manifest. Missing value uses the whole picture. */
  _inkEnd(spr) {
    const raw = spr.inkEndPx > 0 ? spr.inkEndPx : spr.w;
    if (!(raw > 1)) return spr.w > 1 ? spr.w : 1;
    return raw < spr.w ? raw : spr.w;
  }

  /** Fewer slices on a short or straight wisp. A bend keeps a silky count. */
  _countSlices(active, reach) {
    let curved = false;
    if (this.count >= 3 && reach > 2) {
      this._place(Math.min(reach * 0.18, 4), this.q0);
      this._place(reach * 0.82, this.q1);
      curved = Math.abs(CometTail.wrap(this.q1.ang - this.q0.ang)) > 0.45;
    }
    const minW = CometTail.MIN_SLICE > 0.4 ? CometTail.MIN_SLICE : 2.6;
    let n = Math.ceil(active / minW);
    if (curved) {
      const floor = CometTail.MIN_CURVE > 8 ? CometTail.MIN_CURVE : 36;
      if (n < floor) n = floor;
    }
    if (n < 4) n = 4;
    if (n > CometTail.SLICES) n = CometTail.SLICES;
    return n;
  }

  /**
   * Draw-space point `dist` behind the head. Negative dist is the short
   * lead-in in front of the pivot. Billow is a function of distance only,
   * so the two slices that share a vertex land on the same point.
   */
  _along(dist, x, y, reach, r, still, out) {
    let tang;
    let px;
    let py;
    if (!(dist > 0) || this.count < 2) {
      tang = this.ang;
      const c = Math.cos(tang);
      const s = Math.sin(tang);
      px = x + c * dist;
      py = y + s * dist;
    } else {
      this._place(dist, this.at);
      tang = this.at.ang;
      px = x + (this.at.x - this.sx);
      py = y + (this.at.y - this.sy);
    }
    let amp = 0;
    if (!still && dist > 0 && reach > 0) {
      const t = dist < reach ? dist / reach : 1;
      amp = Math.sin(this.phase - t * 4.5 + this.wobble) * Math.pow(t, 1.6) * r * 0.25;
    }
    const c = Math.cos(tang);
    const s = Math.sin(tang);
    out.x = px - s * amp;
    out.y = py + c * amp;
    out.ang = tang;
  }

  _ribbon(ctx, x, y, spr, len, alpha, r, still) {
    if (!spr || !spr.ok || !(len > 0) || !(alpha > 0) || !(spr.w > 0) || !(spr.h > 0)) return false;
    const sw0 = spr.w;
    const sh0 = spr.h;
    const pivotX = spr.pivot[0];
    const ay = spr.pivot[1] / sh0;
    const srcEnd = this._inkEnd(spr);
    let active = len;
    if (this.count >= 2) {
      const recorded = this._length();
      if (recorded > 0.5) {
        const grown = Math.max(r * 2.2, recorded * 1.15);
        active = Math.min(len, grown);
      }
    }
    if (!(active > 0.4)) return false;
    this.span = len;

    const reach = ((srcEnd - pivotX) / sw0) * active;
    const N = this._countSlices(active, reach);
    this.slices = N;
    const baseH = active * (sh0 / sw0);
    let pad = 0;
    if (CometTail.PAD_PX > 0 && ctx.getTransform) {
      const m = ctx.getTransform();
      const s = Math.hypot(m.a, m.b);
      if (s > 1e-6) pad = CometTail.PAD_PX / s;
    }
    let headSlice = 0;
    for (let i = 0; i < N; i++) {
      const sx0 = srcEnd * i / N;
      const sx1 = srcEnd * (i + 1) / N;
      if (sx0 <= pivotX && pivotX < sx1) headSlice = i;
    }
    const hc = Math.cos(this.ang);
    const hs = Math.sin(this.ang);
    for (let i = 0; i <= N; i++) {
      const sx = srcEnd * i / N;
      const dist = ((sx - pivotX) / sw0) * active;
      if (i <= headSlice + 1) {
        this.vx[i] = x + hc * dist;
        this.vy[i] = y + hs * dist;
      } else {
        this._along(dist, x, y, reach, r, still, this.q0);
        this.vx[i] = this.q0.x;
        this.vy[i] = this.q0.y;
      }
    }

    let any = false;
    for (let n = 0; n < N; n++) {
      const i = n === 0 ? headSlice : (n <= headSlice ? n - 1 : n);
      const sx0 = srcEnd * i / N;
      const sx1 = srcEnd * (i + 1) / N;
      const sww = sx1 - sx0;
      if (!(sww > 0)) continue;
      const x0 = this.vx[i];
      const y0 = this.vy[i];
      const x1 = this.vx[i + 1];
      const y1 = this.vy[i + 1];
      const dx = x1 - x0;
      const dy = y1 - y0;
      const segLen = Math.hypot(dx, dy);
      if (!(segLen > 1e-4)) continue;
      const tMid = (i + 0.5) / N;
      const taper = 1 - 0.45 * Math.pow(tMid, 1.15);
      const drawH = baseH * taper;
      let fade = 1;
      if (tMid > 0.78) {
        const u = (tMid - 0.78) / 0.22;
        fade = 1 - u * u * 0.45;
      }
      const a = alpha * fade;
      let drawW = segLen + pad;
      let ang = Math.atan2(dy, dx);
      let mx = (x0 + x1) / 2;
      let my = (y0 + y1) / 2;
      let destX = -drawW / 2;
      if (i === headSlice) {
        const d0 = ((sx0 - pivotX) / sw0) * active;
        const span = ((sx1 - pivotX) / sw0) * active - d0;
        drawW = (span > 1e-4 ? span : segLen) + pad;
        ang = this.ang;
        mx = x;
        my = y;
        destX = d0 - pad / 2;
      }
      if (!(a > 0.015) || !(drawW > 0) || !(drawH > 0)) continue;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(ang);
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = a;
      if (Theme.comets.blitSlice(ctx, spr, sx0, 0, sww, sh0, destX, -ay * drawH, drawW, drawH)) any = true;
      ctx.restore();
    }
    return any;
  }
}
