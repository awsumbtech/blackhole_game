// One planet or moon. The type comes from that body's index. The picture
// is the manifest's layers, drawn with drawImage only.

import { Theme } from "./Theme.js";

export class Body {
  static owned = new WeakMap();

  constructor(e) { this.e = e; }

  static catalogFor(e) {
    return e && e.type === "moon" ? Theme.moons : Theme.planets;
  }

  static for(e) {
    let s = Body.owned.get(e);
    if (!s) { s = new Body(e); Body.owned.set(e, s); }
    return s;
  }

  /** Remember a playable type from the seed, and start its pictures. */
  static assign(e) {
    const catalog = Body.catalogFor(e);
    const type = catalog.pick(e.seed | 0);
    e.artType = type;
    const art = catalog.get(type);
    if (art) art.start();
  }

  static warm(kind) {
    (kind === "moon" ? Theme.moons : Theme.planets).warm();
  }

  catalog() { return Body.catalogFor(this.e); }

  art() {
    const catalog = this.catalog();
    const type = this.e.artType || catalog.pick(this.e.seed | 0);
    if (!this.e.artType && type) this.e.artType = type;
    return type ? catalog.get(type) : null;
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
