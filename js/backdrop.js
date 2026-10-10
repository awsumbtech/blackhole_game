// ─── LAYERED BACKDROP (v5 "Vast") ───
// Four parallax layers drawn in screen space. Each reacts to the camera zoom
// by a different amount (far layers barely, near layers almost like the
// world), so when the camera pulls back at a tier line the near dust shrinks
// away, clouds settle, and distant galaxies hardly move: a sense of depth.
// Each layer is an endless pattern drawn at two scales that cross-fade, so
// zooming out forever never runs out of sky.

import { TIER_STEP } from "./tiers.js";

const TAU = Math.PI * 2;
const B = TIER_STEP;
const LNB = Math.log(B);

// d: how strongly the layer follows zoom (0 = fixed, 1 = like the world)
// par: how much it pans with camera movement
const LAYERS = [
  { id: "far",  d: 0.12, par: 0.04, cell: 190, occ: 0.10, size: [10, 22], alpha: 0.30, kind: "smudge", salt: 11 },
  { id: "neb",  d: 0.30, par: 0.12, cell: 300, occ: 0.42, size: [120, 260], alpha: 0.075, kind: "cloud", salt: 23 },
  { id: "mid",  d: 0.58, par: 0.30, cell: 64,  occ: 0.20, size: [1.2, 2.6], alpha: 0.55, kind: "star", salt: 37 },
  { id: "near", d: 0.92, par: 0.75, cell: 150, occ: 0.16, size: [4, 11], alpha: 0.16, kind: "mote", salt: 53 }
];

let palette = [[110, 140, 210], [90, 170, 200], [150, 120, 220]];
let sprites = null;

export function setBackdropPalette(nebula) {
  if (nebula && nebula.length >= 3) palette = nebula;
  sprites = null;
}

function glow(rgb, size, core = 0) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const h = size / 2;
  const gr = g.createRadialGradient(h, h, 0, h, h, h);
  gr.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 1)`);
  gr.addColorStop(core || 0.35, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.45)`);
  gr.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}

function smudge(rgb, seed) {
  // A tiny far-away galaxy: tilted soft ellipse with a bright core
  const S = 48, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  g.translate(S / 2, S / 2);
  g.rotate(seed * 1.7);
  g.scale(1, 0.4 + (seed % 3) * 0.15);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, S / 2);
  gr.addColorStop(0, "rgba(255, 246, 225, 0.95)");
  gr.addColorStop(0.18, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.55)`);
  gr.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
  g.fillStyle = gr;
  g.beginPath(); g.arc(0, 0, S / 2, 0, TAU); g.fill();
  return c;
}

function buildSprites() {
  const soft = palette.map(p => p.map(v => Math.round(v * 0.5 + 255 * 0.5)));
  sprites = {
    cloud: palette.map(p => glow(p, 128, 0.5)),
    smudge: [smudge(soft[0], 1), smudge([255, 220, 190], 2), smudge(soft[1], 3), smudge([200, 210, 255], 4)],
    star: [glow([255, 255, 255], 12, 0.25), glow([200, 220, 255], 12, 0.25), glow([255, 236, 200], 12, 0.25)],
    mote: soft.map(p => glow(p, 32, 0.3))
  };
}

// Cheap integer hash -> [0, 1)
function hash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function drawLayer(ctx, L, w, h, zoom, panX, panY, breath) {
  const l = L.d * Math.log(zoom) / LNB;
  const fr = l - Math.floor(l);
  const list = sprites[L.kind];
  const cx = w / 2, cy = h / 2;
  const px = panX * L.par, py = panY * L.par;
  const C = L.cell, maxSz = L.size[1];
  for (let k = 0; k < 2; k++) {
    const s = k === 0 ? Math.pow(B, fr) : Math.pow(B, fr - 1);
    const a = (k === 0 ? 1 - fr : fr);
    // fade each copy smoothly at both ends of its life
    const aa = a * a * (3 - 2 * a) * L.alpha * (0.88 + breath * 0.12);
    if (aa < 0.004) continue;
    const u0 = (-cx + px) / s - maxSz, u1 = (w - cx + px) / s + maxSz;
    const v0 = (-cy + py) / s - maxSz, v1 = (h - cy + py) / s + maxSz;
    const gx0 = Math.floor(u0 / C), gx1 = Math.floor(u1 / C);
    const gy0 = Math.floor(v0 / C), gy1 = Math.floor(v1 / C);
    if ((gx1 - gx0 + 1) * (gy1 - gy0 + 1) > 900) continue;   // safety
    ctx.globalAlpha = aa;
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const r = hash(gx, gy, L.salt);
        if (r > L.occ) continue;
        const r2 = hash(gx, gy, L.salt + 1), r3 = hash(gx, gy, L.salt + 2);
        const ux = (gx + r2) * C, uy = (gy + r3) * C;
        const sz = (L.size[0] + (L.size[1] - L.size[0]) * (r / L.occ)) * s;
        const sx = cx + ux * s - px, sy = cy + uy * s - py;
        const img = list[Math.floor(r2 * 997) % list.length];
        const d = sz * 2;
        ctx.drawImage(img, sx - sz, sy - sz, d, d);
      }
    }
  }
  ctx.globalAlpha = 1;
}

/** zoom = the world camera zoom; pan = accumulated camera movement in screen px. */
export function drawBackdrop(ctx, w, h, zoom, panX, panY, breath, opts = {}) {
  if (!sprites) buildSprites();
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "lighter";
  for (const L of LAYERS) {
    if (opts.lite && L.id === "far") continue;
    if (opts.only && opts.only !== L.id) continue;
    if (opts.skip && opts.skip === L.id) continue;
    drawLayer(ctx, L, w, h, zoom, panX, panY, breath);
  }
  ctx.globalCompositeOperation = prev;
}
