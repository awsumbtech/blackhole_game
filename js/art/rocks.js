// A meteor's heated leading edge. The rock itself is SpaceRock.
// This glow stays so a hot entry still reads as hot.

import { makeCanvas } from "./kit.js";
import { artCache, bucketFor } from "./quality.js";

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
  gr.addColorStop(0, "rgba(255, 226, 180, 0.6)");
  gr.addColorStop(0.5, "rgba(255, 150, 80, 0.3)");
  gr.addColorStop(1, "rgba(255, 120, 60, 0)");
  g.fillStyle = gr;
  g.fillRect(-size / 2, -size / 2, size, size);
  g.globalCompositeOperation = "destination-in";
  const m = g.createLinearGradient(-b * 0.2, 0, b * 1.1, 0);
  m.addColorStop(0, "rgba(0,0,0,0)");
  m.addColorStop(1, "rgba(0,0,0,1)");
  g.fillStyle = m;
  g.fillRect(-size / 2, -size / 2, size, size);
  c = { c, k: size / b };
  heatCache.set(b, c);
  return c;
}
