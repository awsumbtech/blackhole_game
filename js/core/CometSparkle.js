// Ice-dust motes along a moving comet plume. A fixed pool, no per-frame
// allocation. Reduce-motion does not spawn and does not drift. A consume
// or a cull drops that comet's motes.

import { Theme } from "./Theme.js";

export class CometSparkle {
  static CAP = 128;
  static PER = 6;
  static slots = Array.from({ length: this.CAP }, () => (
    { on: false, e: null, x: 0, y: 0, vx: 0, vy: 0, life: 1, age: 0, which: 0 }
  ));
  static stampOf = new WeakMap();
  static stateOf = new WeakMap();
  static frame = 0;
  static stepDt = 0;
  static still = false;
  static at = { x: 0, y: 0, ang: 0 };

  static hash(n) {
    n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
    n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
    return (n ^ (n >>> 16)) >>> 0;
  }

  /** Call once per draw, before entities. Ages the pool and drops dead owners. */
  static begin(dt, reduceMotion) {
    this.frame++;
    this.still = !!reduceMotion;
    this.stepDt = dt > 3 ? 3 : (dt > 0 ? dt : 0);
    for (let i = 0; i < this.CAP; i++) {
      const s = this.slots[i];
      if (!s.on) continue;
      const stamped = this.stampOf.get(s.e);
      if (!s.e || s.e.consumed || stamped == null || this.frame - stamped > 1) {
        s.on = false;
        s.e = null;
        continue;
      }
      if (s.e.consuming) {
        const p = s.e.consumeProgress || 0;
        s.age += this.stepDt * (1.6 + p * 2.4);
        if (p >= 0.9) { s.on = false; s.e = null; continue; }
      } else {
        s.age += this.stepDt;
      }
      if (s.age >= s.life) { s.on = false; s.e = null; continue; }
      if (!this.still) {
        s.x += s.vx * this.stepDt;
        s.y += s.vy * this.stepDt;
      }
    }
  }

  /** The entity is still in the world this frame. */
  static note(e) { this.stampOf.set(e, this.frame); }

  static release(e) {
    for (let i = 0; i < this.CAP; i++) {
      if (this.slots[i].e === e) { this.slots[i].on = false; this.slots[i].e = null; }
    }
  }

  static _count(e) {
    let n = 0;
    for (let i = 0; i < this.CAP; i++) if (this.slots[i].on && this.slots[i].e === e) n++;
    return n;
  }

  static _free() {
    for (let i = 0; i < this.CAP; i++) if (!this.slots[i].on) return this.slots[i];
    return null;
  }

  /**
   * One mote on the comet's curved wake. `ang` is the fallback trailing
   * angle when the tail has no path yet. `speed` is the comet's own step.
   * Still frames, a resting comet, and a comet being eaten spawn nothing.
   */
  static spawn(e, ang, speed, r, tail) {
    if (this.still || !(speed > 0.04) || !(r > 0) || e.consuming || e.consumed) return;
    let st = this.stateOf.get(e);
    if (!st) { st = { cool: 0 }; this.stateOf.set(e, st); }
    st.cool -= this.stepDt;
    if (st.cool > 0) return;
    const quick = speed >= 1.15 ? 5 : 9;
    if (this._count(e) >= this.PER) { st.cool = quick; return; }
    const s = this._free();
    if (!s) return;
    st.cool = quick;
    const ids = Theme.comets.idsByRole("sparkle");
    const h = this.hash((e.seed >>> 0) ^ Math.imul(this.frame + 1, 0x9e3779b1));
    const u = (h >>> 8) / 4294967296;
    const v = ((h >>> 16) & 1023) / 1023;
    const along = r * (1.6 + u * 5.2);
    const side = (v - 0.5) * r * 1.1;
    let c = Math.cos(ang);
    let sn = Math.sin(ang);
    let x = e.x + c * along - sn * side;
    let y = e.y + sn * along + c * side;
    if (tail && tail.pointAt && tail.pointAt(along, this.at)) {
      c = Math.cos(this.at.ang);
      sn = Math.sin(this.at.ang);
      x = this.at.x - sn * side;
      y = this.at.y + c * side;
    }
    s.on = true;
    s.e = e;
    s.x = x;
    s.y = y;
    s.vx = c * (0.04 + u * 0.08) - sn * (v - 0.5) * 0.03;
    s.vy = sn * (0.04 + u * 0.08) + c * (v - 0.5) * 0.03;
    s.life = 42 + (h & 31);
    s.age = 0;
    s.which = ids.length ? (h % ids.length) : 0;
  }

  /** World positions, drawn in the same view space as the comet. */
  static draw(ctx, e, camX, camY, viewW, viewH, alpha) {
    if (!(alpha > 0)) return;
    const cat = Theme.comets;
    const ids = cat.idsByRole("sparkle");
    if (!ids.length) return;
    const hw = viewW / 2, hh = viewH / 2;
    ctx.save();
    for (let i = 0; i < this.CAP; i++) {
      const s = this.slots[i];
      if (!s.on || s.e !== e) continue;
      const k = 1 - s.age / s.life;
      let a = alpha * k * k * 0.72;
      if (s.e.consuming) a *= Math.pow(1 - Math.min(1, s.e.consumeProgress || 0), 1.4);
      if (a < 0.03) continue;
      const spr = cat.sprite(ids[s.which % ids.length]);
      if (!spr) continue;
      const d = (e.radius || 4) * (0.22 + 0.28 * k);
      ctx.globalAlpha = a;
      cat.blit(ctx, spr, s.x - camX + hw, s.y - camY + hh, d, d);
    }
    ctx.restore();
  }
}
