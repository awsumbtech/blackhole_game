// One comet head. The seed picks cyan or silver. The coma and the nucleus
// are paintings. This class does not fill, stroke, tint or build a canvas.

import { Theme } from "./Theme.js";

const VARIANT = [
  { coma: "coma-cyan", nucleus: "nucleus-1", tail: "tail-cyan" },
  { coma: "coma-silver", nucleus: "nucleus-2", tail: "tail-silver" }
];

export class Comet {
  static owned = new WeakMap();

  constructor(e) { this.e = e; }

  static for(e) {
    let s = Comet.owned.get(e);
    if (!s) { s = new Comet(e); Comet.owned.set(e, s); }
    return s;
  }

  /** 0 cyan, 1 silver. Stable for the life of the entity. */
  static variant(e) {
    return ((e && e.seed) >>> 0) & 1;
  }

  static look(e) { return VARIANT[Comet.variant(e)]; }

  static tailSprite(e) {
    return Theme.comets.sprite(Comet.look(e).tail);
  }

  /** Nucleus paintings for a bite. No coma: the glow would read as a flash. */
  static debrisFrames(e) {
    const spr = Theme.comets.sprite(Comet.look(e).nucleus);
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
    const coma = Theme.comets.sprite(look.coma);
    const nucleus = Theme.comets.sprite(look.nucleus);
    if (!coma || !nucleus) return false;
    const cd = r * 5.6;
    const nd = r * 1.45;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha * 0.92;
    Theme.comets.blit(ctx, coma, 0, 0, cd, cd);
    ctx.globalAlpha = alpha;
    Theme.comets.blit(ctx, nucleus, 0, 0, nd, nd);
    ctx.restore();
    return true;
  }
}
