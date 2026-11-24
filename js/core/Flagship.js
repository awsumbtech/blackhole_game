// Ruined Armada landmark. One capital wreck, blitted from assets/flagship.
// The hull picture is chosen from role "hull" (manifest order, so the first
// file is the primary hero and a later file is another wreck). The ember
// picture (role "ember") is a luminous overlay on the same pivot, nose +x.
// Nothing here paints a canvas. A picture that has not decoded is skipped.

import { Theme } from "./Theme.js";

export class Flagship {
  /** World width, in flagship.size, of the legacy ship-unit span (X1 - X0). */
  static UNIT = 1.25;
  static SPAN = 2.32;
  static FADE_MS = 1200;

  constructor() {
    this.lastMs = 0;
    this._born = new Map();
  }

  static hullIds() { return Theme.flagship.idsByRole("hull"); }

  static emberIds() { return Theme.flagship.idsByRole("ember"); }

  /** Manifest order. look 0 is the primary hero. A third hull needs no code change. */
  static hullId(look) {
    const ids = this.hullIds();
    if (!ids.length) return "";
    return ids[(look >>> 0) % ids.length];
  }

  static emberId() {
    const ids = this.emberIds();
    return ids.length ? ids[0] : "";
  }

  _key(look, ring) { return `${look >>> 0}|${ring ? 1 : 0}`; }

  /**
   * Catalog readiness for this look. Painting no longer runs, so this is
   * ready once the hull picture has decoded. `born` is the first time that
   * picture was asked for, which is what the fade reads.
   */
  peek(look, _light, _lite, ring = true) {
    const hullId = Flagship.hullId(look);
    if (!hullId || !Theme.flagship.has(hullId)) return { ready: false, born: 0 };
    const born = this._born.get(this._key(look, ring)) || 0;
    return { ready: true, born };
  }

  /**
   * The pictures for this look, or null while the hull is not decoded.
   * `ring` is kept so Zen and play can fade on their own. Both use the
   * painted hull: there is no code-drawn ringless stand-in.
   */
  sprite(look, _light, _lite, ring = true) {
    const hullId = Flagship.hullId(look);
    if (!hullId || !Theme.flagship.has(hullId)) return null;
    const key = this._key(look, ring);
    let born = this._born.get(key);
    if (!born) {
      born = performance.now();
      this._born.set(key, born);
    }
    const emberId = Flagship.emberId();
    return {
      look: look >>> 0,
      hullId,
      emberId: emberId && Theme.flagship.has(emberId) ? emberId : "",
      born
    };
  }

  /**
   * Callers that used to wait out the slice painter. Ready means the hull
   * picture is in the catalog. There is no paint job left to finish.
   */
  slicePaintReady(look, ring = true) {
    const peek = this.peek(look, null, false, ring);
    return { ready: peek.ready, born: peek.born, now: performance.now() };
  }

  static _smooth(t) {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  }

  static _onScreen(state, x, y, r, vw, vh) {
    return Math.abs(x - state.camX) < vw / 2 + r && Math.abs(y - state.camY) < vh / 2 + r;
  }

  /**
   * Place the wreck: slow tumble, the 1.2 s fade, and the near-haze
   * (0.40 far, rising to 0.54 up close). Then blit. Off screen, or before
   * the hull has decoded, draws nothing.
   */
  present(ctx, fl, world, state, fx, vw, vh, cover) {
    if (!fl || !fl.art || !world || !state) return false;
    const f = world.f || 1;
    const x = world.ox + fl.x * f;
    const y = world.oy + fl.y * f;
    const s = fl.size * f;
    const ring = state.mode !== "zen";
    const sp = this.sprite(fl.art.look, null, false, ring);
    if (!Flagship._onScreen(state, x, y, s * 1.6, vw, vh)) return false;
    if (!sp) return false;
    const rot = fl.rot + (fx && fx.reduceMotion ? 0 : (fx && fx.time ? fx.time : 0) * 0.000004);
    const near = Flagship._smooth(1 - (Math.hypot(state.playerX - x, state.playerY - y) - s * 1.2) / (s * 3));
    const fade = Flagship._smooth((performance.now() - sp.born) / Flagship.FADE_MS);
    const breath = fx && fx.reduceMotion ? 0.5 : (fx && fx.breath > 0 ? fx.breath : 0);
    const hullA = cover * fade * (0.4 + near * 0.14);
    const glowA = cover * fade * (0.42 + breath * 0.18);
    return this.draw(ctx, sp, x, y, s, rot, hullA, glowA);
  }

  /**
   * Hull, then the ember overlay on the same pivot. `size` is flagship.size
   * in world units. Returns false when the hull picture is not ready.
   * A missing ember still draws the hull.
   */
  draw(ctx, sp, x, y, size, rot, a, glowA) {
    if (!sp || !(size > 0)) return false;
    const hull = Theme.flagship.sprite(sp.hullId || Flagship.hullId(sp.look));
    if (!hull) return false;
    const w = size * Flagship.UNIT * Flagship.SPAN;
    const h = w * (hull.h > 0 ? hull.h / hull.w : 0.5);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha = a > 0 ? a : 0;
    if (ctx.globalAlpha > 0.005) Theme.flagship.blit(ctx, hull, 0, 0, w, h);
    const ember = sp.emberId ? Theme.flagship.sprite(sp.emberId) : null;
    if (ember && glowA > 0.01) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = glowA;
      Theme.flagship.blit(ctx, ember, 0, 0, w, h);
    }
    ctx.restore();
    return true;
  }
}
