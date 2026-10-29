// ─── DEPTH LAYERS (v8.3 "Growth") ───
// The scale ladder made visible. The play layer holds only what fits your
// size now; the next three tiers of the universe hang behind it as hazy,
// dimmer, slower-parallax layers. When you grow into a tier, its layer
// merges forward: the objects you could see in the haze drift closer,
// sharpen and brighten into real, edible things (about 2.5 s), while the
// camera pulls back. Deeper layers each step forward one place.
//
// Screen space, hashed (no per-object state), pre-blurred cached sprites.

import { shipClassFor } from "./ships.js";
import { tier } from "./tiers.js";
import { createEntity, typeById } from "./entities.js";
import { spriteFor, getArtQuality } from "./art.js";

const TAU = Math.PI * 2;
export const MERGE_FRAMES = 150;     // ~2.5 s at 60 fps
const LAYERS = 3;

// Per layer depth k (continuous, so layers can glide forward one step)
const par = k => 0.42 / (1 + k * 0.9);              // parallax: deeper = slower
const app = k => 0.5 * Math.pow(1.45, k - 1);       // apparent radius, in hole-px units
const alp = k => k <= 0 ? 0 : 0.62 * Math.pow(0.66, k - 1) * Math.min(1, Math.max(0, 3.8 - k) * 1.25);
const blurLv = k => Math.max(1, Math.min(3, Math.round(k)));

// Which objects represent a tier in the background: what's new at that tier
const NAMES = { dust: "dust", junk: "pebbles", meteor: "asteroids", comet: "comets", craft: "ships", moon: "moons",
  planet: "planets", star: "stars", neutron: "neutron stars", system: "star systems", nebula: "nebulae", cluster: "star clusters", galaxy: "galaxies" };
const typesCache = new Map();
export function layerTypes(L) {
  let t = typesCache.get(L);
  if (t) return t;
  const food = tier(L).food, prev = L > 0 ? tier(L - 1).food : {};
  // what's newly prominent at this tier (weight gained over the tier before)
  const score = id => food[id] - (prev[id] || 0) * 0.7;
  t = Object.keys(food).filter(id => id !== "dust").sort((a, b) => score(b) - score(a)).slice(0, 2);
  if (!t.length) t = ["junk"];
  typesCache.set(L, t);
  return t;
}
export function layerName(L) { return NAMES[layerTypes(L)[0]] || "next things"; }

// Pre-blurred copies of sprites (generic: keyed by the source canvas)
const blurCache = new WeakMap();
export function blurFor(src, lv) {
  let byLv = blurCache.get(src);
  if (!byLv) { byLv = [null, null, null, null]; blurCache.set(src, byLv); }
  let c = byLv[lv];
  if (c) return c;
  const pad = 6 * lv, W = src.width + pad * 2, H = src.height + pad * 2;
  c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  if ("filter" in g) {
    g.filter = `blur(${(1.1 * lv * Math.max(1, src.width / 48)).toFixed(1)}px)`;
    g.drawImage(src, pad, pad);
    g.filter = "none";
  } else {
    // fallback: down-sample and back up
    const t = document.createElement("canvas"), f = 1 / (1 + lv * 1.5);
    t.width = Math.max(2, Math.round(W * f)); t.height = Math.max(2, Math.round(H * f));
    t.getContext("2d").drawImage(src, pad * f, pad * f, src.width * f, src.height * f);
    g.drawImage(t, 0, 0, W, H);
  }
  // haze: lift the darks a touch toward the sky so it sits back
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = "rgba(150, 170, 220, 0.10)";
  g.fillRect(0, 0, W, H);
  c._pad = pad / src.width;   // padding as a share of the source size
  byLv[lv] = c;
  return c;
}

// Sample entities per layer type (for their painted look), made once
const samples = new Map();
function sampleFor(id, v, L = 0) {
  // v9.4: distant ships are the class of the tier they belong to (wrecks drift, so they're
  // shown as quiet derelict silhouettes in the haze)
  const ship = id === "craft" ? shipClassFor(L, false, (v + 0.5) / 8) : "";
  const key = id + v + ship;
  let e = samples.get(key);
  if (!e) {
    e = createEntity(typeById(id), 0, 0, 1); e.variant = v & 3; e.look = v * 7 + id.length;
    if (ship) { e.ship = ship; e.wreck = true; e.rotation = v * 0.8; }
    samples.set(key, e);
  }
  return e;
}

// Layer offsets (each tier's layer keeps its own accumulated pan)
const offX = new Float64Array(64), offY = new Float64Array(64);
let lastBgX = 0, lastBgY = 0, shift = 0, mergeTier = -1;

