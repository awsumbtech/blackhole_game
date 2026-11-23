// One craft. The sheet supplies every pixel: live, wreck, the gold edge,
// the four plates and the engine glow. This class does not fill, stroke
// or tint. Until the sheet has decoded, the craft is not drawn.

import { SpriteSheet } from "./SpriteSheet.js";
import { ShipCatalog } from "./ShipCatalog.js";

export class Ship {
  static owned = new WeakMap();

  constructor(e) { this.e = e; }

  /** The same craft keeps the same Ship. */
  static for(e) {
    let s = Ship.owned.get(e);
    if (!s) { s = new Ship(e); Ship.owned.set(e, s); }
    return s;
  }

  /** Start the five class sheets when this galaxy can show a ship. Never awaits. */
  static preloadForGalaxy(state) {
    const tier = state.tier | 0;
    const armada = !!(state.biome && state.biome.name === "Ruined Armada");
    if (!armada && tier < 2) return;
    for (const name of ShipCatalog.playable()) SpriteSheet.for(name).start();
  }

  /** Painted class. A crumb keeps the hull it was torn from. */
  get cls() {
    return ShipCatalog.has(this.e.ship) ? this.e.ship : null;
  }

  get artClass() {
    if (this.e.ship === "scrap") {
      if (ShipCatalog.has(this.e.scrapOf)) return this.e.scrapOf;
      const names = ShipCatalog.playable();
      return names[((this.e.seed | 0) >>> 0) % Math.max(1, names.length)] || null;
    }
    return this.cls;
  }

  /** Which plate a crumb is. 0..3, stored once. */
  get plateIndex() {
    return ((this.e.plate | 0) % 4 + 4) % 4;
  }

  /** Look row. adoptShip already stores 0..7; the modulo matches lookOf. */
  get row() {
    const n = ShipCatalog.looks(this.artClass);
    const look = this.e.look >= 0 ? this.e.look : ((this.e.seed | 0) >>> 3);
    return ((look % n) + n) % n;
  }

  sheet() {
    const c = this.artClass;
    return c ? SpriteSheet.for(c) : null;
  }

  /** True once this craft's picture can be drawn. Starts the load. */
  ready() {
    const sheet = this.sheet();
    if (!sheet) return false;
    sheet.start();
    return !!sheet.ready;
  }

  /** The four plate frames of this craft, or null until the sheet has decoded. */
  plates() {
    const sheet = this.sheet();
    if (!sheet) return null;
    sheet.start();
    if (!sheet.ready) return null;
    const row = this.row;
    const frames = [];
    for (let i = 0; i < 4; i++) {
      const rect = sheet.frameRect("plate" + i, row);
      if (!rect) return null;
      frames.push(rect);
    }
    return frames;
  }

  /**
   * Draw at (sx, sy). `size` is the world width (the old extent × 2 × radius).
   * `haloFrom` is the big-catch threshold render.js already uses.
   * Returns false when there is nothing to draw yet.
   */
  draw(ctx, sx, sy, size, alpha, breath, still, playerRadius, eatRatio, haloFrom) {
    if (this.e.ship === "scrap") return this._scrap(ctx, sx, sy, size, alpha);
    const sheet = this.sheet();
    if (!sheet || !(alpha > 0)) return false;
    sheet.start();
    if (!sheet.ready) return false;
    const e = this.e;
    const row = this.row;
    if (e.consuming && !still) {
      this._plates(ctx, sx, sy, size, alpha, e.consumeProgress || 0, row, sheet);
      return true;
    }
    let a = alpha, drawSize = size;
    if (e.consuming) {
      const p = e.consumeProgress || 0;
      a *= (1 - p);
      drawSize *= (1 - p * 0.8);
    }
    if (!(drawSize > 0) || !(a > 0)) return false;
    const rot = e.rotation || 0;
    const flip = !!(e.steer && Math.cos(rot) < 0);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(rot);
    if (flip) ctx.scale(1, -1);
    if (e.bigFish && !e.consuming && eatRatio > 0 && e.radius > 0) {
      const limit = e.radius * eatRatio;
      const nearQ = playerRadius / limit;
      if (nearQ > haloFrom) {
        const ready = playerRadius > limit;
        const k = ready ? 1 : (nearQ - haloFrom) / (1 - haloFrom);
        ctx.globalAlpha = (0.14 + 0.22 * k) * a * (0.85 + breath * 0.15);
        sheet.draw(ctx, e.wreck ? "wreckEdge" : "liveEdge", row, drawSize);
      }
    }
    ctx.globalAlpha = a;
    sheet.draw(ctx, e.wreck ? "wreck" : "live", row, drawSize);
    if (e.steer && !e.consuming) {
      ctx.globalAlpha = a * (0.38 + breath * 0.17);
      sheet.draw(ctx, "glow", row, drawSize);
    }
    ctx.restore();
    return true;
  }

  /** One painted plate. A crumb is that frame, not a whole hull. */
  _scrap(ctx, sx, sy, size, alpha) {
    const sheet = this.sheet();
    if (!sheet || !(alpha > 0) || !(size > 0)) return false;
    sheet.start();
    if (!sheet.ready) return false;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.e.rotation || 0);
    ctx.globalAlpha = alpha;
    const ok = sheet.draw(ctx, "plate" + this.plateIndex, this.row, size);
    ctx.restore();
    return ok;
  }

  /**
   * Four painted plates. The spiral is the old one: smoothstep of the
   * consume, a short outward drift, and a shrinking fade. Each plate is a
   * full frame with its piece in place, so the offset moves the piece.
   */
  _plates(ctx, sx, sy, size, alpha, p, row, sheet) {
    const e = this.e;
    const q = p * p * (3 - 2 * p);
    const rot = e.rotation || 0;
    const spin = rot + q * (e.swallow ? 2.4 : 1.8);
    const dd = size * (1 - q * 0.8);
    const out = Math.sin(q * Math.PI) * size * 0.16;
    const fade = alpha * (1 - q * q);
    if (!(fade > 0) || !(dd > 0)) return;
    for (let i = 0; i < 4; i++) {
      const mid = (i + 0.5) / 4 * Math.PI * 2;
      const turn = (i & 1 ? 1 : -1) * (0.5 + i * 0.15);
      const a = mid + spin;
      const pr = spin + turn * q;
      ctx.save();
      ctx.translate(sx + Math.cos(a) * out, sy + Math.sin(a) * out);
      ctx.rotate(pr);
      ctx.globalAlpha = fade;
      sheet.draw(ctx, "plate" + i, row, dd);
      ctx.restore();
    }
  }
}
