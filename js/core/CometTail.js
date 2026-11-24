// ─── CometTail ───
// One job: aim a comet's tail behind that comet's own travel in the world.
// The player, the camera and the zoom are not part of the step.
// The picture is the painted plume for that comet (or a find's painted tail).
// +x of the painting is the plume, so the rotation is the trailing angle.
// This file does not draw a new shape.

import { Theme } from "./Theme.js";

const TAU = Math.PI * 2;
// Per frame-time (dt 1 = one 60Hz frame). A slower step than this keeps the
// last heading. FOLLOW is how much of the new heading is taken in one frame.
const HOLD = 0.06;
const FOLLOW = 0.7;

function wrap(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export class CometTail {
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
    if (step < HOLD * frames || frames === 0) return;
    const target = Math.atan2(-dy, -dx);
    if (!this.aimed) {
      this.ang = target;
      this.aimed = true;
      return;
    }
    const take = 1 - Math.pow(1 - FOLLOW, frames);
    this.ang += wrap(target - this.ang) * take;
  }

  /**
   * Food comet. `variant` is 0 cyan or 1 silver. The plume's head pivot sits
   * on the comet. `speed` only sets the length. No code ribbon, no ion stroke.
   */
  drawComet(ctx, x, y, r, alpha, color, rpx, speed, variant = 0) {
    const spr = Theme.comets.sprite(variant ? "tail-silver" : "tail-cyan");
    if (!spr || !(alpha > 0) || !(r > 0)) return false;
    const len = r * (9.2 + Math.min(3.6, (speed || 0) * 2.4));
    return this.drawPainted(ctx, x, y, spr, len, alpha * 0.92);
  }

  /** A painted plume the caller already resolved. +x trails along this.ang. */
  drawPainted(ctx, x, y, spr, len, alpha) {
    if (!spr || !spr.ok || !(len > 0) || !(alpha > 0)) return false;
    const h = len * (spr.h / spr.w);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.ang);
    ctx.globalAlpha = alpha;
    Theme.comets.blit(ctx, spr, 0, 0, len, h);
    ctx.restore();
    return true;
  }

  /** Blit a tail picture the caller already has. +x of the picture is the trailing end. */
  drawSprite(ctx, x, y, sprite, w, h, alpha, composite) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.ang);
    ctx.globalAlpha = alpha;
    if (composite) ctx.globalCompositeOperation = composite;
    ctx.drawImage(sprite, 0, -h / 2, w, h);
    ctx.restore();
  }
}
