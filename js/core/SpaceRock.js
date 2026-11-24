// Pebbles and pebble clusters. Paintings keep their upper-left rim light:
// a sway stays inside a few degrees, and a cluster's pieces do too.
// Meteors and loose pebbles are one rock. One junk look in five is a cluster.

import { Theme } from "./Theme.js";
import { SpaceDust } from "./SpaceDust.js";

const SLOTS = [
  { x: -0.08, y: -0.12, s: 2.45 },
  { x: 0.62, y: 0.16, s: 1.7 },
  { x: -0.5, y: 0.52, s: 1.38 },
  { x: 0.28, y: -0.58, s: 1.05 }
];

function mix(n) {
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  return (n ^ (n >>> 15)) >>> 0;
}

export class SpaceRock {
  static owned = new WeakMap();

  constructor(e) { this.e = e; this._lay = null; }

  static for(e) {
    let s = SpaceRock.owned.get(e);
    if (!s) { s = new SpaceRock(e); SpaceRock.owned.set(e, s); }
    return s;
  }

  /** Gravel handful: the old junk look where kind was 1. Meteors stay single. */
  static isCluster(e) {
    if (!e || e.type !== "junk") return false;
    const look = e.look >= 0 ? e.look : ((e.seed >>> 3));
    return (look % 5) === 1;
  }

  static pebbleId(e) {
    return "pebble-" + (1 + ((e.seed >>> 0) % 4));
  }

  /** Built once per entity. Not touched from the draw hot path after that. */
  layout() {
    if (this._lay) return this._lay;
    const s = this.e.seed >>> 0;
    const n = 3 + (s & 1);
    const lay = new Array(n);
    for (let i = 0; i < n; i++) {
      const h = mix(s ^ Math.imul(i + 1, 0x9e3779b1));
      const slot = SLOTS[i];
      lay[i] = {
        id: "pebble-" + (1 + ((h >>> 16) % 4)),
        x: slot.x + ((h & 255) / 255 - 0.5) * 0.16,
        y: slot.y + (((h >>> 8) & 255) / 255 - 0.5) * 0.16,
        s: slot.s,
        rot: (((h >>> 24) & 255) / 255 - 0.5) * 0.5
      };
    }
    lay.dust = {
      x: 0.15 + ((s >>> 4) & 255) / 255 * 0.4,
      y: 0.2,
      ang: (((s >>> 12) & 255) / 255 - 0.5) * 0.8
    };
    this._lay = lay;
    return lay;
  }

  static debrisFrames(e) {
    const cat = Theme.rocks;
    const frame = (spr, rel) => ({
      image: spr.image, sx: 0, sy: 0,
      sw: spr.image.naturalWidth, sh: spr.image.naturalHeight, relSize: rel
    });
    if (SpaceRock.isCluster(e)) {
      const lay = SpaceRock.for(e).layout();
      const out = [];
      for (let i = 0; i < lay.length && out.length < 4; i++) {
        const spr = cat.sprite(lay[i].id);
        if (spr) out.push(frame(spr, 0.34 + 0.12 * (lay.length - i)));
      }
      while (out.length && out.length < 4) out.push(out[out.length - 1]);
      return out.length ? out : null;
    }
    const spr = cat.sprite(SpaceRock.pebbleId(e));
    if (!spr) return null;
    return [frame(spr, 0.62), frame(spr, 0.4), frame(spr, 0.5), frame(spr, 0.33)];
  }

  draw(ctx, x, y, r, alpha) {
    if (!(alpha > 0) || !(r > 0)) return false;
    const sway = Math.sin(this.e.rotation || 0) * 0.22;
    if (SpaceRock.isCluster(this.e)) return this._cluster(ctx, x, y, r, alpha, sway);
    const spr = Theme.rocks.sprite(SpaceRock.pebbleId(this.e));
    if (!spr) return false;
    const d = r * (this.e.type === "meteor" ? 2.9 : 2.7);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(sway);
    ctx.globalAlpha = alpha;
    Theme.rocks.blit(ctx, spr, 0, 0, d, d);
    ctx.restore();
    return true;
  }

  _cluster(ctx, x, y, r, alpha, sway) {
    const lay = this.layout();
    const cat = Theme.rocks;
    let any = false;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(sway);
    for (let i = 0; i < lay.length; i++) {
      const p = lay[i];
      const spr = cat.sprite(p.id);
      if (!spr) continue;
      any = true;
      const d = r * p.s;
      ctx.save();
      ctx.translate(p.x * r, p.y * r);
      ctx.rotate(p.rot);
      ctx.globalAlpha = alpha;
      cat.blit(ctx, spr, 0, 0, d, d);
      ctx.restore();
    }
    const dust = lay.dust;
    SpaceDust.blot(ctx, dust.x * r, dust.y * r, r * 1.7, alpha * 0.38, dust.ang);
    ctx.restore();
    return any;
  }
}
