// The player's black hole: accretion disk, photon ring, lensed arc, tier-reveal fx.

import { TAU, rng, makeCanvas } from "./kit.js";
import { artCache, quality, bucketFor } from "./quality.js";

export const PALETTES = {
  // inner (white-hot) -> warm gold -> ember -> deep outer
  calm: { hot: [255, 250, 238], warm: [255, 210, 150], ember: [244, 140, 84], deep: [150, 70, 92], bloom: "255, 196, 140" },
  double: { hot: [255, 244, 252], warm: [255, 176, 226], ember: [226, 110, 210], deep: [120, 70, 190], bloom: "255, 160, 230" }
};
const diskCache = artCache();
// v8.1: a big, Interstellar-style disk. In hole radii.
export const DISK_IN = 1.45, DISK_OUT = 3.6;
const TILT = 0.17;

export function colAt(P, t) {
  // t: 0 inner .. 1 outer
  const s = t < 0.25 ? [P.hot, P.warm, t / 0.25] : t < 0.6 ? [P.warm, P.ember, (t - 0.25) / 0.35] : [P.ember, P.deep, (t - 0.6) / 0.4];
  const a = s[0], b = s[1], k = s[2];
  return Math.round(a[0] + (b[0] - a[0]) * k) + ", " + Math.round(a[1] + (b[1] - a[1]) * k) + ", " + Math.round(a[2] + (b[2] - a[2]) * k);
}

// Face-on disk texture: smooth warm-to-white base, then many turbulent bands
// and dark lanes. Painted once per size bucket (and palette).
function diskTexture(palette, b, layer) {
  const key = palette + "|" + b + "|" + layer;
  let d = diskCache.get(key);
  if (d) return d;
  const P = PALETTES[palette] || PALETTES.calm;
  const high = quality === "high";
  const size = Math.ceil(b * DISK_OUT * 2) + 2;
  const c = makeCanvas(size);
  const g = c.getContext("2d");
  g.translate(size / 2, size / 2);
  const rin = b * DISK_IN, rout = b * DISK_OUT;
  const span = rout - rin;
  const base = g.createRadialGradient(0, 0, rin * 0.96, 0, 0, rout);
  base.addColorStop(0, `rgba(${colAt(P, 0)}, 0)`);
  base.addColorStop(0.03, `rgba(${colAt(P, 0)}, 0.95)`);
  base.addColorStop(0.14, `rgba(${colAt(P, 0.15)}, 0.8)`);
  base.addColorStop(0.35, `rgba(${colAt(P, 0.4)}, 0.5)`);
  base.addColorStop(0.65, `rgba(${colAt(P, 0.7)}, 0.22)`);
  base.addColorStop(1, `rgba(${colAt(P, 1)}, 0)`);
  g.fillStyle = base;
  g.beginPath(); g.arc(0, 0, rout, 0, TAU); g.arc(0, 0, rin * 0.96, TAU, 0, true); g.fill();

  const r = rng(4321 + layer * 97 + b);
  g.lineCap = "round";
  // turbulent bright bands (additive)
  g.globalCompositeOperation = "lighter";
  const n = high ? 260 : 120;
  for (let i = 0; i < n; i++) {
    const t = Math.pow(r(), 1.5);
    const rad = rin + span * t;
    const a0 = r() * TAU, len = 0.3 + r() * 2.2;
    g.strokeStyle = `rgba(${colAt(P, t)}, ${(0.05 + r() * 0.16) * (1 - t * 0.6)})`;
    g.lineWidth = Math.max(0.6, b * (0.015 + r() * 0.07) * (1 + t));
    g.beginPath(); g.arc(0, 0, rad, a0, a0 + len); g.stroke();
  }
  // dark lanes give the bands structure
  g.globalCompositeOperation = "destination-out";
  const lanes = high ? 70 : 30;
  for (let i = 0; i < lanes; i++) {
    const t = 0.05 + r() * 0.9;
    const a0 = r() * TAU, len = 0.6 + r() * 2.6;
    g.strokeStyle = `rgba(0, 0, 0, ${0.12 + r() * 0.25})`;
    g.lineWidth = Math.max(0.6, b * (0.02 + r() * 0.05));
    g.beginPath(); g.arc(0, 0, rin + span * t, a0, a0 + len); g.stroke();
  }
  // a brilliant inner rim
  g.globalCompositeOperation = "lighter";
  const rim = g.createRadialGradient(0, 0, rin * 0.98, 0, 0, rin + span * 0.12);
  rim.addColorStop(0, "rgba(255, 252, 244, 0)");
  rim.addColorStop(0.2, "rgba(255, 252, 244, 0.55)");
  rim.addColorStop(1, "rgba(255, 252, 244, 0)");
  g.fillStyle = rim;
  g.beginPath(); g.arc(0, 0, rin + span * 0.12, 0, TAU); g.fill();
  d = { c, k: size / b };
  diskCache.set(key, d);
  if (diskCache.size > 12) diskCache.delete(diskCache.keys().next().value);
  return d;
}

