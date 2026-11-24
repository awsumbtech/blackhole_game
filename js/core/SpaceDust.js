// One dust mote. A single painted filament, turned once from the seed
// so each speck sits differently. No per-frame spin, no tint.

import { Theme } from "./Theme.js";

export class SpaceDust {
  static owned = new WeakMap();

  constructor(e) { this.e = e; }

  static for(e) {
    let s = SpaceDust.owned.get(e);
    if (!s) { s = new SpaceDust(e); SpaceDust.owned.set(e, s); }
    return s;
  }

  static sprite() { return Theme.dust.sprite("wisp-1"); }

  static debrisFrames() {
    const spr = SpaceDust.sprite();
    if (!spr) return null;
    const image = spr.image;
    const frame = (rel) => ({
      image, sx: 0, sy: 0, sw: image.naturalWidth, sh: image.naturalHeight, relSize: rel
    });
    return [frame(0.7), frame(0.42), frame(0.55), frame(0.34)];
  }

  /** A companion wisp for a pebble cluster. Angle is the caller's. */
  static blot(ctx, x, y, size, alpha, ang) {
    const spr = SpaceDust.sprite();
    if (!spr || !(alpha > 0) || !(size > 0)) return false;
    ctx.save();
    ctx.translate(x, y);
    if (ang) ctx.rotate(ang);
    ctx.globalAlpha = alpha;
    Theme.dust.blit(ctx, spr, 0, 0, size, size);
    ctx.restore();
    return true;
  }

  draw(ctx, x, y, r, alpha) {
    if (!(alpha > 0) || !(r > 0)) return false;
    const spr = SpaceDust.sprite();
    if (!spr) return false;
    const ang = ((this.e.seed >>> 0) % 360) * (Math.PI / 180);
    const d = r * 3.4;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.globalAlpha = alpha * 0.9;
    Theme.dust.blit(ctx, spr, 0, 0, d, d);
    ctx.restore();
    return true;
  }
}
