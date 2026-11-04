// Art kit: colour, path and shading helpers shared by every painter. Paint time only.

import { quality } from "./quality.js";

export const TAU = Math.PI * 2;

// ─── Colour helpers ───
const rgbCache = new Map();
export function rgb(hex) {
  let v = rgbCache.get(hex);
  if (v) return v;
  const h = hex.replace("#", "");
  v = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  rgbCache.set(hex, v);
  return v;
}
export function mix(hex, to, t, a = 1) {
  const c = rgb(hex);
  const r = Math.round(c[0] + (to[0] - c[0]) * t);
  const g = Math.round(c[1] + (to[1] - c[1]) * t);
  const b = Math.round(c[2] + (to[2] - c[2]) * t);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
const WHITE = [255, 255, 245];
const BLACK = [6, 6, 18];
export const light = (hex, t, a) => mix(hex, WHITE, t, a);
const dark = (hex, t, a) => mix(hex, BLACK, t, a);
export const rgba = (hex, a) => mix(hex, WHITE, 0, a);

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCanvas(size) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

function path(g, pts) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
}

export function smoothPath(g, pts) {
  const n = pts.length;
  g.beginPath();
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let m = mid(pts[n - 1], pts[0]);
  g.moveTo(m[0], m[1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    m = mid(p, q);
    g.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  }
  g.closePath();
}

// ─── v9 painters: every type and tier its own recognisable little painting ───
// Light always comes from the upper left (LX, LY). Paint time only.
export const LX = -0.74, LY = -0.67;
export const css = (c, a = 1) => "rgba(" + (c[0] | 0) + ", " + (c[1] | 0) + ", " + (c[2] | 0) + ", " + a + ")";
export const mx3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const jit = (c, r, k) => [0, 1, 2].map(i => Math.max(0, Math.min(255, c[i] * (1 + (r() - 0.5) * k))));
export const K0 = [4, 5, 14], K1 = [255, 250, 236];
export const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

// An irregular closed outline: low harmonics give lumpy, rock-like silhouettes
export function lumpy(R, r, n, amp, elong) {
  const h = [], pts = [];
  for (let k = 2; k <= 5; k++) h.push([amp / (k - 1) * (0.6 + r() * 0.8), r() * TAU]);
  const rot = r() * TAU, ex = 1 + elong, ey = 1 - elong * 0.55;
  let mx = 0;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    let d = 1;
    for (let k = 0; k < h.length; k++) d += h[k][0] * Math.cos((k + 2) * a + h[k][1]);
    d *= 1 + (r() - 0.5) * amp * 0.25;
    const x = Math.cos(a) * d * ex, y = Math.sin(a) * d * ey;
    const xr = x * Math.cos(rot) - y * Math.sin(rot), yr = x * Math.sin(rot) + y * Math.cos(rot);
    pts.push([xr, yr]);
    mx = Math.max(mx, Math.hypot(xr, yr));
  }
  for (const p of pts) { p[0] *= R / mx; p[1] *= R / mx; }
  return pts;
}
// Angular chip: few vertices, straight edges
export function chip(R, r, n) {
  const pts = [], off = r() * TAU;
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * TAU + (r() - 0.5) * (TAU / n) * 0.6;
    const d = R * (0.55 + r() * 0.45);
    pts.push([Math.cos(a) * d, Math.sin(a) * d]);
  }
  return pts;
}
export function polyAt(g, pts, x, y, s) {
  g.beginPath();
  g.moveTo(x + pts[0][0] * s, y + pts[0][1] * s);
  for (let i = 1; i < pts.length; i++) g.lineTo(x + pts[i][0] * s, y + pts[i][1] * s);
  g.closePath();
}
// Low-poly facets lit from the upper left: reads instantly as a broken stone
export function facets(g, pts, x, y, s, base, contrast) {
  const n = pts.length;
  const cx = x + LX * 0.18 * s * maxR(pts), cy = y + LY * 0.18 * s * maxR(pts);
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const mxp = (a[0] + b[0]) / 2, myp = (a[1] + b[1]) / 2, l = Math.hypot(mxp, myp) || 1;
    const nx = mxp / l * 0.75, ny = myp / l * 0.75, nz = 0.66;
    const lum = Math.max(-1, nx * LX + ny * LY + nz * 0.35);
    const c = lum > 0 ? mx3(base, K1, lum * 0.45 * contrast) : mx3(base, K0, -lum * 0.8 * contrast);
    g.fillStyle = css(c);
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(x + a[0] * s, y + a[1] * s); g.lineTo(x + b[0] * s, y + b[1] * s); g.closePath();
    g.fill();
  }
  // the top face catches the most light
  g.fillStyle = css(mx3(base, K1, 0.16 * contrast), 0.55);
  g.beginPath();
  for (let i = 0; i < n; i++) { const p = pts[i]; const px = cx + (x + p[0] * s - cx) * 0.42, py = cy + (y + p[1] * s - cy) * 0.42; i ? g.lineTo(px, py) : g.moveTo(px, py); }
  g.closePath(); g.fill();
}
function maxR(pts) { let m = 0; for (const p of pts) m = Math.max(m, Math.hypot(p[0], p[1])); return m || 1; }

