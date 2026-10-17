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
  { id: "far",  d: 0.12, par: 0.04, cell: 170, occ: 0.12, size: [7, 16], alpha: 0.38, kind: "smudge", salt: 11 },
  { id: "neb",  d: 0.30, par: 0.12, cell: 280, occ: 0.45, size: [130, 280], alpha: 0.34, kind: "cloud", salt: 23 },
  { id: "mid",  d: 0.58, par: 0.30, cell: 64,  occ: 0.20, size: [1.2, 2.6], alpha: 0.55, kind: "star", salt: 37 },
  { id: "near", d: 0.92, par: 0.75, cell: 150, occ: 0.18, size: [4, 12], alpha: 0.22, kind: "mote", salt: 53 }
];

let palette = [[110, 140, 210], [90, 170, 200], [150, 120, 220]];
let sprites = null, spritesLite = false;
let tNow = 0, twinkle = false;

export function setBackdropPalette(nebula) {
  if (nebula && nebula.length >= 3) palette = nebula;
  sprites = null;
}

// Seeded rng for paint-time only
function srng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0; return (s >>> 8) / 16777216; };
}

// v8: a painterly nebula cloud. Many soft overlapping puffs in two hues, a
// brighter inner glow, then dark dust lanes carved through it. Painted once.
function cloud(a, b2, seed, S) {
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  const h = S / 2, r = srng(seed * 7919 + 13);
  g.translate(h, h);
  g.globalCompositeOperation = "lighter";
  const puffs = S > 160 ? 26 : 14;
  for (let i = 0; i < puffs; i++) {
    const ang = r() * TAU, d = Math.pow(r(), 0.7) * h * 0.55;
    const x = Math.cos(ang) * d, y = Math.sin(ang) * d * 0.7;
    const pr = h * (0.18 + r() * 0.32);
    const t = r(), col = t < 0.55 ? a : b2;
    const al = 0.10 + r() * 0.12;
    const gr = g.createRadialGradient(x, y, 0, x, y, pr);
    gr.addColorStop(0, `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${al})`);
    gr.addColorStop(0.5, `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${al * 0.45})`);
    gr.addColorStop(1, `rgba(${col[0]}, ${col[1]}, ${col[2]}, 0)`);
    g.fillStyle = gr;
    g.fillRect(x - pr, y - pr, pr * 2, pr * 2);
  }
  // luminous heart
  const hg = g.createRadialGradient(0, 0, 0, 0, 0, h * 0.4);
  hg.addColorStop(0, "rgba(255, 246, 236, 0.10)");
  hg.addColorStop(1, "rgba(255, 246, 236, 0)");
  g.fillStyle = hg;
  g.fillRect(-h, -h, S, S);
  // dust lanes: soft dark streaks that eat the glow
  g.globalCompositeOperation = "destination-out";
  const lanes = S > 160 ? 4 : 2;
  for (let i = 0; i < lanes; i++) {
    g.save();
    g.rotate(r() * TAU);
    g.translate((r() - 0.5) * h * 0.5, (r() - 0.5) * h * 0.4);
    g.scale(1, 0.12 + r() * 0.1);
    const lr = h * (0.35 + r() * 0.3);
    const lg = g.createRadialGradient(0, 0, 0, 0, 0, lr);
    lg.addColorStop(0, "rgba(0, 0, 0, 0.55)");
    lg.addColorStop(1, "rgba(0, 0, 0, 0)");
    g.fillStyle = lg;
    g.fillRect(-lr, -lr, lr * 2, lr * 2);
    g.restore();
  }
  // edge fade so no square ever shows
  g.globalCompositeOperation = "destination-in";
  const m = g.createRadialGradient(0, 0, h * 0.45, 0, 0, h);
  m.addColorStop(0, "rgba(0,0,0,1)");
  m.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = m;
  g.fillRect(-h, -h, S, S);
  return c;
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

// v9: a faint streak of interstellar dust with a few specks (never a round blob)
function wisp(rgb, size, seed) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d"), h = size / 2, r = srng(seed * 131 + 7);
  g.translate(h, h); g.rotate(seed * 1.3 + 0.4);
  g.save(); g.scale(1, 0.18);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, h);
  gr.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.35)`);
  gr.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
  g.fillStyle = gr; g.fillRect(-h, -h, size, size);
  g.restore();
  for (let i = 0; i < 4; i++) {
    g.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${0.5 + r() * 0.5})`;
    g.fillRect((r() - 0.5) * h * 1.3, (r() - 0.5) * h * 0.25, 1.2, 1.2);
  }
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
  gr.addColorStop(0, "rgba(255, 246, 225, 0.6)");
  gr.addColorStop(0.12, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.4)`);
  gr.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
  g.fillStyle = gr;
  g.beginPath(); g.arc(0, 0, S / 2, 0, TAU); g.fill();
  return c;
}

function buildSprites(lite) {
  const soft = palette.map(p => p.map(v => Math.round(v * 0.5 + 255 * 0.5)));
  const S = lite ? 128 : 256, P = palette;
  sprites = {
    cloud: lite ? [cloud(P[0], P[1], 1, S), cloud(P[1], P[2], 2, S), cloud(P[2], P[0], 3, S)]
      : [cloud(P[0], P[1], 1, S), cloud(P[1], P[2], 2, S), cloud(P[2], P[0], 3, S), cloud(P[0], P[2], 4, S), cloud(P[1], P[0], 5, S)],
    smudge: [smudge(soft[0], 1), smudge([255, 220, 190], 2), smudge(soft[1], 3), smudge([200, 210, 255], 4)],
    // v8: stellar colour temperatures, hot blue-white to cool orange
    star: [glow([255, 255, 255], 12, 0.25), glow([190, 212, 255], 12, 0.25), glow([255, 238, 205], 12, 0.25),
      glow([255, 208, 160], 12, 0.25), glow([170, 196, 255], 12, 0.25), glow([255, 250, 235], 12, 0.25)],
    mote: soft.map((p, i) => wisp(p, 32, i))   // v9: drifting dust streaks, not round glows
  };
  spritesLite = lite;
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
        if (twinkle && L.kind === "star" && r2 < 0.35) {
          // v8: a slow, soft twinkle on some stars (no blinking: 0.55..1)
          ctx.globalAlpha = aa * (0.78 + 0.22 * Math.sin(tNow * (0.0007 + r3 * 0.0012) + r2 * 40));
          ctx.drawImage(img, sx - sz, sy - sz, d, d);
          ctx.globalAlpha = aa;
        } else ctx.drawImage(img, sx - sz, sy - sz, d, d);
      }
    }
  }
  ctx.globalAlpha = 1;
}

/** zoom = the world camera zoom; pan = accumulated camera movement in screen px. */
export function drawBackdrop(ctx, w, h, zoom, panX, panY, breath, opts = {}) {
  const lite = !!opts.lite;
  if (!sprites || spritesLite !== lite) buildSprites(lite);
  tNow = opts.time || 0;
  twinkle = !lite && !opts.reduceMotion;
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
