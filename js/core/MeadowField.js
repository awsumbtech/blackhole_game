// Galaxy 6 meadow fields. One painted dusting per meadow, screen-blended
// and turned once from the meadow's place so the motes do not all sit the
// same way. Nothing here builds a glow. A missing picture draws nothing.

import { Theme } from "./Theme.js";

export class MeadowField {
  static ROLE = "field";
  /** Whisper-soft, inside the approved 0.30–0.35 band. The PNG is already faint. */
  static ALPHA = 0.32;

  static ids() {
    return Theme.meadow.idsByRole(this.ROLE);
  }

  /** Stable angle from the meadow's base position. It does not change per frame. */
  static _spin(m) {
    const x = Math.imul((m.x * 1000) | 0, 0x6D2B79F5);
    const y = Math.imul((m.y * 1000) | 0, 0x45D9F3B);
    let h = (x ^ y) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x7FEB352D);
    h = (h ^ (h >>> 15)) >>> 0;
    return (h / 4294967296) * Math.PI * 2;
  }

  static _onScreen(state, x, y, r, vw, vh) {
    return Math.abs(x - state.camX) < vw / 2 + r && Math.abs(y - state.camY) < vh / 2 + r;
  }

  /**
   * The meadow's own picture, or the first decoded sibling if that one failed.
   * Nothing is returned when every field picture is still missing.
   */
  static _sprite(ids, index) {
    const n = ids && ids.length;
    if (!n) return null;
    const cat = Theme.meadow;
    const at = ((index % n) + n) % n;
    const chosen = cat.sprite(ids[at]);
    if (chosen) return chosen;
    for (let i = 0; i < n; i++) {
      const spr = cat.sprite(ids[i]);
      if (spr) return spr;
    }
    return null;
  }

  /**
   * World space, inside the camera transform. `px/py/wx` are the set
   * transform. `cover` is the receding-set fade (1 for the live set).
   */
  static draw(ctx, meadows, px, py, wx, cover, state, vw, vh) {
    if (!meadows || !meadows.length || !(cover > 0.02) || !state) return false;
    const ids = this.ids();
    if (!ids.length) return false;
    const cat = Theme.meadow;
    let any = false;
    for (let i = 0; i < meadows.length; i++) {
      const m = meadows[i];
      if (!m) continue;
      const x = px(m.x);
      const y = py(m.y);
      const r = wx(m.r);
      if (!(r > 0)) continue;
      if (!this._onScreen(state, x, y, r * 1.4, vw, vh)) continue;
      const spr = this._sprite(ids, i);
      if (!spr) continue;
      const d = r * 2.4;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this._spin(m));
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = this.ALPHA * cover;
      cat.blit(ctx, spr, 0, 0, d, d);
      ctx.restore();
      any = true;
    }
    return any;
  }
}