// Body shading for any clipped shape: a curved terminator and a dark limb
export function shade(g, R, night, warm) {
  const sx = LX * R * 0.5, sy = LY * R * 0.5;
  const sg = g.createRadialGradient(sx, sy, 0, sx, sy, R * 1.5);
  sg.addColorStop(0, warm ? "rgba(255, 246, 225, 0.16)" : "rgba(255, 250, 240, 0.1)");
  sg.addColorStop(0.36, "rgba(0, 0, 0, 0)");
  sg.addColorStop(0.56, css(K0, night * 0.42));
  sg.addColorStop(0.72, css(K0, night * 0.84));
  sg.addColorStop(0.9, css(K0, night * 0.97));
  sg.addColorStop(1, css([20, 30, 60], night * 0.9));
  g.fillStyle = sg;
  g.fillRect(-R * 1.7, -R * 1.7, R * 3.4, R * 3.4);
}
// Atmosphere: a halo (thicker on the lit side) painted before the globe, and a
// scattered-light limb painted inside the globe before shading (so night hides it)
export function atmoHalo(g, R, col, k) {
  const cx = LX * R * 0.1, cy = LY * R * 0.1;
  const at = g.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.24);
  at.addColorStop(0, css(col, 0.24 * k)); at.addColorStop(1, css(col, 0));
  g.fillStyle = at;
  g.beginPath(); g.arc(cx, cy, R * 1.24, 0, TAU); g.fill();
}
export function atmoLimb(g, R, col, k) {
  const sc = g.createRadialGradient(0, 0, R * 0.7, 0, 0, R);
  sc.addColorStop(0, css(col, 0)); sc.addColorStop(1, css(col, 0.6 * k));
  g.globalCompositeOperation = "lighter";
  g.fillStyle = sc; g.fillRect(-R, -R, R * 2, R * 2);
  g.globalCompositeOperation = "source-over";
}
export function sphereClip(g, R) { g.save(); g.beginPath(); g.arc(0, 0, R, 0, TAU); g.clip(); }
export function blob(g, x, y, rad, r, rough) {
  const n = 9, pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU, d = rad * (1 - rough / 2 + r() * rough); pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d]); }
  smoothPath(g, pts);
}
export function softBlob(g, x, y, rad, col, a) {
  const gr = g.createRadialGradient(x, y, 0, x, y, rad);
  gr.addColorStop(0, css(col, a)); gr.addColorStop(0.6, css(col, a * 0.5)); gr.addColorStop(1, css(col, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
}
// A crater lit from the upper left: shadowed near wall, bright far wall and rim
export function crater(g, x, y, cr, base, k = 1) {
  g.save();
  g.beginPath(); g.arc(x, y, cr, 0, TAU); g.clip();
  g.fillStyle = css(mx3(base, K0, 0.55), 0.6 * k);
  g.fillRect(x - cr, y - cr, cr * 2, cr * 2);
  g.fillStyle = css(mx3(base, K1, 0.08), 0.75 * k);
  g.beginPath(); g.arc(x - LX * cr * 0.32, y - LY * cr * 0.32, cr * 0.86, 0, TAU); g.fill();
  g.restore();
  g.strokeStyle = css(mx3(base, K1, 0.4), 0.45 * k);
  g.lineWidth = Math.max(0.5, cr * 0.18);
  g.beginPath(); g.arc(x, y, cr * 1.02, Math.PI * 0.95, Math.PI * 1.75); g.stroke();
}
export function speck(g, R, n, cols, r, a0, a1, s0, s1, spread = 1) {
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * R * spread, sz = Math.max(0.45, R * (s0 + r() * (s1 - s0)));
    g.fillStyle = css(pick(r, cols), a0 + r() * (a1 - a0));
    g.fillRect(Math.cos(a) * d - sz / 2, Math.sin(a) * d - sz / 2, sz, sz);
  }
}
// A small, static four-point glint (paint time only, never blinks)
export function glint(g, x, y, l, col, a) {
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 2; i++) {
    const lg = g.createLinearGradient(x - (i ? 0 : l), y - (i ? l : 0), x + (i ? 0 : l), y + (i ? l : 0));
    lg.addColorStop(0, css(col, 0)); lg.addColorStop(0.5, css(col, a)); lg.addColorStop(1, css(col, 0));
    g.fillStyle = lg;
    if (i) g.fillRect(x - Math.max(0.35, l * 0.07), y - l, Math.max(0.7, l * 0.14), l * 2);
    else g.fillRect(x - l, y - Math.max(0.35, l * 0.07), l * 2, Math.max(0.7, l * 0.14));
  }
  softBlob(g, x, y, l * 0.35, col, a * 0.8);
  g.restore();
}
export function ringPass(g, R, tilt, col, front, wide, shadow) {
  g.save();
  g.rotate(tilt);
  g.beginPath(); g.rect(-R * 2.2, front ? 0 : -R * 2.2, R * 4.4, R * 2.2); g.clip();
  if (!front) { g.beginPath(); g.rect(-R * 2.2, -R * 2.2, R * 4.4, R * 2.2); g.arc(0, 0, R, 0, TAU, true); g.clip(); }
  const n = quality === "high" ? 9 : 5;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    g.beginPath();
    g.ellipse(0, 0, R * (1.3 + t * 0.62 * wide), R * (0.3 + t * 0.15 * wide), 0, 0, TAU);
    g.strokeStyle = css(mx3(col, i % 3 ? K1 : K0, (i % 3) * 0.12), (0.22 + ((i * 5) % 4) * 0.08) * (1 - t * 0.3));
    g.lineWidth = Math.max(0.6, R * 0.075 * wide);
    g.stroke();
  }
  g.beginPath(); g.ellipse(0, 0, R * (1.3 + 0.42 * wide), R * (0.3 + 0.1 * wide), 0, 0, TAU);
  g.strokeStyle = "rgba(4, 5, 14, 0.55)"; g.lineWidth = Math.max(0.5, R * 0.035); g.stroke();
  g.restore();
  if (!front && shadow) {
    // the globe's shadow falls on the ring behind it (light is upper left)
    g.save(); g.globalCompositeOperation = "destination-out";
    const sg = g.createRadialGradient(R * 0.6, R * 0.5, R * 0.4, R * 0.6, R * 0.5, R * 1.3);
    sg.addColorStop(0, "rgba(0,0,0,0.8)"); sg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = sg; g.fillRect(-R * 2.2, -R * 2.2, R * 4.4, R * 4.4);
    g.restore();
  }
}
// Wavy horizontal band across a globe (gas giants)
export function band(g, R, y0, y1, amp, f, ph) {
  const s = R * 0.12;
  g.beginPath();
  g.moveTo(-R * 1.3, y0);
  for (let x = -R * 1.3; x <= R * 1.3 + 0.1; x += s) g.lineTo(x, y0 + Math.sin(x / R * f + ph) * amp);
  for (let x = R * 1.3; x >= -R * 1.3 - 0.1; x -= s) g.lineTo(x, y1 + Math.sin(x / R * f * 1.37 + ph * 1.9) * amp);
  g.closePath();
}

