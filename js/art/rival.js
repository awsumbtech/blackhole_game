// Rival holes: a small cached violet hole.

import { PALETTES, DISK_IN, DISK_OUT, colAt } from "./hole.js";
import { TAU, rng, makeCanvas } from "./kit.js";
import { artCache, bucketFor } from "./quality.js";

/** v8.1: a small cached violet hole for rivals (own disk, lensed arc, ring). */
const rivalCache = artCache();
export function rivalSprite(rpx, edible) {
  const b = bucketFor(rpx);
  const key = b + (edible ? "e" : "v");
  let s = rivalCache.get(key);
  if (s) return s;
  const P = edible ? PALETTES.calm : { hot: [246, 236, 255], warm: [200, 170, 255], ember: [150, 110, 240], deep: [90, 60, 170] };
  const R = b * DISK_OUT, size = Math.ceil(R * 2) + 2;
  const c = makeCanvas(size);
  const g = c.getContext("2d");
  g.translate(size / 2, size / 2);
  // tiny disk texture painted inline (small, cheap)
  const tmp = makeCanvas(size);
  const t = tmp.getContext("2d");
  t.translate(size / 2, size / 2);
  const base = t.createRadialGradient(0, 0, b * DISK_IN * 0.95, 0, 0, R);
  base.addColorStop(0, `rgba(${colAt(P, 0)}, 0)`);
  base.addColorStop(0.05, `rgba(${colAt(P, 0)}, 0.9)`);
  base.addColorStop(0.3, `rgba(${colAt(P, 0.35)}, 0.5)`);
  base.addColorStop(1, `rgba(${colAt(P, 1)}, 0)`);
  t.fillStyle = base;
  t.beginPath(); t.arc(0, 0, R, 0, TAU); t.arc(0, 0, b * DISK_IN * 0.95, TAU, 0, true); t.fill();
  const r = rng(77 + b);
  t.globalCompositeOperation = "lighter";
  t.lineCap = "round";
  for (let i = 0; i < 50; i++) {
    const q = Math.pow(r(), 1.4), a0 = r() * TAU;
    t.strokeStyle = `rgba(${colAt(P, q)}, ${0.08 + r() * 0.15})`;
    t.lineWidth = Math.max(0.5, b * 0.05);
    t.beginPath(); t.arc(0, 0, b * (DISK_IN + (DISK_OUT - DISK_IN) * q), a0, a0 + 0.5 + r() * 1.8); t.stroke();
  }
  // glow
  const gl = g.createRadialGradient(0, 0, b, 0, 0, R);
  gl.addColorStop(0, `rgba(${colAt(P, 0.3)}, 0.22)`);
  gl.addColorStop(1, `rgba(${colAt(P, 1)}, 0)`);
  g.fillStyle = gl; g.fillRect(-R, -R, R * 2, R * 2);
  // far half
  g.save(); g.beginPath(); g.rect(-R, -R, R * 2, R); g.clip(); g.scale(1, 0.24); g.drawImage(tmp, -size / 2, -size / 2); g.restore();
  // lensed arc
  g.save();
  g.beginPath(); g.arc(0, 0, b * 1.9, Math.PI, TAU); g.arc(0, 0, b * 1.0, TAU, Math.PI, true); g.closePath(); g.clip();
  const k = 1.04 / DISK_IN; g.scale(k, k * 0.95); g.globalAlpha = 0.85; g.drawImage(tmp, -size / 2, -size / 2);
  g.restore();
  // shadow + ring
  const sh = g.createRadialGradient(0, 0, b * 0.92, 0, 0, b * 1.12);
  sh.addColorStop(0, "rgba(2, 1, 6, 1)");
  sh.addColorStop(0.55, `rgba(${colAt(P, 0)}, 0.95)`);
  sh.addColorStop(1, `rgba(${colAt(P, 0.2)}, 0)`);
  g.fillStyle = sh; g.beginPath(); g.arc(0, 0, b * 1.12, 0, TAU); g.fill();
  g.fillStyle = "rgba(2, 1, 6, 1)"; g.beginPath(); g.arc(0, 0, b * 0.97, 0, TAU); g.fill();
  // near half
  g.save(); g.beginPath(); g.rect(-R, 0, R * 2, R); g.clip(); g.scale(1, 0.24); g.drawImage(tmp, -size / 2, -size / 2); g.restore();
  s = { c, k: size / b };
  rivalCache.set(key, s);
  if (rivalCache.size > 16) rivalCache.delete(rivalCache.keys().next().value);
  return s;
}

/** v8.1 tier reveal: a gentle bloom swell and an expanding ring of dust. */
