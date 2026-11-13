// ─── CometTail ───
// One job: aim a comet's tail behind the way that comet just moved on screen.
// The pictures are the ones already painted (tailFor, or a find's own tail).
// This file does not draw a new shape.

import { tailFor } from "../art.js";

const TAU = Math.PI * 2;
// Below this on-screen step the last heading is kept, so a speck of noise
// cannot spin the tail while the comet is barely moving.
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

  /** Forget the last screen position. A teleport must not aim the tail. */
  reset() {
    this.have = false;
    this.aimed = false;
  }

  /**
   * sx, sy: where the head is on screen this frame, in CSS pixels,
   * camera and zoom already taken out. The trailing point eases toward
   * the opposite of that step.
   */
  sample(sx, sy) {
    if (!this.have) {
      this.sx = sx;
      this.sy = sy;
      this.have = true;
      return;
    }
    const dx = sx - this.sx, dy = sy - this.sy;
    this.sx = sx;
    this.sy = sy;
    if (dx * dx + dy * dy < HOLD * HOLD) return;
    const target = Math.atan2(-dy, -dx);
    if (!this.aimed) {
      this.ang = target;
      this.aimed = true;
      return;
    }
    this.ang += wrap(target - this.ang) * FOLLOW;
  }

  /**
   * The food comet: the cached dust tail, a little off-axis as before, and
   * the straight ion tail on the trailing angle. `speed` only sets the length.
   */
  drawComet(ctx, x, y, r, alpha, color, rpx, speed) {
    const t = tailFor(color, rpx);
    const len = r * (5 + Math.min(4, speed * 3));
    const hgt = r * 2.4;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.ang);
    ctx.globalAlpha = alpha * 0.9;
    ctx.rotate(0.12);
    ctx.drawImage(t.c, 0, -hgt / 2, len, hgt);
    ctx.rotate(-0.12);
    ctx.globalAlpha = alpha * 0.8;
    const it = tailFor(color, rpx, true);
    ctx.drawImage(it.c, 0, -r * 0.6, len * 1.35, r * 1.2);
    ctx.restore();
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
