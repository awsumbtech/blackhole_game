// One comet head. The seed picks a row from the comet index variants.
// The coma and the nucleus are paintings. This class does not fill, stroke,
// tint or build a canvas.

import { Theme } from "./Theme.js";

export class Comet {
  static owned = new WeakMap();

  constructor(e) { this.e = e; }

  static for(e) {
    let s = Comet.owned.get(e);
    if (!s) { s = new Comet(e); Comet.owned.set(e, s); }
    return s;
  }

  /** Index into the catalog variants. Stable for the life of the entity. */
  static variant(e) {
    const n = Theme.comets.variants().length;
    if (!n) return 0;
    return ((e && e.seed) >>> 0) % n;
  }

  static look(e) {
    const rows = Theme.comets.variants();
    if (!rows.length) return null;
    return rows[Comet.variant(e)];
  }

  static tailSprite(e) {
    const look = Comet.look(e);
    return look ? Theme.comets.sprite(look.tail) : null;
  }

  /** Nucleus paintings for a bite. No coma: the glow would read as a flash. */
  static debrisFrames(e) {
    const look = Comet.look(e);
    if (!look) return null;
    const spr = Theme.comets.sprite(look.nucleus);
    if (!spr) return null;
    const image = spr.image;
    const frame = (rel) => ({
      image, sx: 0, sy: 0, sw: image.naturalWidth, sh: image.naturalHeight, relSize: rel
    });
    return [frame(0.62), frame(0.4), frame(0.5), frame(0.34)];
  }

  /**
   * Soft coma, then the craggy nucleus, both centred. `r` is the entity radius.
   * Returns false until both paintings have decoded.
   */
  draw(ctx, x, y, r, alpha) {
    if (!(alpha > 0) || !(r > 0)) return false;
    const look = Comet.look(this.e);
    if (!look) return false;
    const coma = Theme.comets.sprite(look.coma);
    const nucleus = Theme.comets.sprite(look.nucleus);
    if (!coma || !nucleus) return false;
    const cd = r * 3.8;
    const nd = r * 1.45;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = alpha * 0.9;
    Theme.comets.blit(ctx, coma, 0, 0, cd, cd);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = alpha;
    Theme.comets.blit(ctx, nucleus, 0, 0, nd, nd);
    ctx.restore();
    return true;
  }
}