// The lensed image of the far side of the disk: a bright arc bent up over the
// shadow and a thinner one under it. Painted from the disk texture.
const arcCache = artCache();
function arcSprite(palette, b) {
  const key = palette + "|" + b;
  let a = arcCache.get(key);
  if (a) return a;
  const tex = diskTexture(palette, b, 0);
  const R = b * 2.3, size = Math.ceil(R * 2) + 2;
  const c = makeCanvas(size);
  const g = c.getContext("2d");
  g.translate(size / 2, size / 2);
  const k = 1.04 / DISK_IN;            // inner edge hugs the shadow
  const s = tex.k * b * k;
  g.drawImage(tex.c, -s / 2, -s / 2, s, s);
  g.scale(1, 1);
  // top arc fades out by ~2.1 R
  g.globalCompositeOperation = "destination-in";
  const m = g.createRadialGradient(0, 0, b * 1.0, 0, 0, b * 2.2);
  m.addColorStop(0, "rgba(0,0,0,1)");
  m.addColorStop(0.35, "rgba(0,0,0,0.75)");
  m.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = m;
  g.fillRect(-R, -R, R * 2, R * 2);
  // bottom arc: much thinner
  g.save();
  g.beginPath(); g.rect(-R, b * 0.15, R * 2, R); g.clip();
  g.globalCompositeOperation = "destination-out";
  const m2 = g.createRadialGradient(0, 0, b * 1.12, 0, 0, b * 1.5);
  m2.addColorStop(0, "rgba(0,0,0,0)");
  m2.addColorStop(1, "rgba(0,0,0,1)");
  g.fillStyle = m2;
  g.fillRect(-R, -R, R * 2, R * 2);
  g.restore();
  // blend the two arcs smoothly at the sides
  g.globalCompositeOperation = "destination-out";
  const side = g.createLinearGradient(0, -b * 0.3, 0, b * 0.45);
  side.addColorStop(0, "rgba(0,0,0,0)");
  side.addColorStop(0.5, "rgba(0,0,0,0.35)");
  side.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = side;
  g.fillRect(-R, -b * 0.3, R * 2, b * 0.75);
  // approaching side is brighter
  g.globalCompositeOperation = "source-atop";
  const dop = g.createLinearGradient(-R, 0, R, 0);
  dop.addColorStop(0, "rgba(255, 250, 240, 0.35)");
  dop.addColorStop(0.5, "rgba(255, 250, 240, 0)");
  dop.addColorStop(1, "rgba(60, 20, 40, 0.25)");
  g.fillStyle = dop;
  g.fillRect(-R, -R, R * 2, R * 2);
  a = { c, R: 2.3 };
  arcCache.set(key, a);
  if (arcCache.size > 6) arcCache.delete(arcCache.keys().next().value);
  return a;
}

let spinOuter = 0, spinInner = 0, shimmerT = 0;
let glowSprite = null, glowB = 0, ringSprite = null, ringB = 0;
let dopSprite = null, dopB = 0, bloomSprite = null, bloomB = -1;

