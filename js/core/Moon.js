// One moon. Same job as Planet, reading the moon index.

import { Theme } from "./Theme.js";

export class Moon {
  static owned = new WeakMap();

  constructor(e) { this.e = e; }

  static for(e) {
    let s = Moon.owned.get(e);
    if (!s) { s = new Moon(e); Moon.owned.set(e, s); }
    return s;
  }

  static assign(e) {
    const type = Theme.moons.pick(e.seed | 0);
    e.artType = type;
    const art = Theme.moons.get(type);
    if (art) art.start();
  }

  static warm() { Theme.moons.warm(); }

  art() {
    const type = this.e.artType || Theme.moons.pick(this.e.seed | 0);
    if (!this.e.artType && type) this.e.artType = type;
    return type ? Theme.moons.get(type) : null;
  }

  ready() {
    const art = this.art();
    if (!art) return false;
    art.start();
    return !!art.ready;
  }

  draw(ctx, sx, sy, radius, alpha) {
    const art = this.art();
    if (!art || !(alpha > 0) || !(radius > 0)) return false;
    art.start();
    if (!art.ready) return false;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.globalAlpha = alpha;
    const ok = art.draw(ctx, art.bodyWidth(radius));
    ctx.restore();
    return ok;
  }
}
