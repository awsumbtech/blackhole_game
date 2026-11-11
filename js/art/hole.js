// The player's black hole: the shadow and its thin photon edge.
// The wide painted disk is AccretionRing. Rivals still use PALETTES / DISK_* / colAt.

import { TAU, rng, makeCanvas } from "./kit.js";
import { quality, bucketFor } from "./quality.js";

export const PALETTES = {
  // inner (white-hot) -> warm gold -> ember -> deep outer
  calm: { hot: [255, 250, 238], warm: [255, 210, 150], ember: [244, 140, 84], deep: [150, 70, 92], bloom: "255, 196, 140" },
  double: { hot: [255, 244, 252], warm: [255, 176, 226], ember: [226, 110, 210], deep: [120, 70, 190], bloom: "255, 160, 230" }
};
// v8.1 disk proportions, still used by rival holes.
export const DISK_IN = 1.45, DISK_OUT = 3.6;

export function colAt(P, t) {
  const s = t < 0.25 ? [P.hot, P.warm, t / 0.25] : t < 0.6 ? [P.warm, P.ember, (t - 0.25) / 0.35] : [P.ember, P.deep, (t - 0.6) / 0.4];
  const a = s[0], b = s[1], k = s[2];
  return Math.round(a[0] + (b[0] - a[0]) * k) + ", " + Math.round(a[1] + (b[1] - a[1]) * k) + ", " + Math.round(a[2] + (b[2] - a[2]) * k);
}

let ringSprite = null, ringB = 0, shimmerT = 0;
function holeSprites(b) {
  if (ringB === b) return;
  const size = Math.ceil(b * 1.3 * 2);
  ringSprite = makeCanvas(size);
  const g = ringSprite.getContext("2d");
  g.translate(size / 2, size / 2);
  const sh = g.createRadialGradient(0, 0, b * 0.9, 0, 0, b * 1.1);
  sh.addColorStop(0, "rgba(0, 0, 2, 1)");
  sh.addColorStop(0.6, "rgba(0, 0, 2, 0.95)");
  sh.addColorStop(1, "rgba(0, 0, 2, 0)");
  g.fillStyle = sh;
  g.beginPath(); g.arc(0, 0, b * 1.1, 0, TAU); g.fill();
  const pr = g.createRadialGradient(0, 0, b * 0.98, 0, 0, b * 1.12);
  pr.addColorStop(0, "rgba(255, 246, 232, 0)");
  pr.addColorStop(0.25, "rgba(255, 250, 240, 1)");
  pr.addColorStop(0.5, "rgba(255, 220, 170, 0.45)");
  pr.addColorStop(1, "rgba(255, 220, 170, 0)");
  g.fillStyle = pr;
  g.beginPath(); g.arc(0, 0, b * 1.12, 0, TAU); g.arc(0, 0, b * 0.98, TAU, 0, true); g.fill();
  g.globalCompositeOperation = "destination-out";
  const asym = g.createLinearGradient(-b * 1.12, 0, b * 1.12, 0);
  asym.addColorStop(0, "rgba(0,0,0,0)");
  asym.addColorStop(0.55, "rgba(0,0,0,0.1)");
  asym.addColorStop(1, "rgba(0,0,0,0.45)");
  g.fillStyle = asym;
  g.beginPath(); g.arc(0, 0, b * 1.12, 0, TAU); g.arc(0, 0, b * 0.985, TAU, 0, true); g.fill();
  ringB = b;
}

/**
 * Draw the black hole at (x, y) in world units (ctx already scaled by zoom).
 * fx: { zoom, dpr, dt, double, gulp, breath, reduceMotion, magnet, pullRange, breathGuide }
 */
