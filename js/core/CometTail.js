// ─── CometTail ───
// One job: aim a comet's tail behind that comet's own travel in the world.
// The player, the camera and the zoom are not part of the step.
// The picture is the painted plume for that comet (or a find's painted tail).
// +x of the painting is the plume, so the rotation is the trailing angle.
// This file does not draw a new shape.

import { Theme } from "./Theme.js";

export class CometTail {
  static TAU = Math.PI * 2;
  // Per frame-time (dt 1 = one 60Hz frame). A slower step than this keeps the
  // last heading. FOLLOW is how much of the new heading is taken in one frame.
  static HOLD = 0.06;
  static FOLLOW = 0.7;

  static wrap(a) {
    a = (a + Math.PI) % CometTail.TAU;
    if (a < 0) a += CometTail.TAU;
    return a - Math.PI;
  }

  constructor(ang = 0) {
    this.ang = ang;
    this.have = false;
    this.aimed = false;
    this.sx = 0;
    this.sy = 0;
  }

  /** Forget the last world position. A teleport must not aim the tail. */
  reset() {
    this.have = false;
    this.aimed = false;
  }

  /**
   * x, y: where the head is in the world. Steering, the camera and zoom do
   * not move this point, so they do not swing the tail. dt is frame-time.
   * A step longer than `limit` (the view diagonal, in world units) is a
   * respawn or a wrap: keep the heading, do not spin toward it.
   */
  sample(x, y, dt = 1, limit = Infinity) {
    if (!this.have) {
      this.sx = x;
      this.sy = y;
      this.have = true;
      return;
    }
    const dx = x - this.sx, dy = y - this.sy;
    this.sx = x;
    this.sy = y;
    const step = Math.hypot(dx, dy);
    const frames = dt > 0 ? dt : 0;
    if (step > limit) return;
    if (step < CometTail.HOLD * frames || frames === 0) return;
    const target = Math.atan2(-dy, -dx);
    if (!this.aimed) {
      this.ang = target;
      this.aimed = true;
      return;
    }
    const take = 1 - Math.pow(1 - CometTail.FOLLOW, frames);
    this.ang += CometTail.wrap(target - this.ang) * take;
  }

  /**
   * Food comet. `variant` is 0 cyan or 1 silver. The plume's head pivot sits
   * on the comet. `speed` only sets the length. No code ribbon, no ion stroke.
   */
  drawComet(ctx, x, y, r, alpha, color, rpx, speed, variant = 0) {
    const rows = Theme.comets.variants();
    if (!rows.length || !(alpha > 0) || !(r > 0)) return false;
    const row = rows[((variant % rows.length) + rows.length) % rows.length];
    const spr = Theme.comets.sprite(row.tail);
    if (!spr) return false;
    const len = r * (14.0 + Math.min(5.0, (speed || 0) * 3.2));
    return this.drawPainted(ctx, x, y, spr, len, alpha * 0.92);
  }

  /** A painted plume the caller already resolved. +x trails along this.ang. */
  drawPainted(ctx, x, y, spr, len, alpha) {
    if (!spr || !spr.ok || !(len > 0) || !(alpha > 0)) return false;
    const h = len * (spr.h / spr.w);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.ang);
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = alpha;
    Theme.comets.blit(ctx, spr, 0, 0, len, h);
    ctx.restore();
    return true;
  }
}