export const tiltOf = look => (look * 1.618) % Math.PI;

// Asteroid surface: mineral tone, mottling, craters, grit, shading (inside a clip)
export function bodyFill(g, R, base, min, r, hi) {
  const lg = g.createLinearGradient(LX * R, LY * R, -LX * R, -LY * R);
  lg.addColorStop(0, css(mx3(base, K1, min === 2 ? 0.25 : 0.32))); lg.addColorStop(0.55, css(base)); lg.addColorStop(1, css(mx3(base, K0, 0.4)));
  g.fillStyle = lg; g.fillRect(-R * 1.5, -R * 1.5, R * 3, R * 3);
  if (R > 4) {
    for (let i = 0; i < 5; i++) softBlob(g, (r() - 0.5) * R * 1.6, (r() - 0.5) * R * 1.6, R * (0.25 + r() * 0.35), jit(base, r, 0.35), 0.35);
    const nc = hi ? 4 + Math.floor(r() * 5) : 3;
    for (let i = 0; i < nc; i++) { const a = r() * TAU, d = Math.sqrt(r()) * R * 0.75; crater(g, Math.cos(a) * d, Math.sin(a) * d, R * (0.07 + r() * r() * 0.22), base, 1); }
    speck(g, R * 1.1, hi ? Math.round(R * 3) : Math.round(R), [mx3(base, K0, 0.5), mx3(base, K1, 0.3)], r, 0.08, 0.25, 0.015, 0.04);
    if (min === 1) {
      // iron: bright metallic glints and a tight sheen
      for (let i = 0; i < (hi ? 6 : 3); i++) { g.fillStyle = "rgba(235, 240, 255, 0.55)"; const a = r() * TAU, d = r() * R * 0.7; g.fillRect(Math.cos(a) * d, Math.sin(a) * d, Math.max(0.6, R * 0.05), Math.max(0.6, R * 0.05)); }
      g.save(); g.translate(LX * R * 0.35, LY * R * 0.35); g.scale(1.4, 0.7); softBlob(g, 0, 0, R * 0.32, [240, 244, 255], 0.35); g.restore();
    }
  }
  shade(g, R, 0.78, true);
}
export function smoothSub(g, pts, ox, oy) {
  const n = pts.length;
  let mxp = (pts[n - 1][0] + pts[0][0]) / 2 + ox, myp = (pts[n - 1][1] + pts[0][1]) / 2 + oy;
  g.moveTo(mxp, myp);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    g.quadraticCurveTo(p[0] + ox, p[1] + oy, (p[0] + q[0]) / 2 + ox, (p[1] + q[1]) / 2 + oy);
  }
  g.closePath();
}
export function rimLightSmooth(g, R, pts) {
  if (R < 4) return;
  g.save();
  smoothPath(g, pts); g.clip();
  g.globalCompositeOperation = "lighter";
  g.lineWidth = Math.max(0.8, R * 0.12);
  const lg = g.createLinearGradient(LX * R, LY * R, 0, 0);
  lg.addColorStop(0, "rgba(255, 244, 225, 0.38)"); lg.addColorStop(1, "rgba(255, 244, 225, 0)");
  g.strokeStyle = lg;
  smoothPath(g, pts); g.stroke();
  g.restore();
}