export function drawBlackHoleArt(ctx, x, y, radius, time, fx) {
  const zoom = fx.zoom || 1;
  const rpx = radius * zoom * (fx.dpr || 1);
  const b = bucketFor(rpx * 1.1);
  const high = quality === "high";
  const breath = fx.breath ?? 0.5;
  const gulp = fx.reduceMotion ? 0 : (fx.gulp || 0);
  const dt = fx.dt || 1;

  if (!fx.reduceMotion) shimmerT += 0.035 * dt;

  holeSprites(b);

  ctx.save();
  ctx.translate(x, y);

  if (fx.magnet && fx.pullRange) {
    ctx.save();
    ctx.rotate(time * 0.0004);
    ctx.setLineDash([fx.pullRange * 0.08, fx.pullRange * 0.06]);
    ctx.beginPath();
    ctx.arc(0, 0, fx.pullRange, 0, TAU);
    ctx.strokeStyle = `rgba(255, 209, 102, ${0.16 + breath * 0.06})`;
    ctx.lineWidth = 2 / zoom;
    ctx.stroke();
    ctx.restore();
  }
  if (fx.breathGuide) {
    const gr = radius * (4.1 + breath * 1.1) + 14 / zoom;
    ctx.beginPath();
    ctx.arc(0, 0, gr, 0, TAU);
    ctx.strokeStyle = `rgba(180, 200, 255, ${0.1 + breath * 0.12})`;
    ctx.lineWidth = 2 / zoom;
    ctx.stroke();
  }

  // v9.7: the painted AccretionRing is the disk. This is only the shadow and its thin edge.
  const g = 1 + gulp * 0.08;
  const rs = radius * 1.3 * g;
  ctx.globalAlpha = 1;
  ctx.drawImage(ringSprite, -rs, -rs, rs * 2, rs * 2);
  if (high && !fx.reduceMotion) {
    const sh = rs * (1.015 + 0.012 * Math.sin(shimmerT));
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.12 + 0.06 * Math.sin(shimmerT * 1.7);
    ctx.drawImage(ringSprite, -sh, -sh * 0.985, sh * 2, sh * 1.97);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

let revRing = null, revBloom = null;
export function drawRevealFx(ctx, x, y, radius, p, still) {
  if (!revRing) {
    revRing = makeCanvas(256);
    const g = revRing.getContext("2d");
    g.translate(128, 128);
    const gr = g.createRadialGradient(0, 0, 80, 0, 0, 128);
    gr.addColorStop(0, "rgba(255, 230, 200, 0)");
    gr.addColorStop(0.55, "rgba(255, 230, 200, 0.4)");
    gr.addColorStop(1, "rgba(200, 190, 255, 0)");
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 128, 0, TAU); g.fill();
    const r = rng(99);
    for (let i = 0; i < 260; i++) {
      const a = r() * TAU, d = 92 + r() * 30;
      g.fillStyle = `rgba(255, ${220 + Math.floor(r() * 35)}, ${200 + Math.floor(r() * 55)}, ${0.3 + r() * 0.5})`;
      g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, 0.6 + r() * 1.4, 0, TAU); g.fill();
    }
    revBloom = makeCanvas(128);
    const b = revBloom.getContext("2d");
    const bg = b.createRadialGradient(64, 64, 0, 64, 64, 64);
    bg.addColorStop(0, "rgba(255, 236, 210, 0.5)");
    bg.addColorStop(0.4, "rgba(220, 200, 255, 0.15)");
    bg.addColorStop(1, "rgba(200, 190, 255, 0)");
    b.fillStyle = bg; b.fillRect(0, 0, 128, 128);
  }
  const env = Math.sin(Math.PI * p);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const bs = radius * (5 + env * 3);
  ctx.globalAlpha = env * 0.55;
  ctx.drawImage(revBloom, x - bs, y - bs, bs * 2, bs * 2);
  const rs = radius * (still ? 7 : 3 + p * 11);
  ctx.globalAlpha = env * (still ? 0.25 : 0.45);
  ctx.translate(x, y); ctx.scale(1, 0.85);
  ctx.drawImage(revRing, -rs, -rs, rs * 2, rs * 2);
  ctx.restore();
}

/** Pre-paint the common hole textures (e.g. while the title screen is up). */
export function warmHole(rpx) {
  holeSprites(bucketFor(rpx * 1.1));
}