export function resetDepth(state) {
  samples.clear();   // v9.4: ship samples carry the galaxy's light in their art key
  offX.fill(0); offY.fill(0);
  lastBgX = state.bgX || 0; lastBgY = state.bgY || 0;
  shift = 0; mergeTier = -1;
}

function hash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Walk the visible objects of tier layer L at depth k. cb(sx, sy, rad, id, variant) is
 * only used by the merge snapshot; drawing passes cb = null and stamps sprites.
 */
function walk(ctx, L, k, w, h, holePx, dpr, a, cb) {
  const types = layerTypes(L);
  const rad0 = holePx * app(k);
  const C = Math.max(80, holePx * 8);
  const ox = offX[L & 63], oy = offY[L & 63];
  const gx0 = Math.floor((ox - C) / C), gx1 = Math.floor((ox + w + C) / C);
  const gy0 = Math.floor((oy - C) / C), gy1 = Math.floor((oy + h + C) / C);
  const lv = blurLv(k), occ = k < 1.5 ? 0.3 : k < 2.5 ? 0.2 : 0.13;   // deeper layers are sparser
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const r = hash(gx, gy, 101 + L * 13);
      if (r > occ) continue;
      const r2 = hash(gx, gy, 202 + L * 13), r3 = hash(gx, gy, 303 + L * 13);
      const sx = (gx + r2) * C - ox, sy = (gy + r3) * C - oy;
      if (sx < -C || sy < -C || sx > w + C || sy > h + C) continue;
      const rad = rad0 * (0.65 + 0.7 * (r / occ));
      const id = types[(r2 * 997 | 0) % types.length], v = (r3 * 991 | 0) % 8;   // v9: 8 looks per layer type
      if (cb) { cb(sx, sy, rad, id, v); continue; }
      const e = sampleFor(id, v, L);
      const sp = spriteFor(e, rad * dpr);
      const bl = blurFor(sp.c, lv);
      const d = sp.k * rad, pd = d * (1 + 2 * bl._pad);
      ctx.globalAlpha = a * (0.8 + 0.2 * r3);
      if (e.ship) {
        ctx.translate(sx, sy); ctx.rotate(e.rotation);
        ctx.drawImage(bl, -pd / 2, -pd / 2, pd, pd);
        ctx.rotate(-e.rotation); ctx.translate(-sx, -sy);
      } else ctx.drawImage(bl, sx - pd / 2, sy - pd / 2, pd, pd);
    }
  }
}

/** Screen space, after the sky/backdrop and before the world. */
export function drawDepth(ctx, w, h, state, holePx, dpr, dt) {
  const t = state.tier || 0;
  // pan each layer by its own parallax (a changing depth never makes it jump)
  const dx = (state.bgX || 0) - lastBgX, dy = (state.bgY || 0) - lastBgY;
  lastBgX = state.bgX || 0; lastBgY = state.bgY || 0;
  if (shift > 0) shift = Math.max(0, shift - dt / MERGE_FRAMES);
  const s = shift * shift * (3 - 2 * shift);
  const lite = getArtQuality() !== "high";
  for (let k = LAYERS + 1; k >= 1; k--) {
    const L = t + k, ke = k + s;
    offX[L & 63] += dx * par(ke); offY[L & 63] += dy * par(ke);
    if (lite && k > 2) continue;   // Lite: two back layers
    const a = alp(ke);
    if (a < 0.01) continue;
    walk(ctx, L, ke, w, h, holePx, dpr, a, null);
  }
  ctx.globalAlpha = 1;
}

// ─── Merge: the tier you just grew into steps forward into play ───
const MAX_MERGE = 14;
let mergeCb = null;

/**
 * Called on a tier-up. spawn(id, sx, sy, rad) creates the real entity at that
 * screen point (game.js converts to world and sets e.depthT/e.depthK0).
 */
export function startMerge(state, w, h, holePx, spawn) {
  const L = state.tier;
  mergeTier = L;
  shift = 1;
  let n = 0;
  mergeCb = (sx, sy, rad, id, v) => {
    if (n >= MAX_MERGE || sx < 0 || sy < 0 || sx > w || sy > h) return;
    n++;
    spawn(id, sx, sy, rad);
    // v9: the thing that steps forward keeps the look it had in the haze
    const ents = state.entities, e = ents && ents[ents.length - 1];
    if (e && e.type === id) {
      const s = sampleFor(id, v, L); e.look = s.look; e.variant = s.variant; e._artBase = null; e._sp = null;
      if (s.ship) { e.ship = s.ship; e.rotation = s.rotation; }
    }
  };
  walk(null, L, 1, w, h, holePx, 1, 1, mergeCb);
  mergeCb = null;
  return n;
}

export function layersInfo(state) { return { tier: state.tier, layers: [1, 2, 3].map(k => layerTypes((state.tier || 0) + k)), shift: +shift.toFixed(2), mergeTier }; }