// Relativistic beaming: the side turning toward us is brighter and whiter.
// Disk-plane coordinates, does not rotate.
function dopplerSprite(b) {
  if (dopB === b) return dopSprite;
  const R = b * DISK_OUT, size = Math.ceil(R * 2) + 2;
  dopSprite = makeCanvas(size);
  const g = dopSprite.getContext("2d");
  g.translate(size / 2, size / 2);
  const lg = g.createLinearGradient(-R, 0, R, 0);
  lg.addColorStop(0, "rgba(255, 240, 220, 0)");
  lg.addColorStop(0.15, "rgba(255, 246, 232, 0.8)");
  lg.addColorStop(0.42, "rgba(255, 226, 190, 0.25)");
  lg.addColorStop(0.62, "rgba(255, 200, 160, 0)");
  g.fillStyle = lg;
  g.beginPath(); g.arc(0, 0, b * 2.6, 0, TAU); g.arc(0, 0, b * DISK_IN, TAU, 0, true); g.fill();
  g.globalCompositeOperation = "destination-in";
  const m = g.createRadialGradient(0, 0, b * DISK_IN, 0, 0, b * 2.6);
  m.addColorStop(0, "rgba(0,0,0,0)");
  m.addColorStop(0.15, "rgba(0,0,0,1)");
  m.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = m;
  g.fillRect(-R, -R, R * 2, R * 2);
  dopB = b;
  return dopSprite;
}

function bloomFor(b, P) {
  if (bloomB === b) return bloomSprite;
  const R = b * 4.6, size = Math.ceil(R * 2);
  bloomSprite = makeCanvas(size);
  const g = bloomSprite.getContext("2d");
  g.translate(size / 2, size / 2);
  const gr = g.createRadialGradient(0, 0, b * 1.0, 0, 0, R);
  gr.addColorStop(0, "rgba(255, 220, 180, 0.28)");
  gr.addColorStop(0.25, "rgba(250, 180, 140, 0.11)");
  gr.addColorStop(0.6, "rgba(200, 130, 160, 0.035)");
  gr.addColorStop(1, "rgba(160, 120, 200, 0)");
  g.fillStyle = gr;
  g.fillRect(-R, -R, R * 2, R * 2);
  bloomB = b;
  return bloomSprite;
}

function holeSprites(b) {
  if (glowB !== b) {
    const size = Math.ceil(b * 4.2 * 2);
    glowSprite = makeCanvas(size);
    const g = glowSprite.getContext("2d");
    g.translate(size / 2, size / 2);
    const gr = g.createRadialGradient(0, 0, b * 0.9, 0, 0, b * 4.2);
    gr.addColorStop(0, "rgba(150, 130, 230, 0.18)");
    gr.addColorStop(0.3, "rgba(120, 100, 210, 0.07)");
    gr.addColorStop(1, "rgba(90, 90, 200, 0)");
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, b * 4.2, 0, TAU); g.fill();
    glowB = b;
  }
  if (ringB !== b) {
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
    // crisp photon ring, brighter on the approaching (left) side
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
}

// Disk halves (module functions: no per-frame closures)
function drawDisk(ctx, tex, ang, alpha, radius) {
  const s = tex.k * radius;
  ctx.save();
  ctx.scale(1, TILT);
  ctx.rotate(ang);
  ctx.globalAlpha = alpha;
  ctx.drawImage(tex.c, -s / 2, -s / 2, s, s);
  ctx.restore();
}
function drawDoppler(ctx, spr, alpha, radius) {
  const s = DISK_OUT * 2 * radius;
  ctx.save();
  ctx.scale(1, TILT);
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "lighter";
  ctx.drawImage(spr, -s / 2, -s / 2, s, s);
  ctx.restore();
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
  const b = bucketFor(rpx * 1.1);
  holeSprites(b);
  diskTexture("calm", b, 0);
  arcSprite("calm", b);
}
