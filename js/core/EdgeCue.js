// A painted direction on the screen edge. One mote, head along +x, turned
// toward whatever is off-screen. No triangle, no chevron, no tint.
// The same selection as the old arrows: nearest edible things, and power-ups.

import { Theme } from "./Theme.js";

const EDGE_N = 6;
const edgeE = new Array(EDGE_N);
const edgeD = new Float64Array(EDGE_N);
const edgeSX = new Float64Array(EDGE_N);
const edgeSY = new Float64Array(EDGE_N);
const hypot = (x, y) => Math.sqrt(x * x + y * y);

export class EdgeCue {
  /**
   * One cue. `ang` aims +x (the mote's head) toward the target.
   * Coordinates are whatever space the caller is in.
   */
  static draw(ctx, x, y, ang, alpha, which) {
    const spr = Theme.current.sprite(which ? "mote-2" : "mote-1");
    if (!spr || !(alpha > 0)) return false;
    const w = 18;
    const h = w * (spr.h / spr.w);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = alpha;
    Theme.current.blit(ctx, spr, 0, 0, w, h);
    ctx.restore();
    return true;
  }

  /** Screen-space cues for the nearest off-screen edibles and power-ups. */
  static marks(ctx, entities, w, h, camX, camY, playerRadius, zoom, eatRatio) {
    const margin = 16;
    let n = 0;
    for (const e of entities) {
      if (e.consuming) continue;
      const sx = (e.x - camX) * zoom + w / 2;
      const sy = (e.y - camY) * zoom + h / 2;
      if (sx > -10 && sx < w + 10 && sy > -10 && sy < h + 10) continue;
      if (!e.powerup && playerRadius <= e.radius * eatRatio) continue;
      const d = e.powerup ? -1 : hypot(sx - w / 2, sy - h / 2);
      if (n === EDGE_N && d >= edgeD[EDGE_N - 1]) continue;
      let j = n < EDGE_N ? n++ : EDGE_N - 1;
      while (j > 0 && edgeD[j - 1] > d) {
        edgeE[j] = edgeE[j - 1];
        edgeD[j] = edgeD[j - 1];
        edgeSX[j] = edgeSX[j - 1];
        edgeSY[j] = edgeSY[j - 1];
        j--;
      }
      edgeE[j] = e;
      edgeD[j] = d;
      edgeSX[j] = sx;
      edgeSY[j] = sy;
    }
    for (let i = 0; i < n; i++) {
      const e = edgeE[i], sx = edgeSX[i], sy = edgeSY[i];
      edgeE[i] = null;
      const ang = Math.atan2(sy - h / 2, sx - w / 2);
      const edgeX = w / 2 + Math.cos(ang) * (w / 2 - margin);
      const edgeY = h / 2 + Math.sin(ang) * (h / 2 - margin);
      EdgeCue.draw(ctx, edgeX, edgeY, ang, e.powerup ? 0.55 : 0.36, e.powerup ? 1 : 0);
    }
  }
}
