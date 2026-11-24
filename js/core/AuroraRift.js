// Galaxy 5 Void Rift ribbon. Painted wisps chained along the feeding
// corridor, screen-blended and faint. The picture is chosen by segment
// index. A missing picture uses the first decoded sibling. When every
// sibling is missing, nothing is drawn.

import { Theme } from "./Theme.js";

export class AuroraRift {
  static ROLE = "wisp";
  /** Calm ~15% mist. The PNG is already sheer. */
  static ALPHA = 0.15;
  /** Void gift lifts that mist, still quiet beside the hole. */
  static BOOST = 1.45;
  /**
   * Destination height over the corridor width. The silk sits in about
   * half the frame, so 1.95 puts the visible band on wide = b0 * 0.045.
   */
  static HEIGHT = 1.95;
  /** Overlap along the ribbon, as a fraction of each wisp's length. */
  static STEP = 0.44;
  /** Segment-widths per second. Frozen when motion is reduced. */
  static DRIFT = 0.04;
  static MAX = 80;

  static ids() {
    return Theme.aurora.idsByRole(this.ROLE);
  }

  /**
   * Segment `index` in manifest order. If that picture has not decoded,
   * the first decoded sibling is used. Nothing is returned when every
   * wisp is missing.
   */
  static _sprite(ids, index) {
    const n = ids && ids.length;
    if (!n) return null;
    const cat = Theme.aurora;
    const at = ((index % n) + n) % n;
    const chosen = cat.sprite(ids[at]);
    if (chosen) return chosen;
    for (let i = 0; i < n; i++) {
      const spr = cat.sprite(ids[i]);
      if (spr) return spr;
    }
    return null;
  }

  static _onScreen(camX, camY, x, y, r, halfW, halfH) {
    return Math.abs(x - camX) < halfW + r && Math.abs(y - camY) < halfH + r;
  }

  /**
   * World space, inside the camera transform. `wide` is the feeding
   * corridor in base units (b0 * 0.045). `cover` is the receding-set
   * fade. `boost` > 0 lifts alpha by BOOST. `time` is the frame clock
   * in milliseconds. `scale` is the set scale (W.f).
   */
  static draw(ctx, aurora, wide, cover, boost, time, ox, oy, scaleIn, state, vw, vh, reduceMotion) {
    if (!ctx || !aurora || !aurora.pts || aurora.pts.length < 2) return false;
    if (!(cover > 0.02) || !(wide > 0)) return false;
    const ids = this.ids();
    if (!ids.length) return false;
    const sample = this._sprite(ids, 0);
    if (!sample || !(sample.w > 0) || !(sample.h > 0)) return false;

    const scale = scaleIn > 0 ? scaleIn : 1;
    const segH = wide * this.HEIGHT * scale;
    const refW = segH * (sample.w / sample.h);
    const step = refW * this.STEP;
    if (!(step > 1e-4) || !(segH > 0)) return false;

    const pts = aurora.pts;
    const nPts = pts.length;
    const x0 = ox || 0;
    const y0 = oy || 0;
    let total = 0;
    for (let s = 0; s < nPts - 1; s++) {
      const dx = (pts[s + 1][0] - pts[s][0]) * scale;
      const dy = (pts[s + 1][1] - pts[s][1]) * scale;
      total += Math.hypot(dx, dy);
    }
    if (!(total > step * 0.5)) return false;

    let phase = 0;
    if (!reduceMotion && time > 0) phase = time * 0.001 * refW * this.DRIFT;

    const lift = boost > 0 ? this.BOOST : 1;
    const alpha = this.ALPHA * cover * lift;
    if (!(alpha > 0.004)) return false;

    const camX = state && typeof state.camX === "number" ? state.camX : 0;
    const camY = state && typeof state.camY === "number" ? state.camY : 0;
    const halfW = vw > 0 ? vw / 2 : 0;
    const halfH = vh > 0 ? vh / 2 : 0;
    const cull = halfW > 0 && halfH > 0;
    const cat = Theme.aurora;
    let any = false;
    const i0 = Math.floor(-phase / step);
    for (let n = 0, i = i0; n < this.MAX; n++, i++) {
      const pos = phase + i * step;
      if (pos < -1e-4) continue;
      if (pos > total + 1e-4) break;
      const spr = this._sprite(ids, i);
      if (!spr || !(spr.w > 0) || !(spr.h > 0)) continue;
      const drawH = segH;
      const drawW = drawH * (spr.w / spr.h);
      let remain = pos;
      let x = x0 + pts[0][0] * scale;
      let y = y0 + pts[0][1] * scale;
      let ang = 0;
      for (let s = 0; s < nPts - 1; s++) {
        const ax = x0 + pts[s][0] * scale;
        const ay = y0 + pts[s][1] * scale;
        const bx = x0 + pts[s + 1][0] * scale;
        const by = y0 + pts[s + 1][1] * scale;
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.hypot(dx, dy);
        if (!(len > 0)) continue;
        if (remain <= len || s === nPts - 2) {
          const k = Math.min(1, remain / len);
          x = ax + dx * k;
          y = ay + dy * k;
          ang = Math.atan2(dy, dx);
          break;
        }
        remain -= len;
      }
      const rad = 0.5 * Math.hypot(drawW, drawH);
      if (cull && !this._onScreen(camX, camY, x, y, rad, halfW, halfH)) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = alpha;
      const drew = cat.blit(ctx, spr, 0, 0, drawW, drawH);
      ctx.restore();
      if (drew) any = true;
    }
    return any;
  }
}
