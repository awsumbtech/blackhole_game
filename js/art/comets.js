// Comets: the nucleus painter and the cached tails and entry streaks.

import { TAU, mix, light, smoothPath, LX, LY, css, mx3, K1, lumpy, softBlob, speck } from "./kit.js";
import { artCache, bucketFor } from "./quality.js";

export const COMET_PAINTERS = {

  // Comets: a small dark icy nucleus lit on one side, a soft coma (cyan, the
  // green of C2, or pale white) and sunward jets. The two tails are drawn rotated.
  comet(g, R, e, r, v, look) {
    const coma = [[150, 225, 255], [150, 255, 200], [225, 240, 255]][look % 3];
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, R * 2.3);
    gr.addColorStop(0, css(mx3(coma, K1, 0.8), 0.9));
    gr.addColorStop(0.16, css(coma, 0.5));
    gr.addColorStop(0.45, css(coma, 0.12));
    gr.addColorStop(1, css(coma, 0));
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, R * 2.3, 0, TAU); g.fill();
    g.save(); g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 3; i++) {
      const a = Math.atan2(LY, LX) + (r() - 0.5) * 1.3, l = R * (0.9 + r() * 0.7);
      g.save(); g.rotate(a);
      const jg = g.createLinearGradient(0, 0, l, 0);
      jg.addColorStop(0, css(mx3(coma, K1, 0.6), 0.2)); jg.addColorStop(1, css(coma, 0));
      g.fillStyle = jg;
      g.beginPath(); g.moveTo(0, -R * 0.05); g.lineTo(l, -R * 0.22); g.lineTo(l, R * 0.22); g.lineTo(0, R * 0.05); g.fill();
      g.restore();
    }
    g.restore();
    const nr = R * 0.4, pts = lumpy(nr, r, 14, 0.16, 0.25);
    g.save(); smoothPath(g, pts); g.clip();
    const ng = g.createLinearGradient(LX * nr, LY * nr, -LX * nr, -LY * nr);
    ng.addColorStop(0, "rgba(250, 252, 255, 1)"); ng.addColorStop(0.45, "rgba(170, 190, 210, 1)"); ng.addColorStop(1, "rgba(60, 66, 84, 1)");
    g.fillStyle = ng; g.fillRect(-nr, -nr, nr * 2, nr * 2);
    if (R > 8) speck(g, nr, Math.round(nr * 3), [[255, 255, 255], [80, 90, 110]], r, 0.2, 0.5, 0.06, 0.14);
    g.restore();
    softBlob(g, LX * nr * 0.3, LY * nr * 0.3, nr * 0.9, [255, 255, 255], 0.7);
  },
};

