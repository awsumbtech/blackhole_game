// One planet. The type comes from the planet index. The picture is the
// manifest's layers, drawn with drawImage only.

import { Theme } from "./Theme.js";

export class Planet {
  static owned = new WeakMap();

  constructor(e) { this.e = e; }

  static for(e) {
    let s = Planet.owned.get(e);
    if (!s) { s = new Planet(e); Planet.owned.set(e, s); }
    return s;
  }

  /** Remember a playable type from the seed, and start its pictures. */
  static assign(e) {
    const type = Theme.planets.pick(e.seed | 0);
    e.artType = type;
    const art = Theme.planets.get(type);
    if (art) art.start();
  }

  static warm() { Theme.planets.warm(); }

  art() {
    const type = this.e.artType || Theme.planets.pick(this.e.seed | 0);
    if (!this.e.artType && type) this.e.artType = type;
    return type ? Theme.planets.get(type) : null;
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
