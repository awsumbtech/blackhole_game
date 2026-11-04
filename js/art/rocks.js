// Rocks: meteors and asteroids, plus the hot-entry glow.

import { TAU, makeCanvas, smoothPath, jit, lumpy, bodyFill, smoothSub, rimLightSmooth } from "./kit.js";
import { artCache, quality, bucketFor } from "./quality.js";

export const ROCK_PAINTERS = {

  // Asteroids: lumpy potatoes and contact binaries in stony, iron and carbon
  meteor(g, R, e, r, v, look) {
    const min = look % 4, shape = Math.floor(look / 4) % 3, hi = quality === "high";
    const base = jit([[152, 140, 120], [128, 134, 150], [82, 76, 72], [150, 108, 88]][min], r, 0.14);
    let pts;
    if (shape === 1) {
      // contact binary: two lobes merged
      const a = lumpy(R * 0.62, r, 18, 0.12, 0.1), b = lumpy(R * 0.5, r, 18, 0.14, 0.05);
      const ang = r() * TAU, dx = Math.cos(ang) * R * 0.42, dy = Math.sin(ang) * R * 0.42;
      g.save();
      g.beginPath(); smoothSub(g, a, -dx * 0.8, -dy * 0.8); smoothSub(g, b, dx, dy); g.clip();
      bodyFill(g, R, base, min, r, hi);
      g.restore();
      return;
    }
    pts = lumpy(R, r, 22, shape === 2 ? 0.2 : 0.13, shape === 2 ? 0.34 : 0.12 + r() * 0.15);
    g.save(); smoothPath(g, pts); g.clip();
    bodyFill(g, R, base, min, r, hi);
    g.restore();
    rimLightSmooth(g, R, pts);
  },
};

// v9: a meteor entering hot: heated glow on its leading (+x) edge. Cached per size.
const heatCache = artCache();
export function heatFor(rpx) {
  const b = bucketFor(rpx);
  let c = heatCache.get(b);
  if (c) return c;
  const size = Math.ceil(b * 4.4) + 2;
  c = makeCanvas(size);
  const g = c.getContext("2d");
  g.translate(size / 2, size / 2);
  const gr = g.createRadialGradient(b * 0.55, 0, 0, b * 0.55, 0, b * 1.05);
  gr.addColorStop(0, "rgba(255, 226, 180, 0.6)"); gr.addColorStop(0.5, "rgba(255, 150, 80, 0.3)"); gr.addColorStop(1, "rgba(255, 120, 60, 0)");
  g.fillStyle = gr; g.fillRect(-size / 2, -size / 2, size, size);
  // only the leading half glows
  g.globalCompositeOperation = "destination-in";
  const m = g.createLinearGradient(-b * 0.2, 0, b * 1.1, 0);
  m.addColorStop(0, "rgba(0,0,0,0)"); m.addColorStop(1, "rgba(0,0,0,1)");
  g.fillStyle = m; g.fillRect(-size / 2, -size / 2, size, size);
  c = { c, k: size / b };
  heatCache.set(b, c);
  return c;
}