// ─── Comet tails (cached per colour + size, drawn rotated) ───
const tailCache = artCache();
export function tailFor(color, rpx, ion, hot) {
  const b = bucketFor(rpx);
  let byB = tailCache.get(color);
  if (!byB) { byB = {}; tailCache.set(color, byB); }
  const slot = hot ? b + 1000 : ion ? -b : b;
  let t = byB[slot];
  if (t) return t;
  if (ion) { t = ionTail(color, b); byB[slot] = t; return t; }
  if (hot) { t = entryStreak(b); byB[slot] = t; return t; }
  const len = Math.ceil(b * 9), hgt = Math.ceil(b * 2.4);
  const c = document.createElement("canvas");
  c.width = len; c.height = hgt;
  const g = c.getContext("2d");
  const cy = hgt / 2;
  const lg = g.createLinearGradient(0, 0, len, 0);
  lg.addColorStop(0, light(color, 0.55, 0.5));
  lg.addColorStop(0.35, mix(color, [255, 236, 200], 0.6, 0.2));
  lg.addColorStop(1, mix(color, [255, 236, 200], 0.8, 0));
  g.fillStyle = lg;
  if ("filter" in g) g.filter = "blur(" + Math.max(0.5, b * 0.15).toFixed(1) + "px)";
  g.beginPath();
  g.moveTo(0, cy - b * 0.9);
  g.quadraticCurveTo(len * 0.4, cy - b * 0.7, len, cy);
  g.quadraticCurveTo(len * 0.4, cy + b * 0.7, 0, cy + b * 0.9);
  g.closePath();
  g.fill();
  const ig = g.createLinearGradient(0, 0, len * 0.6, 0);
  ig.addColorStop(0, "rgba(255, 255, 255, 0.45)");
  ig.addColorStop(1, "rgba(255, 255, 255, 0)");
  g.fillStyle = ig;
  g.beginPath(); g.ellipse(0, cy, len * 0.55, b * 0.22, 0, 0, TAU); g.fill();
  g.filter = "none";
  t = { c, k: b };
  byB[slot] = t;
  if (tailCache.size > 40) tailCache.delete(tailCache.keys().next().value);
  return t;
}
// v9: a meteor's glowing entry streak: thin, straight, white-hot to ember
function entryStreak(b) {
  const len = Math.ceil(b * 10), hgt = Math.ceil(b * 1.6);
  const c = document.createElement("canvas");
  c.width = len; c.height = hgt;
  const g = c.getContext("2d");
  const cy = hgt / 2;
  const lg = g.createLinearGradient(0, 0, len, 0);
  lg.addColorStop(0, "rgba(255, 226, 170, 0.75)");
  lg.addColorStop(0.18, "rgba(255, 160, 90, 0.45)");
  lg.addColorStop(0.6, "rgba(200, 90, 70, 0.12)");
  lg.addColorStop(1, "rgba(160, 70, 80, 0)");
  g.fillStyle = lg;
  if ("filter" in g) g.filter = "blur(" + Math.max(0.5, b * 0.12).toFixed(1) + "px)";
  g.beginPath(); g.moveTo(0, cy - b * 0.5); g.quadraticCurveTo(len * 0.25, cy - b * 0.12, len, cy); g.quadraticCurveTo(len * 0.25, cy + b * 0.12, 0, cy + b * 0.5); g.fill();
  const ig = g.createLinearGradient(0, 0, len * 0.5, 0);
  ig.addColorStop(0, "rgba(255, 250, 230, 0.6)"); ig.addColorStop(1, "rgba(255, 250, 230, 0)");
  g.fillStyle = ig;
  g.beginPath(); g.ellipse(0, cy, len * 0.4, b * 0.14, 0, 0, TAU); g.fill();
  g.filter = "none";
  return { c, k: b };
}
// v8.1: the straight, thin blue ion tail (comets get two tails)
function ionTail(color, b) {
  const len = Math.ceil(b * 12), hgt = Math.ceil(b * 1.2);
  const c = document.createElement("canvas");
  c.width = len; c.height = hgt;
  const g = c.getContext("2d");
  const cy = hgt / 2;
  const lg = g.createLinearGradient(0, 0, len, 0);
  lg.addColorStop(0, "rgba(170, 220, 255, 0.6)");
  lg.addColorStop(0.5, "rgba(130, 190, 255, 0.2)");
  lg.addColorStop(1, "rgba(120, 180, 255, 0)");
  g.fillStyle = lg;
  g.beginPath(); g.moveTo(0, cy - b * 0.28); g.lineTo(len, cy - b * 0.05); g.lineTo(len, cy + b * 0.05); g.lineTo(0, cy + b * 0.28); g.fill();
  g.strokeStyle = "rgba(220, 240, 255, 0.35)"; g.lineWidth = Math.max(0.5, b * 0.06);
  g.beginPath(); g.moveTo(0, cy); g.lineTo(len * 0.7, cy); g.stroke();
  return { c, k: b };
}

// ─── BLACK HOLE (accretion disk, photon ring, lensed arc) ───
// Disk textures are painted once per palette + size bucket, then rotated.
