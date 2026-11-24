// ─── CometTail ───
// One job: a comet's painted plume follows the path that comet actually
// traveled, in the world. The player, the camera and the zoom are not part
// of the step. +x of the painting is the plume, so each slice is turned to
// the local trailing tangent. This file does not draw a new shape.

import { Theme } from "./Theme.js";

export class CometTail {
  static TAU = Math.PI * 2;
  static CAP = 64;
  static SLICES = 17;
  static MIN_GAP = 1.5;
  // Per frame-time (dt 1 = one 60Hz frame). A slower step than this keeps the
  // last heading. FOLLOW is how much of the new heading is taken in one frame.
  static HOLD = 0.06;
  static FOLLOW = 0.7;
  static OVERLAP = 1.05;

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

  /** A painted plume the caller already resolved. +x trails along the path. */
  drawPainted(ctx, x, y, spr, len, alpha, still = false) {
    if (!spr || !spr.ok || !(len > 0) || !(alpha > 0)) return false;
    const r = len / 7.2;
    return this._ribbon(ctx, x, y, spr, len, alpha, r, !!still);
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

  _ribbon(ctx, x, y, spr, len, alpha, r, still) {
    if (!spr || !spr.ok || !(len > 0) || !(alpha > 0) || !(spr.w > 0) || !(spr.h > 0)) return false;
    const sw0 = spr.w;
    const sh0 = spr.h;
    const pivotX = spr.pivot[0];
    const ay = spr.pivot[1] / sh0;
    let active = len;
    let curved = false;
    if (this.count >= 2) {
      const recorded = this._length();
      if (recorded > 0.5) {
        const grown = Math.max(r * 2.2, recorded * 1.15);
        active = Math.min(len, grown);
        curved = true;
      }
    }
    if (!(active > 0.4)) return false;
    this.span = len;

    const N = CometTail.SLICES;
    const baseH = active * (sh0 / sw0);
    let any = false;
    // Head slice first. Angle checks keep the draw closest to the head, and
    // when several slices share that image's shape the earliest one wins.
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const sx0 = sw0 * i / N;
      const sx1 = i === N - 1 ? sw0 : sw0 * (i + 1) / N;
      const sww = sx1 - sx0;
      if (!(sww > 0)) continue;
      const nom = (sww / sw0) * active;
      const drawW = nom * CometTail.OVERLAP;
      const pad = nom * ((CometTail.OVERLAP - 1) * 0.5);
      const dLeft = ((sx0 - pivotX) / sw0) * active;
      const dAnchor = dLeft > 0 ? dLeft : 0;
      let ax;
      let ayw;
      let ang;
      if (!curved) {
        ang = this.ang;
        ax = x + Math.cos(ang) * dAnchor;
        ayw = y + Math.sin(ang) * dAnchor;
      } else if (dAnchor <= 0) {
        ang = this.ang;
        ax = x;
        ayw = y;
      } else {
        this._place(dAnchor, this.at);
        ax = x + (this.at.x - this.sx);
        ayw = y + (this.at.y - this.sy);
        ang = this.at.ang;
      }
      if (i > 0 && !still && dAnchor > 0) {
        const amp = Math.sin(this.phase - t * 4.5 + this.wobble) * Math.pow(t, 1.6) * r * 0.25;
        ax += -Math.sin(ang) * amp;
        ayw += Math.cos(ang) * amp;
      }
      const taper = 1 - 0.58 * Math.pow(t, 1.2);
      const drawH = baseH * taper;
      let fade = 1;
      if (t > 0.72) {
        const u = (t - 0.72) / 0.28;
        fade = 1 - u * u * 0.62;
      }
      const a = alpha * fade;
      if (!(a > 0.015) || !(drawW > 0) || !(drawH > 0)) continue;
      const destX = (dLeft > 0 ? 0 : dLeft) - pad;
      const destY = -ay * drawH;
      ctx.save();
      ctx.translate(ax, ayw);
      ctx.rotate(ang);
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = a;
      if (Theme.comets.blitSlice(ctx, spr, sx0, 0, sww, sh0, destX, destY, drawW, drawH)) any = true;
      ctx.restore();
    }
    return any;
  }
}
