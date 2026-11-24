// Ice-dust motes along a moving comet plume. A fixed pool, no per-frame
// allocation. Reduce-motion does not spawn and does not drift. A consume
// or a cull drops that comet's motes.

import { Theme } from "./Theme.js";

const CAP = 64;
const PER = 3;
const slots = new Array(CAP);
for (let i = 0; i < CAP; i++) {
  slots[i] = { on: false, e: null, x: 0, y: 0, vx: 0, vy: 0, life: 1, age: 0, which: 0 };
}
const stampOf = new WeakMap();
const stateOf = new WeakMap();
let frame = 0;
let stepDt = 0;
let still = false;

function hash(n) {
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return (n ^ (n >>> 16)) >>> 0;
}

export class CometSparkle {
  /** Call once per draw, before entities. Ages the pool and drops dead owners. */
  static begin(dt, reduceMotion) {
    frame++;
    still = !!reduceMotion;
    stepDt = dt > 3 ? 3 : (dt > 0 ? dt : 0);
    for (let i = 0; i < CAP; i++) {
      const s = slots[i];
      if (!s.on) continue;
      const stamped = stampOf.get(s.e);
      if (!s.e || s.e.consumed || s.e.consuming || stamped == null || frame - stamped > 1) {
        s.on = false;
        s.e = null;
        continue;
      }
      s.age += stepDt;
      if (s.age >= s.life) { s.on = false; s.e = null; continue; }
      if (!still) {
        s.x += s.vx * stepDt;
        s.y += s.vy * stepDt;
      }
    }
  }

  /** The entity is still in the world this frame. */
  static note(e) { stampOf.set(e, frame); }

  static release(e) {
    for (let i = 0; i < CAP; i++) {
      if (slots[i].e === e) { slots[i].on = false; slots[i].e = null; }
    }
  }

  static _count(e) {
    let n = 0;
    for (let i = 0; i < CAP; i++) if (slots[i].on && slots[i].e === e) n++;
    return n;
  }

  static _free() {
    for (let i = 0; i < CAP; i++) if (!slots[i].on) return slots[i];
    return null;
  }

  /**
   * One mote behind the head, along `ang` (the tail's trailing angle).
   * `speed` is the comet's own step. Still frames and a resting comet spawn nothing.
   */
  static spawn(e, ang, speed, r) {
    if (still || !(speed > 0.04) || !(r > 0) || e.consuming || e.consumed) return;
    let st = stateOf.get(e);
    if (!st) { st = { cool: 0 }; stateOf.set(e, st); }
    st.cool -= stepDt;
    if (st.cool > 0) return;
    if (CometSparkle._count(e) >= PER) { st.cool = 8; return; }
    const s = CometSparkle._free();
    if (!s) return;
    st.cool = 9;
    const h = hash((e.seed >>> 0) ^ Math.imul(frame + 1, 0x9e3779b1));
    const u = (h >>> 8) / 4294967296;
    const v = ((h >>> 16) & 1023) / 1023;
    const along = r * (1.6 + u * 5.2);
    const side = (v - 0.5) * r * 1.1;
    const c = Math.cos(ang), sn = Math.sin(ang);
    s.on = true;
    s.e = e;
    s.x = e.x + c * along - sn * side;
    s.y = e.y + sn * along + c * side;
    s.vx = c * (0.04 + u * 0.08) - sn * (v - 0.5) * 0.03;
    s.vy = sn * (0.04 + u * 0.08) + c * (v - 0.5) * 0.03;
    s.life = 42 + (h & 31);
    s.age = 0;
    s.which = (CometSparkle._count(e) + ((e.seed >>> 0) & 1)) & 1;
  }

  /** World positions, drawn in the same view space as the comet. */
  static draw(ctx, e, camX, camY, viewW, viewH, alpha) {
    if (!(alpha > 0)) return;
    const cat = Theme.comets;
    const hw = viewW / 2, hh = viewH / 2;
    ctx.save();
    for (let i = 0; i < CAP; i++) {
      const s = slots[i];
      if (!s.on || s.e !== e) continue;
      const k = 1 - s.age / s.life;
      const a = alpha * k * k * 0.72;
      if (a < 0.03) continue;
      const spr = cat.sprite(s.which ? "sparkle-2" : "sparkle-1");
      if (!spr) continue;
      const d = (e.radius || 4) * (0.22 + 0.28 * k);
      ctx.globalAlpha = a;
      cat.blit(ctx, spr, s.x - camX + hw, s.y - camY + hh, d, d);
    }
    ctx.restore();
  }
}
