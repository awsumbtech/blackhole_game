// The gossamer ring on a growing star bud. The painted ring's radius lives
// in the meadow manifest, so the sprite scales until that ring sits on the
// bud's live bloom radius. The picture is picked once from the bud's seed.
// Nothing here strokes a circle. A missing picture draws nothing.

import { Theme } from "./Theme.js";

export class BloomHalo {
  static ROLE = "halo";

  static ids() {
    return Theme.meadow.idsByRole(this.ROLE);
  }

  static _smooth(t) {
    const u = t < 0 ? 0 : (t > 1 ? 1 : t);
    return u * u * (3 - 2 * u);
  }

  /** Stable variant. Position is not part of the pick, so drift does not flicker. */
  static _pick(e, n) {
    const s = e && e.seed ? (e.seed >>> 0) : 0;
    return s % n;
  }

  /**
   * Painted ring geometry for this sprite. `ringRadiusPx` is the ring inside
   * a `sizePx` canvas. Missing numbers draw nothing rather than a stroke.
   */
  static _geom(spr) {
    if (spr && spr.ringRadiusPx > 0 && spr.sizePx > 0) {
      return { ring: spr.ringRadiusPx, size: spr.sizePx };
    }
    const meta = Theme.meadow.meta();
    const rows = meta && Array.isArray(meta.sprites) ? meta.sprites : null;
    if (!rows || !spr) return null;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.id !== spr.id) continue;
      if (row.ringRadiusPx > 0 && row.sizePx > 0) return { ring: row.ringRadiusPx, size: row.sizePx };
      return null;
    }
    return null;
  }

  static _onScreen(state, x, y, r, vw, vh) {
    return Math.abs(x - state.camX) < vw / 2 + r && Math.abs(y - state.camY) < vh / 2 + r;
  }

  /**
   * One quiet ring on each growing bud (`e.bloom`). `cover` is the
   * receding-set fade. Eating and blooming stay with the world; this only draws.
   */
  static draw(ctx, entities, cover, state, vw, vh) {
    if (!entities || !(cover > 0.02) || !state) return false;
    const ids = this.ids();
    if (!ids.length) return false;
    const cat = Theme.meadow;
    const n = ids.length;
    let any = false;
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (!e || !e.bloom || e.consuming || !(e.radius > 0)) continue;
      const spr = cat.sprite(ids[this._pick(e, n)]);
      if (!spr) continue;
      const geom = this._geom(spr);
      if (!geom) continue;
      const k = this._smooth(e.bloom.t / e.bloom.dur);
      const ringR = e.radius * (1.7 + k * 0.6);
      const d = ringR * (geom.size / geom.ring);
      if (!(d > 0)) continue;
      if (!this._onScreen(state, e.x, e.y, d * 0.5, vw, vh)) continue;
      const a = (1 - k) * 0.90 * (e._spawnAlpha ?? 1) * cover;
      if (!(a > 0.004)) continue;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = a;
      cat.blit(ctx, spr, 0, 0, d, d);
      ctx.restore();
      any = true;
    }
    return any;
  }
}
